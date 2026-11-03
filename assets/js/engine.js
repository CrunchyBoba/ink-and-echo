/* engine.js
 * Talks to the Python engine running in worker.js, and decodes audio files
 * with the browser's own Web Audio decoder (MP3, WAV, OGG, FLAC, M4A...).
 */

const SAMPLE_RATE = 22050;
const MAX_SECONDS = 360;

export class Engine {
  constructor(onStatus) {
    this.worker = new Worker(new URL("./worker.js", import.meta.url));
    this.pending = new Map();
    this.nextId = 1;
    this.state = "loading";
    this.worker.onmessage = ({ data }) => {
      if (data.status) {
        this.state = data.status;
        onStatus?.(data.status, data.detail);
        return;
      }
      const job = this.pending.get(data.id);
      if (!job) return;
      this.pending.delete(data.id);
      data.ok ? job.resolve(data.result) : job.reject(new Error(data.error));
    };
    this.worker.onerror = (event) => onStatus?.("error", event.message || "Engine failed to start");
  }

  call(type, args = [], transfer = []) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, type, args }, transfer);
    });
  }

  // ---- Image -> Sound ----
  loadImage(bytes) {
    return this.call("load_image", [bytes]);
  }
  imageGrid(rows, detail) {
    return this.call("image_grid", [rows, detail]);
  }
  makeSound(method, rows, step, detail) {
    return this.call("make_sound", [method, rows, step, detail]);
  }

  // ---- Sound -> Image ----
  loadSound(decoded, rawBytes) {
    const { left, right, sampleRate } = decoded;
    const leftCopy = left.slice();
    const rightCopy = right ? right.slice() : null;
    const transfer = [leftCopy.buffer, rawBytes.buffer];
    if (rightCopy) transfer.push(rightCopy.buffer);
    return this.call("load_sound", [leftCopy, rightCopy, sampleRate, rawBytes], transfer);
  }
  makeImage(method) {
    return this.call("make_image", [method]);
  }
}

/** Decode an audio file into left/right Float32Arrays at 22,050 Hz. */
export async function decodeAudio(arrayBuffer) {
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const context = new Offline(2, SAMPLE_RATE, SAMPLE_RATE);
  const buffer = await new Promise((resolve, reject) => {
    const result = context.decodeAudioData(arrayBuffer.slice(0), resolve, reject);
    if (result?.then) result.then(resolve, reject);
  });
  const limit = Math.min(buffer.length, MAX_SECONDS * buffer.sampleRate);
  const left = buffer.getChannelData(0).subarray(0, limit);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1).subarray(0, limit) : null;
  return { left, right, sampleRate: buffer.sampleRate, seconds: limit / buffer.sampleRate };
}
