# cymatics.py
# Simulated cymatics: when a metal plate covered in sand is played at a pitch,
# the sand gathers on the lines that don't vibrate (Chladni figures).
# The song is cut into 9 parts; each part's main pitch picks a pattern,
# its loudness sets how much sand there is, and its notes tint the sand.

import numpy as np
from PIL import Image

from ..tools import shrink_time
from .analysis import chroma, loudness, brightness
from .colors import chroma_color

PARTS = 9          # 3 x 3 grid of plates
PLATE = (34, 36, 42)


def chladni(n, m, size):
    """Where sand collects on a square plate vibrating in mode (n, m): 1 = on a still line."""
    t = np.linspace(0, 1, size)
    x, y = np.meshgrid(t, t)
    motion = np.cos(n * np.pi * x) * np.cos(m * np.pi * y) - np.cos(m * np.pi * x) * np.cos(n * np.pi * y)
    return np.exp(-(motion / 0.08) ** 2)


def convert(audio, tile=300, gap=12):
    level = shrink_time(loudness(audio), PARTS)
    bright = shrink_time(brightness(audio), PARTS)
    notes = shrink_time(chroma(audio), PARTS)
    rng = np.random.default_rng(len(audio["y"]))

    side = 3 * tile + 4 * gap
    canvas = np.full((side, side, 3), 12, dtype=np.uint8)
    for p in range(PARTS):
        pitch = int(np.argmax(notes[:, p]))
        n = 1 + pitch % 5                              # main note -> pattern
        m = n + 1 + int(bright[p] * 4)                 # brighter sound -> finer pattern
        sand = chladni(n, m, tile)
        grains = rng.random((tile, tile)) < sand * (0.35 + 0.6 * level[p])
        color = np.array(chroma_color(notes[:, p], value=1.0))
        sand_color = (0.6 * np.array([235, 225, 200]) + 0.4 * color).astype(np.uint8)

        plate = np.empty((tile, tile, 3), dtype=np.uint8)
        plate[:] = PLATE
        plate[grains] = sand_color
        row, col = divmod(p, 3)
        top, left = gap + row * (tile + gap), gap + col * (tile + gap)
        canvas[top:top + tile, left:left + tile] = plate
    return Image.fromarray(canvas)
