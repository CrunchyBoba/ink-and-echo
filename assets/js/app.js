/* app.js
 * The SYN-1 interface: intro screen, the two machines, and the content sections.
 * All heavy lifting happens in the Python engine (see engine.js / worker.js).
 */

import { Engine, decodeAudio } from "./engine.js";
import { IMAGE_METHODS, SOUND_METHODS, hilbertPoint, rowNoteNames } from "./methods.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const KEY_GROUP_COLORS = ["var(--red)", "var(--orange)", "var(--butter)", "var(--cream)"];

/* ---------------------------------------------------------------- helpers */

const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* private mode */ } },
};

let toastTimer = null;
function toast(message, isError = false) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.toggle("is-error", isError);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, isError ? 6000 : 3500);
}

function formatTime(seconds) {
  if (!isFinite(seconds)) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function hsvToRgb(h, s, v) {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
  return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
}

function baseName(file) {
  return (file?.name || "untitled").replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "-").slice(0, 40);
}

function setDownload(link, url, filename) {
  if (url) {
    link.href = url;
    link.download = filename;
    link.classList.remove("btn-disabled");
    link.removeAttribute("aria-disabled");
  } else {
    link.removeAttribute("href");
    link.classList.add("btn-disabled");
    link.setAttribute("aria-disabled", "true");
  }
}

/* ------------------------------------------------------------------ knobs */

class Knob {
  constructor(field, onChange) {
    const d = field.dataset;
    this.min = Number(d.min); this.max = Number(d.max); this.step = Number(d.step);
    this.value = Number(d.value); this.unit = d.unit || ""; this.onChange = onChange;
    field.innerHTML = `
      <span class="knob-name" id="knob-${d.knob}">${d.label}</span>
      <div class="knob" role="slider" tabindex="0" aria-labelledby="knob-${d.knob}"
           aria-valuemin="${this.min}" aria-valuemax="${this.max}">
        <svg viewBox="-36 -36 72 72" width="72" height="72" style="position:absolute;left:-8px;top:-8px;pointer-events:none" aria-hidden="true">
          ${Array.from({ length: 11 }, (_, i) => {
            const a = (-135 + i * 27) * Math.PI / 180;
            return `<circle cx="${(Math.sin(a) * 33).toFixed(1)}" cy="${(-Math.cos(a) * 33).toFixed(1)}" r="1.6" fill="#222"/>`;
          }).join("")}
        </svg>
        <span class="knob-pointer"></span>
      </div>
      <span class="knob-value"></span>`;
    this.el = $(".knob", field);
    this.pointer = $(".knob-pointer", field);
    this.readout = $(".knob-value", field);
    this.render();

    let startY = 0, startValue = 0;
    const move = (event) => {
      const range = this.max - this.min;
      this.set(startValue + ((startY - event.clientY) / 160) * range);
    };
    this.el.addEventListener("pointerdown", (event) => {
      startY = event.clientY; startValue = this.value;
      this.el.setPointerCapture(event.pointerId);
      this.el.addEventListener("pointermove", move);
    });
    const end = () => this.el.removeEventListener("pointermove", move);
    this.el.addEventListener("pointerup", end);
    this.el.addEventListener("pointercancel", end);
    this.el.addEventListener("keydown", (event) => {
      const big = (this.max - this.min) / 4;
      const moves = { ArrowUp: this.step, ArrowRight: this.step, ArrowDown: -this.step, ArrowLeft: -this.step, PageUp: big, PageDown: -big };
      if (event.key in moves) { this.set(this.value + moves[event.key]); event.preventDefault(); }
      if (event.key === "Home") { this.set(this.min); event.preventDefault(); }
      if (event.key === "End") { this.set(this.max); event.preventDefault(); }
    });
  }

  set(raw) {
    const snapped = Math.round((Math.min(this.max, Math.max(this.min, raw)) - this.min) / this.step) * this.step + this.min;
    const value = Number(snapped.toFixed(3));
    if (value === this.value) return;
    this.value = value;
    this.render();
    this.onChange?.(value);
  }

  render() {
    const fraction = (this.value - this.min) / (this.max - this.min);
    this.pointer.style.transform = `rotate(${-135 + fraction * 270}deg)`;
    const text = `${this.value}${this.unit}`;
    this.readout.textContent = text;
    this.el.setAttribute("aria-valuenow", this.value);
    this.el.setAttribute("aria-valuetext", text);
  }
}

/* --------------------------------------------------------------- shell UI */

function setupIntro() {
  const intro = $("#intro");
  const enter = () => {
    intro.classList.add("is-leaving");
    storage.set("syn1-entered", "1");
    setTimeout(() => { intro.hidden = true; }, 400);
    $("#top").focus({ preventScroll: true });  // move focus off the hidden dialog
  };
  if (storage.get("syn1-entered")) { intro.hidden = true; return; }
  $("#enter").addEventListener("click", enter);
  $("#enter").focus();
  intro.addEventListener("keydown", (event) => { if (event.key === "Escape") enter(); });
}

function setupMenu() {
  const button = $("#menu-btn"), menu = $("#menu");
  const close = () => { menu.hidden = true; button.setAttribute("aria-expanded", "false"); button.setAttribute("aria-label", "Open menu"); };
  button.addEventListener("click", () => {
    const open = menu.hidden;
    menu.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    button.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  });
  $$("a", menu).forEach((a) => a.addEventListener("click", close));
  document.addEventListener("click", (event) => { if (!menu.hidden && !event.target.closest("#menu, #menu-btn")) close(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); });
}

let currentMode = "a";
function setMode(mode, { focus = false, scroll = false } = {}) {
  currentMode = mode;
  for (const tab of $$(".mode")) {
    const selected = tab.dataset.mode === mode;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected && focus) tab.focus();
  }
  $("#machine-a").hidden = mode !== "a";
  $("#machine-b").hidden = mode !== "b";
  if (mode === "a") machineB.pause(); else machineA.stop();
  if (mode === "a") machineA.draw();
  if (scroll) window.scrollTo({ top: 0, behavior: "smooth" });
}

function setupTabs() {
  for (const tab of $$(".mode")) {
    tab.addEventListener("click", () => setMode(tab.dataset.mode));
    tab.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        setMode(currentMode === "a" ? "b" : "a", { focus: true });
        event.preventDefault();
      }
    });
  }
}

function setupDrop(zone, onFile) {
  const input = $("input[type=file]", zone);
  input.addEventListener("change", () => { if (input.files[0]) onFile(input.files[0]); input.value = ""; });
  const target = zone.closest(".display");
  ["dragenter", "dragover"].forEach((type) => target.addEventListener(type, (event) => {
    event.preventDefault(); zone.classList.add("is-over");
  }));
  ["dragleave", "drop"].forEach((type) => target.addEventListener(type, () => zone.classList.remove("is-over")));
  target.addEventListener("drop", (event) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  });
  return input;
}

function buildKeys(container, methods, onPick, grouped) {
  container.innerHTML = "";
  methods.forEach((method, i) => {
    const key = document.createElement("button");
    key.type = "button";
    key.className = "key";
    key.setAttribute("role", "radio");
    key.setAttribute("aria-checked", i === 0 ? "true" : "false");
    key.tabIndex = i === 0 ? 0 : -1;
    key.dataset.slug = method.slug;
    key.dataset.group = grouped ? Math.floor(i / (methods.length / 4)) : 0;
    key.title = method.name;
    key.innerHTML = `<span class="key-num">${i + 1}</span>
      <span class="key-cap">${method.key}</span>
      ${grouped ? '<span class="lamp-mini"></span>' : '<span class="key-tri"></span>'}
      <span class="sr-only">${method.name}</span>`;
    key.addEventListener("click", () => onPick(method.slug));
    key.addEventListener("keydown", (event) => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      if (!step) return;
      event.preventDefault();
      const next = methods[(i + step + methods.length) % methods.length];
      onPick(next.slug);
      $(`[data-slug="${next.slug}"]`, container).focus();
    });
    container.appendChild(key);
  });
}

function checkKey(container, slug) {
  for (const key of $$(".key", container)) {
    const on = key.dataset.slug === slug;
    key.setAttribute("aria-checked", String(on));
    key.tabIndex = on ? 0 : -1;
  }
}

function readoutHTML(index, method, status = "") {
  const chips = method.maps.map(([from, to]) => `<span class="chip"><b>${from}</b><i>→</i>${to}</span>`).join("");
  return `<div><span class="r-num">${String(index + 1).padStart(2, "0")}</span><h3>${method.name}</h3></div>
    <p>${method.desc}</p><div class="chips">${chips}</div>
    ${status ? `<div class="status">${status}</div>` : ""}`;
}

/* ------------------------------------------------- machine A: image→sound */

const machineA = {
  file: null, grid: null, method: IMAGE_METHODS[0].slug, render: null, stale: false,
  knobs: {}, raf: null, gridTimer: null,

  init() {
    this.canvas = $("#a-canvas");
    this.audio = $("#a-audio");
    setupDrop($("#a-drop"), (file) => this.load(file));
    $("#a-load").addEventListener("click", () => $("#a-file").click());
    buildKeys($("#a-keys"), IMAGE_METHODS, (slug) => this.pick(slug), true);
    for (const field of $$(".panel-knobs .knob-field")) {
      this.knobs[field.dataset.knob] = new Knob(field, (value) => this.knobChanged(field.dataset.knob, value));
    }
    $("#a-start").addEventListener("click", () => this.start());
    $("#a-stop").addEventListener("click", () => this.stop());
    this.audio.addEventListener("ended", () => this.stop());
    new ResizeObserver(() => this.draw()).observe($("#a-display"));
    this.updateReadout();
  },

  settings() {
    return { rows: this.knobs.rows.value, step: this.knobs.step.value, detail: this.knobs.detail.value };
  },

  async load(file) {
    if (!file.type.startsWith("image/")) { toast("That doesn't look like an image. Try a PNG, JPG or WEBP.", true); return; }
    this.stop();
    this.file = file;
    this.render = null;
    $("#a-file-name").textContent = file.name;
    const thumb = $("#a-thumb-img");
    if (thumb.src) URL.revokeObjectURL(thumb.src);
    thumb.src = URL.createObjectURL(file);
    $("#a-thumb").hidden = false;
    $("#a-drop").hidden = true;
    $("#a-grid-wrap").hidden = false;
    this.updateReadout(engine.state === "ready" ? "Reading the artwork…" : "Waiting for the engine to finish loading…");
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const size = await engine.loadImage(bytes);
      $("#a-thumb-cap").textContent = `${size.width} × ${size.height}px`;
      await this.refreshGrid();
      this.updateReadout("Ready. Press Start to hear it.");
      this.updateButtons();
    } catch (error) {
      console.error(error);
      toast("Couldn't read that image. Try another file.", true);
      this.updateReadout();
    }
  },

  async refreshGrid() {
    if (!this.file) return;
    const { rows, detail } = this.settings();
    const grid = await engine.imageGrid(rows, detail);
    this.grid = grid;
    $("#a-labels").innerHTML = rowNoteNames(grid.rows)
      .map((name, i) => `<li>${grid.rows <= 24 || i % 2 === 0 ? `<span>${name}</span>` : ""}</li>`).join("");
    this.draw();
  },

  knobChanged(name, value) {
    if (this.render) this.stale = true;
    if (name !== "step") {
      clearTimeout(this.gridTimer);
      this.gridTimer = setTimeout(() => this.refreshGrid(), 120);
    }
    if (this.render) this.updateReadout("Settings changed. Press Start to hear them.");
  },

  pick(slug) {
    this.method = slug;
    checkKey($("#a-keys"), slug);
    const wasPlaying = !this.audio.paused;
    this.updateReadout(this.file ? (wasPlaying ? "" : "Press Start to hear this method.") : "");
    if (wasPlaying) this.start();
  },

  updateReadout(status = "") {
    const index = IMAGE_METHODS.findIndex((m) => m.slug === this.method);
    if (!this.file && !status) status = "Load an artwork to begin.";
    $("#a-readout").innerHTML = readoutHTML(index, IMAGE_METHODS[index], status);
  },

  updateButtons() {
    const ready = Boolean(this.grid);
    $("#a-start").disabled = !ready;
    $("#a-stop").disabled = !ready;
  },

  async start() {
    if (!this.grid) return;
    const { rows, step, detail } = this.settings();
    const key = `${this.method}|${rows}|${step}|${detail}`;
    const button = $("#a-start");
    if (!this.render || this.render.key !== key) {
      button.classList.add("is-busy");
      button.textContent = "Wait";
      button.disabled = true;
      this.updateReadout("Composing…");
      try {
        const result = await engine.makeSound(this.method, rows, step, detail);
        if (this.render) { URL.revokeObjectURL(this.render.wavUrl); if (this.render.midiUrl) URL.revokeObjectURL(this.render.midiUrl); }
        const wavUrl = URL.createObjectURL(new Blob([result.wav], { type: "audio/wav" }));
        const midiUrl = result.midi ? URL.createObjectURL(new Blob([result.midi], { type: "audio/midi" })) : null;
        this.render = { key, wavUrl, midiUrl, timeline: result.timeline, seconds: result.seconds };
        this.audio.src = wavUrl;
        const name = `${baseName(this.file)}-${this.method}`;
        setDownload($("#a-wav"), wavUrl, `${name}.wav`);
        setDownload($("#a-midi"), midiUrl, `${name}.mid`);
      } catch (error) {
        console.error(error);
        toast("Something went wrong while composing. Try another method or setting.", true);
        this.updateReadout();
        return;
      } finally {
        button.classList.remove("is-busy");
        button.textContent = "Start";
        button.disabled = false;
      }
    }
    this.stale = false;
    const method = IMAGE_METHODS.find((m) => m.slug === this.method);
    this.updateReadout(method.audioOnly ? "Playing. This method makes audio only, so there's no MIDI file." : "Playing.");
    this.audio.currentTime = 0;
    try { await this.audio.play(); } catch { toast("Your browser blocked playback. Press Start again.", true); return; }
    $("#a-lamp").classList.add("is-on");
    cancelAnimationFrame(this.raf);
    const tick = () => { this.draw(); this.raf = requestAnimationFrame(tick); };
    tick();
  },

  stop() {
    if (!this.audio) return;
    this.audio.pause();
    this.audio.currentTime = 0;
    cancelAnimationFrame(this.raf);
    $("#a-lamp")?.classList.remove("is-on");
    this.draw();
  },

  playheadColumn() {
    if (!this.render || this.audio.paused) return -1;
    const { timeline } = this.render;
    if (timeline.kind !== "columns") return -1;
    let t = this.audio.currentTime;
    if (timeline.period) t %= timeline.period;
    const col = Math.floor(t / timeline.step);
    return col < timeline.cols ? col : -1;
  },

  draw() {
    const total = this.render?.seconds || 0;
    $("#a-time").textContent = `${formatTime(this.audio?.currentTime || 0)} / ${formatTime(total)}`;
    if (!this.grid || !this.canvas || $("#machine-a").hidden) return;
    const { rows, cols, hsv } = this.grid;
    const box = this.canvas.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const dpr = window.devicePixelRatio || 1;
    if (this.canvas.width !== Math.round(box.width * dpr) || this.canvas.height !== Math.round(box.height * dpr)) {
      this.canvas.width = Math.round(box.width * dpr);
      this.canvas.height = Math.round(box.height * dpr);
    }
    const ctx = this.canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, box.width, box.height);

    const cw = box.width / cols, ch = box.height / rows;
    const radius = Math.min(cw, ch) * 0.46;
    const playCol = this.playheadColumn();
    if (playCol >= 0) {
      ctx.fillStyle = "rgba(255, 230, 0, 0.14)";
      ctx.fillRect(playCol * cw, 0, cw, box.height);
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = (r * cols + c) * 3;
        const h = hsv[i] / 255, s = hsv[i + 1] / 255, v = hsv[i + 2] / 255;
        const x = (c + 0.5) * cw, y = (r + 0.5) * ch;
        ctx.fillStyle = "#4a4a48";
        ctx.beginPath(); ctx.arc(x, y, Math.max(0.8, radius * 0.22), 0, Math.PI * 2); ctx.fill();
        if (v < 0.08) continue;
        const lit = c === playCol;
        ctx.fillStyle = hsvToRgb(h, lit ? s * 0.6 : s, lit ? 1 : Math.max(0.35, v));
        ctx.beginPath(); ctx.arc(x, y, radius * (0.22 + 0.78 * v), 0, Math.PI * 2); ctx.fill();
      }
    }
  },
};

/* ------------------------------------------------- machine B: sound→image */

const machineB = {
  file: null, seconds: 0, method: SOUND_METHODS[0].slug, images: {}, shown: null,
  raf: null, busy: false, peaks: null,

  init() {
    this.audio = $("#b-audio");
    setupDrop($("#b-drop"), (file) => this.load(file));
    $("#b-load").addEventListener("click", () => $("#b-file").click());
    buildKeys($("#b-keys"), SOUND_METHODS, (slug) => this.pick(slug), false);
    $("#b-run").addEventListener("click", () => this.run(this.method));
    $("#b-all").addEventListener("click", () => this.runAll());
    $("#b-play").addEventListener("click", () => (this.audio.paused ? this.play() : this.pause()));
    this.audio.addEventListener("ended", () => this.pause());
    $("#b-wave").addEventListener("click", (event) => {
      if (!this.audio.duration) return;
      const box = event.currentTarget.getBoundingClientRect();
      this.audio.currentTime = ((event.clientX - box.left) / box.width) * Math.min(this.audio.duration, this.seconds);
      this.tick(true);
    });
    new ResizeObserver(() => this.drawWave()).observe($("#b-wave-strip"));
    this.updateReadout();
  },

  async load(file) {
    const looksLikeAudio = file.type.startsWith("audio/") || /\.(mp3|wav|ogg|oga|flac|m4a|aac|webm)$/i.test(file.name);
    if (!looksLikeAudio) { toast("That doesn't look like a sound file. Try an MP3, WAV or M4A.", true); return; }
    this.pause();
    this.file = file;
    $("#b-file-name").textContent = file.name;
    this.updateReadout("Listening…");
    let decoded;
    try {
      const buffer = await file.arrayBuffer();
      decoded = await decodeAudio(buffer);
      this.seconds = decoded.seconds;
      this.peaks = this.makePeaks(decoded.left, 600);
      for (const image of Object.values(this.images)) URL.revokeObjectURL(image.url);
      this.images = {};
      this.shown = null;
      $("#b-gallery").innerHTML = "";
      $("#b-frame-inner").classList.remove("has-image");
      $$(".key", $("#b-keys")).forEach((k) => k.classList.remove("is-done"));
      setDownload($("#b-png"), null);
      if (this.audio.src) URL.revokeObjectURL(this.audio.src);
      this.audio.src = URL.createObjectURL(file);
      $("#b-drop").hidden = true;
      $("#b-stage").hidden = false;
      $("#b-wave-strip").hidden = false;
      this.drawWave();
      const raw = new Uint8Array(buffer.slice(0, 16 * 1024 * 1024));
      this.updateReadout(engine.state === "ready" ? "Analyzing…" : "Waiting for the engine to finish loading…");
      await engine.loadSound(decoded, raw);
      $("#b-run").disabled = false;
      $("#b-all").disabled = false;
      $("#b-play").disabled = false;
      const note = decoded.seconds >= 359 ? " Only the first 6 minutes are used." : "";
      this.updateReadout(`Ready: ${formatTime(decoded.seconds)} of sound.${note} Pick a method and press Run.`);
      this.tick(true);
    } catch (error) {
      console.error(error);
      toast("Couldn't decode that sound file. Try an MP3 or WAV.", true);
      this.updateReadout();
    }
  },

  makePeaks(samples, count) {
    const peaks = new Float32Array(count);
    const size = Math.max(1, Math.floor(samples.length / count));
    for (let i = 0; i < count; i++) {
      let peak = 0;
      for (let j = i * size; j < Math.min(samples.length, (i + 1) * size); j += 4) peak = Math.max(peak, Math.abs(samples[j]));
      peaks[i] = peak;
    }
    const max = Math.max(...peaks) || 1;
    return peaks.map((p) => p / max);
  },

  drawWave() {
    const canvas = $("#b-wave");
    if (!this.peaks || !canvas.isConnected) return;
    const box = canvas.getBoundingClientRect();
    if (!box.width) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(box.width * dpr);
    canvas.height = Math.round(box.height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bars = Math.floor(box.width / 4);
    for (let i = 0; i < bars; i++) {
      const peak = this.peaks[Math.floor((i / bars) * this.peaks.length)];
      const h = Math.max(2, peak * (box.height - 6));
      ctx.fillStyle = "#111";
      ctx.fillRect(i * 4, (box.height - h) / 2, 2, h);
    }
  },

  pick(slug) {
    this.method = slug;
    checkKey($("#b-keys"), slug);
    if (this.images[slug]) this.show(slug);
    else this.updateReadout(this.file ? "Press Run to paint this one." : "");
  },

  updateReadout(status = "") {
    const index = SOUND_METHODS.findIndex((m) => m.slug === this.method);
    if (!this.file && !status) status = "Load a sound to begin.";
    $("#b-readout").innerHTML = readoutHTML(index, SOUND_METHODS[index], status);
  },

  setBusy(busy) {
    this.busy = busy;
    $("#b-run").disabled = busy || !this.file;
    $("#b-all").disabled = busy || !this.file;
    $("#b-run").classList.toggle("is-busy", busy);
    $("#b-frame").classList.toggle("is-working", busy);
    $("#engine-led").dataset.state = busy ? "busy" : engine.state;
  },

  async make(slug) {
    if (this.images[slug]) return this.images[slug];
    const png = await engine.makeImage(slug);
    const url = URL.createObjectURL(new Blob([png], { type: "image/png" }));
    this.images[slug] = { url };
    const method = SOUND_METHODS.find((m) => m.slug === slug);
    const item = document.createElement("li");
    item.innerHTML = `<button type="button" data-slug="${slug}"><img src="${url}" alt=""><span class="g-name">${method.name}</span></button>`;
    $("button", item).addEventListener("click", () => this.pick(slug));
    const order = SOUND_METHODS.map((m) => m.slug);
    const after = $$("#b-gallery li").find((li) => order.indexOf($("button", li).dataset.slug) > order.indexOf(slug));
    $("#b-gallery").insertBefore(item, after || null);
    $(`[data-slug="${slug}"]`, $("#b-keys")).classList.add("is-done");
    return this.images[slug];
  },

  async run(slug) {
    if (!this.file || this.busy) return;
    this.setBusy(true);
    this.updateReadout("Painting…");
    try {
      await this.make(slug);
      this.show(slug);
    } catch (error) {
      console.error(error);
      toast("Something went wrong while painting. Try another method.", true);
      this.updateReadout();
    } finally {
      this.setBusy(false);
    }
  },

  async runAll() {
    if (!this.file || this.busy) return;
    this.setBusy(true);
    try {
      for (const [i, method] of SOUND_METHODS.entries()) {
        this.updateReadout(`Painting ${i + 1} of ${SOUND_METHODS.length}: ${method.name}…`);
        await this.make(method.slug);
        if (!this.shown) this.show(method.slug);
      }
      this.show(this.method in this.images ? this.method : SOUND_METHODS[0].slug);
      toast("All 12 images are ready. Click any thumbnail.");
    } catch (error) {
      console.error(error);
      toast("Something went wrong while painting.", true);
    } finally {
      this.setBusy(false);
    }
  },

  show(slug) {
    const image = this.images[slug];
    if (!image) return;
    this.shown = slug;
    this.method = slug;
    checkKey($("#b-keys"), slug);
    const method = SOUND_METHODS.find((m) => m.slug === slug);
    const img = $("#b-image");
    img.src = image.url;
    img.alt = `${method.name} made from ${this.file.name}`;
    $("#b-frame-inner").classList.add("has-image");
    $$("#b-gallery button").forEach((b) => b.setAttribute("aria-current", String(b.dataset.slug === slug)));
    setDownload($("#b-png"), image.url, `${baseName(this.file)}-${slug}.png`);
    this.updateReadout(method.follow ? "Press Play and watch the image follow the sound." : "");
    this.tick(true);
  },

  async play() {
    try { await this.audio.play(); } catch { toast("Your browser blocked playback. Press Play again.", true); return; }
    $("#b-play").textContent = "Pause";
    $("#b-play").setAttribute("aria-pressed", "true");
    cancelAnimationFrame(this.raf);
    const loop = () => { this.tick(); this.raf = requestAnimationFrame(loop); };
    loop();
  },

  pause() {
    if (!this.audio) return;
    this.audio.pause();
    cancelAnimationFrame(this.raf);
    $("#b-play").textContent = "Play";
    $("#b-play").setAttribute("aria-pressed", "false");
    this.tick(true);
  },

  tick(force = false) {
    const t = this.audio.currentTime || 0;
    $("#b-time").textContent = `${formatTime(t)} / ${formatTime(this.seconds)}`;
    const fraction = this.seconds ? Math.min(1, t / this.seconds) : 0;
    $("#b-wave-head").style.left = `${fraction * 100}%`;
    const playing = !this.audio.paused || (force && t > 0);
    this.follow(playing && t <= this.seconds ? fraction : null);
  },

  /** Draw a marker on the image showing where the song is right now. */
  follow(f) {
    const layer = $("#b-follow");
    const method = SOUND_METHODS.find((m) => m.slug === this.shown);
    if (f === null || !method?.follow) { layer.innerHTML = ""; return; }
    const pct = (v) => `${(v * 100).toFixed(3)}%`;
    let html = "";
    switch (method.follow) {
      case "x":
        html = `<span class="ph-line" style="left:${pct(f)}"></span>`;
        break;
      case "radial": {
        const a = f * Math.PI * 2 - Math.PI / 2;
        html = `<svg viewBox="0 0 100 100" preserveAspectRatio="none"><line x1="50" y1="50" x2="${50 + Math.cos(a) * 48}" y2="${50 + Math.sin(a) * 48}" stroke="#ffe600" stroke-width="0.6"/></svg>`;
        break;
      }
      case "diagonal": {
        const p = (40 + f * 900) / 940;
        html = `<span class="ph-dot" style="left:${pct(p)};top:${pct(p)}"></span>`;
        break;
      }
      case "melody": {
        const row = Math.min(5, Math.floor(f * 6));
        const x = (60 + (f * 6 - row) * 1080) / 1200;
        const top = (60 + row * 130) / 900;
        html = `<span class="ph-line" style="left:${pct(x)};top:${pct(top)};bottom:auto;height:${pct(130 / 900)}"></span>`;
        break;
      }
      case "mosaic": {
        const [x, y] = hilbertPoint(64, Math.min(4095, Math.floor(f * 4096)));
        html = `<span class="ph-box" style="left:${pct((x - 1) / 64)};top:${pct((y - 1) / 64)};width:${pct(3 / 64)};height:${pct(3 / 64)}"></span>`;
        break;
      }
      case "cymatics": {
        const part = Math.min(8, Math.floor(f * 9));
        const row = Math.floor(part / 3), col = part % 3;
        html = `<span class="ph-box" style="left:${pct((12 + col * 312) / 948)};top:${pct((12 + row * 312) / 948)};width:${pct(300 / 948)};height:${pct(300 / 948)}"></span>`;
        break;
      }
    }
    layer.innerHTML = html;
  },
};

/* ------------------------------------------------------- content sections */

function buildMethodLists() {
  $("#list-a").innerHTML = IMAGE_METHODS.map((m, i) => `
    <li><span class="m-dot" style="background:${KEY_GROUP_COLORS[Math.floor(i / 2)]}">${i + 1}</span>
      <div><h4>${m.name}</h4><p>${m.desc}</p><button class="try" type="button" data-mode="a" data-slug="${m.slug}">Try it →</button></div></li>`).join("");
  $("#list-b").innerHTML = SOUND_METHODS.map((m, i) => `
    <li><span class="m-dot" style="background:var(--grey-light)">${i + 1}</span>
      <div><h4>${m.name}</h4><p>${m.desc}</p><button class="try" type="button" data-mode="b" data-slug="${m.slug}">Try it →</button></div></li>`).join("");
  $$(".method-list .try").forEach((button) => button.addEventListener("click", () => {
    setMode(button.dataset.mode, { scroll: true });
    (button.dataset.mode === "a" ? machineA : machineB).pick(button.dataset.slug);
  }));
}

/** Demo files listed in samples/demos.json (empty until samples are added). */
async function buildDemos() {
  let demos = [];
  try {
    const response = await fetch("samples/demos.json", { cache: "no-cache" });
    if (response.ok) demos = (await response.json()).demos || [];
  } catch { /* no demos yet */ }
  if (!demos.length) return;
  const grid = $("#demo-grid");
  grid.innerHTML = "";
  for (const demo of demos) {
    const card = document.createElement("article");
    card.className = "demo-card";
    const isArt = demo.type === "artwork";
    const cover = demo.cover || (isArt ? demo.file : null);
    card.innerHTML = `
      ${cover ? `<img src="${cover}" alt="" loading="lazy">` : ""}
      <div class="demo-body">
        <span class="demo-type">${isArt ? "Artwork → Sound" : "Sound → Image"}</span>
        <h3></h3><p></p>
        <button class="btn btn-small" type="button">Load into SYN-1${isArt ? "A" : "B"}</button>
      </div>`;
    $("h3", card).textContent = demo.title || "Untitled";
    $("p", card).textContent = demo.note || "";
    $("button", card).addEventListener("click", async () => {
      try {
        const blob = await (await fetch(demo.file)).blob();
        const file = new File([blob], demo.file.split("/").pop(), { type: blob.type });
        setMode(isArt ? "a" : "b", { scroll: true });
        (isArt ? machineA : machineB).load(file);
      } catch {
        toast("Couldn't load that demo file.", true);
      }
    });
    grid.appendChild(card);
  }
}

/* ------------------------------------------------------------------ start */

const engine = new Engine((state, detail) => {
  const led = $("#engine-led"), text = $("#engine-text");
  if (!machineB.busy) led.dataset.state = state;
  text.textContent = state === "ready" ? "Ready" : state === "error" ? "Offline" : detail || "Loading";
  $("#engine").title = detail || "";
  if (state === "error") toast("The engine couldn't start. Check your connection and reload the page.", true);
});

setupIntro();
setupMenu();
setupTabs();
machineA.init();
machineB.init();
buildMethodLists();
buildDemos();
