"""Colors for Sound -> Image. Pitches become hues using Scriabin's
color keyboard: the circle of fifths goes around the color wheel
(C red, G orange, D yellow, A green, E sky blue, B blue, F# violet ...)."""

import colorsys

import numpy as np


def pitch_hue(pitch_class):
    """Pitch class (0 = C ... 11 = B) -> hue from 0 to 1."""
    return (pitch_class * 7 % 12) / 12


def chroma_color(column, value=1.0):
    """Blend the colors of the 12 pitches, weighted by how loud each is.
    Returns (r, g, b) with numbers 0-255."""
    weights = np.asarray(column, dtype=float) ** 3  # the strongest pitch dominates
    angles = np.array([pitch_hue(p) for p in range(12)]) * 2 * np.pi
    x = (weights * np.cos(angles)).sum()
    y = (weights * np.sin(angles)).sum()
    hue = (np.arctan2(y, x) / (2 * np.pi)) % 1
    saturation = min(1, np.hypot(x, y) / (weights.sum() + 1e-9) * 1.4)  # clear pitch = vivid
    r, g, b = colorsys.hsv_to_rgb(hue, saturation, value)
    return int(r * 255), int(g * 255), int(b * 255)


def colormap(values, stops):
    """Numbers 0-1 -> colors, blending between a list of (r, g, b) stops."""
    values = np.clip(np.asarray(values, dtype=float), 0, 1)
    positions = np.linspace(0, 1, len(stops))
    stops = np.array(stops, dtype=float)
    channels = [np.interp(values, positions, stops[:, c]) for c in range(3)]
    return np.stack(channels, axis=-1).astype(np.uint8)


def mix(a, b, t):
    """Blend two colors: t = 0 gives a, t = 1 gives b."""
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


# ready-made color ramps
EMBERS = [(0, 0, 4), (40, 11, 84), (140, 41, 129), (229, 92, 48), (252, 255, 164)]
PHOSPHOR = [(0, 0, 0), (0, 60, 30), (40, 200, 120), (220, 255, 230)]
DUSK = [(10, 10, 20), (35, 40, 90), (120, 90, 170), (240, 200, 140), (255, 250, 235)]
