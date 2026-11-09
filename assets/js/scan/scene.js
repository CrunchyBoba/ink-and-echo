/* scene.js
 * Everything you see in "Scanned", drawn on a 1280 x 720 canvas.
 *
 * The look borrows from two places:
 *   - the face is drawn IN the barcode: each of the 95 bars becomes a vertical
 *     stroke whose thickness follows how dark the face is at that height
 *   - behind it, a deep-blue photo montage (after Shin Matsunaga's 1965
 *     "Montage"): a ghost of the face and drifting, overlapping words
 */

export const W = 1280, H = 720;
const LABEL = { x: 64, y: 40, w: 500, h: 640 };            // the paper label
const FACE = { x: LABEL.x + 18, y: LABEL.y + 18, w: LABEL.w - 36, h: 490 };
const STRIP = { x: FACE.x, y: FACE.y + FACE.h + 14, w: FACE.w, h: 64 };
const PAPER = "#f4f1e8", INK = "#121212", BLUE_DARK = "#0c1730", BLUE = "#1d3767", PALE = "#cdd9ef";
const RED = "#ff2a1a", YELLOW = "#ffe600";
const SANS = "Inter, 'Helvetica Neue', Arial, sans-serif";
const MODEL = "Michroma, Inter, sans-serif";

function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

/** Crop a 600x800 portrait to the face window's shape (keeping the top, where the face is). */
function cropToFace(portrait) {
  const out = canvas(FACE.w, FACE.h);
  const scale = FACE.w / portrait.width;
  const h = FACE.h / scale;
  const top = Math.max(0, Math.min(portrait.height - h, portrait.height * 0.1));
  out.getContext("2d").drawImage(portrait, 0, top, portrait.width, h, 0, 0, FACE.w, FACE.h);
  return out;
}

/**
 * The face drawn in the barcode. Returns { revealed, ghost } canvases (FACE size):
 * revealed = the finished portrait, ghost = just the faint barcode before scanning.
 */
export function barcodePortrait(portrait, barcode) {
  const face = cropToFace(portrait);
  const n = barcode.modules.length;
  // darkness of each module column at each pixel row
  const thin = canvas(n, FACE.h);
  const t = thin.getContext("2d", { willReadFrequently: true });
  t.imageSmoothingQuality = "high";
  t.drawImage(face, 0, 0, n, FACE.h);
  const px = t.getImageData(0, 0, n, FACE.h).data;
  const lights = [];
  for (let i = 0; i < n * FACE.h; i++) if (px[i * 4 + 3] > 100) lights.push((0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255);
  lights.sort((a, b) => a - b);
  const low = lights[Math.floor(lights.length * 0.02)] ?? 0, high = lights[Math.floor(lights.length * 0.98)] ?? 1;

  const render = (ghostOnly) => {
    const out = canvas(FACE.w, FACE.h);
    const ctx = out.getContext("2d");
    const img = ctx.createImageData(FACE.w, FACE.h);
    const mw = FACE.w / n;
    const paper = [244, 241, 232], ink = [18, 18, 18];
    for (let y = 0; y < FACE.h; y++) {
      for (let x = 0; x < FACE.w; x++) {
        const m = Math.min(n - 1, Math.floor(x / mw));
        const black = barcode.modules[m];
        const i = (y * n + m) * 4;
        let dark = 0;
        if (px[i + 3] > 100) {
          const light = (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) / 255;
          dark = Math.pow(1 - Math.min(1, Math.max(0, (light - low) / ((high - low) || 1))), 0.85);
        }
        // stroke width as a share of the module: the face's darkness, plus a little extra on black bars
        const width = ghostOnly ? (black ? 0.22 : 0) : Math.min(1, dark * 0.95 + (black ? 0.2 : 0));
        const offset = Math.abs((x + 0.5) - (m + 0.5) * mw) / mw;      // 0 at the module's center line
        const cover = Math.max(0, Math.min(1, (width / 2 - offset) * mw + 0.5));
        const alpha = ghostOnly ? cover * 0.55 : cover;
        const o = (y * FACE.w + x) * 4;
        for (let c = 0; c < 3; c++) img.data[o + c] = paper[c] + (ink[c] - paper[c]) * alpha;
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return out;
  };
  return { revealed: render(false), ghost: render(true), faceCrop: face };
}

/** The real, scannable bars plus digits under the portrait. */
function drawStrip(ctx, barcode, progress = 1) {
  const n = barcode.modules.length;
  const mw = STRIP.w / n;
  const guards = new Set([0, 2, 46, 48, 92, 94]);
  ctx.fillStyle = INK;
  for (let m = 0; m < n; m++) {
    if (!barcode.modules[m]) continue;
    const tall = guards.has(m) ? 10 : 0;
    ctx.globalAlpha = (m + 0.5) / n <= progress ? 1 : 0.25;
    ctx.fillRect(STRIP.x + m * mw, STRIP.y, mw + 0.4, STRIP.h - 14 + tall);
  }
  ctx.globalAlpha = 1;
  ctx.font = `500 15px ui-monospace, Menlo, monospace`;
  ctx.textAlign = "center";
  barcode.digitSpans.forEach(([a, b], i) => {
    ctx.fillStyle = INK;
    ctx.fillText(barcode.digits[i], STRIP.x + ((a + b) / 2) * mw, STRIP.y + STRIP.h + 4);
  });
}

/* --------------------------------------------------------- the backdrop */

const texture = (() => {
  // fine horizontal weave, like the woven pixel picture in the book
  const c = canvas(4, 4);
  const g = c.getContext("2d");
  g.fillStyle = "rgba(255,255,255,0.05)"; g.fillRect(0, 0, 4, 1);
  g.fillStyle = "rgba(0,0,0,0.12)"; g.fillRect(0, 2, 4, 1);
  return c;
})();

function seeded(seed) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}

/** Words that drift and overlap behind the label, Matsunaga-style. */
function makeWords(words, seed) {
  const random = seeded(seed);
  return words.map((text, i) => ({
    text, size: 40 + random() * 150, x: random() * W, y: 60 + random() * (H - 60),
    speed: (random() - 0.5) * 9, alpha: 0.07 + random() * 0.16, tilt: (random() - 0.5) * 0.06,
    weight: random() > 0.4 ? 800 : 300, layer: i % 3,
  }));
}

function drawBackdrop(ctx, t, words, ghost) {
  const sky = ctx.createLinearGradient(0, 0, W * 0.4, H);
  sky.addColorStop(0, BLUE_DARK); sky.addColorStop(1, BLUE);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  if (ghost) {
    // the face, huge and faint, bleeding through the blue
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.globalCompositeOperation = "screen";
    const s = 1.55, gw = ghost.width * s, gh = ghost.height * s;
    ctx.drawImage(ghost, W - gw * 0.92 - t * 2.2, H / 2 - gh * 0.45, gw, gh);
    ctx.restore();
  }
  for (const word of words) {
    ctx.save();
    ctx.globalAlpha = word.alpha;
    ctx.fillStyle = PALE;
    ctx.font = `${word.weight} ${Math.round(word.size)}px ${SANS}`;
    ctx.translate(((word.x + word.speed * t) % (W + 600)) - 300, word.y);
    ctx.rotate(word.tilt);
    ctx.fillText(word.text, 0, 0);
    ctx.restore();
  }
  ctx.fillStyle = ctx.createPattern(texture, "repeat");
  ctx.fillRect(0, 0, W, H);
}

/* ---------------------------------------------------------- text panel */

function label(ctx, text, x, y, size = 12, color = PALE) {
  ctx.font = `700 ${size}px ${SANS}`;
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  ctx.letterSpacing = "3px";
  ctx.fillText(text.toUpperCase(), x, y);
  ctx.letterSpacing = "0px";
}

function priceTag(ctx, text, x, y, fill = YELLOW, color = INK) {
  ctx.font = `800 34px ${SANS}`;
  const w = ctx.measureText(text).width + 46;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x, y - 26); ctx.lineTo(x + w, y - 26); ctx.lineTo(x + w, y + 22); ctx.lineTo(x, y + 22); ctx.lineTo(x - 18, y - 2);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#0c1730";
  ctx.beginPath(); ctx.arc(x - 2, y - 2, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = color;
  ctx.fillText(text, x + 18, y + 10);
}

function stamp(ctx, text, x, y, color, rotation, alpha = 1, size = 54) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.font = `900 ${size}px ${SANS}`;
  ctx.textAlign = "center";
  const w = ctx.measureText(text).width + 36;
  ctx.strokeStyle = color; ctx.lineWidth = 5;
  ctx.strokeRect(-w / 2, -size * 0.85, w, size * 1.2);
  ctx.fillStyle = color;
  ctx.fillText(text, 0, size * 0.18);
  ctx.restore();
}

function laser(ctx, x, top, bottom) {
  ctx.save();
  ctx.shadowColor = RED; ctx.shadowBlur = 22;
  ctx.fillStyle = RED;
  ctx.fillRect(x - 1.5, top - 12, 3, bottom - top + 24);
  ctx.globalAlpha = 0.18;
  ctx.fillRect(x - 14, top - 12, 28, bottom - top + 24);
  ctx.restore();
}

function easeOut(x) { return 1 - (1 - Math.min(1, Math.max(0, x))) ** 3; }

/* -------------------------------------------------------------- scenes */

/**
 * A person's scene. person: from people.json; art: { revealed, ghost, faceCrop, photo };
 * timing: { duration, scanStart, scanEnd }; index/total for the "01 / 03" counter.
 */
export function makePersonScene(person, art, barcode, timing, index, total) {
  const words = makeWords([
    person.item.toUpperCase(), barcode ? `$${person.price.toFixed(2)}` : "NOT FOR SALE", person.years,
    "PAID", "NO RETURNS", "VALUE", "QTY 1", person.name.split(" ").pop().toUpperCase(), "PRICE",
    barcode ? barcode.digits : "PRICELESS", "SCAN", "SKU", "TOTAL",
  ], index * 97 + 13);
  const { scanStart, scanEnd } = timing;

  return (ctx, t) => {
    drawBackdrop(ctx, t, words, art.faceCrop);
    const progress = Math.min(1, Math.max(0, (t - scanStart) / (scanEnd - scanStart)));

    // the paper label
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 30; ctx.shadowOffsetY = 12;
    ctx.fillStyle = PAPER;
    ctx.fillRect(LABEL.x, LABEL.y, LABEL.w, LABEL.h);
    ctx.restore();

    if (barcode) {
      ctx.drawImage(art.ghost, FACE.x, FACE.y);
      const cut = progress * FACE.w;
      if (cut > 0) ctx.drawImage(art.revealed, 0, 0, cut, FACE.h, FACE.x, FACE.y, cut, FACE.h);
      drawStrip(ctx, barcode, progress);
      if (t >= scanStart && t < scanEnd) laser(ctx, FACE.x + cut, FACE.y, STRIP.y + STRIP.h);
      if (t >= scanEnd + 0.15) {
        stamp(ctx, `PAID $${person.price.toFixed(2)}`, LABEL.x + LABEL.w / 2, FACE.y + FACE.h * 0.84, RED, -0.12,
          easeOut((t - scanEnd - 0.15) / 0.25) * 0.88, 44);
      }
    } else {
      // priceless: a blank label, a failed scan, then the person, whole
      ctx.fillStyle = "#e9e5da";
      ctx.fillRect(STRIP.x, STRIP.y, STRIP.w, STRIP.h - 14);
      ctx.font = `600 15px ui-monospace, Menlo, monospace`; ctx.fillStyle = "#9a958a"; ctx.textAlign = "center";
      ctx.fillText("NO BARCODE", STRIP.x + STRIP.w / 2, STRIP.y + STRIP.h + 4);
      const show = easeOut((t - scanEnd - 1) / 2.2);
      if (show > 0) {
        ctx.save(); ctx.globalAlpha = show;
        ctx.drawImage(art.photo, FACE.x, FACE.y, FACE.w, FACE.h);
        ctx.restore();
      }
      if (t >= scanStart && t < scanEnd) laser(ctx, FACE.x + progress * FACE.w, FACE.y, STRIP.y + STRIP.h);
      if (t >= scanEnd + 0.1) {
        const fade = 1 - easeOut((t - scanEnd - 3.2) / 1.2);
        stamp(ctx, "ITEM NOT FOUND", LABEL.x + LABEL.w / 2, FACE.y + FACE.h * 0.5, RED, -0.08, fade * 0.92, 40);
      }
    }

    // the panel on the right
    const px = 640;
    label(ctx, `Scanned  ${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, px, 92);
    ctx.fillStyle = "#ffffff"; ctx.textAlign = "left";
    ctx.font = `700 58px ${SANS}`;
    ctx.fillText(person.name, px, 162);
    ctx.font = `400 22px ${MODEL}`; ctx.fillStyle = PALE;
    ctx.fillText(person.years, px, 200);

    label(ctx, "Favorite thing", px, 262);
    ctx.font = `500 30px ${SANS}`; ctx.fillStyle = "#ffffff";
    ctx.fillText(person.item, px, 302);
    priceTag(ctx, barcode ? `$${person.price.toFixed(2)}` : "NOT FOR SALE", px + 20, 360);

    label(ctx, "Barcode", px, 432);
    if (barcode) {
      const reached = progress * barcode.modules.length;
      ctx.font = `600 40px ui-monospace, Menlo, monospace`;
      let x = px;
      barcode.digits.split("").forEach((d, i) => {
        const [a, b] = barcode.digitSpans[i];
        const active = t >= scanStart && reached >= a && reached < b;
        const done = reached >= b || t >= scanEnd;
        if (active) { ctx.fillStyle = YELLOW; ctx.fillRect(x - 3, 446, 30, 48); }
        ctx.fillStyle = active ? INK : done ? "#ffffff" : "rgba(205,217,239,0.35)";
        ctx.fillText(d, x, 484);
        x += i === 0 || i === 5 || i === 10 ? 40 : 30;
      });
      ctx.font = `400 15px ${SANS}`; ctx.fillStyle = PALE;
      ctx.fillText(person.barcodeNote || "", px, 520);
    } else {
      ctx.font = `600 40px ui-monospace, Menlo, monospace`; ctx.fillStyle = "rgba(205,217,239,0.5)";
      ctx.fillText("— — — — — —", px, 484);
      ctx.font = `400 15px ${SANS}`; ctx.fillStyle = PALE;
      ctx.fillText("Some things have no barcode.", px, 520);
    }

    label(ctx, "Song", px, 580);
    ctx.font = `500 22px ${SANS}`; ctx.fillStyle = "#ffffff";
    ctx.fillText(`♪ ${person.songTitle}`, px, 614);
    ctx.font = `400 15px ${SANS}`; ctx.fillStyle = PALE;
    ctx.fillText(barcode ? `${person.songBy}. Heard only through the black bars.` : `${person.songBy}. Heard whole.`, px, 640);

    ctx.font = `400 11px ${SANS}`; ctx.fillStyle = "rgba(205,217,239,0.55)";
    ctx.fillText(person.credit || "", px, 694);
  };
}

/** Title card: the rules, one at a time. */
export function makeIntroScene(duration) {
  const words = makeWords(["VALUE", "$", "PRICE", "SCAN", "QTY 1", "PAID", "TOTAL", "SKU", "0 12345 67890 5", "NO RETURNS"], 7);
  const rules = [
    "Each person's favorite thing has a barcode.",
    "Their face is drawn in its bars: the darker the face, the thicker the bar.",
    "The digits play the notes. The price sets the tempo.",
    "Their favorite song plays only through the black bars.",
  ];
  return (ctx, t) => {
    drawBackdrop(ctx, t, words, null);
    ctx.textAlign = "left";
    ctx.globalAlpha = easeOut(t / 0.8);
    ctx.font = `400 92px ${MODEL}`; ctx.fillStyle = "#ffffff";
    ctx.fillText("SCANNED", 96, 230);
    ctx.globalAlpha = 1;
    rules.forEach((rule, i) => {
      const a = easeOut((t - 1.2 - i * 1.25) / 0.6);
      if (a <= 0) return;
      ctx.globalAlpha = a;
      ctx.fillStyle = YELLOW; ctx.fillRect(96, 300 + i * 62, 34, 30);
      ctx.fillStyle = INK; ctx.font = `800 16px ${SANS}`; ctx.textAlign = "center";
      ctx.fillText(String(i + 1), 113, 321 + i * 62);
      ctx.textAlign = "left"; ctx.fillStyle = "#ffffff"; ctx.font = `400 26px ${SANS}`;
      ctx.fillText(rule, 148, 324 + i * 62);
    });
    ctx.globalAlpha = 1;
    if (t > duration - 1.2) laser(ctx, 96 + ((t - (duration - 1.2)) / 1.2) * 1088, 280, 560);
  };
}

/** Closing card. */
export function makeOutroScene(lines) {
  const words = makeWords(["PRICELESS", "NOT FOR SALE", "VALUE", "NO BARCODE", "TOTAL $0.00", "PAID"], 31);
  return (ctx, t) => {
    drawBackdrop(ctx, t, words, null);
    ctx.textAlign = "left";
    ctx.globalAlpha = easeOut(t / 1.2);
    ctx.font = `500 50px ${SANS}`; ctx.fillStyle = "#ffffff";
    ctx.fillText("The things we value most", 96, 290);
    ctx.fillText("don't scan.", 96, 352);
    ctx.globalAlpha = easeOut((t - 1.6) / 1);
    ctx.font = `400 15px ${SANS}`; ctx.fillStyle = PALE;
    lines.forEach((line, i) => ctx.fillText(line, 96, 450 + i * 24));
    ctx.font = `400 16px ${MODEL}`; ctx.fillStyle = "#ffffff";
    ctx.fillText("SCANNED  ·  INK & ECHO  ·  ART 1901", 96, 640);
    ctx.globalAlpha = 1;
  };
}

/** A finished, full-size barcode portrait for the page (no scanner, no backdrop). */
export function posterCanvas(art, barcode) {
  const c = canvas(LABEL.w, LABEL.h);
  const ctx = c.getContext("2d");
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, LABEL.w, LABEL.h);
  ctx.translate(-LABEL.x, -LABEL.y);
  if (barcode) {
    ctx.drawImage(art.revealed, FACE.x, FACE.y);
    drawStrip(ctx, barcode, 1);
  } else {
    ctx.drawImage(art.photo, FACE.x, FACE.y, FACE.w, FACE.h);
    ctx.font = `600 15px ui-monospace, Menlo, monospace`; ctx.fillStyle = "#9a958a"; ctx.textAlign = "center";
    ctx.fillText("NO BARCODE", STRIP.x + STRIP.w / 2, STRIP.y + STRIP.h / 2);
  }
  return c;
}

export { cropToFace };
