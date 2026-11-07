import hashlib
import io
import subprocess
import sys
import urllib.error
import urllib.request

import numpy as np
import pytest

from helpers import synth
from pianoverse_engine import chords_btc
from pianoverse_engine.chords_btc import frames_to_segments, map_label
from pianoverse_engine.errors import PipelineError
from pianoverse_engine.separate import Stems
from pianoverse_engine.theory import QUALITY_INTERVALS
from pianoverse_engine.vendor.btc.vocab import idx2voca_chord


def test_large_vocabulary_has_170_labels():
    voca = idx2voca_chord()
    assert len(voca) == 170
    assert (voca[0], voca[1], voca[13], voca[169], voca[168]) == ("C:min", "C", "C:sus4", "N", "X")
    assert voca[14 * 11 + 8] == "B:maj7"


def test_importing_btc_chords_does_not_import_torch():
    code = "import sys, pianoverse_engine.chords_btc; assert 'torch' not in sys.modules"
    assert subprocess.run([sys.executable, "-c", code]).returncode == 0


def test_every_vocabulary_quality_maps_to_ours_or_no_chord():
    for label in idx2voca_chord().values():
        mapped = map_label(label)
        assert mapped is None or mapped[1] in QUALITY_INTERVALS


def test_label_mapping_examples():
    assert map_label("C:maj6") == ("C", "maj")
    assert map_label("A:min7") == ("A", "m7")
    assert map_label("G") == ("G", "maj")
    assert map_label("A#:hdim7") == ("Bb", "dim")
    assert map_label("Db:minmaj7") == ("C#", "min")
    assert map_label("N") is None
    assert map_label("X") is None


TIMES = np.arange(40) * 0.1          # 4 s of frames, 10 per beat
BEATS4 = [1.0, 2.0, 3.0]


def _frames(*runs: tuple[str, int, float]) -> tuple[list[str], np.ndarray]:
    labels = [label for label, n, _ in runs for _ in range(n)]
    probs = np.array([p for _, n, p in runs for _ in range(n)])
    return labels, probs


def test_frames_merge_equal_beats_and_drop_no_chord():
    labels, probs = _frames(("C", 10, 0.9), ("C:maj6", 10, 0.9), ("A:min7", 10, 0.9), ("N", 10, 0.9))
    segments, uncertain = frames_to_segments(TIMES, labels, probs, BEATS4, 4.0)
    assert [(s.symbol, s.start, s.end) for s in segments] == [("C", 0.0, 2.0), ("Am7", 2.0, 3.0)]
    assert (segments[1].root, segments[1].quality, segments[1].bass) == ("A", "m7", None)
    assert uncertain == []


def test_beat_takes_majority_label_of_its_frames():
    labels, probs = _frames(("C", 6, 0.9), ("G", 4, 0.9), ("G", 30, 0.9))
    segments, _ = frames_to_segments(TIMES, labels, probs, BEATS4, 4.0)
    assert [(s.symbol, s.start, s.end) for s in segments] == [("C", 0.0, 1.0), ("G", 1.0, 4.0)]


def test_majority_tie_goes_to_higher_mean_probability():
    labels, probs = _frames(("C", 5, 0.6), ("G", 5, 0.9), ("G", 30, 0.9))
    segments, _ = frames_to_segments(TIMES, labels, probs, BEATS4, 4.0)
    assert [s.symbol for s in segments] == ["G"]


def test_low_probability_segments_are_uncertain_and_ranges_merge():
    labels, probs = _frames(("C", 10, 0.9), ("F", 10, 0.3), ("G", 10, 0.45), ("C", 10, 0.9))
    segments, uncertain = frames_to_segments(TIMES, labels, probs, BEATS4, 4.0)
    assert [s.symbol for s in segments] == ["C", "F", "G", "C"]
    assert uncertain == [(1.0, 3.0)]


def test_corrupt_weights_are_deleted_and_reported(tmp_path, monkeypatch):
    monkeypatch.setattr(chords_btc, "_download", lambda url, dest: dest.write_bytes(b"not the model"))
    with pytest.raises(PipelineError) as err:
        chords_btc.ensure_weights(tmp_path)
    assert err.value.code == "chord_model_corrupt"
    assert list(tmp_path.iterdir()) == []


def test_verified_weights_are_downloaded_once(tmp_path, monkeypatch):
    calls = []

    def fake_download(url, dest):
        calls.append(url)
        dest.write_bytes(b"model")

    monkeypatch.setattr(chords_btc, "_download", fake_download)
    monkeypatch.setattr(chords_btc, "WEIGHTS_SHA256", hashlib.sha256(b"model").hexdigest())
    assert chords_btc.ensure_weights(tmp_path / "cache") == b"model"
    assert chords_btc.ensure_weights(tmp_path / "cache") == b"model"
    assert calls == [chords_btc.WEIGHTS_URL]


def test_unreachable_download_is_reported(tmp_path, monkeypatch):
    def offline(url, timeout):
        raise urllib.error.URLError("no network")

    monkeypatch.setattr(urllib.request, "urlopen", offline)
    with pytest.raises(PipelineError) as err:
        chords_btc.ensure_weights(tmp_path)
    assert err.value.code == "chord_model_download"
    assert list(tmp_path.iterdir()) == []


def test_interrupted_download_leaves_no_partial_file(tmp_path, monkeypatch):
    class Dropping(io.BytesIO):
        def read(self, size=-1):
            if self.tell():
                raise TimeoutError("timed out")
            return super().read(4)

    seen = {}

    def flaky(url, timeout):
        seen["timeout"] = timeout
        return Dropping(b"partial model")

    monkeypatch.setattr(urllib.request, "urlopen", flaky)
    with pytest.raises(PipelineError) as err:
        chords_btc.ensure_weights(tmp_path)
    assert err.value.code == "chord_model_download"
    assert list(tmp_path.iterdir()) == []
    assert seen["timeout"] == chords_btc.DOWNLOAD_TIMEOUT


@pytest.mark.slow
def test_btc_hears_pop_progression_roots():
    sr = 22050
    prog = [([48, 52, 55, 60], 0, 2), ([45, 48, 52, 57], 2, 4),
            ([41, 48, 53, 57], 4, 6), ([43, 50, 55, 59], 6, 8)]
    y = synth([(p, s, e) for ps, s, e in prog for p in ps], sr)
    stems = Stems(sr=sr, tracks={"other": np.stack([y, y])})
    segments, _ = chords_btc.recognize_chords_btc(stems, [i * 0.5 for i in range(1, 16)], 8.0)
    assert [s.root for s in segments] == ["C", "A", "F", "G"]
