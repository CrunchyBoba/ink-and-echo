"""Shared musical tools for Image -> Sound: scales, the color -> instrument
table, and note helpers. Every method returns a list of notes made here."""

# Musical scales: which steps (in semitones) inside one octave are allowed
SCALES = {
    "major": [0, 2, 4, 5, 7, 9, 11],
    "minor": [0, 2, 3, 5, 7, 8, 10],
}

# General MIDI instrument numbers (GarageBand and other music apps read these)
PIANO, ORGAN, VIOLIN, VIOLA, CELLO = 0, 19, 40, 41, 42
TRUMPET, TUBA, BASSOON, FLUTE, OCARINA = 56, 58, 70, 73, 79

# Rough tone color of each instrument for the WAV preview:
# loudness of the 1st, 2nd, 3rd... harmonic
TIMBRES = {
    PIANO: [1, 0.5, 0.3, 0.15],
    ORGAN: [1, 1, 0.6, 0, 0.4],
    VIOLIN: [1, 0.5, 0.35, 0.25, 0.2],
    VIOLA: [1, 0.6, 0.4, 0.3, 0.2],
    CELLO: [1, 0.7, 0.4, 0.2],
    TRUMPET: [1, 0.9, 0.8, 0.6, 0.4, 0.3],
    TUBA: [1, 0.8, 0.4, 0.2],
    BASSOON: [0.6, 1, 0.5, 0.4],
    FLUTE: [1, 0.15, 0.05],
    OCARINA: [1, 0.05],
}


def make_pitches(count, scale="major", lowest=36):
    """List of `count` MIDI note numbers, HIGHEST first, so pitches[0]
    belongs to the top row of the image. MIDI 36 is a low C; 60 is middle C."""
    pitches = []
    octave = 0
    while len(pitches) < count:
        for step in SCALES[scale]:
            if len(pitches) < count:
                pitches.append(min(127, lowest + 12 * octave + step))
        octave += 1
    pitches.reverse()
    return pitches


def hue_to_instrument(hue, saturation, value):
    """Pick an instrument from a color, loosely following Kandinsky's
    'Concerning the Spiritual in Art' (yellow = trumpet, blue = organ/flute...).
    hue, saturation and value are 0 to 1."""
    degrees = hue * 360
    if saturation < 0.15:
        return PIANO  # greys, black and white: no strong color
    if degrees < 20 or degrees >= 330:
        return TUBA  # red
    if degrees < 45:
        return VIOLA  # orange
    if degrees < 70:
        return TRUMPET  # yellow
    if degrees < 160:
        return VIOLIN  # green
    if degrees < 260:
        return FLUTE if value > 0.6 else ORGAN  # light blue / dark blue
    return BASSOON  # violet


def make_note(start, length, pitch, volume, instrument):
    """One note. start and length are in seconds, volume is 1-127."""
    return {
        "start": start,
        "length": length,
        "pitch": int(pitch),
        "volume": max(1, min(127, int(volume))),
        "instrument": instrument,
    }


def merge_notes(notes):
    """Join back-to-back repeats of the same pitch into one longer note,
    so lines sound smooth instead of re-striking every column."""
    notes = sorted(notes, key=lambda n: (n["instrument"], n["pitch"], n["start"]))
    merged = []
    for note in notes:
        if merged:
            last = merged[-1]
            touching = abs(last["start"] + last["length"] - note["start"]) < 0.001
            same = last["pitch"] == note["pitch"] and last["instrument"] == note["instrument"]
            if touching and same:
                last["length"] += note["length"]
                last["volume"] = max(last["volume"], note["volume"])
                continue
        merged.append(dict(note))
    return merged
