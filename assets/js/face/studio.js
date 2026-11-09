/* studio.js
 * The Song -> Face machine: a gallery of faces built by songs, and a
 * "Make a face" view to create new ones.
 */

import { preparePortrait, loadFaceTools, PORTRAIT } from "./align.js";
import { decodeSong, listen } from "./listen.js";
import { makeGrid, schedule, drawShape, FaceRenderer, SHAPES, COLORS } from "./particles.js";
import { recordBuild, videoFormat } from "./recorder.js";
import { listFaces, saveFace, deleteFace } from "./store.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const RENDER_WIDTH = 900;     // canvas resolution (videos come out 900 x 1200)
const MAX_SNIPPET = 60;

let toast = () => {};

function formatTime(seconds) {
  if (!isFinite(seconds)) seconds = 0;
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function slug(text) {
  return (text || "face").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "face";
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const canvasBlob = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, "image/png"));

async function imageToCanvas(source) {
  const bitmap = await createImageBitmap(source);
  const c = document.createElement("canvas");
  c.width = PORTRAIT.width; c.height = PORTRAIT.height;
  c.getContext("2d").drawImage(bitmap, 0, 0, c.width, c.height);
  return c;
}

/* ------------------------------------------------------------------ player */

/** Builds one face on one canvas, in time with one <audio> element. */
class Player {
  constructor(canvas, audio, onTick) {
    this.canvas = canvas;
    this.audio = audio;
    this.onTick = onTick;
    this.renderer = new FaceRenderer(canvas);
    this.raf = null;
    this.sounds = new Map();  // cached measurements per snippet
  }

  /** portrait: canvas. song: decoded song or null. */
  setup({ portrait, song, start = 0, length = 20, style, caption }) {
    Object.assign(this, { portrait, song, start, length, style: { ...style }, caption });
    this.rebuild();
  }

  sound() {
    if (!this.song) return null;
    const key = `${this.start.toFixed(2)}|${this.length.toFixed(2)}`;
    if (!this.sounds.has(key)) {
      if (this.sounds.size > 6) this.sounds.clear();
      this.sounds.set(key, listen(this.song, this.start, this.start + this.length));
    }
    return this.sounds.get(key);
  }

  /** Recompute the grid and the build order (after density, paper or snippet changes). */
  rebuild() {
    if (!this.portrait) return;
    const grid = makeGrid(this.portrait, this.style.density, this.style.paper);
    const sound = this.sound();
    if (sound) schedule(grid, sound);
    this.renderer.setup(grid, this.style, RENDER_WIDTH, this.caption);
    this.renderer.draw(Infinity);
  }

  /** Shape and color changes don't need a new build order. */
  restyle(style) {
    const needsRebuild = style.density !== this.style.density || style.paper !== this.style.paper;
    this.style = { ...style };
    if (needsRebuild) this.rebuild();
    else { this.renderer.style = { ...style }; this.renderer.reset(); this.renderer.draw(Infinity); }
  }

  setCaption(caption) {
    const sizeChanges = Boolean(caption) !== Boolean(this.caption);
    this.caption = caption;
    if (sizeChanges) { this.renderer.setup(this.renderer.grid, this.style, RENDER_WIDTH, caption); }
    else this.renderer.caption = caption;
    if (!this.playing) { this.renderer.reset(); this.renderer.draw(Infinity); }
  }

  get playing() { return this.raf !== null; }

  /** Play the snippet and build the face. Resolves when the snippet ends (or stops). */
  async play() {
    if (!this.song || !this.portrait) return;
    this.stop(false);
    this.renderer.reset();
    this.audio.currentTime = this.start;
    await this.audio.play();
    return new Promise((resolve) => {
      this.finish = resolve;
      const loop = () => {
        const t = this.audio.currentTime - this.start;
        this.renderer.draw(t);
        this.onTick?.(t, this.length);
        if (t >= this.length || this.audio.ended) { this.stop(); return; }
        this.raf = requestAnimationFrame(loop);
      };
      loop();
    });
  }

  stop(redraw = true) {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.audio.pause();
    if (redraw && this.portrait) { this.renderer.draw(Infinity); this.onTick?.(this.length, this.length, true); }
    this.finish?.();
    this.finish = null;
  }
}

/* ------------------------------------------------------------------- make */

const make = {
  portrait: null,    // { canvas, file, faceFound, backgroundRemoved }
  song: null,        // { file, decoded, url }
  style: { shape: "circle", color: "ink", density: 64, paper: "light" },

  init() {
    this.player = new Player($("#c-canvas"), $("#c-audio"), (t, length, done) => this.tick(t, length, done));
    this.setupDrop($("#c-drop"), $("#c-photo"), (file) => this.loadPortrait(file));
    $("#c-load-photo").addEventListener("click", () => $("#c-photo").click());
    $("#c-load-song").addEventListener("click", () => $("#c-song").click());
    $("#c-song").addEventListener("change", (e) => { if (e.target.files[0]) this.loadSong(e.target.files[0]); e.target.value = ""; });
    for (const id of ["c-remove-bg", "c-align"]) $(`#${id}`).addEventListener("change", () => this.portrait && this.loadPortrait(this.portrait.file));

    this.buildKeys();
    $("#c-density").addEventListener("input", (e) => { $("#c-density-value").textContent = e.target.value; });
    $("#c-density").addEventListener("change", (e) => this.setStyle({ density: Number(e.target.value) }));
    $$("[name=c-paper]").forEach((r) => r.addEventListener("change", () => this.setStyle({ paper: r.value })));

    $("#c-start").addEventListener("input", () => this.snippetChanged(false));
    $("#c-length").addEventListener("input", () => this.snippetChanged(false));
    $("#c-start").addEventListener("change", () => this.snippetChanged(true));
    $("#c-length").addEventListener("change", () => this.snippetChanged(true));
    $("#c-wave").addEventListener("click", (event) => {
      if (!this.song) return;
      const box = event.currentTarget.getBoundingClientRect();
      $("#c-start").value = (((event.clientX - box.left) / box.width) * this.song.decoded.seconds).toFixed(1);
      this.snippetChanged(true);
    });
    new ResizeObserver(() => this.drawWave()).observe($("#c-wave"));

    $("#c-name").addEventListener("input", () => this.updateCaption());
    $("#c-song-title").addEventListener("input", () => this.updateCaption());
    $("#c-caption").addEventListener("change", () => this.updateCaption());

    $("#c-build").addEventListener("click", () => this.build());
    $("#c-stop").addEventListener("click", () => this.player.stop());
    $("#c-compare").addEventListener("click", () => openCompare(this.player, (style) => this.setStyle(style)));
    $("#c-record").addEventListener("click", () => recordWith(this.player, $("#c-record"), $("#c-name").value));
    $("#c-png").addEventListener("click", () => savePng(this.player, $("#c-name").value));
    $("#c-save").addEventListener("click", () => this.save());
    $("#c-export").addEventListener("click", () => this.exportForSite());
    if (!videoFormat()) { $("#c-record").disabled = true; $("#c-record").title = "This browser can't record video"; }
    this.status("Load a portrait and a song to begin.");
    this.updateButtons();
  },

  setupDrop(zone, input, onFile) {
    input.addEventListener("change", () => { if (input.files[0]) onFile(input.files[0]); input.value = ""; });
    const target = $("#c-frame");
    ["dragenter", "dragover"].forEach((type) => target.addEventListener(type, (e) => { e.preventDefault(); zone.classList.add("is-over"); }));
    ["dragleave", "drop"].forEach((type) => target.addEventListener(type, () => zone.classList.remove("is-over")));
    target.addEventListener("drop", (event) => {
      event.preventDefault();
      const file = event.dataTransfer.files[0];
      if (!file) return;
      if (file.type.startsWith("audio/")) this.loadSong(file); else this.loadPortrait(file);
    });
  },

  buildKeys() {
    $("#c-shapes").innerHTML = SHAPES.map((s, i) => `
      <button type="button" class="pkey" role="radio" aria-checked="${i === 0}" data-shape="${s.id}" title="${s.name}">
        <canvas width="44" height="44" aria-hidden="true"></canvas><span>${s.name}</span></button>`).join("");
    $("#c-colors").innerHTML = COLORS.map((c, i) => `
      <button type="button" class="pkey ckey ckey-${c.id}" role="radio" aria-checked="${i === 0}" data-color="${c.id}" title="${c.note}">
        <span class="swatch" aria-hidden="true"></span><span>${c.name}</span></button>`).join("");
    $$("#c-shapes .pkey").forEach((key) => {
      const ctx = $("canvas", key).getContext("2d");
      ctx.fillStyle = "#141414";
      drawShape(ctx, key.dataset.shape, 22, 22, 0.75, 34);
      key.addEventListener("click", () => this.setStyle({ shape: key.dataset.shape }));
    });
    $$("#c-colors .pkey").forEach((key) => key.addEventListener("click", () => this.setStyle({ color: key.dataset.color })));
  },

  setStyle(change) {
    Object.assign(this.style, change);
    $$("#c-shapes .pkey").forEach((k) => k.setAttribute("aria-checked", String(k.dataset.shape === this.style.shape)));
    $$("#c-colors .pkey").forEach((k) => k.setAttribute("aria-checked", String(k.dataset.color === this.style.color)));
    $("#c-density").value = this.style.density;
    $("#c-density-value").textContent = this.style.density;
    $$("[name=c-paper]").forEach((r) => { r.checked = r.value === this.style.paper; });
    $("#c-frame").dataset.paper = this.style.paper;
    if (this.player.portrait) this.player.restyle(this.style);
    const color = COLORS.find((c) => c.id === this.style.color);
    if ((this.style.color === "song" || this.style.color === "blend") && !this.song && this.portrait) {
      this.status(`${color.name} colors come from the song: load one to see them.`);
    }
  },

  status(text) { $("#c-status").textContent = text; },

  async loadPortrait(file) {
    if (!file.type.startsWith("image/")) { toast("That doesn't look like an image. Try a JPG or PNG portrait.", true); return; }
    this.player.stop(false);
    this.status("Finding the face… (the first time, this downloads about 20 MB of face tools)");
    $("#c-frame").classList.add("is-working");
    try {
      const result = await preparePortrait(file, { removeBackground: $("#c-remove-bg").checked, align: $("#c-align").checked });
      this.portrait = { ...result, file };
      $("#c-drop").hidden = true;
      $("#c-photo-name").textContent = file.name;
      $("#c-chip-face").dataset.ok = String(result.faceFound);
      $("#c-chip-face").textContent = result.faceFound ? "Face lined up" : "No face found: centered";
      $("#c-chip-bg").dataset.ok = String(result.backgroundRemoved);
      $("#c-chip-bg").textContent = result.backgroundRemoved ? "Background removed" : "Background kept";
      $("#c-chips").hidden = false;
      if (!result.toolsLoaded && ($("#c-remove-bg").checked || $("#c-align").checked)) {
        toast("Couldn't load the face tools, so the photo was just centered. Check your connection.", true);
      }
      if (!$("#c-name").value) $("#c-name").value = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
      this.refresh();
      this.status(this.song ? "Ready. Press Build to watch the song build the face." : "Now load a song.");
    } catch (error) {
      console.error(error);
      toast("Couldn't read that photo. Try a JPG or PNG.", true);
      this.status(this.portrait ? "Kept the previous portrait." : "Load a portrait and a song to begin.");
    } finally {
      $("#c-frame").classList.remove("is-working");
      this.updateButtons();
    }
  },

  async loadSong(file) {
    const audioLike = file.type.startsWith("audio/") || /\.(mp3|wav|m4a|aac|ogg|oga|flac|webm)$/i.test(file.name);
    if (!audioLike) { toast("That doesn't look like a sound file. Try an MP3 or WAV.", true); return; }
    this.player.stop(false);
    this.status("Listening to the song…");
    try {
      const decoded = await decodeSong(await file.arrayBuffer());
      if (decoded.seconds < 2) { toast("That song is too short. Use at least a few seconds.", true); return; }
      if (this.song?.url) URL.revokeObjectURL(this.song.url);
      const url = URL.createObjectURL(file);
      this.song = { file, decoded, url };
      $("#c-audio").src = url;
      $("#c-song-name").textContent = file.name;
      $("#c-start").max = Math.max(0, decoded.seconds - 2).toFixed(1);
      $("#c-start").value = 0;
      $("#c-length").max = Math.min(MAX_SNIPPET, decoded.seconds).toFixed(0);
      $("#c-length").value = Math.min(20, decoded.seconds).toFixed(0);
      $("#c-snippet").hidden = false;
      if (!$("#c-song-title").value) $("#c-song-title").value = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
      this.player.sounds.clear();
      this.snippetChanged(true);
      this.drawWave();
      this.status(this.portrait ? "Ready. Press Build to watch the song build the face." : "Now load a portrait.");
    } catch (error) {
      console.error(error);
      toast("Couldn't decode that sound file. Try an MP3 or WAV.", true);
      this.status(this.song ? "Kept the previous song." : "Load a portrait and a song to begin.");
    } finally {
      this.updateButtons();
    }
  },

  snippet() {
    const seconds = this.song?.decoded.seconds || 0;
    const start = Math.min(Number($("#c-start").value), Math.max(0, seconds - 2));
    const length = Math.max(2, Math.min(Number($("#c-length").value), seconds - start));
    return { start, length };
  },

  snippetChanged(final) {
    if (!this.song) return;
    const { start, length } = this.snippet();
    $("#c-start-value").textContent = formatTime(start);
    $("#c-length-value").textContent = `${Math.round(length)} s`;
    $("#c-time").textContent = `0:00 / ${formatTime(length)}`;
    this.drawWave();
    if (final) this.refresh();
  },

  refresh() {
    if (!this.portrait) return;
    const { start, length } = this.snippet();
    this.player.setup({
      portrait: this.portrait.canvas, song: this.song?.decoded || null, start, length,
      style: this.style, caption: this.caption(),
    });
    $("#c-frame").dataset.paper = this.style.paper;
  },

  caption() {
    if (!$("#c-caption").checked) return null;
    return { name: $("#c-name").value.trim(), song: $("#c-song-title").value.trim() };
  },

  updateCaption() { if (this.player.portrait) this.player.setCaption(this.caption()); },

  drawWave() {
    const canvas = $("#c-wave");
    if (!this.song || !canvas.isConnected) return;
    const box = canvas.getBoundingClientRect();
    if (!box.width) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(box.width * dpr); canvas.height = Math.round(box.height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { samples, seconds } = this.song.decoded;
    const { start, length } = this.snippet();
    ctx.fillStyle = "rgba(255, 230, 0, 0.55)";
    ctx.fillRect((start / seconds) * box.width, 0, (length / seconds) * box.width, box.height);
    const bars = Math.floor(box.width / 3), step = Math.floor(samples.length / bars);
    ctx.fillStyle = "#141414";
    for (let i = 0; i < bars; i++) {
      let peak = 0;
      for (let j = i * step; j < (i + 1) * step; j += 16) peak = Math.max(peak, Math.abs(samples[j] || 0));
      const h = Math.max(1, peak * (box.height - 4));
      ctx.fillRect(i * 3, (box.height - h) / 2, 2, h);
    }
  },

  tick(t, length, done) {
    $("#c-time").textContent = `${formatTime(Math.min(t, length))} / ${formatTime(length)}`;
    $("#c-progress").style.width = `${Math.min(100, (t / length) * 100)}%`;
    if (done) { $("#c-build").textContent = "Build"; $("#c-lamp").classList.remove("is-on"); }
  },

  updateButtons() {
    const ready = Boolean(this.portrait && this.song);
    for (const id of ["c-build", "c-stop", "c-record", "c-save", "c-export"]) $(`#${id}`).disabled = !ready || (id === "c-record" && !videoFormat());
    $("#c-png").disabled = !this.portrait;
    $("#c-compare").disabled = !this.portrait;
  },

  async build() {
    if (!this.portrait || !this.song) return;
    $("#c-build").textContent = "Building";
    $("#c-lamp").classList.add("is-on");
    try { await this.player.play(); } catch { toast("Your browser blocked playback. Press Build again.", true); }
  },

  async save() {
    const name = $("#c-name").value.trim() || "Untitled";
    const thumb = document.createElement("canvas");
    const renderer = new FaceRenderer(thumb);
    renderer.setup(this.player.renderer.grid, this.style, 450, null);
    renderer.draw(Infinity);
    const { start, length } = this.snippet();
    await saveFace({
      name, song: $("#c-song-title").value.trim(), start, end: start + length, style: { ...this.style },
      portrait: await canvasBlob(this.portrait.canvas), audio: this.song.file, audioName: this.song.file.name,
      thumb: await canvasBlob(thumb),
    });
    toast(`Saved ${name} to your gallery.`);
    gallery.refresh();
  },

  /** Download what's needed to add this face to the public site (see samples/README.md). */
  async exportForSite() {
    const name = $("#c-name").value.trim() || "Untitled";
    const id = slug(name);
    const thumb = document.createElement("canvas");
    const renderer = new FaceRenderer(thumb);
    renderer.setup(this.player.renderer.grid, this.style, 450, null);
    renderer.draw(Infinity);
    const { start, length } = this.snippet();
    const audioName = slug(this.song.file.name.replace(/\.[^.]+$/, "")) + (this.song.file.name.match(/\.[^.]+$/)?.[0] || ".mp3");
    const entry = {
      name, song: $("#c-song-title").value.trim(),
      portrait: `samples/faces/${id}.png`, thumb: `samples/faces/${id}-thumb.png`, audio: `samples/audio/${audioName}`,
      start: Number(start.toFixed(2)), end: Number((start + length).toFixed(2)), style: { ...this.style },
    };
    download(await canvasBlob(this.portrait.canvas), `${id}.png`);
    download(await canvasBlob(thumb), `${id}-thumb.png`);
    download(new Blob([JSON.stringify(entry, null, 2)], { type: "application/json" }), `${id}.json`);
    toast(`Downloaded ${id}.png, ${id}-thumb.png and ${id}.json. See samples/README.md to publish.`);
  },
};

/* -------------------------------------------------------- shared actions */

async function recordWith(player, button, name) {
  if (player.playing || !player.song) return;
  const label = button.textContent;
  button.textContent = "Recording…";
  button.disabled = true;
  try {
    const { blob, extension } = await recordBuild(player.canvas, player.audio, () => player.play());
    download(blob, `${slug(name)}-build.${extension}`);
    toast(extension === "mp4" ? "Video saved." : "Video saved as WebM. If your slides need MP4, convert it, or record in Safari.");
  } catch (error) {
    console.error(error);
    toast("Couldn't record a video in this browser. Try Chrome or Safari.", true);
  } finally {
    button.textContent = label;
    button.disabled = false;
  }
}

async function savePng(player, name) {
  player.stop();
  player.renderer.reset();
  player.renderer.draw(Infinity);
  download(await canvasBlob(player.canvas), `${slug(name)}.png`);
}

/** All 6 shapes x 4 color modes side by side, using the current face and song. */
function openCompare(player, onPick) {
  const dialog = $("#compare");
  const grid = player.renderer.grid;
  const sheet = $("#compare-grid");
  sheet.innerHTML = `<div class="cmp-corner"></div>${COLORS.map((c) => `<div class="cmp-head">${c.name}<small>${c.note}</small></div>`).join("")}`;
  for (const shape of SHAPES) {
    sheet.insertAdjacentHTML("beforeend", `<div class="cmp-side">${shape.name}</div>`);
    for (const color of COLORS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cmp-cell";
      button.setAttribute("aria-label", `${shape.name}, ${color.name}`);
      const current = shape.id === player.style.shape && color.id === player.style.color;
      if (current) button.setAttribute("aria-current", "true");
      const canvas = document.createElement("canvas");
      const renderer = new FaceRenderer(canvas);
      renderer.setup(grid, { shape: shape.id, color: color.id }, 300, null);
      renderer.draw(Infinity);
      button.appendChild(canvas);
      button.addEventListener("click", () => { onPick({ shape: shape.id, color: color.id }); dialog.close(); });
      sheet.appendChild(button);
    }
  }
  dialog.showModal();
}

/* ---------------------------------------------------------------- gallery */

const gallery = {
  curated: [],

  async init() {
    try {
      const response = await fetch("samples/faces.json", { cache: "no-cache" });
      if (response.ok) this.curated = (await response.json()).faces || [];
    } catch { /* no published faces yet */ }
    this.viewer = new Player($("#viewer-canvas"), $("#viewer-audio"), (t, length, done) => {
      $("#viewer-time").textContent = `${formatTime(Math.min(t, length))} / ${formatTime(length)}`;
      if (done) $("#viewer-play").textContent = "Build";
    });
    $("#viewer-play").addEventListener("click", async () => {
      if (this.viewer.playing) { this.viewer.stop(); return; }
      $("#viewer-play").textContent = "Stop";
      try { await this.viewer.play(); } catch { toast("Your browser blocked playback. Press Build again.", true); }
      $("#viewer-play").textContent = "Build";
    });
    $("#viewer-record").addEventListener("click", () => recordWith(this.viewer, $("#viewer-record"), this.current?.name));
    $("#viewer-png").addEventListener("click", () => savePng(this.viewer, this.current?.name));
    $("#viewer-close").addEventListener("click", () => $("#viewer").close());
    $("#viewer").addEventListener("close", () => this.viewer.stop(false));
    if (!videoFormat()) $("#viewer-record").disabled = true;
    await this.refresh();
  },

  async refresh() {
    const local = await listFaces();
    const items = [
      ...this.curated.map((face) => ({ ...face, source: "site" })),
      ...local.map((face) => ({ ...face, source: "local" })),
    ];
    const list = $("#face-grid");
    for (const img of $$("img", list)) if (img.src.startsWith("blob:")) URL.revokeObjectURL(img.src);
    list.innerHTML = "";
    $("#face-empty").hidden = items.length > 0;
    for (const face of items) {
      const thumb = face.source === "local" ? URL.createObjectURL(face.thumb) : (face.thumb || face.portrait);
      const seconds = (face.end ?? 20) - (face.start ?? 0);
      const li = document.createElement("li");
      li.innerHTML = `
        <button type="button" class="face-card">
          <span class="face-thumb"><img alt="" loading="lazy"></span>
          <span class="price" title="How much of the song it took to build this face">${formatTime(seconds)}</span>
          <span class="face-name"></span><span class="face-song"></span>
        </button>
        ${face.source === "local" ? '<button type="button" class="face-delete" aria-label="Delete">×</button>' : ""}`;
      $("img", li).src = thumb;
      $(".face-name", li).textContent = face.name || "Untitled";
      $(".face-song", li).textContent = face.song ? `built by ${face.song}` : "";
      $(".face-card", li).addEventListener("click", () => this.open(face));
      $(".face-delete", li)?.addEventListener("click", async () => {
        if (!confirm(`Delete ${face.name || "this face"} from your gallery? This can't be undone.`)) return;
        await deleteFace(face.id);
        this.refresh();
      });
      list.appendChild(li);
    }
  },

  async open(face) {
    this.current = face;
    $("#viewer-title").textContent = face.name || "Untitled";
    $("#viewer-song").textContent = face.song ? `built by ${face.song}` : "";
    $("#viewer-play").disabled = true;
    $("#viewer").showModal();
    try {
      const portraitBlob = face.source === "local" ? face.portrait : await (await fetch(face.portrait)).blob();
      const audioBlob = face.source === "local" ? face.audio : await (await fetch(face.audio)).blob();
      const [portrait, decoded] = await Promise.all([imageToCanvas(portraitBlob), decodeSong(await audioBlob.arrayBuffer())]);
      const audio = $("#viewer-audio");
      if (audio.src.startsWith("blob:")) URL.revokeObjectURL(audio.src);
      audio.src = URL.createObjectURL(audioBlob);
      const start = face.start ?? 0;
      this.viewer.sounds.clear();
      this.viewer.setup({
        portrait, song: decoded, start, length: Math.max(2, (face.end ?? start + 20) - start),
        style: { shape: "circle", color: "ink", density: 64, paper: "light", ...face.style },
        caption: { name: face.name, song: face.song },
      });
      $("#viewer-time").textContent = `0:00 / ${formatTime(this.viewer.length)}`;
      $("#viewer-play").disabled = false;
    } catch (error) {
      console.error(error);
      toast("Couldn't open that face.", true);
    }
  },
};

/* ------------------------------------------------------------------ setup */

export function initFaces(showToast) {
  toast = showToast;
  for (const tab of $$(".c-view-tab")) {
    tab.addEventListener("click", () => setView(tab.dataset.view));
  }
  make.init();
  gallery.init();
  $("#face-empty-make").addEventListener("click", () => setView("make"));
  $("#compare-close").addEventListener("click", () => $("#compare").close());
}

export function setView(view) {
  for (const tab of $$(".c-view-tab")) tab.setAttribute("aria-selected", String(tab.dataset.view === view));
  $("#c-gallery").hidden = view !== "gallery";
  $("#c-make").hidden = view !== "make";
  if (view === "make") { make.drawWave(); loadFaceTools(); }  // start downloading face tools early
}

/** Called when leaving the Song -> Face tab. */
export function pauseFaces() {
  make.player?.stop(false);
  gallery.viewer?.stop(false);
}
