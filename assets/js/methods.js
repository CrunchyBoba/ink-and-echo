/* methods.js
 * What each translation method does, in plain words, for the interface.
 * `slug` must match the METHODS keys in python/translator/image_to_sound
 * and python/translator/sound_to_image (their __init__.py files).
 */

export const IMAGE_METHODS = [
  {
    slug: "scanline", name: "Scan line", key: "SCAN",
    desc: "Sweeps left to right, like assistive devices that let blind users hear camera images.",
    maps: [["row", "pitch"], ["value", "volume"]],
  },
  {
    slug: "parameter", name: "Parameter mapping", key: "PARAM",
    desc: "The most song-like. Each color property steers a musical one; instruments follow Kandinsky's color theory.",
    maps: [["hue", "instrument"], ["value", "volume"], ["saturation", "sustain"], ["darkness", "minor key"]],
  },
  {
    slug: "hilbert", name: "Hilbert curve", key: "CURVE",
    desc: "Walks a space-filling zig-zag through the image, so neighboring patches play close together in time.",
    maps: [["path", "time"], ["value", "pitch"], ["hue", "instrument"]],
  },
  {
    slug: "regions", name: "Color regions", key: "REGION",
    desc: "Groups the artwork into six color blobs. Each blob becomes one sustained voice.",
    maps: [["blob color", "instrument"], ["position", "pitch"], ["size", "volume"]],
  },
  {
    slug: "contour", name: "Contour tracing", key: "EDGE",
    desc: "Finds the lines and edges, and lets the melody trace them the way a hand would draw them.",
    maps: [["edges", "melody"], ["edge strength", "volume"]],
  },
  {
    slug: "wavetable", name: "Wavetable", key: "WAVE",
    desc: "Each column's light-to-dark profile becomes the shape of a sound wave, so the image changes the tone itself.",
    maps: [["column shape", "tone color"], ["brightness", "pitch"]], audioOnly: true,
  },
  {
    slug: "svd", name: "SVD build-up", key: "SVD",
    desc: "Plays the image three times: only its most important pattern, then 3, then 8 layers. Value accumulates.",
    maps: [["layers", "passes"], ["importance", "order"]],
  },
  {
    slug: "nmf", name: "NMF build-up", key: "NMF",
    desc: "The same build-up, made of layers that can only add light, never subtract it.",
    maps: [["layers", "passes"], ["parts", "voices"]],
  },
];

export const SOUND_METHODS = [
  {
    slug: "landscape", name: "Landscape painting", key: "LAND", follow: "x",
    desc: "Four mountain ranges follow four pitch ranges over time; the sky reads the key, the sun sits at the loudest moment. Then it's repainted in brush strokes.",
    maps: [["pitch ranges", "mountains"], ["major / minor", "day / dusk"], ["hits", "flowers"]],
  },
  {
    slug: "abstract", name: "Abstract painting", key: "ABSTR", follow: "x",
    desc: "Gestural brush strokes from left to right. Sudden hits become dabs, held notes become long sweeps.",
    maps: [["notes", "paint color"], ["loudness", "stroke size"], ["timbre", "height"]],
  },
  {
    slug: "spectrogram", name: "Spectrogram", key: "SPEC", follow: "x",
    desc: "The standard picture of sound: time runs right, pitch runs up, brightness is loudness.",
    maps: [["time", "x"], ["pitch", "y"], ["loudness", "brightness"]],
  },
  {
    slug: "radial", name: "Radial waveform", key: "RADIAL", follow: "radial",
    desc: "The whole song's loudness wrapped clockwise around a circle, colored by the notes.",
    maps: [["time", "angle"], ["loudness", "length"], ["notes", "color"]],
  },
  {
    slug: "pianoroll", name: "Piano roll", key: "ROLL", follow: "x",
    desc: "Finds which notes are sounding when, and draws them as bars, like sheet music for computers.",
    maps: [["note", "row"], ["time", "x"], ["pitch class", "color"]],
  },
  {
    slug: "structure", name: "Song structure", key: "FORM", follow: "diagonal",
    desc: "Compares every moment with every other. Repeated choruses appear as matching bright blocks.",
    maps: [["similarity", "brightness"], ["sections", "color bands"]],
  },
  {
    slug: "melody", name: "Melody line", key: "LINE", follow: "melody",
    desc: "The main pitch drawn as one continuous ink line, wrapped into rows like handwriting.",
    maps: [["pitch", "height"], ["loudness", "thickness"], ["silence", "pen up"]],
  },
  {
    slug: "oscilloscope", name: "Oscilloscope", key: "SCOPE", follow: null,
    desc: "The raw sound wave traced as a glowing dot, like an old lab screen.",
    maps: [["left channel", "x"], ["right channel", "y"]],
  },
  {
    slug: "layers", name: "Layers", key: "LAYER", follow: "x",
    desc: "Splits the sound into ingredients (bass, drums, highs...) and draws each as a flowing stream.",
    maps: [["ingredient", "color"], ["its loudness", "thickness"]],
  },
  {
    slug: "mosaic", name: "Hilbert mosaic", key: "TILE", follow: "mosaic",
    desc: "The song laid out as 4,096 tiles along a space-filling curve; close in time means close in space.",
    maps: [["notes", "color"], ["loudness", "brightness"]],
  },
  {
    slug: "cymatics", name: "Cymatics", key: "SAND", follow: "cymatics",
    desc: "Simulated sand on vibrating plates (Chladni figures), one plate per ninth of the song.",
    maps: [["main note", "pattern"], ["brightness", "detail"], ["loudness", "sand"]],
  },
  {
    slug: "databend", name: "Data bending", key: "RAW", follow: null,
    desc: "No listening at all: the file's raw bytes shown as pixels. What a song looks like to a computer.",
    maps: [["3 bytes", "1 pixel"]],
  },
];

/** Hilbert curve position, the same as python/translator/tools.py */
export function hilbertPoint(size, d) {
  let x = 0, y = 0;
  for (let s = 1; s < size; s *= 2) {
    const rx = 1 & (d >> 1);
    const ry = 1 & (d ^ rx);
    if (ry === 0) {
      if (rx === 1) { x = s - 1 - x; y = s - 1 - y; }
      [x, y] = [y, x];
    }
    x += s * rx;
    y += s * ry;
    d >>= 2;
  }
  return [x, y];
}

/** Pitch names for the rows of the image grid (top row = highest), matching notes.py */
export function rowNoteNames(count) {
  const scale = [0, 2, 4, 5, 7, 9, 11];
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const out = [];
  for (let octave = 0; out.length < count; octave++) {
    for (const step of scale) {
      if (out.length >= count) break;
      const midi = 36 + 12 * octave + step;
      out.push(names[midi % 12] + (Math.floor(midi / 12) - 1));
    }
  }
  return out.reverse();
}
