import numpy as np
import soundfile as sf

from pianoverse_engine.separate import Stems


def _stems() -> Stems:
    ones = np.ones((2, 100), dtype=np.float32)
    return Stems(sr=1000, tracks={"vocals": ones * 0.5, "bass": ones * 0.1})


def test_energies_are_mean_square():
    e = _stems().energies()
    assert np.isclose(e["vocals"], 0.25) and np.isclose(e["bass"], 0.01)


def test_mix_sums_mono_tracks_and_ignores_missing():
    mixed = _stems().mix(["vocals", "bass", "piano"])
    assert mixed.shape == (100,)
    assert np.allclose(mixed, 0.6)


def test_save_writes_wav_per_stem(tmp_path):
    paths = _stems().save(tmp_path)
    assert set(paths) == {"vocals", "bass"}
    data, sr = sf.read(paths["vocals"], always_2d=True)
    assert sr == 1000 and data.shape == (100, 2)
