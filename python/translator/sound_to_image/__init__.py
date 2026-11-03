"""Sound -> Image: listen to a song and turn it into pictures.

Each method module has a `convert(audio)` function that takes the shared
audio dictionary (see analysis.prepare) and returns a Pillow image.
"""

from . import (abstract, cymatics, databend, landscape, layers, melody, mosaic,
               oscilloscope, pianoroll, radial, spectrogram, structure)
from .analysis import prepare

# slug -> (display name, convert function)
METHODS = {
    "landscape": ("Landscape painting", landscape.convert),
    "abstract": ("Abstract painting", abstract.convert),
    "spectrogram": ("Spectrogram", spectrogram.convert),
    "radial": ("Radial waveform", radial.convert),
    "pianoroll": ("Piano roll", pianoroll.convert),
    "structure": ("Song structure", structure.convert),
    "melody": ("Melody line", melody.convert),
    "oscilloscope": ("Oscilloscope", oscilloscope.convert),
    "layers": ("Layers", layers.convert),
    "mosaic": ("Hilbert mosaic", mosaic.convert),
    "cymatics": ("Cymatics", cymatics.convert),
    "databend": ("Data bending", databend.convert),
}


def run(method, audio):
    """Make one image (a Pillow Image) from the prepared audio dictionary."""
    return METHODS[method][1](audio)
