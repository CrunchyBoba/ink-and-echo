# oscilloscope.py
# Oscilloscope (the reverse of wavetable): plot the raw sound wave as a moving dot,
# like an old oscilloscope screen, and let every position it visits glow.
# Stereo songs: left vs right channel (a "goniometer" view of the stereo field).
# Mono songs: the wave vs a slightly delayed copy of itself, which draws loops.

import numpy as np
from PIL import Image, ImageFilter

from .colors import colormap, PHOSPHOR


def convert(audio, size=900):
    left, right = audio["stereo"]
    if np.corrcoef(left, right)[0, 1] > 0.98:     # basically mono
        delay = audio["sr"] // 400                 # 2.5 milliseconds
        x, y = audio["y"][:-delay], audio["y"][delay:]
    else:
        x, y = (left - right) / 1.4, (left + right) / 1.4   # rotate so center = up

    # zoom each direction so the shape fills the screen
    x = x / (np.percentile(np.abs(x), 99.5) + 1e-9)
    y = y / (np.percentile(np.abs(y), 99.5) + 1e-9)
    counts, _, _ = np.histogram2d(y, x, bins=size, range=[[-1.1, 1.1], [-1.1, 1.1]])
    glow = np.log1p(counts)
    glow = glow / (glow.max() + 1e-9)
    image = Image.fromarray(colormap(glow[::-1] ** 0.8, PHOSPHOR))
    halo = image.filter(ImageFilter.GaussianBlur(4))
    return Image.blend(halo, image, 0.6).point(lambda v: min(255, int(v * 1.4)))
