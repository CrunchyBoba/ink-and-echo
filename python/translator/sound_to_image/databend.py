# databend.py
# Raw data bending: read the sound file's raw bytes as if they were pixels
# (every 3 bytes = one red-green-blue pixel). No analysis at all: this is what
# the file "looks like" to a computer. Glitchy, and different for WAV vs MP3.

import numpy as np
from PIL import Image


def convert(audio, width=600, max_height=900):
    data = np.frombuffer(audio["bytes"], dtype=np.uint8)
    if len(data) < width * 3 * 50:   # tiny or missing file: repeat it to fill 50 rows
        data = np.resize(data if len(data) else np.zeros(1, np.uint8), width * 3 * 50)
    height = min(max_height, len(data) // (width * 3))
    start = (len(data) - height * width * 3) // 2   # take bytes from the middle of the file
    pixels = data[start:start + height * width * 3].reshape(height, width, 3)
    return Image.fromarray(pixels).resize((width * 2, height * 2), Image.Resampling.NEAREST)
