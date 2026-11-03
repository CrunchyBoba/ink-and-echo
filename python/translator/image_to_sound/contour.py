# contour.py
# Contour / edge tracing: find the lines and edges in the image,
# then let the melody follow them from left to right.

import numpy as np
from PIL import Image, ImageFilter

from .grid import shrink, get_hsv
from .notes import make_note, make_pitches, hue_to_instrument, merge_notes

LINES_PER_COLUMN = 2  # follow the 2 strongest edges in each column


def convert(image, rows=36, step=0.25, width_factor=2):
    small = shrink(image, rows, width_factor)
    hue, saturation, value = get_hsv(small)
    cols = small.width

    # find edges on a medium-size grey copy, then shrink the edge map to our grid
    grey = image.convert("L").resize((cols * 4, rows * 4), Image.Resampling.BOX)
    edges = grey.filter(ImageFilter.SMOOTH).filter(ImageFilter.FIND_EDGES)
    edges = edges.resize((cols, rows), Image.Resampling.BOX)
    strength = np.array(edges, dtype=float)
    if strength.max() > 0:
        strength = strength / strength.max()  # 0 = no edge, 1 = strongest edge

    pitches = make_pitches(rows)
    notes = []
    for col in range(cols):
        column = [strength[row][col] for row in range(rows)]
        strongest = sorted(range(rows), key=lambda r: column[r], reverse=True)[:LINES_PER_COLUMN]
        for row in strongest:
            if column[row] < 0.2:
                continue  # no real edge here
            instrument = hue_to_instrument(hue[row][col], saturation[row][col], value[row][col])
            notes.append(make_note(col * step, step, pitches[row], 40 + 87 * column[row], instrument))
    return merge_notes(notes)
