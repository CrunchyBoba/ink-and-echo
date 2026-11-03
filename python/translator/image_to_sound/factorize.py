# factorize.py
# Matrix factorization (SVD and NMF): split the brightness grid into layers
# ranked by importance, then play the image several times with more layers each pass.
# Pass 1 is only the single most important pattern (a drone); later passes sharpen it.

import numpy as np

from ..tools import nmf
from .grid import shrink, get_hsv
from .notes import make_pitches, ORGAN
from .scanline import scan

STAGES = [1, 3, 8]  # how many layers each pass uses; change to hear other versions
GAP = 1.0           # seconds of silence between passes


def svd_layers(value, k):
    """Rebuild the grid from its k most important SVD layers."""
    U, S, Vt = np.linalg.svd(value, full_matrices=False)
    return U[:, :k] @ np.diag(S[:k]) @ Vt[:k]


def nmf_layers(value, k):
    """Rebuild the grid from k NMF layers (like SVD, but never negative)."""
    W, H = nmf(value, k)
    return W @ H


def build_up(rebuild, image, rows, step, width_factor):
    small = shrink(image, rows, width_factor)
    hue, saturation, value = get_hsv(small)
    pitches = make_pitches(rows)

    notes = []
    start = 0
    for k in STAGES:
        k = min(k, min(value.shape))
        approx = np.clip(rebuild(value, k), 0, 1)
        notes += scan(approx, pitches, step, start, top_n=4, threshold=0.15, instrument=ORGAN)
        start += small.width * step + GAP
    return notes


def convert_svd(image, rows=36, step=0.25, width_factor=2):
    return build_up(svd_layers, image, rows, step, width_factor)


def convert_nmf(image, rows=36, step=0.25, width_factor=2):
    return build_up(nmf_layers, image, rows, step, width_factor)
