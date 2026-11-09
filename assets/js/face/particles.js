/* particles.js
 * Turn a portrait into a halftone grid of particles, decide when each particle
 * appears based on the song, and draw the face being built at any moment.
 *
 *   photo darkness  -> particle size (the finished grid reads as the face)
 *   song pitch      -> WHERE particles appear: low notes fill the dark areas
 *                      (hair, shadows), high notes fill the highlights
 *   song loudness   -> HOW FAST they appear: loud passages build a lot at once
 *   beats           -> fresh particles swell on each beat
 *   notes playing   -> color, in the "song" and "blend" color modes
 */

export const SHAPES = [
  { id: "circle", name: "Circle" },
  { id: "ellipse", name: "Ellipse" },
  { id: "dash", name: "Dash" },
  { id: "crescent", name: "Crescent" },
  { id: "square", name: "Square" },
  { id: "diamond", name: "Diamond" },
];

export const COLORS = [
  { id: "ink", name: "Ink", note: "Black and white, like the halftone in the book" },
  { id: "photo", name: "Photo", note: "Each particle takes the person's real color" },
  { id: "song", name: "Song", note: "Each particle takes the color of the notes playing when it appeared" },
  { id: "blend", name: "Blend", note: "The photo's light and dark, tinted with the song's colors" },
];

export const PAPER = { light: "#efebe2", dark: "#0d0d0d" };
const INK = { light: "#141414", dark: "#f1ede4" };
const POP = 0.35;      // seconds for a particle to pop in
const SETTLE = 2.2;    // after this long a particle stops reacting to beats
const FINISH = 0.92;   // the face is complete at 92% of the snippet

/* ---------------------------------------------------------------- colors */

function hsvToRgb(h, s, v) {
  const i = Math.floor(h * 6), f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][((i % 6) + 6) % 6].map((c) => Math.round(c * 255));
}

/** Scriabin's color keyboard: the circle of fifths around the color wheel (C red, G orange...). */
function songHue(chroma) {
  let x = 0, y = 0, total = 0;
  for (let p = 0; p < 12; p++) {
    const w = chroma[p] ** 3;
    const angle = (((p * 7) % 12) / 12) * Math.PI * 2;
    x += w * Math.cos(angle); y += w * Math.sin(angle); total += w;
  }
  const hue = ((Math.atan2(y, x) / (Math.PI * 2)) % 1 + 1) % 1;
  const clarity = Math.min(1, Math.hypot(x, y) / (total || 1) * 1.4);
  return { hue, clarity };
}

/* ------------------------------------------------------------------ grid */

/** A deterministic random number generator, so a face always builds the same way. */
function seeded(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/**
 * Sample the portrait into a grid of particles.
 * cols: particles across. paper: "light" (dark ink on paper) or "dark" (light on black).
 */
export function makeGrid(portrait, cols, paper = "light") {
  const rows = Math.round((cols * portrait.height) / portrait.width);
  // shrink in two steps for a clean average of each cell
  const mid = document.createElement("canvas");
  mid.width = cols * 4; mid.height = rows * 4;
  const m = mid.getContext("2d");
  m.imageSmoothingQuality = "high";
  m.drawImage(portrait, 0, 0, mid.width, mid.height);
  const small = document.createElement("canvas");
  small.width = cols; small.height = rows;
  const s = small.getContext("2d", { willReadFrequently: true });
  s.imageSmoothingQuality = "high";
  s.drawImage(mid, 0, 0, cols, rows);
  const data = s.getImageData(0, 0, cols, rows).data;

  // stretch the contrast of each face to the full range, so all faces match
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = (r * cols + c) * 4;
      if (data[i + 3] < 110) continue;  // background (cut out)
      const rgb = [data[i], data[i + 1], data[i + 2]];
      cells.push({ c, r, rgb, light: (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255 });
    }
  }
  const sorted = cells.map((p) => p.light).sort((a, b) => a - b);
  const low = sorted[Math.floor(sorted.length * 0.02)] ?? 0;
  const high = sorted[Math.floor(sorted.length * 0.98)] ?? 1;

  const particles = [];
  for (const cell of cells) {
    const light = Math.min(1, Math.max(0, (cell.light - low) / ((high - low) || 1)));
    const tone = Math.pow(paper === "light" ? 1 - light : light, 0.9);
    if (tone < 0.04) continue;  // nearly blank: no particle
    particles.push({ x: (cell.c + 0.5) / cols, y: (cell.r + 0.5) / rows, tone, light, rgb: cell.rgb, t: 0, song: [0, 0, 0], hue: 0 });
  }
  return { cols, rows, paper, particles };
}

/* -------------------------------------------------------------- schedule */

/**
 * Decide when each particle appears, from the song measurements (see listen.js).
 * Modifies the particles in place and sorts them by appearance time.
 */
export function schedule(grid, sound) {
  const { particles } = grid;
  const n = particles.length;
  const random = seeded(n * 31 + grid.cols);
  const BANDS = 8;

  // sort particles into 8 tone bands, lightest (0) to darkest (7);
  // inside each band, the face grows outward from its center
  const byTone = [...particles].sort((a, b) => a.tone - b.tone);
  const bands = Array.from({ length: BANDS }, () => []);
  byTone.forEach((p, i) => bands[Math.min(BANDS - 1, Math.floor((i / n) * BANDS))].push(p));
  for (const band of bands) {
    band.sort((a, b) => (Math.hypot(a.x - 0.5, a.y - 0.42) + random() * 0.18) - (Math.hypot(b.x - 0.5, b.y - 0.42) + random() * 0.18));
  }
  const next = new Array(BANDS).fill(0);

  // how much of the face each frame gets: louder and more percussive = more
  const usable = Math.max(1, Math.floor(sound.frames * FINISH));
  const energy = [];
  let total = 0;
  for (let f = 0; f < usable; f++) {
    const e = 0.15 + sound.loud[f] + 1.2 * sound.onset[f];
    energy.push(e); total += e;
  }

  let placed = 0, running = 0;
  for (let f = 0; f < usable && placed < n; f++) {
    running += energy[f];
    const target = f === usable - 1 ? n : Math.round((running / total) * n);
    // low register -> dark band, high register -> light band
    const want = Math.round((1 - sound.register[f]) * (BANDS - 1));
    const { hue, clarity } = songHue(sound.chroma[f]);
    while (placed < target) {
      let band = -1;
      for (let d = 0; d < BANDS && band < 0; d++) {
        for (const candidate of [want - d, want + d]) {
          if (candidate >= 0 && candidate < BANDS && next[candidate] < bands[candidate].length) { band = candidate; break; }
        }
      }
      const p = bands[band][next[band]++];
      p.t = f * sound.frameTime + random() * sound.frameTime;
      p.hue = hue;
      p.song = hsvToRgb(hue, 0.3 + 0.45 * clarity, 0.86);  // rich but not neon
      placed++;
    }
  }
  particles.sort((a, b) => a.t - b.t);
  grid.beats = sound.beats;
  grid.duration = sound.duration;
  return grid;
}

/* --------------------------------------------------------------- drawing */

function particleColor(p, mode, paper) {
  switch (mode) {
    case "photo": {
      // boost saturation a little so small particles still read as colored
      const [r, g, b] = p.rgb, avg = (r + g + b) / 3;
      return `rgb(${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, avg + (v - avg) * 1.35)))).join(",")})`;
    }
    case "song": return `rgb(${p.song.join(",")})`;
    case "blend": {
      const value = paper === "light" ? 0.12 + 0.75 * p.light : 0.25 + 0.75 * p.light;
      return `rgb(${hsvToRgb(p.hue, 0.55, value).join(",")})`;
    }
    default: return INK[paper];
  }
}

/** Draw one particle. size is 0-1 (its tone), cell is the grid spacing in pixels. */
export function drawShape(ctx, shape, x, y, size, cell) {
  const k = Math.sqrt(Math.max(0, size));
  ctx.beginPath();
  switch (shape) {
    case "ellipse":
      ctx.ellipse(x, y, 0.56 * cell * k, 0.3 * cell * k, 0, 0, Math.PI * 2);
      break;
    case "dash":
      ctx.ellipse(x, y, 0.22 * cell * k, 0.56 * cell * Math.sqrt(k), 0, 0, Math.PI * 2);
      break;
    case "crescent": {
      // a circle with a round bite taken out of its upper right
      const r = 0.54 * cell * k, d = 0.42 * r, R = 0.85 * r, a = -Math.PI / 4;
      const cx = x + d * Math.cos(a), cy = y + d * Math.sin(a);
      const theta = Math.acos((r * r + d * d - R * R) / (2 * r * d));  // where the two circles cross
      const p1 = [x + r * Math.cos(a + theta), y + r * Math.sin(a + theta)];
      const p2 = [x + r * Math.cos(a - theta), y + r * Math.sin(a - theta)];
      ctx.arc(x, y, r, a + theta, a - theta + Math.PI * 2);         // the outer edge, the long way round
      const b2 = Math.atan2(p2[1] - cy, p2[0] - cx), b1 = Math.atan2(p1[1] - cy, p1[0] - cx);
      const span = (((b1 - b2) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const facing = ((((a + Math.PI) - b2) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      ctx.arc(cx, cy, R, b2, b1, facing > span);                     // the inner edge of the bite
      ctx.closePath();
      break;
    }
    case "square": {
      const h = 0.45 * cell * k;
      ctx.rect(x - h, y - h, 2 * h, 2 * h);
      break;
    }
    case "diamond": {
      const h = 0.62 * cell * k;
      ctx.moveTo(x, y - h); ctx.lineTo(x + h, y); ctx.lineTo(x, y + h); ctx.lineTo(x - h, y); ctx.closePath();
      break;
    }
    default:
      ctx.arc(x, y, 0.5 * cell * k, 0, Math.PI * 2);
  }
  ctx.fill("evenodd");
}

function easeOutBack(t) {
  const c = 1.9;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}

/**
 * Draws a face at any moment of its build. Particles that have settled are
 * painted once onto a hidden layer, so each frame only redraws the fresh ones.
 */
export class FaceRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.layer = document.createElement("canvas");
    this.style = { shape: "circle", color: "ink" };
    this.caption = null;
  }

  /** grid: from makeGrid + schedule. width: pixel width to draw at. */
  setup(grid, style, width, caption = null) {
    this.grid = grid;
    this.style = { ...style };
    this.caption = caption;
    this.faceHeight = Math.round((width * grid.rows) / grid.cols);
    this.band = caption ? Math.round(width * 0.12) : 0;  // a strip below the face for the name
    for (const c of [this.canvas, this.layer]) { c.width = width; c.height = this.faceHeight + this.band; }
    this.reset();
  }

  reset() {
    this.baked = 0;
    this.last = -1;
    const ctx = this.layer.getContext("2d");
    ctx.fillStyle = PAPER[this.grid.paper];
    ctx.fillRect(0, 0, this.layer.width, this.layer.height);
  }

  /** Draw the build at `time` seconds into the snippet (Infinity = finished). */
  draw(time) {
    if (!this.grid) return;
    if (time < this.last) this.reset();
    this.last = time;
    const { particles, paper, beats = [] } = this.grid;
    const { shape, color } = this.style;
    const w = this.canvas.width, h = this.faceHeight;
    const cell = w / this.grid.cols;

    const layer = this.layer.getContext("2d");
    while (this.baked < particles.length && particles[this.baked].t + SETTLE <= time) {
      const p = particles[this.baked++];
      layer.fillStyle = particleColor(p, color, paper);
      drawShape(layer, shape, p.x * w, p.y * h, p.tone, cell);
    }

    const ctx = this.canvas.getContext("2d");
    ctx.drawImage(this.layer, 0, 0);

    // swell on the most recent beat
    let sinceBeat = Infinity;
    for (let i = beats.length - 1; i >= 0; i--) if (beats[i] <= time) { sinceBeat = time - beats[i]; break; }
    const pulse = sinceBeat < 0.15 ? 1 + 0.22 * (1 - sinceBeat / 0.15) : 1;

    for (let i = this.baked; i < particles.length && particles[i].t <= time; i++) {
      const p = particles[i];
      const age = time - p.t;
      const grow = age < POP ? Math.max(0, easeOutBack(age / POP)) : 1;
      ctx.fillStyle = particleColor(p, color, paper);
      drawShape(ctx, shape, p.x * w, p.y * h, p.tone * grow * grow * pulse, cell);
    }
    if (this.caption) this.drawCaption(ctx, w, this.canvas.height);
  }

  drawCaption(ctx, w, h) {
    const { name, song } = this.caption;
    const ink = INK[this.grid.paper];
    ctx.fillStyle = ink;
    ctx.textAlign = "left";
    ctx.font = `600 ${Math.round(w * 0.042)}px Inter, Helvetica, Arial, sans-serif`;
    ctx.fillText((name || "").toUpperCase(), w * 0.05, h - w * 0.062);
    ctx.font = `400 ${Math.round(w * 0.026)}px Inter, Helvetica, Arial, sans-serif`;
    ctx.globalAlpha = 0.7;
    ctx.fillText(song ? `built by ${song}` : "", w * 0.05, h - w * 0.024);
    ctx.globalAlpha = 1;
  }
}
