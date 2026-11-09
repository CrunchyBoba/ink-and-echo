/* recorder.js
 * Record a face being built, with its music, as a video file you can drop
 * straight into a presentation. Uses the browser's built-in MediaRecorder.
 */

const audioGraphs = new WeakMap();  // an <audio> element can only be wired up once

function wire(audio) {
  if (!audioGraphs.has(audio)) {
    const context = new (window.AudioContext || window.webkitAudioContext)();
    const source = context.createMediaElementSource(audio);
    const tap = context.createMediaStreamDestination();
    source.connect(context.destination);  // keep hearing it
    source.connect(tap);                  // and record it
    audioGraphs.set(audio, { context, tap });
  }
  return audioGraphs.get(audio);
}

/** The best video format this browser can record (MP4 where possible). */
export function videoFormat() {
  if (!window.MediaRecorder) return null;
  const options = [
    ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "mp4"],
    ["video/mp4", "mp4"],
    ["video/webm;codecs=vp9,opus", "webm"],
    ["video/webm", "webm"],
  ];
  const found = options.find(([type]) => MediaRecorder.isTypeSupported(type));
  return found ? { type: found[0], extension: found[1] } : null;
}

/**
 * Play the build from the start and record it.
 * play(): starts playback and the animation, resolves when the build is done.
 * Returns { blob, extension }.
 */
export async function recordBuild(canvas, audio, play, holdSeconds = 1.5) {
  const format = videoFormat();
  if (!format || !canvas.captureStream) throw new Error("This browser can't record video");
  const { context, tap } = wire(audio);
  await context.resume();

  const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...tap.stream.getAudioTracks()]);
  const recorder = new MediaRecorder(stream, { mimeType: format.type, videoBitsPerSecond: 6_000_000 });
  const chunks = [];
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  const stopped = new Promise((resolve) => { recorder.onstop = resolve; });

  recorder.start(250);
  await play();
  await new Promise((resolve) => setTimeout(resolve, holdSeconds * 1000));  // hold on the finished face
  recorder.stop();
  await stopped;
  stream.getVideoTracks().forEach((track) => track.stop());  // keep the audio tap alive for next time
  return { blob: new Blob(chunks, { type: format.type.split(";")[0] }), extension: format.extension };
}
