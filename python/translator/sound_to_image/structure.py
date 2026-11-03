# structure.py
# Song structure (the reverse of color regions): compare every moment of the song
# with every other moment. Similar moments light up, so repeated choruses appear
# as bright diagonal lines and blocks. The bands along the top and left split the
# song into sections; sections that sound alike (e.g. every chorus) share a color.

import numpy as np
from PIL import Image, ImageDraw

from ..tools import kmeans, segment, shrink_time
from .analysis import chroma, timbre
from .colors import chroma_color, colormap, DUSK

STEPS = 400
SECTIONS = 8       # how many sections to cut the song into
SECTION_TYPES = 4  # how many kinds of section (verse, chorus, ...)


def convert(audio, size=900, band=40):
    features = np.vstack([chroma(audio), timbre(audio) / 50])
    features = shrink_time(features, STEPS)

    # similarity of every moment to every other moment (1 = identical)
    unit = features / (np.linalg.norm(features, axis=0) + 1e-9)
    similar = unit.T @ unit
    low, high = np.percentile(similar, 5), np.percentile(similar, 99)
    similar = np.clip((similar - low) / (high - low + 1e-9), 0, 1) ** 2   # stretch the contrast
    matrix = Image.fromarray(colormap(similar, DUSK)).resize((size, size), Image.Resampling.BICUBIC)

    # cut into sections, then group sections that sound alike
    bounds = segment(features, SECTIONS) + [STEPS]
    count = len(bounds) - 1
    means = np.array([features[:, bounds[i]:bounds[i + 1]].mean(axis=1) for i in range(count)])
    kinds = kmeans(means, SECTION_TYPES)
    kind_colors = {}
    for i, kind in enumerate(kinds):
        if kind not in kind_colors:
            kind_colors[kind] = chroma_color(means[i][:12], value=0.95)  # first 12 = the notes

    image = Image.new("RGB", (size + band, size + band), (10, 10, 20))
    image.paste(matrix, (band, band))
    draw = ImageDraw.Draw(image)
    scale = size / STEPS
    for i in range(count):
        a, b = band + bounds[i] * scale, band + bounds[i + 1] * scale
        color = kind_colors[kinds[i]]
        draw.rectangle([a, 0, b - 2, band - 6], fill=color)   # top band
        draw.rectangle([0, a, band - 6, b - 2], fill=color)   # left band
    return image
