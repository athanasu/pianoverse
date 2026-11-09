from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, Field, model_validator

Hand = Literal["L", "R"]
Level = Literal["easy", "medium", "hard", "original"]
SourceType = Literal["vocal", "instrumental", "solo_piano"]


@dataclass(frozen=True)
class RawNote:
    """Engine-internal note before hands are assigned."""
    pitch: int
    start: float
    end: float
    velocity: int = 80


class Note(BaseModel):
    pitch: int = Field(ge=21, le=108)
    start: float = Field(ge=0)
    end: float
    velocity: int = Field(ge=1, le=127)
    hand: Hand

    @model_validator(mode="after")
    def _end_after_start(self) -> "Note":
        if self.end <= self.start:
            raise ValueError("note end must be after start")
        return self


class Arrangement(BaseModel):
    notes: list[Note]


class Tempo(BaseModel):
    bpm: float = Field(gt=0)
    beats: list[float]
    downbeats: list[float]


class Key(BaseModel):
    tonic: str
    mode: Literal["major", "minor"]


class Preview(BaseModel):
    """What the pipeline knows after analysis, shown while the melody is still being transcribed."""
    key: Key
    bpm: float
    timeSignature: tuple[int, int]
    chords: list[str]


class ChordSegment(BaseModel):
    start: float
    end: float
    symbol: str
    root: str
    quality: str
    bass: str | None = None


class SongWarning(BaseModel):
    code: str
    message: str
    start: float | None = None
    end: float | None = None


class Song(BaseModel):
    schemaVersion: Literal[1] = 1
    id: str
    title: str
    durationSec: float
    sourceType: SourceType
    tempo: Tempo
    timeSignature: tuple[int, int]
    key: Key
    chords: list[ChordSegment]
    arrangements: dict[Level, Arrangement]
    warnings: list[SongWarning] = []
