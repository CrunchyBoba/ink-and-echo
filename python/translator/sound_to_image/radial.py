# radial.py
# Radial waveform: the song's loudness wrapped clockwise around a circle,
# starting at the top. Each spoke is colored by the notes playing at that moment.

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from ..tools import shrink_time
from .analysis import chroma, loudness
from .colors import chroma_color

SPOKES = 720


def convert(audio, size=1000):
    level = shrink_time(loudness(audio), SPOKES)
    notes = shrink_time(chroma(audio), SPOKES)

    image = Image.new("RGB", (size, size), (12, 12, 18))
    draw = ImageDraw.Draw(image)
    center = size / 2
    inner = size * 0.18
    for i in range(SPOKES):
        angle = i / SPOKES * 2 * np.pi - np.pi / 2   # start at 12 o'clock
        reach = inner + level[i] * size * 0.30
        color = chroma_color(notes[:, i], value=0.35 + 0.65 * level[i])
        start = (center + np.cos(angle) * (inner - level[i] * size * 0.08),
                 center + np.sin(angle) * (inner - level[i] * size * 0.08))
        end = (center + np.cos(angle) * reach, center + np.sin(angle) * reach)
        draw.line([start, end], fill=color, width=3)

    glow = image.filter(ImageFilter.GaussianBlur(12))   # soft glow behind the spokes
    return Image.blend(glow, image, 0.7).point(lambda v: min(255, int(v * 1.3)))
