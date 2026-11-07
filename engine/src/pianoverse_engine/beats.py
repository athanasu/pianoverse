from pathlib import Path

MIN_BEATS = 4


def _beat_this(path: Path) -> tuple[list[float], list[float]]:
    """Beat and downbeat times in seconds (beat_this, CPJKU 2024)."""
    from beat_this.inference import File2Beats

    from .separate import pick_device

    f2b = File2Beats(checkpoint_path="final0", device=pick_device(), dbn=False)
    beats, downbeats = f2b(str(path))
    return [float(b) for b in beats], [float(d) for d in downbeats]


def _librosa_beats(path: Path) -> list[float]:
    import librosa

    from .audio import load_mono

    y, sr = load_mono(path, sr=22050)
    _, times = librosa.beat.beat_track(y=y, sr=sr, units="time")
    return [float(t) for t in times]


def track_beats(path: Path) -> tuple[list[float], list[float]]:
    """beat_this first; librosa when it finds almost nothing (seen on phone-mic recordings).

    The librosa fallback has no downbeats, so callers get an empty list for them.
    """
    beats, downbeats = _beat_this(path)
    if len(beats) >= MIN_BEATS:
        return beats, downbeats
    return _librosa_beats(path), []
