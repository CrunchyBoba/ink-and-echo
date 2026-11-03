"""Image -> Sound: read an artwork as a grid of colors and play it as music.

Each method module has a `convert(image, rows, step, width_factor)` function
that returns either a list of notes or (for wavetable) raw audio samples.
"""

from . import contour, factorize, hilbert, parameter, regions, scanline, wavetable
from .render import notes_to_midi, notes_to_wav, samples_to_wav

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
    """Convert an image with one method. Returns (wav_bytes, midi_bytes);
    midi_bytes is None for methods that make raw audio (wavetable)."""
    result = METHODS[method][1](image, rows, step, width_factor)
    if isinstance(result, list):  # a list of notes
        return notes_to_wav(result), notes_to_midi(result)
    return samples_to_wav(result), None
