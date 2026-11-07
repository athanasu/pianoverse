import numpy as np

from helpers import synth
from pianoverse_engine.key import MAJOR_PROFILE, MINOR_PROFILE, chroma_profile, estimate_key
from pianoverse_engine.models import Key


def test_rolled_major_profile_is_g_major():
    assert estimate_key(np.roll(MAJOR_PROFILE, 7)) == Key(tonic="G", mode="major")


def test_rolled_minor_profile_is_a_minor():
    assert estimate_key(np.roll(MINOR_PROFILE, 9)) == Key(tonic="A", mode="minor")


def test_chroma_profile_peaks_on_played_notes():
    y = synth([(60, 0, 2), (64, 0, 2), (67, 0, 2)], 22050)
    profile = chroma_profile(y, 22050)
    assert profile.shape == (12,)
    assert int(profile.argmax()) in (0, 4, 7)
