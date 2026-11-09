import shutil
from pathlib import Path
from typing import Protocol


class Blobs(Protocol):
    def put_bytes(self, key: str, data: bytes, content_type: str) -> None: ...
    def put_file(self, key: str, path: Path, content_type: str) -> None: ...
    def get_bytes(self, key: str) -> bytes: ...
    def download(self, key: str, dest: Path) -> None: ...


class LocalBlobs:
    """Blobs as files under one folder; content types only matter to remote stores."""

    def __init__(self, root: Path):
        self.root = root

    def _path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if not path.is_relative_to(self.root.resolve()):
            raise ValueError(f"blob key escapes the store: {key}")
        return path

    def _existing(self, key: str) -> Path:
        path = self._path(key)
        if not path.is_file():
            raise KeyError(key)
        return path

    def put_bytes(self, key: str, data: bytes, content_type: str) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def put_file(self, key: str, path: Path, content_type: str) -> None:
        dest = self._path(key)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, dest)

    def get_bytes(self, key: str) -> bytes:
        return self._existing(key).read_bytes()

    def download(self, key: str, dest: Path) -> None:
        source = self._existing(key)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, dest)
