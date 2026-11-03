# melody.py
# Melody line (the reverse of contour tracing): follow the main pitch of the song
# and draw it as one continuous ink line, wrapped into rows like handwriting.
# Higher notes go up, louder moments make a thicker line, silence lifts the pen.

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from ..tools import shrink_time, smooth
from .analysis import loudness, notes

LOWEST = 48       # MIDI 48 = C3; follow three octaves up to B5
RANGE = 36
ROWS = 6
STEPS = 1800
PAPER = (244, 238, 224)
INK = (25, 25, 45)


def convert(audio, width=1200, height=900):
    # the strongest semitone at each moment is the "melody"
    pitch = np.argmax(notes(audio, LOWEST, RANGE), axis=0).astype(float)
    pitch = smooth(shrink_time(pitch, STEPS), 7)
    level = shrink_time(loudness(audio), STEPS)

    image = Image.new("RGB", (width, height), PAPER)
    draw = ImageDraw.Draw(image)
    margin = 60
    row_height = (height - 2 * margin) / ROWS
    per_row = STEPS // ROWS

    for row in range(ROWS):
        baseline = margin + (row + 0.75) * row_height
        draw.line([(margin, baseline), (width - margin, baseline)], fill=(215, 205, 190), width=1)
        previous = None
        for j in range(per_row):
            i = row * per_row + j
            x = margin + j / per_row * (width - 2 * margin)
            y = baseline - pitch[i] / RANGE * row_height * 0.9
            if level[i] < 0.12:          # quiet: lift the pen
                previous = None
                continue
            if previous:
                draw.line([previous, (x, y)], fill=INK, width=int(1 + 7 * level[i]))
            previous = (x, y)

    return image.filter(ImageFilter.SMOOTH)   # soften like ink on paper
