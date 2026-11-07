from dataclasses import replace

import numpy as np

from ..models import RawNote


def beat_grid(beats: list[float], duration: float, subdivisions: int) -> np.ndarray:
    """Grid of `subdivisions` points per beat, extrapolated to cover [0, duration]."""
    b = np.asarray(sorted(beats), dtype=float)
    step = float(np.median(np.diff(b)))
    pre = np.arange(b[0], -1e-9, -step)[::-1][:-1]
    post = np.arange(b[-1] + step, duration + step, step)
    full = np.concatenate([pre, b, post])
    points: list[float] = []
    for a, c in zip(full[:-1], full[1:]):
        points.extend(np.linspace(a, c, subdivisions, endpoint=False))
    points.append(float(full[-1]))
    grid = np.asarray(points)
    grid = grid[grid >= -1e-9]
    if grid[0] > 1e-9:
        if grid[0] < 0.5 * step:
            grid[0] = 0.0   # a near-zero first point would only yield sliver notes
        else:
            grid = np.concatenate([[0.0], grid])
    return grid


def quantize_monophonic(notes: list[RawNote], grid: np.ndarray) -> list[RawNote]:
    g = np.asarray(grid)

    def nearest(t: float) -> int:
        return int(np.abs(g - t).argmin())

    snapped: list[RawNote] = []
    for n in sorted(notes, key=lambda n: (n.start, -n.pitch)):
        i, j = nearest(n.start), nearest(n.end)
        if j <= i:
            j = min(i + 1, len(g) - 1)
        if j <= i:
            continue
        start = round(float(g[i]), 6)
        if snapped and snapped[-1].start == start:
            continue
        snapped.append(replace(n, start=start, end=round(float(g[j]), 6)))
    for k in range(len(snapped) - 1):
        if snapped[k].end > snapped[k + 1].start:
            snapped[k] = replace(snapped[k], end=snapped[k + 1].start)
    return snapped
