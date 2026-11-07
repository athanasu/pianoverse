class EngineError(Exception):
    """Failure with a stable code and a Greek, user-facing message."""

    def __init__(self, code: str, message: str):
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message


class AudioError(EngineError):
    pass


class PipelineError(EngineError):
    pass
