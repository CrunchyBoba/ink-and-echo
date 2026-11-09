/* page.js
 * The "Scanned" tab: a full demo at the top, then one section per person
 * with their barcode portrait, the details, and their own scan to play.
 * People are listed in scanned/people.json.
 */

import { preparePortrait } from "../face/align.js";
import { videoFormat } from "../face/recorder.js";
import { upc } from "./barcode.js";
import { SONGS, RATE, renderSong, decodeSongFile, scanSoundtrack, tempoForPrice } from "./music.js";
import { W, H, barcodePortrait, cropToFace, makePersonScene, makeIntroScene, makeOutroScene, posterCanvas } from "./scene.js";

const $ = (selector, root = document) => root.querySelector(selector);
const PERSON_TIMING = { duration: 34, scanStart: 1.5, scanEnd: 29.5 };
const PRICELESS_TIMING = { duration: 30, scanStart: 1.5, scanEnd: 5.5 };
const INTRO = 8, OUTRO = 8;

let audioContext = null;
const ctx = () => (audioContext ||= new (window.AudioContext || window.webkitAudioContext)());
let toast = () => {};

function formatTime(seconds) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function slug(text) {
  return (text || "scan").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Find the downloadable image URL for a Wikimedia Commons file. */
async function commonsImage(title, width = 900) {
  const api = "https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&prop=imageinfo&iiprop=url"
    + `&iiurlwidth=${width}&titles=${encodeURIComponent(title)}`;
  const page = Object.values((await (await fetch(api)).json()).query.pages)[0];
  const url = page.imageinfo?.[0]?.thumburl || page.imageinfo?.[0]?.url;
  if (!url) throw new Error(`Couldn't find ${title} on Wikimedia Commons`);
  return url;
}

/** Load one person: portrait, barcode, art, song and soundtrack. */
async function preparePerson(person, index, total) {
  const url = person.photo.commons ? await commonsImage(person.photo.commons) : person.photo.src;
  const blob = await (await fetch(url)).blob();
  const cut = await preparePortrait(blob, { removeBackground: true, align: true });
  const barcode = person.priceless ? null : upc(person.barcode);
  const timing = person.priceless ? PRICELESS_TIMING : PERSON_TIMING;

  let art;
  if (barcode) {
    art = barcodePortrait(cut.canvas, barcode);
  } else {
    const whole = await preparePortrait(blob, { removeBackground: false, align: true });
    art = { photo: cropToFace(whole.canvas), faceCrop: cropToFace(cut.canvas) };
  }

  const song = person.song || {};
  const preset = song.melody ? SONGS[song.melody] : null;
  const tempo = barcode ? tempoForPrice(person.price) : 1;
  const samples = preset
    ? renderSong(song.melody, timing.duration, tempo)
    : await decodeSongFile(await (await fetch(song.file)).arrayBuffer(), song.start || 0, timing.duration);
  const details = {
    ...person,
    songTitle: song.title || preset?.title || "Untitled",
    songBy: song.by || preset?.by || "",
  };
  const soundtrack = scanSoundtrack({ timing, barcode, song: samples, keyNote: preset?.key ?? 60 });
  return {
    details, barcode, art, timing, soundtrack,
    draw: makePersonScene(details, art, barcode, timing, index, total),
  };
}

/** One canvas + controls that plays a list of scenes with their soundtrack. */
class ScanPlayer {
  constructor(root, scenes, name) {
    this.root = root;
    this.scenes = scenes;          // [{ draw, duration, soundtrack }]
    this.name = name;
    this.total = scenes.reduce((s, x) => s + x.duration, 0);
    this.canvas = $("canvas", root);
    this.canvas.width = W; this.canvas.height = H;
    this.g = this.canvas.getContext("2d");
    this.source = null;
    this.raf = null;
    $(".sp-play", root).addEventListener("click", () => (this.source ? this.stop() : this.play()));
    $(".sp-big", root).addEventListener("click", () => this.play());
    $(".sp-full", root).addEventListener("click", () => this.fullscreen());
    $(".sp-record", root).addEventListener("click", () => this.record());
    if (!videoFormat()) $(".sp-record", root).disabled = true;
    this.posterTime = scenes.length > 1 ? INTRO * 0.85 : scenes[0].posterTime ?? scenes[0].duration - 1.5;
    this.drawAt(this.posterTime);
    this.setTime(0);
  }

  /** All scene soundtracks joined into one audio buffer. */
  buffer() {
    if (this._buffer) return this._buffer;
    const buffer = ctx().createBuffer(1, Math.ceil(this.total * RATE), RATE);
    const data = buffer.getChannelData(0);
    let offset = 0;
    for (const scene of this.scenes) {
      if (scene.soundtrack) data.set(scene.soundtrack.subarray(0, Math.min(scene.soundtrack.length, data.length - offset)), offset);
      offset += Math.round(scene.duration * RATE);
    }
    return (this._buffer = buffer);
  }

  drawAt(t) {
    let start = 0;
    for (const scene of this.scenes) {
      if (t < start + scene.duration || scene === this.scenes[this.scenes.length - 1]) {
        scene.draw(this.g, Math.min(t - start, scene.duration));
        return;
      }
      start += scene.duration;
    }
  }

  setTime(t) {
    $(".sp-time", this.root).textContent = `${formatTime(t)} / ${formatTime(this.total)}`;
    $(".sp-bar span", this.root).style.width = `${(t / this.total) * 100}%`;
  }

  async play(tap = null) {
    ScanPlayer.current?.stop();
    ScanPlayer.current = this;
    const audio = ctx();
    await audio.resume();
    this.source = audio.createBufferSource();
    this.source.buffer = this.buffer();
    this.source.connect(audio.destination);
    if (tap) this.source.connect(tap);
    const started = audio.currentTime + 0.05;
    this.source.start(started);
    this.root.classList.add("is-playing");
    $(".sp-play", this.root).textContent = "Stop";
    return new Promise((resolve) => {
      this.done = resolve;
      this.source.onended = () => this.stop();
      const loop = () => {
        const t = Math.max(0, audio.currentTime - started);
        this.drawAt(t);
        this.setTime(Math.min(t, this.total));
        if (this.source) this.raf = requestAnimationFrame(loop);
      };
      loop();
    });
  }

  stop() {
    if (this.source) { this.source.onended = null; try { this.source.stop(); } catch { /* already stopped */ } }
    this.source = null;
    cancelAnimationFrame(this.raf);
    this.root.classList.remove("is-playing");
    $(".sp-play", this.root).textContent = "Play";
    if (ScanPlayer.current === this) ScanPlayer.current = null;
    this.done?.(); this.done = null;
  }

  fullscreen() {
    const target = $(".sp-stage", this.root);
    (target.requestFullscreen || target.webkitRequestFullscreen)?.call(target);
  }

  async record() {
    const format = videoFormat();
    const button = $(".sp-record", this.root);
    if (!format || this.recording) return;
    this.recording = true;
    button.textContent = "Recording…"; button.disabled = true;
    try {
      const audio = ctx();
      const tap = audio.createMediaStreamDestination();
      const stream = new MediaStream([...this.canvas.captureStream(30).getVideoTracks(), ...tap.stream.getAudioTracks()]);
      const recorder = new MediaRecorder(stream, { mimeType: format.type, videoBitsPerSecond: 8_000_000 });
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
      recorder.start(500);
      await this.play(tap);
      recorder.stop();
      await stopped;
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunks, { type: format.type.split(";")[0] });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `scanned-${slug(this.name)}.${format.extension}`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast("Video saved to your downloads.");
    } catch (error) {
      console.error(error);
      toast("Couldn't record a video in this browser. Try Chrome or Safari.", true);
    } finally {
      this.recording = false;
      button.textContent = "Record video"; button.disabled = !videoFormat();
    }
  }
}

function playerHTML(title) {
  return `
    <div class="sp-stage">
      <canvas aria-label="${title}"></canvas>
      <button type="button" class="sp-big" aria-label="Play ${title}"><span></span></button>
    </div>
    <div class="sp-controls">
      <button type="button" class="btn btn-start btn-small sp-play">Play</button>
      <div class="sp-bar" aria-hidden="true"><span></span></div>
      <span class="sp-time">0:00</span>
      <button type="button" class="btn btn-small sp-full">Full screen</button>
      <button type="button" class="btn btn-small sp-record">Record video</button>
    </div>`;
}

/* ------------------------------------------------------------------ setup */

let started = false;

/** Build the tab the first time it's opened. */
export async function openScanned(showToast) {
  toast = showToast;
  if (started) return;
  started = true;
  const status = $("#d-status");
  try {
    await Promise.all(["700 58px Inter", "800 34px Inter", "500 30px Inter", "400 15px Inter", "400 22px Michroma"]
      .map((font) => document.fonts.load(font).catch(() => {})));
    const data = await (await fetch("scanned/people.json", { cache: "no-cache" })).json();
    const people = data.people || [];
    const prepared = [];
    for (const [i, person] of people.entries()) {
      status.textContent = `Scanning ${person.name} (${i + 1} of ${people.length})…`;
      prepared.push(await preparePerson(person, i, people.length));
    }

    const credits = [
      "Songs: public-domain compositions, performed by the SYN-1 synthesizer.",
      "Photos: public domain, via Wikimedia Commons.",
      "Barcodes encode each person's birth and death years. Favorite things and prices are imagined.",
    ];
    const introBeep = new Float32Array(Math.ceil(INTRO * RATE));
    for (let i = 0; i < 0.13 * RATE; i++) introBeep[Math.floor((INTRO - 0.3) * RATE) + i] = 0.2 * Math.sign(Math.sin(2 * Math.PI * 1900 * i / RATE));
    const scenes = [
      { draw: makeIntroScene(INTRO), duration: INTRO, soundtrack: introBeep },
      ...prepared.map((p) => ({ draw: p.draw, duration: p.timing.duration, soundtrack: p.soundtrack })),
      { draw: makeOutroScene(credits), duration: OUTRO, soundtrack: null },
    ];
    const demo = $("#d-demo");
    demo.innerHTML = playerHTML("Scanned, full demo");
    new ScanPlayer(demo, scenes, "demo");
    $("#d-length").textContent = formatTime(scenes.reduce((s, x) => s + x.duration, 0));

    const list = $("#d-people");
    list.innerHTML = "";
    prepared.forEach((p, i) => {
      const { details, barcode } = p;
      const section = document.createElement("article");
      section.className = "d-person";
      section.innerHTML = `
        <div class="d-poster"></div>
        <div class="d-info">
          <span class="d-count">${String(i + 1).padStart(2, "0")} / ${String(prepared.length).padStart(2, "0")}</span>
          <h3></h3>
          <p class="d-years"></p>
          <dl>
            <dt>Favorite thing</dt><dd class="d-item"></dd>
            <dt>Price</dt><dd><span class="d-price"></span></dd>
            <dt>Barcode</dt><dd class="d-code"></dd>
            <dt>Song</dt><dd class="d-song"></dd>
          </dl>
          <p class="d-credit"></p>
        </div>
        <div class="d-clip">${playerHTML(`${details.name}'s scan`)}</div>`;
      $(".d-poster", section).appendChild(posterCanvas(p.art, barcode));
      $("h3", section).textContent = details.name;
      $(".d-years", section).textContent = details.years;
      $(".d-item", section).textContent = details.item;
      $(".d-price", section).textContent = barcode ? `$${details.price.toFixed(2)}` : "Not for sale";
      $(".d-code", section).textContent = barcode ? `${barcode.digits} · ${details.barcodeNote || ""}` : "None. The scanner can't read it.";
      $(".d-song", section).textContent = `${details.songTitle}, ${details.songBy}. ${barcode ? "Heard only through the black bars." : "Heard whole."}`;
      $(".d-credit", section).textContent = details.credit || "";
      list.appendChild(section);
      new ScanPlayer($(".d-clip", section), [{ draw: p.draw, duration: p.timing.duration, soundtrack: p.soundtrack, posterTime: p.timing.duration - 1 }], details.name);
    });
    status.textContent = "";
    status.hidden = true;
  } catch (error) {
    console.error(error);
    status.textContent = "Couldn't load the scans. Check your connection and reload the page.";
    started = false;
  }
}

/** Stop any scan that's playing (when leaving the tab). */
export function pauseScanned() {
  ScanPlayer.current?.stop();
}
