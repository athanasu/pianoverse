import contextlib
import io
import tempfile
from pathlib import Path

from .models import RawNote


def transcribe_polyphonic(path: Path) -> list[RawNote]:
    """Any instrument or voice → notes (Spotify Basic Pitch)."""
    from basic_pitch.inference import predict

    with contextlib.redirect_stdout(io.StringIO()):   # CoreML backend prints per-window debug lines
        _, _, note_events = predict(str(path))
    return [
        RawNote(int(pitch), float(start), float(end), max(1, min(127, int(round(amp * 127)))))
        for start, end, pitch, amp, _bends in note_events
    ]


def transcribe_piano(path: Path) -> list[RawNote]:
    """Solo piano → faithful notes (ByteDance high-resolution piano transcription)."""
    from piano_transcription_inference import PianoTranscription, sample_rate

    from .audio import load_mono
    from .separate import pick_device

    audio, _ = load_mono(path, sr=sample_rate)
    transcriptor = PianoTranscription(device=pick_device(), checkpoint_path=None)
    with tempfile.TemporaryDirectory() as tmp:
        result = transcriptor.transcribe(audio, str(Path(tmp) / "out.mid"))
    return [
        RawNote(int(e["midi_note"]), float(e["onset_time"]), float(e["offset_time"]), int(e["velocity"]))
        for e in result["est_note_events"]
    ]
