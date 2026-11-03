# layers.py
# Layers (the reverse of SVD/NMF build-up): split the song's sound into a few
# ingredients with NMF (roughly: bass, drums, mid instruments, highs...), then
# draw each one as a colored stream whose thickness follows how loud it is.
# Low ingredients are warm colors, high ones are cool colors.

import colorsys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from ..tools import nmf, shrink_time, smooth
from .analysis import mel

LAYERS = 6
STEPS = 500


def convert(audio, width=1600, height=700):
    spectrum = shrink_time(mel(audio) ** 2, STEPS)
    parts, activity = nmf(spectrum, LAYERS)
    # order ingredients from lowest to highest pitch range
    order = np.argsort((parts * np.arange(parts.shape[0])[:, None]).sum(axis=0) / (parts.sum(axis=0) + 1e-9))
    activity = np.array([smooth(activity[k] * parts[:, k].sum(), 9) for k in order])
    activity = activity / (activity.sum(axis=0).max() + 1e-9) * height * 0.8

    # stack the layers around the middle line (a "streamgraph")
    bottom = height / 2 - activity.sum(axis=0) / 2
    xs = np.linspace(0, width, STEPS)

    image = Image.new("RGB", (width, height), (18, 16, 22))
    draw = ImageDraw.Draw(image, "RGBA")
    for k in range(LAYERS):
        hue = 0.02 + 0.6 * k / (LAYERS - 1)     # low -> high: red ... blue
        r, g, b = colorsys.hsv_to_rgb(hue, 0.65, 0.95)
        top = bottom + activity[k]
        outline = list(zip(xs, top)) + list(zip(xs[::-1], bottom[::-1]))
        draw.polygon(outline, fill=(int(r * 255), int(g * 255), int(b * 255), 215))
        bottom = top
    return image.filter(ImageFilter.SMOOTH_MORE)
