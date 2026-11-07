from pianoverse_engine.vendor.btc.vocab import idx2voca_chord


def test_large_vocabulary_has_170_labels():
    voca = idx2voca_chord()
    assert len(voca) == 170
    assert (voca[0], voca[1], voca[13], voca[169], voca[168]) == ("C:min", "C", "C:sus4", "N", "X")
    assert voca[14 * 11 + 8] == "B:maj7"
