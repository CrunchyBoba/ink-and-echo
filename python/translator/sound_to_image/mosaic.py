# mosaic.py
# Hilbert mosaic (the reverse of Hilbert scanning): the whole song is laid out as
# tiles along the same space-filling curve, so moments that are close in time
# sit close together in the square. Color = notes, brightness = loudness.

from PIL import Image

from ..tools import hilbert_point, shrink_time
from .analysis import chroma, loudness
from .colors import chroma_color

SIZE = 64  # 64 x 64 = 4096 tiles (must be a power of 2)


def convert(audio, pixels=768):
    tiles = SIZE * SIZE
    level = shrink_time(loudness(audio), tiles)
    notes = shrink_time(chroma(audio), tiles)

    image = Image.new("RGB", (SIZE, SIZE))
    for d in range(tiles):
        x, y = hilbert_point(SIZE, d)
        image.putpixel((x, y), chroma_color(notes[:, d], value=0.15 + 0.85 * level[d]))
    return image.resize((pixels, pixels), Image.Resampling.NEAREST)
