from pathlib import Path


def track_beats(path: Path) -> tuple[list[float], list[float]]:
    """Beat and downbeat times in seconds (beat_this, CPJKU 2024)."""
    from beat_this.inference import File2Beats

    from .separate import pick_device

    f2b = File2Beats(checkpoint_path="final0", device=pick_device(), dbn=False)
    beats, downbeats = f2b(str(path))
    return [float(b) for b in beats], [float(d) for d in downbeats]
