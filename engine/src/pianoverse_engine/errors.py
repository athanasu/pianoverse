class EngineError(Exception):
    """Failure with a stable code (the contract clients translate) and an English fallback message."""

    def __init__(self, code: str, message: str):
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message


class AudioError(EngineError):
    pass


class PipelineError(EngineError):
    pass
