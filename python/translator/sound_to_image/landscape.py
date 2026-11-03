# landscape.py
# Landscape painting: the song becomes mountains under a sky, then the whole
# scene is repainted with brush strokes so it looks like an oil painting.
#   4 mountain ranges   -> 4 pitch ranges (far = high sounds, near = bass),
#                          each ridge rises and falls with that range's loudness over time
#   major / minor       -> daytime sky / dusk sky
#   loudest moment      -> where the sun sits (left = early in the song)
#   brightest moments   -> clouds
#   strongest hits      -> wildflowers in the foreground, in the color of their notes

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

from ..tools import normalize, shrink_time, smooth
from .analysis import chroma, loudness, brightness, onsets, mel, is_minor
from .brush import repaint, stroke, canvas_texture
from .colors import chroma_color, mix

STEPS = 300


def convert(audio, width=1200, height=800):
    rng = np.random.default_rng(len(audio["y"]))
    level = shrink_time(loudness(audio), STEPS)
    bright = shrink_time(brightness(audio), STEPS)
    hits = shrink_time(onsets(audio), STEPS)
    notes = shrink_time(chroma(audio), STEPS)
    song_color = chroma_color(chroma(audio).mean(axis=1), value=0.9)
    horizon = int(height * 0.58)

    # 1. sky: daytime for major-sounding songs, dusk for minor ones
    if is_minor(audio):
        top, low, sun_color = (45, 35, 85), (238, 140, 95), (255, 190, 120)
    else:
        top, low, sun_color = (75, 120, 185), (245, 222, 180), (255, 245, 210)
    top, low = mix(top, song_color, 0.2), mix(low, song_color, 0.15)
    image = Image.new("RGB", (width, height))
    draw = ImageDraw.Draw(image, "RGBA")
    for y in range(height):
        draw.line([(0, y), (width, y)], fill=mix(top, low, min(1, y / horizon)))

    # 2. sun at the loudest moment, with a soft glow
    peak = int(np.argmax(smooth(level, 9)))
    sun_x = (peak + 0.5) / STEPS * width
    sun_y = horizon * (0.75 - 0.5 * bright[peak])
    glow = Image.new("RGB", (width, height), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([sun_x - 160, sun_y - 160, sun_x + 160, sun_y + 160], fill=mix((0, 0, 0), sun_color, 0.55))
    image = ImageChops.add(image, glow.filter(ImageFilter.GaussianBlur(90)))
    draw = ImageDraw.Draw(image, "RGBA")
    radius = 28 + 22 * level[peak]
    draw.ellipse([sun_x - radius, sun_y - radius, sun_x + radius, sun_y + radius], fill=sun_color)

    # 3. clouds at the brightest-sounding moments
    clouds = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    cd = ImageDraw.Draw(clouds)
    for i in np.argsort(bright)[-5:]:
        cx, cy = (i + 0.5) / STEPS * width, rng.uniform(0.12, 0.4) * horizon
        for _ in range(9):
            w, h = rng.uniform(40, 110), rng.uniform(18, 40)
            ox, oy = rng.normal(0, 55), rng.normal(0, 12)
            cd.ellipse([cx + ox - w, cy + oy - h, cx + ox + w, cy + oy + h], fill=(255, 250, 245, 120))
    clouds = clouds.filter(ImageFilter.GaussianBlur(10))
    image.paste(clouds, (0, 0), clouds)
    draw = ImageDraw.Draw(image, "RGBA")

    # 4. four mountain ranges, from the high sounds (far) to the bass (near)
    spectrum = mel(audio)
    bands = [spectrum[96:], spectrum[64:96], spectrum[32:64], spectrum[:32]]
    near_colors = [mix(low, (110, 120, 150), 0.5), (95, 105, 120), (70, 95, 75), (45, 60, 40)]
    for k, band in enumerate(bands):
        # the range's loudness over time, smoothed so it rises and falls like hills
        energy = normalize(smooth(smooth(shrink_time(band.mean(axis=0), STEPS), 35), 35))
        # jagged peaks on top: rougher where the song is bright and busy
        rocky = smooth(rng.normal(0, 1, STEPS).cumsum(), 4)
        rocky = normalize(rocky - smooth(rocky, 40)) - 0.5
        rough = 20 + 60 * smooth(bright, 30) * (1 - k / 4)
        base = horizon + k * height * 0.075
        tall = height * (0.26 - 0.04 * k)
        ridge = [((i + 0.5) / STEPS * width, base - tall * energy[i] - rough[i] * rocky[i])
                 for i in range(STEPS)]
        color = mix(near_colors[k], song_color, 0.12)
        draw.polygon([(0, height), (0, ridge[0][1])] + ridge + [(width, ridge[-1][1]), (width, height)],
                     fill=color)

    # 5. repaint everything with brush strokes: sky strokes run sideways,
    #    land strokes follow the slopes, foreground strokes stand up like grass
    def angle_at(x, y):
        if y > height * 0.88:
            return -np.pi / 2 + rng.normal(0, 0.3)
        if y > horizon - height * 0.3:
            return rng.normal(0, 0.5)
        return rng.normal(0, 0.08)

    painted = repaint(image, count=14000, length=24, width=9, angle_at=angle_at, seed=2)

    # 6. wildflowers where the song hits hardest, dabbed on last
    draw = ImageDraw.Draw(painted, "RGBA")
    for i in np.argsort(hits)[-45:]:
        color = chroma_color(notes[:, i], value=0.95)
        x = (i + 0.5) / STEPS * width + rng.normal(0, 10)
        y = rng.uniform(0.86, 0.98) * height
        for _ in range(3):
            stroke(draw, x + rng.normal(0, 3), y + rng.normal(0, 3), rng.uniform(0, np.pi),
                   rng.uniform(5, 10), rng.uniform(4, 7), color, 220, rng)
    return canvas_texture(painted, seed=3)
