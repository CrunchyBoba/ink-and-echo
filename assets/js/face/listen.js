/* listen.js
 * Measure a song snippet ~43 times a second: how loud it is, how high the
 * melody sits, which of the 12 notes are sounding, and where the beats land.
 * Plain JavaScript (a small FFT), so the face builder doesn't need the Python engine.
 */

export const SAMPLE_RATE = 22050;
const N = 4096;            // FFT size: fine enough to tell neighboring notes apart
const HOP = 512;           // samples between measurements
const LOW_NOTE = 36;       // C2
const HIGH_NOTE = 96;      // C7

/** Decode any audio file to mono samples at 22,050 Hz. */
export async function decodeSong(arrayBuffer) {
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const context = new Offline(1, SAMPLE_RATE, SAMPLE_RATE);
  const buffer = await new Promise((resolve, reject) => {
    const result = context.decodeAudioData(arrayBuffer.slice(0), resolve, reject);
    if (result?.then) result.then(resolve, reject);
  });
  const mono = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const channel = buffer.getChannelData(c);
    for (let i = 0; i < mono.length; i++) mono[i] += channel[i] / buffer.numberOfChannels;
  }
  return { samples: mono, seconds: buffer.length / buffer.sampleRate, sampleRate: buffer.sampleRate };
}

/** In-place radix-2 FFT on separate real/imaginary arrays. */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const step = (-2 * Math.PI) / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < size / 2; k++) {
        const angle = step * k;
        const wr = Math.cos(angle), wi = Math.sin(angle);
        const a = start + k, b = a + size / 2;
        const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
      }
    }
  }
}

/** Which FFT bins feed each semitone (each note averages its bins). */
function noteBank(sampleRate) {
  const bank = [];
  for (let note = LOW_NOTE; note <= HIGH_NOTE; note++) {
    const bins = [];
    for (let bin = 1; bin < N / 2; bin++) {
      const midi = 69 + 12 * Math.log2((bin * sampleRate) / N / 440);
      const weight = 1 - Math.abs(midi - note);
      if (weight > 0) bins.push([bin, weight]);
    }
    const total = bins.reduce((s, [, w]) => s + w, 0) || 1;
    bank.push(bins.map(([bin, w]) => [bin, w / total]));
  }
  return bank;
}

function normalize(values) {
  let low = Infinity, high = -Infinity;
  for (const v of values) { if (v < low) low = v; if (v > high) high = v; }
  const span = high - low || 1;
  return values.map((v) => (v - low) / span);
}

/** Squash to 0-1 using the 5th-95th percentile, so one spike doesn't flatten everything. */
function robustNormalize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const low = sorted[Math.floor(sorted.length * 0.05)] ?? 0;
  const high = sorted[Math.floor(sorted.length * 0.95)] ?? 1;
  const span = high - low || 1;
  return values.map((v) => Math.min(1, Math.max(0, (v - low) / span)));
}

function smooth(values, size) {
  const out = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    let sum = 0, count = 0;
    for (let j = Math.max(0, i - size); j <= Math.min(values.length - 1, i + size); j++) { sum += values[j]; count++; }
    out[i] = sum / count;
  }
  return out;
}

/**
 * Measure the snippet from `start` to `end` seconds.
 * Returns per-frame arrays (loud, register, onset, chroma) plus beat times.
 */
export function listen(song, start, end) {
  const { samples, sampleRate } = song;
  const a = Math.max(0, Math.floor(start * sampleRate));
  const b = Math.min(samples.length, Math.floor(end * sampleRate));
  const clip = samples.subarray(a, b);
  const frames = Math.max(1, Math.floor(clip.length / HOP));
  const hann = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  const bank = noteBank(sampleRate);
  const re = new Float32Array(N), im = new Float32Array(N);

  const loud = [], pitch = [], centroid = [], flux = [], chroma = [];
  let previous = null;
  for (let f = 0; f < frames; f++) {
    const center = f * HOP;
    let energy = 0;
    for (let i = 0; i < N; i++) {
      const s = clip[center - N / 2 + i] || 0;
      re[i] = s * hann[i]; im[i] = 0;
      energy += s * s;
    }
    loud.push(Math.sqrt(Math.sqrt(energy / N)));  // square root keeps quiet parts visible
    fft(re, im);
    const mag = new Float32Array(N / 2);
    let weighted = 0, total = 0;
    for (let k = 1; k < N / 2; k++) {
      mag[k] = Math.hypot(re[k], im[k]);
      weighted += mag[k] * k; total += mag[k];
    }
    centroid.push(Math.log(1 + (weighted / (total || 1)) * sampleRate / N));

    // semitone strengths -> the strongest one is the melody; fold octaves for chroma
    const notes = bank.map((bins) => bins.reduce((s, [bin, w]) => s + mag[bin] * w, 0));
    let best = 0;
    for (let i = 1; i < notes.length; i++) if (notes[i] > notes[best]) best = i;
    pitch.push(best);
    const fold = new Array(12).fill(0);
    notes.forEach((v, i) => { fold[(LOW_NOTE + i) % 12] += v; });
    const peak = Math.max(...fold) || 1;
    chroma.push(fold.map((v) => v / peak));

    // spectral flux: how much louder each note got since the last frame (new hits)
    const logNotes = notes.map((v) => Math.log(1 + 100 * v));
    let rise = 0;
    if (previous) logNotes.forEach((v, i) => { rise += Math.max(0, v - previous[i]); });
    flux.push(rise);
    previous = logNotes;
  }

  const onset = normalize(flux);
  // beats: onset peaks that stand out, at least 0.18 s apart
  const mean = onset.reduce((s, v) => s + v, 0) / onset.length;
  const spread = Math.sqrt(onset.reduce((s, v) => s + (v - mean) ** 2, 0) / onset.length);
  const beats = [];
  const gap = Math.round((0.18 * sampleRate) / HOP);
  for (let f = 1; f < onset.length - 1; f++) {
    const isPeak = onset[f] >= onset[f - 1] && onset[f] >= onset[f + 1];
    if (isPeak && onset[f] > mean + 0.6 * spread && (!beats.length || f - beats[beats.length - 1] >= gap)) beats.push(f);
  }

  // how high the music sits: mostly the melody's pitch, partly the tone's brightness
  const melody = robustNormalize(pitch);
  const bright = robustNormalize(centroid);
  const register = smooth(melody.map((p, i) => p * 0.6 + bright[i] * 0.4), 6);

  return {
    frames, frameTime: HOP / sampleRate, duration: clip.length / sampleRate,
    loud: smooth(robustNormalize(loud), 2),
    register,
    onset,
    chroma,
    beats: beats.map((f) => f * HOP / sampleRate),
  };
}
