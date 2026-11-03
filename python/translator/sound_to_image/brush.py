# brush.py
# Painting tools used by the two "painting" methods: a bristle brush stroke,
# a canvas texture, and a pass that repaints an image with visible brush strokes.

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter


def stroke(draw, x, y, angle, length, width, color, alpha, rng, curve=0.25):
    """One brush stroke: a solid tapered body of paint, with bristle streaks on top.
    draw must be ImageDraw.Draw(image, "RGBA") so strokes blend.
    angle is in radians; color is (r, g, b)."""
    dx, dy = np.cos(angle), np.sin(angle)   # along the stroke
    px, py = -dy, dx                        # across the stroke
    bend = rng.uniform(-curve, curve) * length
    steps = np.linspace(0, 1, 10)

    def point(t, side):
        """A spot t of the way along the stroke, `side` pixels off its center line."""
        side = side + bend * 4 * t * (1 - t)   # the stroke curves slightly
        return (x + dx * length * t + px * side, y + dy * length * t + py * side)

    def taper(t):
        """Stroke thickness along its length: full in the middle, thin at the ends."""
        return (0.35 + 0.65 * np.sin(np.pi * t)) ** 0.6

    # 1. body of paint
    outline = [point(t, width / 2 * taper(t)) for t in steps]
    outline += [point(t, -width / 2 * taper(t)) for t in steps[::-1]]
    draw.polygon(outline, fill=tuple(color) + (int(alpha * 0.8),))

    # 2. bristle streaks: thin lighter and darker lines along the stroke
    for _ in range(max(2, int(width / 3))):
        side = rng.uniform(-0.45, 0.45) * width
        shade = rng.integers(-28, 29)
        c = tuple(int(min(255, max(0, v + shade))) for v in color)
        end = rng.uniform(0.6, 1.0)        # some bristles run out of paint early
        line = [point(t, side * taper(t)) for t in steps if t <= end]
        if len(line) > 1:
            draw.line(line, fill=c + (int(alpha * 0.5),), width=1)


def canvas_texture(image, strength=0.12, seed=0):
    """Add a woven-canvas texture and a slight raised-paint look."""
    w, h = image.size
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:h, 0:w]
    weave = np.sin(xx * 1.9) * np.sin(yy * 1.9)          # fine cross-hatched threads
    grain = rng.normal(0, 1, (h, w))
    texture = 128 + 128 * strength * (0.6 * weave + 0.4 * grain)
    texture = Image.fromarray(np.clip(texture, 0, 255).astype(np.uint8)).convert("RGB")
    image = ImageChops.soft_light(image, texture)

    # raised paint: light the brush marks from the top left, like thick oil paint
    relief = image.convert("L").filter(ImageFilter.EMBOSS).convert("RGB")
    return Image.blend(image, ImageChops.soft_light(image, relief), 0.35)


def repaint(reference, count, length, width, angle_at, seed=0, alpha=170):
    """Repaint an image with brush strokes that pick up its colors.
    angle_at(x, y) returns the direction strokes should follow at that spot."""
    rng = np.random.default_rng(seed)
    pixels = np.array(reference)
    h, w = pixels.shape[:2]
    canvas = reference.filter(ImageFilter.GaussianBlur(6))  # soft underpainting
    draw = ImageDraw.Draw(canvas, "RGBA")
    for _ in range(count):
        x, y = rng.uniform(0, w), rng.uniform(0, h)
        color = tuple(int(v) for v in pixels[int(y), int(x)])
        size = rng.uniform(0.6, 1.3)
        stroke(draw, x, y, angle_at(x, y) + rng.normal(0, 0.15),
               length * size, width * size, color, alpha, rng, curve=0.1)
    return canvas
