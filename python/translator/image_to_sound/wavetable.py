# wavetable.py
# Wavetable synthesis: each column's brightness, read top to bottom, becomes
# the SHAPE of one sound wave. As the scan moves right, the wave shape morphs,
# so the image changes the tone color itself. WAV only (MIDI can't store wave shapes).

import numpy as np

from .grid import shrink, get_hsv
from .notes import make_pitches
from .render import SAMPLE_RATE

TABLE_SIZE = 256  # points per wave cycle


def convert(image, rows=36, step=0.25, width_factor=2):
    small = shrink(image, rows, width_factor)
    hue, saturation, value = get_hsv(small)
    cols = small.width
    low_pitches = make_pitches(rows)[rows // 2:]  # lower half only, so it doesn't get shrill

    tables = []
    frequencies = []
    for col in range(cols):
        # the column's brightness profile becomes one cycle of a wave
        shape = value[:, col] - value[:, col].mean()
        peak = np.abs(shape).max()
        if peak > 0:
            shape = shape / peak
        wrapped = np.append(shape, shape[0])  # loop back to the start smoothly
        table = np.interp(np.linspace(0, rows, TABLE_SIZE, endpoint=False), np.arange(rows + 1), wrapped)
        tables.append(table)

        # the column's average brightness picks the pitch (bright = higher)
        index = int((1 - value[:, col].mean()) * (len(low_pitches) - 1))
        frequencies.append(440 * 2 ** ((low_pitches[index] - 69) / 12))

    tables = np.array(tables)
    total = int(cols * step * SAMPLE_RATE)
    position = np.arange(total) / (step * SAMPLE_RATE)  # which column we're in, e.g. 3.4
    col_a = position.astype(int)
    col_b = np.minimum(col_a + 1, cols - 1)
    blend = position - col_a  # how far we are toward the next column

    # glide smoothly between column pitches, and step through the wave table
    frequency = np.interp(position, np.arange(cols), frequencies)
    phase = np.cumsum(frequency / SAMPLE_RATE) % 1
    index = (phase * TABLE_SIZE).astype(int)

    # morph between this column's wave shape and the next one's
    return (1 - blend) * tables[col_a, index] + blend * tables[col_b, index]
