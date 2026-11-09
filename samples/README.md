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

# Faces (Song → Face gallery)

Faces you **Save to gallery** stay in your own browser. To show a face to
everyone on the public site:

1. In **Song → Face → Make a face**, set it up the way you like, then press **Export for site**.
   It downloads three files: `name.png` (the lined-up portrait), `name-thumb.png` (the finished face)
   and `name.json` (the settings).
2. Put the two PNGs in `samples/faces/` and the song file in `samples/audio/`
   (renamed to match the `audio` path inside `name.json`).
3. Paste the contents of `name.json` into the `faces` list in `samples/faces.json`:

```json
{
  "faces": [
    {
      "name": "Abraham Lincoln",
      "song": "Shenandoah",
      "portrait": "samples/faces/abraham-lincoln.png",
      "thumb": "samples/faces/abraham-lincoln-thumb.png",
      "audio": "samples/audio/shenandoah.mp3",
      "start": 12,
      "end": 32,
      "style": { "shape": "circle", "color": "ink", "density": 64, "paper": "light" }
    }
  ]
}
```

Only publish portraits of people who agreed to it (or historical figures), and songs you're allowed to share.
