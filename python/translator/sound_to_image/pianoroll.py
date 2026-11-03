# pianoroll.py
# Piano roll (the reverse of the scan line): find which notes are sounding when,
# and draw each as a colored bar at its pitch. Time runs left to right,
# low notes at the bottom. Colors follow Scriabin's pitch -> color wheel.

import colorsys

import numpy as np
from PIL import Image

from ..tools import normalize, shrink_time
from .analysis import notes
from .colors import pitch_hue

LOWEST = 36       # MIDI 36 = C2
OCTAVES = 6
COLUMNS = 400


def convert(audio, width=1600, row_height=8):
    strength = notes(audio, LOWEST, 12 * OCTAVES)
    strength = normalize(20 * np.log10(strength + 1e-6).clip(-120))  # loudness in decibels
    strength = shrink_time(strength, COLUMNS)
    rows = strength.shape[0]

    grid = np.zeros((rows, COLUMNS, 3), dtype=np.uint8)
    for note in range(rows):
        hue = pitch_hue((LOWEST + note) % 12)
        for col in range(COLUMNS):
            s = strength[note, col]
            loudest = strength[:, col].max()
            if s > 0.55 and s > loudest - 0.15:      # only notes that stand out
                r, g, b = colorsys.hsv_to_rgb(hue, 0.85, s)
                grid[rows - 1 - note, col] = (int(r * 255), int(g * 255), int(b * 255))
            elif (LOWEST + note) % 12 == 0:
                grid[rows - 1 - note, col] = (28, 28, 34)   # faint line at every C
            else:
                grid[rows - 1 - note, col] = (14, 14, 18)

    image = Image.fromarray(grid)
    return image.resize((width, rows * row_height), Image.Resampling.NEAREST)
