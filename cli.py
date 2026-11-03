"""Run the translator from the terminal (no browser needed).

    python cli.py image painting.jpg                  every Image -> Sound method
    python cli.py image painting.jpg -m parameter     one method
    python cli.py sound song.mp3                      every Sound -> Image method
    python cli.py sound song.mp3 -m landscape         one method

Results go to the `output/` folder. Needs: pip install -r requirements.txt
"""

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "python"))

from translator import api  # noqa: E402
from translator.image_to_sound import METHODS as IMAGE_METHODS  # noqa: E402
from translator.sound_to_image import METHODS as SOUND_METHODS  # noqa: E402


def image_to_sound(path, methods, rows, step, detail, out):
    size = api.load_image(Path(path).read_bytes())
    print(f"Loaded {path} ({size['width']} x {size['height']})")
    for method in methods:
        start = time.time()
        result = api.make_sound(method, rows, step, detail)
        base = out / f"{Path(path).stem}-{method}"
        base.with_suffix(".wav").write_bytes(result["wav"])
        if result["midi"]:
            base.with_suffix(".mid").write_bytes(result["midi"])
        print(f"  {IMAGE_METHODS[method][0]:20} {result['seconds']:5.0f} s of sound  ({time.time() - start:.1f} s)")


def sound_to_image(path, methods, out):
    import numpy as np
    import soundfile  # reads WAV, FLAC, OGG and MP3

    samples, rate = soundfile.read(path, dtype="float32", always_2d=True)
    right = samples[:, 1] if samples.shape[1] > 1 else None
    info = api.load_sound(np.ascontiguousarray(samples[:, 0]), right, rate, Path(path).read_bytes())
    print(f"Loaded {path} ({info['seconds']:.0f} s)")
    for method in methods:
        start = time.time()
        png = api.make_image(method)
        (out / f"{Path(path).stem}-{method}.png").write_bytes(png)
        print(f"  {SOUND_METHODS[method][0]:20} ({time.time() - start:.1f} s)")


def main():
    parser = argparse.ArgumentParser(description="SYN-1: translate between images and sound.")
    parser.add_argument("direction", choices=["image", "sound"], help="what you are starting from")
    parser.add_argument("file", help="the image or sound file")
    parser.add_argument("-m", "--method", help="one method slug (default: all)")
    parser.add_argument("--rows", type=int, default=36, help="image -> sound: number of pitches")
    parser.add_argument("--step", type=float, default=0.25, help="image -> sound: seconds per column")
    parser.add_argument("--detail", type=float, default=2.0, help="image -> sound: extra detail left to right")
    parser.add_argument("-o", "--out", default="output", help="folder for the results")
    args = parser.parse_args()

    available = IMAGE_METHODS if args.direction == "image" else SOUND_METHODS
    if args.method and args.method not in available:
        parser.error(f"unknown method '{args.method}'. Choose from: {', '.join(available)}")
    methods = [args.method] if args.method else list(available)
    out = Path(args.out)
    out.mkdir(exist_ok=True)

    if args.direction == "image":
        image_to_sound(args.file, methods, args.rows, args.step, args.detail, out)
    else:
        sound_to_image(args.file, methods, out)
    print(f"Saved to {out}/")


if __name__ == "__main__":
    main()
