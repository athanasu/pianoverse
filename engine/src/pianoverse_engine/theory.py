PITCH_NAMES = ("C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B")
_ALIASES = {"Db": 1, "D#": 3, "Gb": 6, "G#": 8, "A#": 10, "Cb": 11, "Fb": 4, "E#": 5, "B#": 0}

QUALITY_INTERVALS: dict[str, tuple[int, ...]] = {
    "maj": (0, 4, 7),
    "min": (0, 3, 7),
    "7": (0, 4, 7, 10),
    "maj7": (0, 4, 7, 11),
    "m7": (0, 3, 7, 10),
    "sus2": (0, 2, 7),
    "sus4": (0, 5, 7),
    "dim": (0, 3, 6),
    "aug": (0, 4, 8),
}
_SUFFIX = {"maj": "", "min": "m", "7": "7", "maj7": "maj7", "m7": "m7",
           "sus2": "sus2", "sus4": "sus4", "dim": "dim", "aug": "aug"}
_MIREX = {"maj": "maj", "min": "min", "7": "7", "maj7": "maj7", "m7": "min7",
          "sus2": "sus2", "sus4": "sus4", "dim": "dim", "aug": "aug"}


def pc_name(pc: int) -> str:
    return PITCH_NAMES[pc % 12]


def pc_of(name: str) -> int:
    if name in PITCH_NAMES:
        return PITCH_NAMES.index(name)
    if name in _ALIASES:
        return _ALIASES[name]
    raise ValueError(f"unknown pitch name: {name!r}")


def chord_pcs(root_pc: int, quality: str) -> list[int]:
    return [(root_pc + i) % 12 for i in QUALITY_INTERVALS[quality]]


def chord_symbol(root_pc: int, quality: str, bass_pc: int | None = None) -> str:
    symbol = pc_name(root_pc) + _SUFFIX[quality]
    if bass_pc is not None and bass_pc % 12 != root_pc % 12:
        symbol += "/" + pc_name(bass_pc)
    return symbol


def to_mirex(root_pc: int, quality: str) -> str:
    return f"{pc_name(root_pc)}:{_MIREX[quality]}"


def pitch_at_or_above(pc: int, lo: int) -> int:
    """Lowest MIDI pitch >= lo whose pitch class is pc."""
    return lo + ((pc - lo) % 12)
