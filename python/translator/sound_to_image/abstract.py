# abstract.py
# Abstract painting (parameter mapping, reversed): the song is painted left to
# right with bristle brush strokes, like a gestural abstract painting.
#   notes playing        -> paint color (Scriabin's pitch -> color wheel)
#   loudness             -> how many strokes, how thick, how rich the color
#   timbre brightness    -> height on the canvas (bright sounds sit high)
#   sudden hits (onsets) -> short stabbing dabs; smooth sounds -> long sweeps
#   melody going up/down -> strokes tilt up/down

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from ..tools import shrink_time
from .analysis import chroma, loudness, brightness, onsets
from .brush import stroke, canvas_texture
from .colors import chroma_color

SLICES = 90           # how many moments of the song get painted
CANVAS = (240, 232, 214)  # off-white primed canvas
EARTH = (120, 95, 75)     # a little brown mixed into every color, like real pigment


def convert(audio, width=1200, height=900):
    level = shrink_time(loudness(audio), SLICES)
    bright = shrink_time(brightness(audio), SLICES)
    hits = shrink_time(onsets(audio), SLICES)
    notes = shrink_time(chroma(audio), SLICES)
    rng = np.random.default_rng(len(audio["y"]))

    # 1. underpainting: thin washes of each moment's color, heavily blurred
    wash = Image.new("RGB", (SLICES, 4))
    for i in range(SLICES):
        color = chroma_color(notes[:, i], value=0.55 + 0.4 * level[i])
        for row in range(4):
            wash.putpixel((i, row), color)
    wash = wash.resize((width, height), Image.Resampling.BICUBIC).filter(ImageFilter.GaussianBlur(70))
    image = Image.blend(Image.new("RGB", (width, height), CANVAS), wash, 0.45)
    draw = ImageDraw.Draw(image, "RGBA")

    column = width / SLICES
    # 2. two passes: broad strokes first, then smaller detail strokes on top
    for broad in (True, False):
        for i in range(SLICES):
            count = int((3 if broad else 5) + (12 if broad else 18) * level[i])
            rise = bright[min(i + 1, SLICES - 1)] - bright[max(i - 1, 0)]
            for _ in range(count):
                x = (i + 0.5) * column + rng.normal(0, column * 1.3)
                spread = height * (0.10 + 0.20 * level[i])
                y = height * (0.85 - 0.7 * bright[i]) + rng.normal(0, spread)
                if rng.random() < hits[i] * 0.8:   # a hit: short dab at a random angle
                    angle = rng.uniform(0, np.pi)
                    length = rng.uniform(12, 35)
                else:                              # sustained: long sweep following the melody
                    angle = -rise * 2.5 + rng.normal(0, 0.35)
                    length = rng.uniform(50, 160) * (0.5 + level[i])
                size = (22 if broad else 8) + (40 if broad else 16) * level[i]
                color = chroma_color(notes[:, i], value=0.35 + 0.6 * level[i])
                color = tuple(int(0.78 * c + 0.22 * e) for c, e in zip(color, EARTH))  # real-paint tones
                if rng.random() < 0.06 + 0.15 * hits[i]:
                    color = (250, 246, 235)          # occasional bright highlight
                elif level[i] < 0.25 and rng.random() < 0.5:
                    color = (60, 48, 45)             # quiet passages: dark earthy accents
                stroke(draw, x, y, angle, length, size, color,
                       alpha=120 if broad else 190, rng=rng, curve=0.12)

    return canvas_texture(image, seed=1)
