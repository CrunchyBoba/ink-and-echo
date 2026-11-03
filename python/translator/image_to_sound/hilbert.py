# hilbert.py
# Hilbert curve scanning: walk through the image along a zig-zag curve that
# visits every cell while keeping neighbors close together in time.
# Each cell plays one note in sequence: brightness -> pitch, hue -> instrument.

from PIL import Image

from ..tools import hilbert_point
from .grid import get_hsv
from .notes import make_note, make_pitches, hue_to_instrument, merge_notes

SIZE = 32  # the curve needs a square grid with a power-of-2 size (16, 32, 64...)


def convert(image, rows=36, step=0.25, width_factor=2):
    small = image.convert("RGB").resize((SIZE, SIZE), Image.Resampling.BOX)
    hue, saturation, value = get_hsv(small)
    pitches = make_pitches(rows)  # highest first
    note_step = step / 4  # one cell per note, so go faster

    notes = []
    for d in range(SIZE * SIZE):
        x, y = hilbert_point(SIZE, d)
        v = value[y][x]
        index = int((1 - v) * (rows - 1))  # bright = high pitch
        instrument = hue_to_instrument(hue[y][x], saturation[y][x], v)
        volume = 50 + 70 * saturation[y][x]  # vivid colors are louder
        notes.append(make_note(d * note_step, note_step, pitches[index], volume, instrument))
    return merge_notes(notes)
