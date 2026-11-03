# Demos

Files listed in `demos.json` show up in the **Demos** section of the website,
each with a button that loads it straight into the right machine.

1. Put artwork in `samples/artwork/` (PNG, JPG or WEBP) and recordings in `samples/audio/` (MP3, WAV, OGG, M4A).
   Keep each file under about 10 MB so the page stays quick.
2. Add an entry to `demos.json`:

```json
{
  "demos": [
    {
      "type": "artwork",
      "title": "Still life, charcoal",
      "file": "samples/artwork/still-life.jpg",
      "note": "Try Contour tracing: the melody follows the charcoal lines."
    },
    {
      "type": "audio",
      "title": "Voice memo, humming",
      "file": "samples/audio/humming.mp3",
      "cover": "samples/artwork/humming-landscape.png",
      "note": "One voice gives a sparse melody line and a calm landscape."
    }
  ]
}
```

- `type`: `"artwork"` loads into Image → Sound, and `"audio"` loads into Sound → Image
- `cover` (optional): an image shown on the card. Artwork demos use the artwork itself.
- Only use work you made or have permission to share.
