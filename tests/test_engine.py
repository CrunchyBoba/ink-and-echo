"""Smoke tests: every method runs and produces a valid file.

Run with:  python -m pytest
"""

import io
import json
import re
import struct
import sys
from pathlib import Path

import numpy as np
import pytest
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "python"))

from translator import api  # noqa: E402
from translator.image_to_sound import METHODS as IMAGE_METHODS  # noqa: E402
from translator.sound_to_image import METHODS as SOUND_METHODS  # noqa: E402


def make_artwork():
    image = Image.new("RGB", (480, 300), (240, 230, 200))
    draw = ImageDraw.Draw(image)
    draw.ellipse((30, 30, 180, 180), fill=(30, 60, 180))
    draw.rectangle((220, 60, 320, 260), fill=(230, 200, 20))
    draw.polygon([(360, 280), (440, 40), (470, 280)], fill=(200, 30, 30))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def make_song(seconds=8, rate=22050):
    t = np.arange(int(seconds * rate)) / rate
    melody = np.sin(2 * np.pi * 440 * 2 ** (np.floor(t * 2) % 5 / 12) * t)
    bass = 0.5 * np.sin(2 * np.pi * 110 * t)
    left = (0.4 * melody + bass) * (0.5 + 0.5 * (t % 1 < 0.5))
    right = 0.6 * melody + 0.3 * bass
    return left.astype(np.float32), right.astype(np.float32), rate


@pytest.fixture(scope="module")
def loaded_image():
    api.load_image(make_artwork())


@pytest.fixture(scope="module")
def loaded_sound():
    left, right, rate = make_song()
    api.load_sound(left, right, rate, np.random.default_rng(0).bytes(1_200_000))


@pytest.mark.parametrize("method", list(IMAGE_METHODS))
def test_image_to_sound(loaded_image, method):
    result = api.make_sound(method, rows=24, step=0.1, detail=1.5)
    wav = result["wav"]
    assert wav[:4] == b"RIFF" and wav[8:12] == b"WAVE"
    assert result["seconds"] > 1
    if method == "wavetable":
        assert result["midi"] is None
    else:
        midi = result["midi"]
        assert midi[:4] == b"MThd"
        track_length = struct.unpack(">I", midi[18:22])[0]
        assert len(midi) == 22 + track_length and midi.endswith(b"\xff\x2f\x00")


def test_image_grid(loaded_image):
    grid = api.image_grid(rows=24, detail=2)
    assert grid["rows"] == 24
    assert len(grid["hsv"]) == grid["rows"] * grid["cols"] * 3


@pytest.mark.parametrize("method", list(SOUND_METHODS))
def test_sound_to_image(loaded_sound, method):
    image = Image.open(io.BytesIO(api.make_image(method)))
    assert image.width > 100 and image.height > 100
    assert np.array(image.convert("L")).std() > 1  # not a blank picture


def encode(image, fmt="PNG"):
    buffer = io.BytesIO()
    image.save(buffer, format=fmt)
    return buffer.getvalue()


EDGE_IMAGES = {
    "all-black": (Image.new("RGB", (400, 300)), "PNG"),
    "one-color": (Image.new("RGB", (400, 300), (20, 120, 220)), "PNG"),
    "tiny": (Image.new("RGB", (6, 4), (200, 30, 30)), "PNG"),
    "transparent": (Image.new("RGBA", (300, 200), (0, 0, 0, 0)), "PNG"),
    "grayscale": (Image.linear_gradient("L").resize((300, 200)), "PNG"),
    "panorama": (Image.new("RGB", (6000, 400), (240, 240, 240)), "PNG"),
    "gif": (Image.new("P", (200, 200)), "GIF"),
}


@pytest.mark.parametrize("name", list(EDGE_IMAGES))
def test_unusual_images_never_crash(name):
    image, fmt = EDGE_IMAGES[name]
    api.load_image(encode(image, fmt))
    for method in IMAGE_METHODS:
        result = api.make_sound(method)
        assert result["wav"][:4] == b"RIFF"
        assert isinstance(result["heard"], bool)


@pytest.mark.parametrize("samples", [np.zeros(5 * 22050), np.ones(30), np.zeros(0)], ids=["silent", "30-samples", "empty"])
def test_unusual_sounds_never_crash(samples):
    api.load_sound(np.asarray(samples, dtype=np.float32), None, 22050, b"")
    for method in SOUND_METHODS:
        Image.open(io.BytesIO(api.make_image(method))).verify()


def test_browser_manifest_is_up_to_date():
    sys.path.insert(0, str(ROOT / "scripts"))
    from build_manifest import build

    manifest = json.loads((ROOT / "python" / "manifest.json").read_text())
    assert manifest == build(), "the engine changed: run  python scripts/build_manifest.py"


def test_website_methods_match_python():
    js = (ROOT / "assets" / "js" / "methods.js").read_text()
    image_part, sound_part = js.split("export const SOUND_METHODS")
    assert re.findall(r'slug: "(\w+)"', image_part) == list(IMAGE_METHODS)
    assert re.findall(r'slug: "(\w+)"', sound_part) == list(SOUND_METHODS)
