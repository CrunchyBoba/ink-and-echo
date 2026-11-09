/* store.js
 * Saves faces you make into this browser (IndexedDB), so your gallery is
 * still there next time. Nothing is uploaded: faces live on this device only.
 * To publish faces on the public site, see samples/README.md.
 */

const DB_NAME = "syn1-faces";
const STORE = "faces";

function open() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run(mode, action) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(request?.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/** Every saved face, newest first. Returns [] if storage isn't available. */
export async function listFaces() {
  try {
    const faces = await run("readonly", (store) => store.getAll());
    return (faces || []).sort((a, b) => b.created - a.created);
  } catch (error) {
    console.warn("Gallery storage unavailable:", error);
    return [];
  }
}

/** face: { name, song, start, end, style, portrait: Blob, audio: Blob, thumb: Blob } */
export async function saveFace(face) {
  const entry = { id: face.id || `face-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, created: Date.now(), ...face };
  await run("readwrite", (store) => store.put(entry));
  return entry;
}

export async function deleteFace(id) {
  await run("readwrite", (store) => store.delete(id));
}
