# parameter.py
# Parameter mapping: each color property controls a musical property.
#   row -> pitch, value (brightness) -> volume, hue -> instrument (Kandinsky),
#   saturation -> how long the note rings, overall darkness -> key and tempo.

from .grid import shrink, get_hsv
from .notes import make_note, make_pitches, hue_to_instrument

NOTES_PER_COLUMN = 4  # the ear can only follow a few notes at once


def convert(image, rows=36, step=0.25, width_factor=2):
    small = shrink(image, rows, width_factor)
    hue, saturation, value = get_hsv(small)
    cols = small.width

    # dark paintings play in a minor key and a bit slower
    dark = value.mean() < 0.4
    scale = "minor" if dark else "major"
    if dark:
        step = step * 1.3
    pitches = make_pitches(rows, scale)

    notes = []
    for col in range(cols):
        # pick the cells that stand out most: bright AND colorful
        # (otherwise a pale background would win every column)
        score = [value[row][col] * (0.3 + saturation[row][col]) for row in range(rows)]
        standouts = sorted(range(rows), key=lambda r: score[r], reverse=True)[:NOTES_PER_COLUMN]
        for row in standouts:
            v = value[row][col]
            s = saturation[row][col]
            if v < 0.15:
                continue  # very dark cells stay silent
            length = step * (1 + 2 * s)  # vivid colors ring longer
            instrument = hue_to_instrument(hue[row][col], s, v)
            notes.append(make_note(col * step, length, pitches[row], 40 + 87 * v, instrument))
    return notes
