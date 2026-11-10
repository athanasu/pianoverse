# pianoverse-engine

Song audio → playable piano arrangement (Song JSON + MIDI). Design: `docs/superpowers/specs/2026-11-07-pianoverse-design.md`.

## Setup

```bash
brew install ffmpeg
brew install wget   # piano model downloads its weights with wget on first use
uv sync
```

## Run

```bash
uv run pianoverse-engine path/to/song.mp3 --out out/song
uv run pianoverse-engine piano.m4a --out out/piano --mode solo_piano
```

Writes `song.json` and `easy.mid`, `medium.mid`, `hard.mid` (and `original.mid` for solo piano). First run downloads model weights.

Chords come from BTC (Bi-directional Transformer for Chord recognition, Park et al. ISMIR 2019), vendored in `src/pianoverse_engine/vendor/btc/` under its MIT license. Its 12 MB checkpoint is downloaded on first use to `~/.cache/pianoverse/` and verified by SHA-256.

## Test

```bash
uv run pytest            # fast suite
uv run pytest -m slow    # real models (minutes)
```

## Server

A small HTTP API (FastAPI) that accepts uploads, runs the engine on a background worker and serves the finished songs to the app. Locally it keeps everything under `data/` (git-ignored): a SQLite database and a `blobs/` folder with the audio, `song.json` and MIDI files.

```bash
PIANOVERSE_API_KEY=dev-key uv run pianoverse-server
curl http://127.0.0.1:8000/api/health                                   # {"ok":true}
curl -H "Authorization: Bearer dev-key" http://127.0.0.1:8000/api/songs
curl -H "Authorization: Bearer dev-key" -F audio=@song.mp3 -F title="My song" \
     -F mode=auto -F source=file http://127.0.0.1:8000/api/jobs         # {"jobId":"…"}
```

Point the app at it with `VITE_API_URL=http://127.0.0.1:8000` and `VITE_API_KEY=dev-key` in `app/.env.local`.

Songs keep the arrangement they were made with. After the engine improves, rebuild the ones already in the library from their original audio (titles and ids stay):

```bash
uv run pianoverse-reanalyze                 # every song
uv run pianoverse-reanalyze 24a25c36f184    # only these ids
```

| Variable | Default | Meaning |
|---|---|---|
| `PIANOVERSE_API_KEY` | none | Bearer key for every `/api` route except `/api/health`. Without it auth is off, which is allowed only on `127.0.0.1`. |
| `PIANOVERSE_HOST` / `PIANOVERSE_PORT` | `127.0.0.1` / `8000` | Where uvicorn listens. Any other host requires an API key. |
| `PIANOVERSE_DATA_DIR` | `engine/data` | Local database and blobs. |
| `PIANOVERSE_DATABASE_URL` | `sqlite:///<data dir>/pianoverse.db` | Any SQLAlchemy URL (`postgresql+psycopg://…` in the cloud). |
| `PIANOVERSE_CORS_ORIGINS` | `http://localhost:5173` | Comma-separated origins allowed to call the API. |
| `PIANOVERSE_RUNNER` | `local` | `local` runs jobs one at a time on a thread in the server. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | none | Cloud storage (later). |

Uploads must be at most 50 MB and 10 seconds to 8 minutes long. Jobs that were running when the server stopped are marked `interrupted` on the next start. On the cloud runner (`PIANOVERSE_RUNNER=modal`) a job without progress for 20 minutes is marked `interrupted` too. Errors come back as `{"error": {"code", "message"}}`; the app translates by `code`.

## Evaluate

Put songs in `samples/` (git-ignored). Optional reference chords go in `samples/<name>.chords.lab` (MIREX format). To force a song's type (e.g. a solo-piano recording the stem classifier calls instrumental), add `samples/<name>.mode` containing `vocal`, `instrumental` or `solo_piano`.

```bash
uv run python -m pianoverse_engine.evaluate samples out/eval
```

Then listen to `out/eval/<song>/overlay-<level>.wav` and read `out/eval/report.md`.
