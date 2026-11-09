import hmac
import logging
import os
import re
import tempfile
from collections.abc import AsyncIterator, Callable, Mapping
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from pathlib import Path
from typing import Annotated, Any, BinaryIO

from fastapi import APIRouter, Depends, FastAPI, File, Form, Header, Request, Response, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from ..audio import check_duration, probe_duration
from ..errors import AudioError
from .blobs import Blobs, LocalBlobs
from .config import Settings
from .runner import LocalRunner, Runner
from .store import JobRecord, Store, utcnow
from .worker import INTERNAL_MESSAGE

MODES = ("auto", "vocal", "instrumental", "solo_piano")
SOURCES = ("recording", "file")
CHUNK = 1024 * 1024
log = logging.getLogger(__name__)
HTTP_CODES = {404: "not_found", 405: "method_not_allowed"}

Lifespan = Callable[[FastAPI], Any]


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": message}}, status_code=status)


def iso(value: datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")


def job_json(job: JobRecord) -> dict[str, Any]:
    out: dict[str, Any] = {
        "id": job.id, "title": job.title, "status": job.status, "progress": job.progress,
        "source": job.source, "durationSec": job.duration_sec, "createdAt": iso(job.created_at),
    }
    if job.song_id:
        out["songId"] = job.song_id
    if job.preview:
        out["preview"] = job.preview
    if job.error_code:
        out["error"] = {"code": job.error_code, "message": job.error_message or ""}
    return out


def _audio_suffix(filename: str | None) -> str:
    suffix = Path(filename or "").suffix.lower()
    return suffix if re.fullmatch(r"\.[a-z0-9]{1,8}", suffix) else ".bin"


def _save_upload(source: BinaryIO, dest: Path, limit: int) -> None:
    size = 0
    with dest.open("wb") as out:
        while chunk := source.read(CHUNK):
            size += len(chunk)
            if size > limit:
                raise ApiError(413, "too_large", "The file is too large.")
            out.write(chunk)


def create_app(settings: Settings, store: Store, blobs: Blobs, runner: Runner, *,
               probe: Callable[[Path], float] = probe_duration, lifespan: Lifespan | None = None) -> FastAPI:
    app = FastAPI(title="Pianoverse", lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins,
                       allow_methods=["GET", "POST", "DELETE"], allow_headers=["Authorization"])

    @app.exception_handler(ApiError)
    async def api_error(request: Request, err: ApiError) -> JSONResponse:
        return _error(err.status, err.code, err.message)

    @app.exception_handler(RequestValidationError)
    async def bad_request(request: Request, err: RequestValidationError) -> JSONResponse:
        return _error(400, "bad_request", "The request is missing fields or has invalid ones.")

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request: Request, err: StarletteHTTPException) -> JSONResponse:
        return _error(err.status_code, HTTP_CODES.get(err.status_code, f"http_{err.status_code}"), str(err.detail))

    @app.exception_handler(Exception)
    async def unhandled(request: Request, err: Exception) -> JSONResponse:
        log.error("unhandled error on %s %s", request.method, request.url.path, exc_info=err)
        return _error(500, "internal", "Something went wrong on the server.")

    def require_key(authorization: Annotated[str | None, Header()] = None) -> None:
        if settings.api_key is None:
            return
        expected = f"Bearer {settings.api_key}".encode()
        if authorization is None or not hmac.compare_digest(authorization.encode(), expected):
            raise ApiError(401, "unauthorized", "Missing or wrong API key.")

    def expire_stale() -> None:
        # Locally a queue wait or a long CPU stage is not a crash, and startup recovery covers restarts.
        if settings.runner != "modal":
            return
        store.fail_interrupted(older_than=utcnow() - timedelta(seconds=settings.stale_after_sec))

    def find_job(job_id: str) -> JobRecord:
        job = store.get_job(job_id)
        if job is None:
            raise ApiError(404, "not_found", "No such job.")
        return job

    @app.get("/api/health")
    def health() -> dict[str, bool]:
        return {"ok": True}

    api = APIRouter(prefix="/api", dependencies=[Depends(require_key)])

    @api.post("/jobs", status_code=202)
    def create_job(
        audio: Annotated[UploadFile, File()],
        title: Annotated[str, Form()] = "",
        mode: Annotated[str, Form()] = "auto",
        source: Annotated[str, Form()] = "file",
    ) -> dict[str, str]:
        if mode not in MODES:
            raise ApiError(400, "bad_mode", f"mode must be one of {', '.join(MODES)}.")
        if source not in SOURCES:
            raise ApiError(400, "bad_source", f"source must be one of {', '.join(SOURCES)}.")
        title = title.strip()
        if not title:
            raise ApiError(400, "bad_title", "The title is empty.")
        suffix = _audio_suffix(audio.filename)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / f"upload{suffix}"
            _save_upload(audio.file, path, settings.max_upload_bytes)
            try:
                duration = probe(path)
                check_duration(duration)
            except AudioError as err:
                raise ApiError(500 if err.code == "ffmpeg_missing" else 400, err.code, err.message) from err
            job = store.create_job(title=title, mode=mode, source=source,
                                   duration_sec=round(duration, 3), audio_key="")
            audio_key = f"audio/{job.id}{suffix}"
            try:
                blobs.put_file(audio_key, path, audio.content_type or "application/octet-stream")
            except Exception:
                store.update_job(job.id, status="failed", error_code="internal", error_message=INTERNAL_MESSAGE)
                raise
        store.update_job(job.id, audio_key=audio_key)
        runner.submit(job.id)
        return {"jobId": job.id}

    @api.get("/jobs")
    def list_jobs(active: int = 1) -> list[dict[str, Any]]:
        # Only the unfinished view exists: running jobs plus failures the user has not dismissed.
        expire_stale()
        unfinished = store.list_active_jobs() + store.list_failed_jobs()
        unfinished.sort(key=lambda job: job.created_at, reverse=True)
        return [job_json(job) for job in unfinished]

    @api.get("/jobs/{job_id}")
    def get_job(job_id: str) -> dict[str, Any]:
        expire_stale()
        return job_json(find_job(job_id))

    @api.delete("/jobs/{job_id}", status_code=204)
    def dismiss_job(job_id: str) -> Response:
        if find_job(job_id).status != "failed":
            raise ApiError(409, "not_failed", "Only failed jobs can be dismissed.")
        store.dismiss_job(job_id)
        return Response(status_code=204)

    app.include_router(api)
    return app


def app_from_env(env: Mapping[str, str] = os.environ) -> FastAPI:
    settings = Settings.from_env(env)
    if settings.runner != "local":
        raise ValueError("Only PIANOVERSE_RUNNER=local is available so far")
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    store = Store(settings.database_url)
    blobs = LocalBlobs(settings.data_dir / "blobs")
    runner = LocalRunner(store, blobs)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        store.fail_interrupted()   # the in-memory queue died with the previous process
        runner.start()
        yield
        runner.stop()

    return create_app(settings, store, blobs, runner, lifespan=lifespan)
