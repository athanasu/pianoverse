import os
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import soundfile as sf


@dataclass
class Stems:
    sr: int
    tracks: dict[str, np.ndarray]   # name -> (channels, samples)

    def mono(self, name: str) -> np.ndarray:
        return self.tracks[name].mean(axis=0).astype(np.float32)

    def mix(self, names: Iterable[str]) -> np.ndarray:
        present = [self.mono(n) for n in names if n in self.tracks]
        if not present:
            length = next(iter(self.tracks.values())).shape[1]
            return np.zeros(length, dtype=np.float32)
        return np.sum(present, axis=0).astype(np.float32)

    def energies(self) -> dict[str, float]:
        return {name: float(np.mean(t ** 2)) for name, t in self.tracks.items()}

    def save(self, directory: Path) -> dict[str, Path]:
        directory.mkdir(parents=True, exist_ok=True)
        paths = {}
        for name, track in self.tracks.items():
            path = directory / f"{name}.wav"
            sf.write(path, track.T, self.sr)
            paths[name] = path
        return paths


def pick_device() -> str:
    import torch
    if os.environ.get("PIANOVERSE_DEVICE"):
        return os.environ["PIANOVERSE_DEVICE"]
    return "cuda" if torch.cuda.is_available() else "cpu"


def separate(path: Path, model_name: str = "htdemucs_6s") -> Stems:
    """Split a 44.1 kHz stereo wav into drums/bass/other/vocals/guitar/piano."""
    import torch
    from demucs.apply import apply_model
    from demucs.pretrained import get_model

    data, sr = sf.read(path, always_2d=True, dtype="float32")
    model = get_model(model_name)
    model.eval()
    if sr != model.samplerate:
        raise ValueError(f"expected {model.samplerate} Hz input, got {sr}")
    wav = torch.from_numpy(data.T.copy())
    ref = wav.mean(0)
    mean, std = ref.mean(), ref.std() + 1e-8
    with torch.no_grad():
        out = apply_model(model, ((wav - mean) / std)[None], device=pick_device(),
                          split=True, overlap=0.25, progress=False)[0]
    out = out * std + mean
    return Stems(sr=sr, tracks={name: out[i].cpu().numpy() for i, name in enumerate(model.sources)})
