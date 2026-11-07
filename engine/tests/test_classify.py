from pianoverse_engine.classify import classify, lead_stem


def test_song_with_vocals():
    assert classify({"vocals": 0.3, "other": 0.5, "drums": 0.2}) == "vocal"


def test_solo_piano():
    assert classify({"piano": 0.9, "other": 0.05, "vocals": 0.01}) == "solo_piano"


def test_instrumental():
    assert classify({"guitar": 0.4, "other": 0.3, "drums": 0.3, "vocals": 0.02}) == "instrumental"


def test_silent_input_is_instrumental():
    assert classify({}) == "instrumental"


def test_lead_stem_is_loudest_melodic_stem():
    assert lead_stem({"piano": 0.1, "guitar": 0.5, "other": 0.2, "drums": 0.9}) == "guitar"
