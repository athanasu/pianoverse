from .models import SourceType

VOCAL_SHARE = 0.15
PIANO_SHARE = 0.6
MELODIC_STEMS = ("piano", "guitar", "other")


def classify(energies: dict[str, float]) -> SourceType:
    total = sum(energies.values())
    if total <= 0:
        return "instrumental"
    if energies.get("vocals", 0.0) / total >= VOCAL_SHARE:
        return "vocal"
    if energies.get("piano", 0.0) / total >= PIANO_SHARE:
        return "solo_piano"
    return "instrumental"


def lead_stem(energies: dict[str, float]) -> str:
    return max(MELODIC_STEMS, key=lambda name: energies.get(name, 0.0))
