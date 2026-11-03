"""Turn a list of notes into files: a WAV preview (simple synthesized tones)
and a MIDI file (to open in GarageBand, BandLab, etc. with real instruments).
Both writers are hand-made so the project needs no extra libraries."""

import struct

import numpy as np

from .notes import TIMBRES

SAMPLE_RATE = 22050


def notes_to_wav(notes):
    """Synthesize a quick WAV preview of the notes."""
    end = max(n["start"] + n["length"] for n in notes) + 1.0
    audio = np.zeros(int(end * SAMPLE_RATE))
    release = 0.15  # seconds of fade-out after each note

    for note in notes:
        frequency = 440 * 2 ** ((note["pitch"] - 69) / 12)
        duration = note["length"] + release
        t = np.arange(int(duration * SAMPLE_RATE)) / SAMPLE_RATE

        tone = np.zeros(len(t))  # add up the harmonics for this instrument
        for number, strength in enumerate(TIMBRES.get(note["instrument"], [1]), start=1):
            if frequency * number < SAMPLE_RATE / 2:
                tone += strength * np.sin(2 * np.pi * frequency * number * t)

        # quick fade in and out so notes don't click
        envelope = np.minimum(1, t / 0.01) * np.minimum(1, (duration - t) / release)
        start = int(note["start"] * SAMPLE_RATE)
        audio[start:start + len(t)] += tone * envelope * note["volume"] / 127

    return samples_to_wav(audio)


def samples_to_wav(audio):
    """Raw samples -> WAV file bytes (mono, 16-bit)."""
    audio = np.asarray(audio, dtype=float)
    peak = np.max(np.abs(audio))
    if peak > 0:
        audio = audio / peak * 0.9  # loud but not clipping
    data = (audio * 32767).astype("<i2").tobytes()
    header = b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVE"
    header += b"fmt " + struct.pack("<IHHIIHH", 16, 1, 1, SAMPLE_RATE, SAMPLE_RATE * 2, 2, 16)
    header += b"data" + struct.pack("<I", len(data))
    return header + data


def _variable_length(number):
    """MIDI stores time gaps as 7 bits per byte, high bit = 'more bytes follow'."""
    chunks = [number & 0x7F]
    number >>= 7
    while number:
        chunks.append((number & 0x7F) | 0x80)
        number >>= 7
    return bytes(reversed(chunks))


def notes_to_midi(notes, ticks_per_beat=480):
    """Notes -> MIDI file bytes. Tempo is 60 beats per minute, so one beat is
    one second and note times in seconds can be used directly."""
    channels = {}  # instrument -> MIDI channel
    events = []    # (tick, order, message bytes); note-offs sort before note-ons
    for note in notes:
        instrument = note["instrument"]
        if instrument not in channels:
            channel = len(channels)
            if channel >= 9:
                channel += 1  # channel 9 is reserved for drums
            channels[instrument] = min(channel, 15)
        ch = channels[instrument]
        on = round(note["start"] * ticks_per_beat)
        off = max(on + 1, round((note["start"] + note["length"]) * ticks_per_beat))
        events.append((on, 1, bytes([0x90 | ch, note["pitch"], note["volume"]])))
        events.append((off, 0, bytes([0x80 | ch, note["pitch"], 0])))
    events.sort(key=lambda e: (e[0], e[1]))

    track = b"\x00\xff\x51\x03" + (1_000_000).to_bytes(3, "big")  # 60 bpm
    for instrument, ch in channels.items():
        track += b"\x00" + bytes([0xC0 | ch, instrument])         # pick instruments
    now = 0
    for tick, _, message in events:
        track += _variable_length(tick - now) + message
        now = tick
    track += b"\x00\xff\x2f\x00"  # end of track

    header = b"MThd" + struct.pack(">IHHH", 6, 0, 1, ticks_per_beat)
    return header + b"MTrk" + struct.pack(">I", len(track)) + track
