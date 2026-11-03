"""Listening tools for Sound -> Image: measure a song once, then let every
method ask for the measurements it needs.

All of it is plain NumPy (a short-time Fourier transform plus a few filter
banks), so it runs in the browser too. Only one chunk of the spectrogram is
kept in memory at a time; each chunk is immediately reduced to:
  * a 128-band mel spectrogram (how the ear hears pitch ranges)
  * 84 semitones from C1 to B7 (which notes are sounding)
  * loudness and timbre brightness
"""

import numpy as np

from ..tools import normalize

SAMPLE_RATE = 22050
N_FFT = 4096          # window size: big enough to tell neighboring notes apart
HOP = 512             # step between measurements (~43 per second)
LOWEST_NOTE = 24      # MIDI 24 = C1
NOTES = 84            # 7 octaves
MAX_SECONDS = 360     # analyze at most 6 minutes


def prepare(left, right, sr, raw_bytes=b""):
    """Build the shared audio dictionary from left/right sample arrays."""
    left = np.asarray(left, dtype=np.float32)
    right = np.asarray(right if right is not None else left, dtype=np.float32)
    if sr != SAMPLE_RATE:  # simple resampling by interpolation
        length = int(len(left) * SAMPLE_RATE / sr)
        old = np.linspace(0, 1, len(left))
        new = np.linspace(0, 1, length)
        left = np.interp(new, old, left).astype(np.float32)
        right = np.interp(new, old, right).astype(np.float32)
    limit = MAX_SECONDS * SAMPLE_RATE
    left, right = left[:limit], right[:limit]
    mono = (left + right) / 2
    return {
        "y": mono, "stereo": np.array([left, right]), "sr": SAMPLE_RATE,
        "bytes": raw_bytes, "seconds": len(mono) / SAMPLE_RATE,
    }


def _mel_bank(bands, freqs, sr):
    """Triangular filters spaced evenly on the mel (hearing) scale."""
    def to_mel(f):
        return 2595 * np.log10(1 + f / 700)
    edges = 700 * (10 ** (np.linspace(0, to_mel(sr / 2), bands + 2) / 2595) - 1)
    bank = np.zeros((bands, len(freqs)))
    for b in range(bands):
        low, mid, high = edges[b], edges[b + 1], edges[b + 2]
        rise = (freqs - low) / (mid - low + 1e-9)
        fall = (high - freqs) / (high - mid + 1e-9)
        bank[b] = np.maximum(0, np.minimum(rise, fall))
    return bank


def _note_bank(freqs):
    """Filters that collect each FFT bin into its nearest semitones."""
    with np.errstate(divide="ignore"):
        midi = 69 + 12 * np.log2(np.maximum(freqs, 1e-9) / 440)
    notes = np.arange(LOWEST_NOTE, LOWEST_NOTE + NOTES)[:, None]
    bank = np.maximum(0, 1 - np.abs(midi[None, :] - notes))
    bank[:, freqs < 25] = 0
    # average (not add up) each note's bins: high notes span many more FFT bins
    # than low notes, and adding them would make overtones drown out the real notes
    return bank / (bank.sum(axis=1, keepdims=True) + 1e-9)


def _measure(audio):
    """One pass over the song that fills in every measurement."""
    y, sr = audio["y"], audio["sr"]
    padded = np.pad(y, N_FFT // 2)
    frames = max(1, 1 + (len(padded) - N_FFT) // HOP)
    window = np.hanning(N_FFT).astype(np.float32)
    freqs = np.fft.rfftfreq(N_FFT, 1 / sr)
    mel_bank = _mel_bank(128, freqs, sr).T.astype(np.float32)
    note_bank = _note_bank(freqs).T.astype(np.float32)

    mel, notes, centroid, rms = [], [], [], []
    offsets = np.arange(N_FFT)
    for start in range(0, frames, 256):  # 256 frames at a time keeps memory small
        index = np.arange(start, min(frames, start + 256))[:, None] * HOP + offsets
        chunk = padded[np.minimum(index, len(padded) - 1)]
        power = (np.abs(np.fft.rfft(chunk * window, axis=1)) ** 2).astype(np.float32)
        mel.append(power @ mel_bank)
        notes.append(np.sqrt(power) @ note_bank)
        centroid.append((power @ freqs) / (power.sum(axis=1) + 1e-9))
        rms.append(np.sqrt((chunk ** 2).mean(axis=1)))

    mel = np.concatenate(mel).T          # 128 bands x time (row 0 = lowest)
    notes = np.concatenate(notes).T      # 84 semitones x time (row 0 = C1)
    db = 10 * np.log10(mel + 1e-10)
    audio["mel_db"] = db
    audio["mel"] = np.clip((db - db.max() + 80) / 80, 0, 1)
    audio["notes"] = notes
    audio["loudness"] = normalize(np.sqrt(np.concatenate(rms)))
    audio["brightness"] = normalize(np.log(np.concatenate(centroid) + 1))
    flux = np.maximum(0, np.diff(db, axis=1)).mean(axis=0)   # sudden rises = new notes/hits
    audio["onsets"] = normalize(np.concatenate([[0], flux]))

    chroma = np.zeros((12, notes.shape[1]))
    for n in range(NOTES):                                    # fold octaves together
        chroma[(LOWEST_NOTE + n) % 12] += notes[n]
    audio["chroma"] = chroma / (chroma.max(axis=0, keepdims=True) + 1e-9)


def get(audio, name):
    """Ask for a measurement by name; the first request measures everything."""
    if name not in audio:
        _measure(audio)
    return audio[name]


def loudness(audio):
    """How loud each moment is, 0 to 1."""
    return get(audio, "loudness")


def brightness(audio):
    """Timbre brightness: 0 = dark/mellow, 1 = bright/sharp."""
    return get(audio, "brightness")


def onsets(audio):
    """How strongly a new note or hit starts at each moment, 0 to 1."""
    return get(audio, "onsets")


def chroma(audio):
    """Strength of the 12 pitch classes (C, C#, D ... B) over time: 12 x time."""
    return get(audio, "chroma")


def mel(audio):
    """Mel spectrogram scaled 0 to 1: 128 bands x time, row 0 = lowest."""
    return get(audio, "mel")


def notes(audio, low_midi, count):
    """Strength of `count` semitones starting at MIDI note `low_midi`."""
    start = low_midi - LOWEST_NOTE
    return get(audio, "notes")[start:start + count]


def timbre(audio, count=13):
    """MFCCs: a compact description of tone color at each moment."""
    db = get(audio, "mel_db")
    bands = db.shape[0]
    k = np.arange(count)[:, None]
    n = np.arange(bands)[None, :]
    dct = np.cos(np.pi * k * (2 * n + 1) / (2 * bands)) * np.sqrt(2 / bands)
    return dct @ db


def is_minor(audio):
    """Rough guess: does the song lean minor (darker) or major (brighter)?"""
    profile = chroma(audio).mean(axis=1)
    root = int(np.argmax(profile))
    return profile[(root + 3) % 12] > profile[(root + 4) % 12]
