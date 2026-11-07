from pathlib import Path

import pretty_midi

from .models import Arrangement, Song


def arrangement_to_midi(arr: Arrangement, bpm: float) -> pretty_midi.PrettyMIDI:
    pm = pretty_midi.PrettyMIDI(initial_tempo=bpm)
    for hand, name in (("R", "Right hand"), ("L", "Left hand")):
        inst = pretty_midi.Instrument(program=0, name=name)
        inst.notes = [pretty_midi.Note(velocity=n.velocity, pitch=n.pitch, start=n.start, end=n.end)
                      for n in arr.notes if n.hand == hand]
        pm.instruments.append(inst)
    return pm


def write_outputs(song: Song, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "song.json").write_text(song.model_dump_json(indent=2, exclude_none=True))
    for level, arr in song.arrangements.items():
        arrangement_to_midi(arr, song.tempo.bpm).write(str(out_dir / f"{level}.mid"))
