import librosa
import numpy as np

from .models import Key
from .theory import pc_name

HOP = 2048
# Krumhansl–Kessler key profiles, index 0 = tonic.
MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


def chroma_profile(y: np.ndarray, sr: int) -> np.ndarray:
    return librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=HOP).sum(axis=1)


def estimate_key(profile: np.ndarray) -> Key:
    best: tuple[float, int, str] = (-2.0, 0, "major")
    for tonic in range(12):
        for mode, template in (("major", MAJOR_PROFILE), ("minor", MINOR_PROFILE)):
            r = float(np.corrcoef(profile, np.roll(template, tonic))[0, 1])
            if r > best[0]:
                best = (r, tonic, mode)
    return Key(tonic=pc_name(best[1]), mode=best[2])
