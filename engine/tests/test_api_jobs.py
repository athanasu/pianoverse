import io

import pytest
import soundfile as sf
from fastapi.testclient import TestClient

from helpers import synth
from pianoverse_engine.audio import probe_duration
from pianoverse_engine.errors import AudioError, PipelineError
from pianoverse_engine.server.api import app_from_env
from pianoverse_engine.server.store import Store
from server_helpers import API_KEY, AUTH, upload


def _wav(seconds: float) -> bytes:
    buf = io.BytesIO()
    sf.write(buf, synth([(60, 0, seconds)], 22050), 22050, format="WAV")
    return buf.getvalue()


def _unreadable(path):
    raise AudioError("unsupported_format", "Could not read this audio file.")


def test_health_needs_no_key(make_server):
    response = make_server().client.get("/api/health")
    assert (response.status_code, response.json()) == (200, {"ok": True})


@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer wrong"}, {"Authorization": API_KEY}])
def test_jobs_need_the_key(make_server, headers):
    response = make_server().client.get("/api/jobs?active=1", headers=headers)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"


def test_no_key_configured_means_no_auth(make_server):
    assert make_server(api_key=None).client.get("/api/jobs?active=1").status_code == 200


def test_cors_allows_the_app_origin_with_authorization(make_server):
    response = make_server().client.options("/api/jobs", headers={
        "Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization",
    })
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "authorization" in response.headers["access-control-allow-headers"].lower()


def test_cors_ignores_other_origins(make_server):
    response = make_server().client.get("/api/health", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in response.headers


def test_upload_runs_the_job_to_done(make_server):
    server = make_server()
    response = upload(server.client, audio=b"fake-audio", filename="Take 1.M4A", source="recording")
    assert response.status_code == 202
    job_id = response.json()["jobId"]
    assert server.blobs.get_bytes(f"audio/{job_id}.m4a") == b"fake-audio"
    assert server.runner.join_idle(10)

    job = server.client.get(f"/api/jobs/{job_id}", headers=AUTH).json()
    created_at = job.pop("createdAt")
    assert created_at.endswith("Z")
    assert job == {
        "id": job_id, "title": "My song", "status": "done", "progress": 1.0, "source": "recording",
        "durationSec": 30.0, "songId": job_id,
        "preview": {"key": {"tonic": "C", "mode": "major"}, "bpm": 120.0, "timeSignature": [4, 4],
                    "chords": ["C"]},
    }


def test_new_job_is_queued_and_listed(make_server):
    server = make_server()
    server.runner.stop()   # keep it queued
    job_id = upload(server.client).json()["jobId"]
    job = server.client.get(f"/api/jobs/{job_id}", headers=AUTH).json()
    assert (job["status"], job["progress"]) == ("queued", 0.0)
    assert {"songId", "preview", "error"}.isdisjoint(job)
    assert [j["id"] for j in server.client.get("/api/jobs?active=1", headers=AUTH).json()] == [job_id]


def test_title_is_trimmed_and_suffix_defaults_to_bin(make_server):
    server = make_server()
    server.runner.stop()
    job_id = upload(server.client, title="  Spaced  ", filename="blob").json()["jobId"]
    assert server.store.get_job(job_id).title == "Spaced"
    assert server.store.get_job(job_id).audio_key == f"audio/{job_id}.bin"


@pytest.mark.parametrize("form,code", [
    ({"mode": "karaoke"}, "bad_mode"),
    ({"source": "radio"}, "bad_source"),
    ({"title": "   "}, "bad_title"),
])
def test_upload_rejects_bad_fields(make_server, form, code):
    server = make_server()
    response = upload(server.client, **form)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == code
    assert server.store.list_active_jobs() == []


def test_upload_rejects_large_files(make_server):
    response = upload(make_server(max_upload_bytes=10).client, audio=b"x" * 11)
    assert response.status_code == 413
    assert response.json() == {"error": {"code": "too_large", "message": "The file is too large."}}


@pytest.mark.parametrize("probe,code", [
    (_unreadable, "unsupported_format"),
    (lambda path: 9.5, "too_short"),
    (lambda path: 481.0, "too_long"),
])
def test_upload_rejects_unusable_audio(make_server, probe, code):
    server = make_server(probe=probe)
    response = upload(server.client)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == code
    assert server.store.list_active_jobs() == []


def test_upload_without_audio_is_a_bad_request(make_server):
    response = make_server().client.post("/api/jobs", headers=AUTH, data={"title": "x"})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "bad_request"


def test_real_probe_enforces_the_ten_second_minimum(make_server):
    server = make_server(probe=probe_duration)
    short = upload(server.client, audio=_wav(5), filename="short.wav")
    assert (short.status_code, short.json()["error"]["code"]) == (400, "too_short")
    ok = upload(server.client, audio=_wav(12), filename="ok.wav")
    assert ok.status_code == 202
    assert 12.0 <= server.store.get_job(ok.json()["jobId"]).duration_sec < 14.0   # synth adds a release tail


def test_engine_failure_is_reported_and_dismissable(make_server):
    def run(*args, **kwargs):
        raise PipelineError("no_melody", "Could not find a melody in the song.")

    server = make_server(run=run)
    job_id = upload(server.client).json()["jobId"]
    assert server.runner.join_idle(10)
    job = server.client.get(f"/api/jobs/{job_id}", headers=AUTH).json()
    assert job["status"] == "failed"
    assert job["error"] == {"code": "no_melody", "message": "Could not find a melody in the song."}
    assert [j["id"] for j in server.client.get("/api/jobs?active=1", headers=AUTH).json()] == [job_id]

    assert server.client.delete(f"/api/jobs/{job_id}", headers=AUTH).status_code == 204
    assert server.client.get(f"/api/jobs/{job_id}", headers=AUTH).status_code == 404
    assert server.client.get("/api/jobs?active=1", headers=AUTH).json() == []


def test_only_failed_jobs_can_be_dismissed(make_server):
    server = make_server()
    server.runner.stop()
    job_id = upload(server.client).json()["jobId"]
    response = server.client.delete(f"/api/jobs/{job_id}", headers=AUTH)
    assert (response.status_code, response.json()["error"]["code"]) == (409, "not_failed")


def test_unknown_job_is_not_found(make_server):
    client = make_server().client
    for response in (client.get("/api/jobs/nope", headers=AUTH), client.delete("/api/jobs/nope", headers=AUTH)):
        assert (response.status_code, response.json()["error"]["code"]) == (404, "not_found")


def test_job_list_has_active_and_failed_newest_first_without_done(make_server):
    server = make_server()
    server.runner.stop()
    first, second, third = (upload(server.client, title=t).json()["jobId"] for t in ("a", "b", "c"))
    server.store.update_job(first, status="failed", error_code="silent", error_message="Nothing is audible.")
    server.store.update_job(second, status="done", progress=1.0, song_id=second)
    server.store.update_job(third, status="melody", progress=0.6)
    jobs = server.client.get("/api/jobs?active=1", headers=AUTH).json()
    assert [(j["id"], j["status"]) for j in jobs] == [(third, "melody"), (first, "failed")]


def test_stale_jobs_fail_as_interrupted_when_read_on_modal(make_server):
    server = make_server(stale_after_sec=0, runner="modal")
    server.runner.stop()
    job_id = upload(server.client).json()["jobId"]
    job = server.client.get(f"/api/jobs/{job_id}", headers=AUTH).json()
    assert (job["status"], job["error"]["code"]) == ("failed", "interrupted")


def test_local_runner_never_expires_slow_or_queued_jobs(make_server):
    server = make_server(stale_after_sec=0)
    server.runner.stop()
    job_id = upload(server.client).json()["jobId"]
    job = server.client.get(f"/api/jobs/{job_id}", headers=AUTH).json()
    assert job["status"] == "queued"


def test_app_from_env_fails_jobs_left_running_by_a_previous_process(tmp_path):
    store = Store(f"sqlite:///{tmp_path / 'pianoverse.db'}")
    job = store.create_job(title="x", mode="auto", source="file", duration_sec=30.0, audio_key="audio/x.m4a")
    store.update_job(job.id, status="separating")
    app = app_from_env({"PIANOVERSE_DATA_DIR": str(tmp_path), "PIANOVERSE_API_KEY": API_KEY})
    with TestClient(app) as client:
        response = client.get(f"/api/jobs/{job.id}", headers=AUTH)
    assert response.json()["error"]["code"] == "interrupted"


def test_app_from_env_refuses_the_modal_runner_for_now(tmp_path):
    with pytest.raises(ValueError, match="PIANOVERSE_RUNNER"):
        app_from_env({"PIANOVERSE_DATA_DIR": str(tmp_path), "PIANOVERSE_RUNNER": "modal"})


def test_unknown_route_and_wrong_method_use_the_error_shape(make_server):
    client = make_server().client
    missing = client.get("/api/nope")
    assert (missing.status_code, missing.json()["error"]["code"]) == (404, "not_found")
    wrong = client.put("/api/health")
    assert (wrong.status_code, wrong.json()["error"]["code"]) == (405, "method_not_allowed")
    assert set(wrong.json()) == {"error"}


def test_unhandled_error_is_a_json_500_and_fails_the_job(make_server):
    server = make_server()
    server.runner.stop()

    def broken_put(*args, **kwargs):
        raise RuntimeError("disk full")

    server.blobs.put_file = broken_put
    client = TestClient(server.client.app, raise_server_exceptions=False)
    response = upload(client, headers={**AUTH, "Origin": "http://localhost:5173"})
    assert response.status_code == 500
    assert response.json() == {"error": {"code": "internal", "message": "Something went wrong on the server."}}
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    [job] = server.store.list_failed_jobs()
    assert job.error_code == "internal"


def test_without_an_api_key_foreign_origins_are_rejected(make_server):
    server = make_server(api_key=None)
    server.runner.stop()
    foreign = upload(server.client, headers={"Origin": "http://evil.example"})
    assert foreign.status_code == 403
    assert foreign.json()["error"]["code"] == "forbidden_origin"
    assert server.store.list_active_jobs() == []
    assert upload(server.client, headers={"Origin": "http://localhost:5173"}).status_code == 202
    assert upload(server.client, headers={}).status_code == 202


def test_with_an_api_key_the_origin_check_is_left_to_the_key(make_server):
    server = make_server()
    server.runner.stop()
    wrong = upload(server.client, headers={"Origin": "http://evil.example"})
    assert wrong.status_code == 401
