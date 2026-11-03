/* worker.js
 * Runs the Python engine (python/translator) inside the browser with Pyodide,
 * in a background thread so the page stays responsive while it works.
 *
 * Messages in:  { id, type, args }
 * Messages out: { id, ok, result | error }   and   { status, detail } while loading
 */

const PYODIDE_VERSION = "0.27.2";
importScripts(`https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/pyodide.js`);

const PYTHON_ROOT = new URL("../../python/", self.location.href);
let api = null;

function status(state, detail) {
  self.postMessage({ status: state, detail });
}

// Python bytes come back either as a Uint8Array or as a proxy we copy out of.
function toUint8(value) {
  if (value == null || value instanceof Uint8Array) return value;
  if (value.getBuffer) {
    const buffer = value.getBuffer("u8");
    const copy = buffer.data.slice();
    buffer.release();
    value.destroy();
    return copy;
  }
  return value;
}

function toPlain(proxy) {
  if (proxy == null || typeof proxy !== "object" || !proxy.toJs) return proxy;
  const result = proxy.toJs({ dict_converter: Object.fromEntries });
  proxy.destroy();
  if (result instanceof Uint8Array || result?.getBuffer) return toUint8(result);
  for (const key of Object.keys(result)) result[key] = toUint8(result[key]);
  return result;
}

const ready = (async () => {
  status("loading", "Starting Python");
  const pyodide = await loadPyodide();
  status("loading", "Loading NumPy + Pillow");
  await pyodide.loadPackage(["numpy", "pillow"]);

  status("loading", "Loading translator");
  // the manifest is never cached; its version makes browsers fetch changed engine files
  const get = async (url, options) => {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`Couldn't download ${url} (${response.status})`);
    return response;
  };
  const manifest = await (await get(new URL("manifest.json", PYTHON_ROOT), { cache: "no-cache" })).json();
  for (const file of manifest.files) {
    const code = await (await get(new URL(`${file}?v=${manifest.version}`, PYTHON_ROOT))).text();
    const path = `/home/pyodide/${file}`;
    pyodide.FS.mkdirTree(path.slice(0, path.lastIndexOf("/")));
    pyodide.FS.writeFile(path, code);
  }
  api = pyodide.pyimport("translator.api");
  status("ready", "Engine ready");
})().catch((error) => {
  status("error", String(error));
  throw error;
});

self.onmessage = async ({ data }) => {
  const { id, type, args = [] } = data;
  try {
    await ready;
    if (!(type in api)) throw new Error(`Unknown engine call: ${type}`);
    const result = toPlain(api[type](...args));
    const transfer = [];
    if (result instanceof Uint8Array) transfer.push(result.buffer);
    else if (result && typeof result === "object") {
      for (const value of Object.values(result)) if (value instanceof Uint8Array) transfer.push(value.buffer);
    }
    self.postMessage({ id, ok: true, result }, transfer);
  } catch (error) {
    self.postMessage({ id, ok: false, error: String(error.message || error) });
  }
};
