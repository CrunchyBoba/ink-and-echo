/* music.js
 * The sound of a scan:
 *   - the person's song plays only while the scanner line is over a BLACK bar
 *     (white space = silence), so the song stutters in the barcode's rhythm
 *   - each of the 12 digits rings a bell as the scanner reaches it
 *     (digit -> note, so every barcode has its own little tune)
 *   - the price sets the song's tempo: cheap things hurry, expensive things linger
 *   - a checkout beep at the end, or "item not found" if there's no barcode
 *
 * The demo songs are public-domain compositions, performed here by a tiny synthesizer.
 */

export const RATE = 44100;

/* --------------------------------------------------- public-domain songs */

const NOTE = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };
const midi = (name) => {
  const [, letter, octave] = name.match(/^([A-G]#?)(-?\d)$/);
  return 12 * (Number(octave) + 1) + NOTE[letter];
};

/** Each song: tempo (beats per minute), instrument, and [melody note, bass note, beats] steps. */
export const SONGS = {
  "fur-elise": {
    title: "Für Elise", by: "Ludwig van Beethoven, 1810", bpm: 420, instrument: "piano", key: midi("A4"),
    steps: `E5 D#5 | E5 D#5 E5 B4 D5 C5 | A4:A2:2 - C4 E4 A4 | B4:E2:2 - E4 G#4 B4 | C5:A2:2 - E4 E5 D#5 |
            E5 D#5 E5 B4 D5 C5 | A4:A2:2 - C4 E4 A4 | B4:E2:2 - E4 C5 B4 | A4:A2:3 - - -`,
  },
  "minuet-in-g": {
    title: "Minuet in G", by: "attributed to Christian Petzold, c. 1725", bpm: 132, instrument: "harpsichord", key: midi("G4"),
    steps: `D5:G3:1 G4:-:0.5 A4:-:0.5 B4:-:0.5 C5:-:0.5 | D5:B3:1 G4:-:1 G4:-:1 | E5:C4:1 C5:-:0.5 D5:-:0.5 E5:-:0.5 F#5:-:0.5 |
            G5:B3:1 G4:-:1 G4:-:1 | C5:A3:1 D5:-:0.5 C5:-:0.5 B4:-:0.5 A4:-:0.5 | B4:G3:1 C5:-:0.5 B4:-:0.5 A4:-:0.5 G4:-:0.5 |
            F#4:D3:1 G4:-:0.5 A4:-:0.5 B4:-:0.5 G4:-:0.5 | A4:D3:3 | D5:G3:1 G4:-:0.5 A4:-:0.5 B4:-:0.5 C5:-:0.5 |
            D5:B3:1 G4:-:1 G4:-:1 | E5:C4:1 C5:-:0.5 D5:-:0.5 E5:-:0.5 F#5:-:0.5 | G5:B3:1 G4:-:1 G4:-:1 |
            C5:A3:1 D5:-:0.5 C5:-:0.5 B4:-:0.5 A4:-:0.5 | B4:G3:1 C5:-:0.5 B4:-:0.5 A4:-:0.5 G4:-:0.5 |
            A4:D3:1 B4:-:0.5 A4:-:0.5 G4:-:0.5 F#4:-:0.5 | G4:G2:3`,
  },
  "ode-to-joy": {
    title: "Ode to Joy", by: "Ludwig van Beethoven, 1824", bpm: 100, instrument: "violin", key: midi("D5"),
    steps: `F#5:D3:1 F#5 G5 A5 | A5:A2:1 G5 F#5 E5 | D5:D3:1 D5 E5 F#5 | F#5:D3:1.5 E5:-:0.5 E5:A2:2 |
            F#5:D3:1 F#5 G5 A5 | A5:A2:1 G5 F#5 E5 | D5:D3:1 D5 E5 F#5 | E5:A2:1.5 D5:-:0.5 D5:D3:2 |
            E5:A2:1 E5 F#5 D5 | E5:A2:1 F#5:-:0.5 G5:-:0.5 F#5:-:1 D5:-:1 | E5:A2:1 F#5:-:0.5 G5:-:0.5 F#5:-:1 E5:-:1 |
            D5:D3:1 E5 A4:A2:2 | F#5:D3:1 F#5 G5 A5 | A5:A2:1 G5 F#5 E5 | D5:D3:1 D5 E5 F#5 | E5:A2:1.5 D5:-:0.5 D5:D3:2`,
  },
};

/** Parse "E5:A2:2" (melody:bass:beats), "E5" (1 beat), "-" (a 1-beat rest). */
function parseSteps(text) {
  return text.replace(/\|/g, " ").split(/\s+/).filter(Boolean).map((token) => {
    const [note, bass = "-", beats] = token.split(":");
    const isRest = note === "-";
    return { note: isRest ? null : midi(note), bass: bass === "-" ? null : midi(bass), beats: Number(beats ?? 1) };
  });
}

/* -------------------------------------------------------------- the synth */

const hz = (m) => 440 * 2 ** ((m - 69) / 12);

/** Add one note into `out` starting at sample `start`. */
function voice(out, start, seconds, freq, instrument, level) {
  const length = Math.min(out.length - start, Math.floor((seconds + 0.6) * RATE));
  if (length <= 0) return;
  const shapes = {
    piano: { harmonics: [1, 0.45, 0.25, 0.12, 0.06], attack: 0.004, decay: 2.2, sustain: false },
    harpsichord: { harmonics: [1, 0.7, 0.55, 0.4, 0.3, 0.2, 0.12], attack: 0.002, decay: 3.4, sustain: false },
    violin: { harmonics: [1, 0.6, 0.42, 0.3, 0.22, 0.16, 0.1, 0.07], attack: 0.07, decay: 0, sustain: true },
    bell: { harmonics: [1, 0, 0.35, 0, 0.12], attack: 0.002, decay: 4.5, sustain: false },
  };
  const shape = shapes[instrument];
  for (let i = 0; i < length; i++) {
    const t = i / RATE;
    let env = Math.min(1, t / shape.attack);
    if (shape.sustain) env *= t < seconds ? 1 : Math.exp(-(t - seconds) * 14);  // bowed: holds, then releases
    else env *= Math.exp(-t * shape.decay) * (t < seconds ? 1 : Math.exp(-(t - seconds) * 10));
    if (env < 0.0005 && t > seconds) break;
    const vibrato = instrument === "violin" ? 1 + 0.004 * Math.sin(2 * Math.PI * 5.5 * t) * Math.min(1, t / 0.3) : 1;
    let sample = 0;
    shape.harmonics.forEach((strength, h) => {
      const f = freq * (h + 1) * vibrato;
      if (strength && f < RATE / 2) sample += strength * Math.sin(2 * Math.PI * f * t);
    });
    out[start + i] += sample * env * level;
  }
}

/** Play a song, looping as needed, for `seconds`. Price scales the tempo. */
export function renderSong(songId, seconds, tempoScale = 1) {
  const song = SONGS[songId];
  const out = new Float32Array(Math.ceil(seconds * RATE));
  const steps = parseSteps(song.steps);
  const beat = 60 / (song.bpm * tempoScale);
  let t = 0;
  while (t < seconds) {
    for (const step of steps) {
      if (t >= seconds) break;
      const length = step.beats * beat;
      const start = Math.floor(t * RATE);
      if (step.note !== null) voice(out, start, length, hz(step.note), song.instrument, 0.22);
      if (step.bass !== null) voice(out, start, length * 1.6, hz(step.bass), song.instrument === "violin" ? "piano" : song.instrument, 0.16);
      t += length;
    }
  }
  return out;
}

/** Decode a real song file (for your own versions) into mono samples at RATE, from `start` seconds. */
export async function decodeSongFile(arrayBuffer, start, seconds) {
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const context = new Offline(1, RATE, RATE);
  const buffer = await new Promise((resolve, reject) => {
    const result = context.decodeAudioData(arrayBuffer.slice(0), resolve, reject);
    if (result?.then) result.then(resolve, reject);
  });
  const out = new Float32Array(Math.ceil(seconds * RATE));
  const from = Math.floor(start * RATE);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const channel = buffer.getChannelData(c);
    for (let i = 0; i < out.length; i++) out[i] += (channel[from + i] || 0) / buffer.numberOfChannels;
  }
  return out;
}

/* ------------------------------------------------------------- the scan */

function beep(out, at, freq, seconds, level = 0.25) {
  const start = Math.floor(at * RATE);
  for (let i = 0; i < seconds * RATE && start + i < out.length; i++) {
    const t = i / RATE;
    const square = Math.sign(Math.sin(2 * Math.PI * freq * t));
    out[start + i] += square * level * Math.min(1, t / 0.005) * Math.min(1, (seconds - t) / 0.01);
  }
}

/** Price -> tempo: a $1 item plays about 25% faster than normal, a $1,000 one about 25% slower. */
export function tempoForPrice(price) {
  return Math.min(1.3, Math.max(0.75, 1.25 - 0.17 * Math.log10(Math.max(price, 1))));
}

/**
 * The whole soundtrack of one person's scan.
 * timing: { duration, scanStart, scanEnd } in seconds.
 * barcode: from upc() (or null for a priceless item). song: samples (Float32Array).
 */
export function scanSoundtrack({ timing, barcode, song, keyNote }) {
  const { duration, scanStart, scanEnd } = timing;
  const out = new Float32Array(Math.ceil(duration * RATE));
  const scanLength = scanEnd - scanStart;
  const ramp = Math.floor(0.008 * RATE);  // tiny fades so the cuts click softly, like a scanner

  if (barcode) {
    // the song, gated by the bars
    let gain = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / RATE;
      let open = 0;
      if (t >= scanStart && t < scanEnd) {
        const module = Math.floor(((t - scanStart) / scanLength) * barcode.modules.length);
        open = barcode.modules[module] ? 1 : 0;
      }
      gain += (open - gain) / ramp;
      out[i] += (song[i] || 0) * gain * 0.9;
    }
    // a bell for each digit as the scanner reaches it
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];  // major pentatonic: always sounds in tune
    barcode.digitSpans.forEach(([first], i) => {
      const at = scanStart + (first / barcode.modules.length) * scanLength;
      voice(out, Math.floor(at * RATE), 0.4, hz(keyNote + 12 + scale[Number(barcode.digits[i])]), "bell", 0.13);
    });
    beep(out, scanEnd + 0.15, 1900, 0.13);  // checkout beep
  } else {
    // priceless: the scanner finds nothing, then the song plays whole, for the first time
    beep(out, scanEnd + 0.1, 330, 0.16, 0.22);
    beep(out, scanEnd + 0.36, 262, 0.28, 0.22);
    const songStart = scanEnd + 1.1;
    for (let i = Math.floor(songStart * RATE); i < out.length; i++) {
      const t = i / RATE;
      const fade = Math.min(1, (t - songStart) / 1.5) * Math.min(1, (duration - t) / 2.5);
      out[i] += (song[i - Math.floor(songStart * RATE)] || 0) * fade * 0.9;
    }
  }

  // keep the overall level safe
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  if (peak > 0.98) for (let i = 0; i < out.length; i++) out[i] *= 0.98 / peak;
  return out;
}
