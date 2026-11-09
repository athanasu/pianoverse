import io

import pretty_midi
import pytest

from helpers import make_song
from pianoverse_engine.models import Song
from server_helpers import AUTH, upload


@pytest.fixture
def server(make_server):
    return make_server()


def _finished_song(server, title: str = "My song") -> str:
    job_id = upload(server.client, title=title).json()["jobId"]
    assert server.runner.join_idle(10)
    return job_id


def test_songs_list_summaries_newest_first(server):
    first = _finished_song(server, "First")
    second = _finished_song(server, "Second")
    songs = server.client.get("/api/songs", headers=AUTH).json()
    assert [s["id"] for s in songs] == [second, first]
    assert songs[1] == {"id": first, "title": "First", "key": {"tonic": "C", "mode": "major"}, "bpm": 120.0,
                        "durationSec": 8.0, "sourceType": "vocal", "chords": ["C"]}


def test_song_json_is_served_from_blobs(server):
    song_id = _finished_song(server)
    response = server.client.get(f"/api/songs/{song_id}", headers=AUTH)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/json"
    assert Song.model_validate_json(response.content) == make_song(id=song_id, title="My song")


def test_midi_is_served_per_level(server):
    song_id = _finished_song(server)
    response = server.client.get(f"/api/songs/{song_id}/midi?level=easy", headers=AUTH)
    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/midi"
    assert f'filename="{song_id}-easy.mid"' in response.headers["content-disposition"]
    midi = pretty_midi.PrettyMIDI(io.BytesIO(response.content))
    assert [i.name for i in midi.instruments] == ["Right hand", "Left hand"]


def test_midi_defaults_to_easy(server):
    song_id = _finished_song(server)
    assert server.client.get(f"/api/songs/{song_id}/midi", headers=AUTH).status_code == 200


@pytest.mark.parametrize("path", [
    "/api/songs/nope", "/api/songs/nope/midi?level=easy", "/api/songs/{id}/midi?level=hard",
    "/api/songs/{id}/midi?level=bogus",
])
def test_missing_songs_and_levels_are_not_found(server, path):
    song_id = _finished_song(server)   # make_song only has the easy level
    response = server.client.get(path.format(id=song_id), headers=AUTH)
    assert (response.status_code, response.json()["error"]["code"]) == (404, "not_found")


@pytest.mark.parametrize("path", ["/api/songs", "/api/songs/x", "/api/songs/x/midi"])
def test_songs_need_the_key(server, path):
    assert server.client.get(path).status_code == 401
