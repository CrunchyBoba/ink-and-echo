# spectrogram.py
# Spectrogram: time runs left to right, pitch runs bottom (low) to top (high),
# and brightness is loudness. The standard "picture of sound".

from PIL import Image

from ..tools import shrink_time
from .analysis import mel
from .colors import colormap, EMBERS


def convert(audio, width=1600, height=600):
    spec = mel(audio)
    spec = shrink_time(spec, min(width, spec.shape[1]))
    spec = spec[::-1]  # flip so low notes are at the bottom
    image = Image.fromarray(colormap(spec ** 1.5, EMBERS))
    return image.resize((width, height), Image.Resampling.BICUBIC)
