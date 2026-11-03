"""Rebuild python/manifest.json, the list of engine files the browser loads.

Run this after changing, adding, renaming or deleting anything in python/translator/:

    python scripts/build_manifest.py

The "version" is a fingerprint of all the files, so when the engine changes,
browsers download the new files instead of using old cached copies.
"""

import hashlib
import json
from pathlib import Path

PYTHON = Path(__file__).resolve().parents[1] / "python"


def build():
    files = sorted(str(p.relative_to(PYTHON)) for p in (PYTHON / "translator").rglob("*.py"))
    fingerprint = hashlib.sha256()
    for name in files:
        fingerprint.update(name.encode() + (PYTHON / name).read_bytes())
    return {"package": "translator", "version": fingerprint.hexdigest()[:12], "files": files}


if __name__ == "__main__":
    manifest = build()
    (PYTHON / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"manifest.json: {len(manifest['files'])} files, version {manifest['version']}")
