from collections.abc import Callable, Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from fake_pipeline import fake_run
from pianoverse_engine.server.api import create_app
from pianoverse_engine.server.blobs import LocalBlobs
from pianoverse_engine.server.runner import LocalRunner
from pianoverse_engine.server.store import Store
from server_helpers import Server, make_settings, thirty_seconds


@pytest.fixture
def make_server(tmp_path) -> Iterator[Callable[..., Server]]:
    """Build an app on a temp folder with a started LocalRunner; stops every runner afterwards."""
    runners: list[LocalRunner] = []

    def make(*, run: Any = fake_run, probe: Any = thirty_seconds, **settings: Any) -> Server:
        config = make_settings(tmp_path, **settings)
        store = Store(config.database_url)
        blobs = LocalBlobs(tmp_path / "blobs")
        runner = LocalRunner(store, blobs, run=run)
        runner.start()
        runners.append(runner)
        client = TestClient(create_app(config, store, blobs, runner, probe=probe))
        return Server(client=client, store=store, blobs=blobs, runner=runner)

    yield make
    for runner in runners:
        runner.stop()
