# scanline.py
# Scan line (vOICe-style): sweep left to right.
# Row = pitch (top is high), brightness = loudness. One plain instrument.

from .grid import shrink, get_hsv
from .notes import make_note, make_pitches, OCARINA


def scan(value, pitches, step, start=0, top_n=None, threshold=0.2, instrument=OCARINA):
    """Play a brightness grid column by column.
    top_n: only play the N brightest cells per column (None = play all of them).
    threshold: cells darker than this stay silent."""
    rows = len(value)
    cols = len(value[0])
    notes = []
    for col in range(cols):
        column = [value[row][col] for row in range(rows)]
        rows_to_play = range(rows)
        if top_n is not None:
            rows_to_play = sorted(range(rows), key=lambda r: column[r], reverse=True)[:top_n]
        for row in rows_to_play:
            if column[row] > threshold:
                notes.append(make_note(start + col * step, step, pitches[row],
                                       column[row] * 127, instrument))
    return notes


def convert(image, rows=36, step=0.25, width_factor=2):
    small = shrink(image, rows, width_factor)
    hue, saturation, value = get_hsv(small)
    return scan(value, make_pitches(rows), step)
