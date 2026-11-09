/* align.js
 * Standardize a portrait: cut out the background and line the face up,
 * so every face in the gallery sits at the same size and position.
 *
 * Uses Google's MediaPipe tools, which run entirely in the browser:
 *   - a segmenter that separates the person from the background
 *   - a face detector that finds the eyes
 * If they can't load (offline, old browser), the photo is simply center-cropped.
 */

const MEDIAPIPE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21";
const MODELS = "https://storage.googleapis.com/mediapipe-models";
const FACE_MODEL = `${MODELS}/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite`;
const SEGMENT_MODEL = `${MODELS}/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite`;

export const PORTRAIT = { width: 600, height: 800 };
const EYE_LINE = 0.4;        // eyes sit 40% down from the top
const EYE_SPACING = 0.22;    // distance between the eyes, as a share of the width
const MAX_INPUT = 1024;      // big photos are scaled down first

let toolsPromise = null;

/** Load MediaPipe once; later calls reuse it. Resolves to null if unavailable. */
export function loadFaceTools() {
  if (!toolsPromise) {
    toolsPromise = (async () => {
      const { FilesetResolver, FaceDetector, ImageSegmenter } = await import(`${MEDIAPIPE}/vision_bundle.mjs`);
      const files = await FilesetResolver.forVisionTasks(`${MEDIAPIPE}/wasm`);
      const [detector, segmenter] = await Promise.all([
        FaceDetector.createFromOptions(files, {
          baseOptions: { modelAssetPath: FACE_MODEL, delegate: "CPU" }, runningMode: "IMAGE",
        }),
        ImageSegmenter.createFromOptions(files, {
          baseOptions: { modelAssetPath: SEGMENT_MODEL, delegate: "CPU" }, runningMode: "IMAGE",
          outputCategoryMask: true, outputConfidenceMasks: false,
        }),
      ]);
      return { detector, segmenter };
    })().catch((error) => {
      console.warn("Face tools unavailable, using a simple crop instead:", error);
      return null;
    });
  }
  return toolsPromise;
}

function canvas(width, height) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}

/** Draw the photo onto a canvas no bigger than MAX_INPUT on its long side. */
async function readPhoto(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_INPUT / Math.max(bitmap.width, bitmap.height));
  const c = canvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
  c.getContext("2d").drawImage(bitmap, 0, 0, c.width, c.height);
  bitmap.close?.();
  return c;
}

/** Keep only the person: everything the segmenter calls background becomes transparent. */
function cutOut(photo, segmenter) {
  const result = segmenter.segment(photo);
  const mask = result.categoryMask;
  const labels = mask.getAsUint8Array();
  const maskCanvas = canvas(mask.width, mask.height);
  const pixels = new ImageData(mask.width, mask.height);
  for (let i = 0; i < labels.length; i++) pixels.data[i * 4 + 3] = labels[i] === 0 ? 0 : 255;
  maskCanvas.getContext("2d").putImageData(pixels, 0, 0);
  result.close();

  const out = canvas(photo.width, photo.height);
  const ctx = out.getContext("2d");
  ctx.drawImage(photo, 0, 0);
  ctx.globalCompositeOperation = "destination-in";
  ctx.filter = "blur(1.5px)";  // soften the cut edge a little
  ctx.drawImage(maskCanvas, 0, 0, out.width, out.height);
  return out;
}

/** The two eyes of the largest face, in pixels, left to right in the picture. */
function findEyes(photo, detector) {
  const { detections } = detector.detect(photo);
  if (!detections?.length) return null;
  const biggest = detections.reduce((a, b) =>
    (b.boundingBox.width * b.boundingBox.height > a.boundingBox.width * a.boundingBox.height ? b : a));
  const [a, b] = biggest.keypoints;  // MediaPipe lists the two eyes first
  const eyes = [a, b].map((k) => ({ x: k.x * photo.width, y: k.y * photo.height }));
  return eyes.sort((p, q) => p.x - q.x);
}

/**
 * Turn any photo into a standard 600 x 800 portrait.
 * Returns { canvas, faceFound, backgroundRemoved }.
 */
export async function preparePortrait(file, { removeBackground = true, align = true } = {}) {
  const photo = await readPhoto(file);
  const tools = (removeBackground || align) ? await loadFaceTools() : null;

  let source = photo;
  let backgroundRemoved = false;
  if (tools && removeBackground) {
    try {
      source = cutOut(photo, tools.segmenter);
      backgroundRemoved = true;
    } catch (error) {
      console.warn("Background removal failed:", error);
    }
  }

  let eyes = null;
  if (tools && align) {
    try { eyes = findEyes(photo, tools.detector); } catch (error) { console.warn("Face detection failed:", error); }
  }

  const out = canvas(PORTRAIT.width, PORTRAIT.height);
  const ctx = out.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  if (eyes) {
    // rotate so the eyes are level, scale to a standard eye spacing, center them
    const [left, right] = eyes;
    const angle = Math.atan2(right.y - left.y, right.x - left.x);
    const spacing = Math.hypot(right.x - left.x, right.y - left.y);
    const scale = (EYE_SPACING * PORTRAIT.width) / Math.max(spacing, 1);
    ctx.translate(PORTRAIT.width / 2, PORTRAIT.height * EYE_LINE);
    ctx.rotate(-angle);
    ctx.scale(scale, scale);
    ctx.translate(-(left.x + right.x) / 2, -(left.y + right.y) / 2);
    ctx.drawImage(source, 0, 0);
  } else {
    // no face found: fill the frame, centered (like "cover")
    const scale = Math.max(PORTRAIT.width / source.width, PORTRAIT.height / source.height);
    const w = source.width * scale, h = source.height * scale;
    ctx.drawImage(source, (PORTRAIT.width - w) / 2, (PORTRAIT.height - h) / 2, w, h);
  }
  return { canvas: out, faceFound: Boolean(eyes), backgroundRemoved, toolsLoaded: Boolean(tools) };
}
