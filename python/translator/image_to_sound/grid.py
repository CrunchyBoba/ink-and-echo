"""Steps 1-2 of Image -> Sound: shrink an artwork into a small grid,
then read each cell's color as hue, saturation and value (brightness)."""

import numpy as np
from PIL import Image


def shrink(image, rows=36, width_factor=2, max_cols=300):
    """Shrink an image to a grid `rows` tall.

    Height is fixed because rows become pitches. Width keeps the artwork's
    proportions (wide paintings play longer). `width_factor` adds detail
    left-to-right, since time can carry more detail than pitch can.
    """
    image = image.convert("RGB")
    width, height = image.size
    cols = round(width / height * rows * width_factor)
    cols = max(8, min(cols, max_cols))
    # BOX averages every block of pixels into one cell, like squinting at a painting
    return image.resize((cols, rows), Image.Resampling.BOX)


def get_hsv(small):
    """Three grids (hue, saturation, value), each 0 to 1. Row 0 is the TOP."""
    hsv = np.array(small.convert("HSV"), dtype=float) / 255
    return hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
