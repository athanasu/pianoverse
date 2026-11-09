import uvicorn

from .api import app_from_env
from .config import Settings


def main() -> None:
    settings = Settings.from_env()
    uvicorn.run(app_from_env(), host=settings.host, port=settings.port)
