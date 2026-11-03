"""Rebuild python/manifest.json, the list of Python files the browser loads.
Run this after adding, renaming or deleting a file in python/translator/.

    python tests/build_manifest.py
"""

import json
from pathlib import Path

PYTHON = Path(__file__).resolve().parents[1] / "python"
files = sorted(str(p.relative_to(PYTHON)) for p in (PYTHON / "translator").rglob("*.py"))
(PYTHON / "manifest.json").write_text(json.dumps({"package": "translator", "files": files}, indent=2) + "\n")
print(f"manifest.json lists {len(files)} files")
