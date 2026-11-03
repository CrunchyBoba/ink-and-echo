# regions.py
# Region / clustering: group the image into a few color blobs.
# Each blob is one voice. Its instrument comes from its color, its pitch follows
# where the blob sits in each column, and its size in the column sets the volume.

import colorsys

import numpy as np

from .grid import shrink
from .notes import make_note, make_pitches, hue_to_instrument, merge_notes

COLORS = 6  # how many color regions to split the image into


def convert(image, rows=36, step=0.25, width_factor=2):
    small = shrink(image, rows, width_factor)
    cols = small.width

    # quantize() groups similar colors together; each cell gets a region number
    grouped = small.quantize(colors=COLORS)
    labels = np.array(grouped)
    palette = grouped.getpalette()
    pitches = make_pitches(rows)

    notes = []
    # images with fewer than COLORS distinct colors get fewer regions
    for region in np.unique(labels):
        # the region's average color -> instrument
        r, g, b = palette[region * 3: region * 3 + 3]
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        instrument = hue_to_instrument(h, s, v)

        for col in range(cols):
            rows_here = [row for row in range(rows) if labels[row][col] == region]
            if not rows_here:
                continue
            center = sum(rows_here) // len(rows_here)  # where the blob sits -> pitch
            size = len(rows_here) / rows               # how much of the column it fills -> volume
            notes.append(make_note(col * step, step, pitches[center], 30 + 97 * size, instrument))
    return merge_notes(notes)
