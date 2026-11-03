"""Image -> Sound: read an artwork as a grid of colors and play it as music.

Each method module has a `convert(image, rows, step, width_factor)` function
that returns either a list of notes or (for wavetable) raw audio samples.
"""

import numpy as np

from . import contour, factorize, hilbert, parameter, regions, scanline, wavetable
from .render import SAMPLE_RATE, notes_to_midi, notes_to_wav, samples_to_wav

# slug -> (display name, convert function)
METHODS = {
    "scanline": ("Scan line", scanline.convert),
    "parameter": ("Parameter mapping", parameter.convert),
    "hilbert": ("Hilbert curve", hilbert.convert),
    "regions": ("Color regions", regions.convert),
    "contour": ("Contour tracing", contour.convert),
    "wavetable": ("Wavetable", wavetable.convert),
    "svd": ("SVD build-up", factorize.convert_svd),
    "nmf": ("NMF build-up", factorize.convert_nmf),
}


def run(method, image, rows=36, step=0.25, width_factor=2):
    """Convert an image with one method. Returns (wav_bytes, midi_bytes, heard).
    midi_bytes is None for methods that make raw audio (wavetable).
    heard is False when the method found nothing to play (e.g. an all-black
    image, or no edges for contour tracing); the WAV is then 2 s of silence."""
    result = METHODS[method][1](image, rows, step, width_factor)
    if isinstance(result, list):  # a list of notes
        if not result:
            return samples_to_wav(np.zeros(2 * SAMPLE_RATE)), notes_to_midi([]), False
        return notes_to_wav(result), notes_to_midi(result), True
    heard = bool(np.max(np.abs(result)) > 1e-6) if len(result) else False
    if not heard:
        result = np.zeros(2 * SAMPLE_RATE)
    return samples_to_wav(result), None, heard
