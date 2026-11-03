"""The bridge between the website and the Python engine.

The browser runs this file inside a Web Worker with Pyodide. It keeps the
current artwork and the current song in memory, so trying many methods on
the same input doesn't re-send or re-analyze it.
"""

import io

import numpy as np
from PIL import Image

from . import image_to_sound, sound_to_image
from .image_to_sound.factorize import GAP, STAGES
from .image_to_sound.grid import get_hsv, shrink
from .image_to_sound.render import SAMPLE_RATE

_state = {"image": None, "audio": None}


def _to_bytes(data):
    """Accept Python bytes or a JavaScript Uint8Array."""
    return data.to_bytes() if hasattr(data, "to_bytes") else bytes(data)


def _to_samples(data):
    """Accept a NumPy array, a list, or a JavaScript Float32Array."""
    if hasattr(data, "to_bytes"):
        return np.frombuffer(data.to_bytes(), dtype=np.float32)
    return np.asarray(data, dtype=np.float32)


# ---------------- Image -> Sound ----------------

def load_image(data):
    """Remember an uploaded artwork. Returns its size."""
    image = Image.open(io.BytesIO(_to_bytes(data)))
    image.load()
    if image.mode not in ("RGB", "L"):  # flatten transparency onto white
        background = Image.new("RGB", image.size, (255, 255, 255))
        background.paste(image.convert("RGBA"), mask=image.convert("RGBA").split()[3])
        image = background
    _state["image"] = image.convert("RGB")
    return {"width": image.width, "height": image.height}


def image_grid(rows=36, detail=2.0):
    """The grid the computer actually reads, as hue/sat/value bytes (0-255 each)."""
    small = shrink(_state["image"], int(rows), float(detail))
    hue, saturation, value = get_hsv(small)
    hsv = (np.stack([hue, saturation, value], axis=-1) * 255).astype(np.uint8)
    return {"rows": small.height, "cols": small.width, "hsv": hsv.tobytes()}


def make_sound(method, rows=36, step=0.25, detail=2.0):
    """Turn the current artwork into sound. Returns the WAV preview, the MIDI
    file (or None), and a timeline so the website can move a playhead."""
    rows, step, detail = int(rows), float(step), float(detail)
    image = _state["image"]
    wav, midi, heard = image_to_sound.run(method, image, rows, step, detail)
    cols = shrink(image, rows, detail).width

    timeline = {"kind": "columns", "step": step, "cols": cols, "period": None}
    if method == "parameter":
        _, _, value = get_hsv(shrink(image, rows, detail))
        if value.mean() < 0.4:       # dark artworks play 30% slower
            timeline["step"] = step * 1.3
    elif method in ("svd", "nmf"):   # the image plays several times, sharper each pass
        timeline["period"] = cols * step + GAP
        timeline["passes"] = len(STAGES)
    elif method == "hilbert":
        timeline["kind"] = "curve"

    if not heard:
        timeline["kind"] = "silent"
    seconds = (len(wav) - 44) / 2 / SAMPLE_RATE
    return {"wav": wav, "midi": midi, "timeline": timeline, "seconds": seconds, "heard": heard}


# ---------------- Sound -> Image ----------------

def load_sound(left, right, sample_rate, raw=b""):
    """Remember a decoded song (left/right samples). Returns its length."""
    right = _to_samples(right) if right is not None else None
    audio = sound_to_image.prepare(_to_samples(left), right, int(sample_rate), _to_bytes(raw))
    _state["audio"] = audio
    return {"seconds": audio["seconds"]}


def make_image(method):
    """Turn the current song into a PNG image (bytes)."""
    image = sound_to_image.run(method, _state["audio"])
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=False)
    return buffer.getvalue()
