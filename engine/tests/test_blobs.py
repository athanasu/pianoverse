import pytest

from pianoverse_engine.server.blobs import LocalBlobs


@pytest.fixture
def blobs(tmp_path) -> LocalBlobs:
    return LocalBlobs(tmp_path / "blobs")


def test_put_and_get_bytes(blobs):
    blobs.put_bytes("songs/abc/song.json", b'{"id": "abc"}', "application/json")
    assert blobs.get_bytes("songs/abc/song.json") == b'{"id": "abc"}'


def test_put_overwrites(blobs):
    blobs.put_bytes("a.bin", b"one", "application/octet-stream")
    blobs.put_bytes("a.bin", b"two", "application/octet-stream")
    assert blobs.get_bytes("a.bin") == b"two"


def test_put_file_and_download(blobs, tmp_path):
    src = tmp_path / "in.m4a"
    src.write_bytes(b"audio")
    blobs.put_file("audio/job1.m4a", src, "audio/mp4")
    dest = tmp_path / "work" / "nested" / "source.m4a"
    blobs.download("audio/job1.m4a", dest)
    assert dest.read_bytes() == b"audio"


def test_missing_keys_raise_key_error(blobs, tmp_path):
    with pytest.raises(KeyError):
        blobs.get_bytes("songs/none/song.json")
    with pytest.raises(KeyError):
        blobs.download("audio/none.m4a", tmp_path / "x")


def test_keys_cannot_escape_the_root(blobs):
    with pytest.raises(ValueError):
        blobs.put_bytes("../outside.txt", b"x", "text/plain")
