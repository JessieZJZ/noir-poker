#!/usr/bin/env python3
"""Original, sample-free NOIR Poker music. No model, MIDI, sample bank or network.

Tested with Python 3.14, NumPy, SciPy and FFmpeg. Run from any directory.
All notes, arrangements, synthesis and circular effects are defined here.
"""

import argparse
import functools
import hashlib
import json
import math
import shutil
import subprocess
import tempfile
import wave
from pathlib import Path

import numpy as np
from scipy import signal

SR = 48000
BARS = 32
TAU = 2 * math.pi
ROOT = Path(__file__).resolve().parents[1]


def chord(name, bass, notes):
    return {"name": name, "bass": bass, "notes": notes}


SCORES = [
    {
        "id": "01-midnight-felt",
        "title": "夜色牌桌",
        "subtitle": "Midnight Felt",
        "bpm": 82,
        "key": "D minor",
        "style": "夜色爵士 / downtempo lounge",
        "description": "温暖电钢琴、圆润低音、轻刷鼓与少量玻璃泛音；平稳、有质感，适合默认牌桌。",
        "seed": 160801,
        "palette": "#6ee7c5",
        "harmony": [
            chord("Dm9", 38, [53, 57, 60, 64]),
            chord("Bbmaj9", 34, [53, 57, 60, 65]),
            chord("Gm9", 43, [53, 57, 58, 62]),
            chord("Am11", 45, [55, 60, 62, 64]),
            chord("Dm9/F", 41, [53, 57, 60, 64]),
            chord("Cmaj9", 36, [52, 55, 59, 62]),
            chord("Gm9", 43, [53, 57, 58, 62]),
            chord("A7sus(b9)", 45, [55, 58, 62, 64]),
            chord("Dm9", 38, [53, 57, 60, 64]),
            chord("Fmaj9", 41, [52, 57, 60, 67]),
            chord("Bbmaj9", 34, [53, 57, 60, 65]),
            chord("Am11", 45, [55, 60, 62, 64]),
            chord("Gm9", 43, [53, 57, 58, 62]),
            chord("C6/9", 36, [52, 57, 62, 67]),
            chord("Bbmaj9", 34, [53, 57, 60, 65]),
            chord("A7sus(b9)", 45, [55, 58, 62, 64]),
        ],
        "motifs": [
            [[0.75, 69, 0.65], [2.25, 72, 0.8], [3.5, 76, 1.1]],
            [[0.5, 74, 1.1], [2.75, 69, 0.9]],
            [[1.25, 65, 0.7], [2.5, 69, 0.7], [3.5, 72, 0.7]],
            [[0.75, 67, 0.6], [2.0, 64, 1.3]],
        ],
    },
    {
        "id": "02-mint-circuit",
        "title": "薄荷暗流",
        "subtitle": "Mint Circuit",
        "bpm": 94,
        "key": "C minor",
        "style": "极简电子 / soft microhouse",
        "description": "细碎拨弦、柔和合成器、轻量切分鼓点；更现代、更有行进感，适合连续练习。",
        "seed": 160802,
        "palette": "#8abaff",
        "harmony": [
            chord("Cm9", 36, [51, 55, 58, 62]),
            chord("Abmaj9", 32, [51, 55, 58, 60]),
            chord("Ebmaj9", 39, [53, 55, 58, 62]),
            chord("Bb6/9", 34, [50, 55, 60, 65]),
            chord("Cm9", 36, [51, 55, 58, 62]),
            chord("Fm9", 41, [51, 55, 56, 60]),
            chord("Abmaj9", 32, [51, 55, 58, 60]),
            chord("Bb6/9", 34, [50, 55, 60, 65]),
            chord("Cm9", 36, [51, 55, 58, 62]),
            chord("Ebmaj9/G", 43, [53, 55, 58, 62]),
            chord("Abmaj9", 32, [51, 55, 58, 60]),
            chord("Bb6/9", 34, [50, 55, 60, 65]),
            chord("Fm9", 41, [51, 55, 56, 60]),
            chord("Abmaj9", 32, [51, 55, 58, 60]),
            chord("Cm9/G", 43, [51, 55, 58, 62]),
            chord("Bb6/9", 34, [50, 55, 60, 65]),
        ],
        "motifs": [
            [[0.5, 74, 0.5], [1.75, 75, 0.35], [3.0, 79, 0.75]],
            [[0.75, 79, 0.4], [2.5, 72, 0.8]],
            [[1.0, 77, 0.6], [2.75, 74, 0.55], [3.5, 70, 0.6]],
            [[0.5, 74, 0.8], [2.25, 72, 1.0]],
        ],
    },
    {
        "id": "03-velvet-room",
        "title": "丝绒会客室",
        "subtitle": "Velvet Room",
        "bpm": 76,
        "key": "B minor / D major",
        "style": "休闲爵士 / brushed lounge",
        "description": "柔和毡音钢琴、模拟拨弦低音、刷鼓和颤音琴；温暖轻摆，适合长时间休闲对局。",
        "seed": 160803,
        "palette": "#d5b897",
        "harmony": [
            chord("Bm9", 35, [50, 54, 57, 61]),
            chord("Em9", 40, [50, 54, 55, 59]),
            chord("A13", 33, [49, 54, 55, 59]),
            chord("Dmaj9", 38, [49, 52, 54, 57]),
            chord("Gmaj9", 43, [50, 54, 57, 59]),
            chord("F#m11", 42, [52, 57, 59, 61]),
            chord("Em9", 40, [50, 54, 55, 59]),
            chord("F#7sus(b9)", 42, [52, 55, 59, 61]),
            chord("Bm9", 35, [50, 54, 57, 61]),
            chord("Dmaj9/A", 33, [49, 52, 54, 57]),
            chord("Gmaj9", 43, [50, 54, 57, 59]),
            chord("F#m11", 42, [52, 57, 59, 61]),
            chord("Em9", 40, [50, 54, 55, 59]),
            chord("A13", 33, [49, 54, 55, 59]),
            chord("Gmaj9", 43, [50, 54, 57, 59]),
            chord("F#7sus(b9)", 42, [52, 55, 59, 61]),
        ],
        "motifs": [
            [[0.66, 66, 0.85], [2.0, 69, 0.65], [3.33, 73, 0.8]],
            [[0.66, 71, 1.0], [2.66, 66, 0.95]],
            [[1.33, 64, 0.8], [2.66, 66, 0.55], [3.33, 69, 0.8]],
            [[0.66, 67, 0.9], [2.33, 64, 1.25]],
        ],
    },
    {
        "id": "04-quiet-equity",
        "title": "静夜推演",
        "subtitle": "Quiet Equity",
        "bpm": 68,
        "key": "D major / B minor",
        "style": "氛围钢琴 / ambient focus",
        "description": "稀疏钢琴、缓慢铺底、低频呼吸和远处泛音；鼓点最少，适合思考与复盘。",
        "seed": 160804,
        "palette": "#b4a2ff",
        "harmony": [
            chord("Dadd9", 38, [54, 57, 62, 64]),
            chord("Bm9", 35, [54, 57, 61, 62]),
            chord("Gmaj9", 43, [54, 57, 59, 62]),
            chord("A6sus2", 33, [54, 57, 59, 64]),
            chord("Dmaj9/F#", 42, [54, 57, 61, 64]),
            chord("Bm11", 35, [52, 57, 61, 62]),
            chord("Gmaj9", 43, [54, 57, 59, 62]),
            chord("Asus2", 33, [52, 57, 59, 64]),
            chord("Dadd9", 38, [54, 57, 62, 64]),
            chord("Em9", 40, [54, 55, 59, 62]),
            chord("Gmaj9", 43, [54, 57, 59, 62]),
            chord("A6sus2", 33, [54, 57, 59, 64]),
            chord("Bm9", 35, [54, 57, 61, 62]),
            chord("Dmaj9/F#", 42, [54, 57, 61, 64]),
            chord("Gmaj9", 43, [54, 57, 59, 62]),
            chord("Asus2", 33, [52, 57, 59, 64]),
        ],
        "motifs": [
            [[0.5, 69, 1.6], [3.0, 76, 2.0]],
            [[1.0, 73, 1.5]],
            [[0.5, 71, 1.5], [3.0, 66, 2.0]],
            [[1.25, 69, 1.8]],
        ],
    },
]


def filt(x, hz, kind="lowpass", order=2):
    return signal.sosfilt(signal.butter(order, hz, kind, fs=SR, output="sos"), x, axis=0)


def envelope(t, attack, release):
    return np.minimum(t / attack, 1) ** 1.3 * np.minimum((len(t) / SR - t) / release, 1) ** 1.5


@functools.lru_cache(maxsize=240)
def voice(kind, midi, duration):
    t = np.arange(round(duration * SR), dtype=np.float64) / SR
    f = 440 * 2 ** ((midi - 69) / 12)
    phase = TAU * f * t
    rng = np.random.default_rng(11000 + midi * 101 + round(duration * 100))
    if kind == "ep":
        y = np.sin(phase + 1.6 * np.exp(-t / 0.24) * np.sin(2 * phase)) * np.exp(-t / 1.7)
        y += 0.14 * np.sin(phase * 2.002) * np.exp(-t / 0.65)
        y += 0.055 * np.sin(phase * 3.001) * np.exp(-t / 0.3)
        y *= envelope(t, 0.009, 0.42)
    elif kind == "felt":
        y = np.zeros_like(t)
        for h in range(1, 13):
            y += h ** -1.65 * np.sin(phase * h * (1 + 0.000018 * h * h)) * np.exp(-t * h ** 0.7 / 2.15)
        y += 0.023 * filt(rng.normal(size=len(t)), [900, 3200], "bandpass") * np.exp(-t / 0.012)
        y *= envelope(t, 0.008, 0.65)
    elif kind in ("pluck", "guitar"):
        y = np.zeros_like(t)
        for h in range(1, 10):
            weight = h ** -1.55 * (1 - 0.38 * math.cos(h * math.pi * 0.3))
            y += weight * np.sin(phase * h) * np.exp(-t * h ** 0.8 / (0.65 if kind == "pluck" else 1.3))
        y = filt(y, 4200 if kind == "pluck" else 2700)
        y *= envelope(t, 0.005, 0.23)
    elif kind == "vibes":
        y = np.sin(phase) * np.exp(-t / 2.1)
        y += 0.17 * np.sin(phase * 3.99) * np.exp(-t / 0.7)
        y += 0.03 * np.sin(phase * 9.8) * np.exp(-t / 0.25)
        y *= (0.9 + 0.1 * np.sin(TAU * 4.4 * t)) * envelope(t, 0.014, 0.7)
    elif kind == "glass":
        y = np.sin(phase) * np.exp(-t / 2.2)
        y += 0.12 * np.sin(phase * 2.002) * np.exp(-t / 1.0)
        y += 0.04 * np.sin(phase * 4.001) * np.exp(-t / 0.45)
        y *= envelope(t, 0.024, 0.8)
    elif kind in ("bass", "upright"):
        glide = phase - 0.25 * np.exp(-t / 0.025)
        y = np.sin(glide) + 0.19 * np.sin(2 * glide) + 0.08 * np.sin(3 * glide)
        y *= np.exp(-t / (1.6 if kind == "bass" else 0.85))
        if kind == "upright":
            y += 0.032 * filt(rng.normal(size=len(t)), [180, 1400], "bandpass") * np.exp(-t / 0.035)
        y *= envelope(t, 0.012, 0.09)
    elif kind == "pad":
        y = np.zeros_like(t)
        for detune in [0.9978, 1.0, 1.0022]:
            p = phase * detune + 0.015 * np.sin(TAU * 0.19 * t)
            y += np.sin(p) + 0.14 * np.sin(2 * p) + 0.06 * np.sin(3 * p)
        y /= 3
        y *= (0.94 + 0.06 * np.sin(TAU * 0.12 * t)) * envelope(t, 0.8, 1.7)
    else:
        raise ValueError(kind)
    return y.astype(np.float32)


@functools.lru_cache(maxsize=16)
def percussion(kind):
    duration = {"kick": 0.36, "snare": 0.24, "hat": 0.10, "openhat": 0.25, "rim": 0.15, "brush": 0.45}[kind]
    t = np.arange(round(duration * SR)) / SR
    rng = np.random.default_rng(401 + sum(map(ord, kind)))
    noise = rng.normal(size=len(t))
    if kind == "kick":
        p = TAU * (49 * t + 2.5 * (1 - np.exp(-t / 0.025)))
        y = np.sin(p) * np.exp(-t / 0.085) + 0.025 * filt(noise, 500) * np.exp(-t / 0.008)
    elif kind == "snare":
        y = 0.25 * filt(noise, [1400, 6500], "bandpass") * np.exp(-t / 0.065)
        y += 0.12 * np.sin(TAU * 173 * t) * np.exp(-t / 0.035)
    elif kind in ("hat", "openhat"):
        y = filt(noise, [4900, 10500], "bandpass") * np.exp(-t / (0.023 if kind == "hat" else 0.065)) * 0.24
    elif kind == "rim":
        y = sum(a * np.sin(TAU * hz * t) for a, hz in [(0.35, 395), (0.2, 612), (0.12, 1137)]) * np.exp(-t / 0.018)
    else:
        y = filt(noise, [1700, 7200], "bandpass") * np.exp(-t / 0.13) * 0.17
    y *= envelope(t, 0.0015, 0.015)
    return y.astype(np.float32)


class Session:
    def __init__(self, score):
        self.score = score
        self.beat = 60 / score["bpm"]
        self.n = round(BARS * 4 * self.beat * SR)
        self.rng = np.random.default_rng(score["seed"])
        self.buses = {k: np.zeros((self.n, 2), np.float32) for k in ["keys", "bass", "drums", "air", "lead"]}
        self.events = []

    def add(self, bus, samples, beat, gain, pan=0):
        # Deposit the COMPLETE note, including release, modulo the musical period.
        # This is a steady-state loop: no intro/outro fade and no dropped reverb.
        start = round(beat * self.beat * SR) % self.n
        v = samples[:, None] * np.array([math.cos((pan + 1) * math.pi / 4), math.sin((pan + 1) * math.pi / 4)], np.float32) * gain
        end = start + len(v)
        self.buses[bus][start:min(end, self.n)] += v[:min(len(v), self.n - start)]
        if end > self.n:
            self.buses[bus][:end - self.n] += v[self.n - start:]

    def note(self, kind, midi, beat, length, gain, pan=0, bus="keys", human=0.008):
        jitter = float(self.rng.uniform(-human, human))
        velocity = float(self.rng.uniform(0.92, 1.06))
        duration = round(length * self.beat + (1.6 if kind == "pad" else 0.5), 4)
        self.add(bus, voice(kind, midi, duration), beat + jitter / self.beat, gain * velocity, pan)
        self.events.append({"instrument": kind, "note": midi, "beat": round(beat + jitter / self.beat, 6), "durationSeconds": duration, "gain": round(gain * velocity, 6), "pan": pan, "bus": bus})

    def hit(self, kind, beat, gain, pan=0):
        jitter = float(self.rng.uniform(-0.005, 0.008))
        self.add("drums", percussion(kind), beat + jitter / self.beat, gain * float(self.rng.uniform(0.90, 1.06)), pan)
        self.events.append({"instrument": kind, "beat": round(beat + jitter / self.beat, 6), "gain": gain, "pan": pan, "bus": "drums"})

    def arrange(self):
        index = int(self.score["id"][:2])
        for bar in range(BARS):
            h = self.score["harmony"][bar // 2]
            start = bar * 4
            section = bar // 8
            # Four eight-bar scenes. Every scene retains the core groove;
            # changes are small enough to sit behind decisions and public cues.
            activity = [0.88, 1.0, 0.93, 0.90][section]
            if index == 1:
                for off, strength in [(0.08, 1), (2.65, 0.68)]:
                    for i, midi in enumerate(h["notes"]):
                        self.note("ep", midi, start + off + i * 0.025, 2.5, 0.052 * strength * activity, (i - 1.5) * 0.14)
                for off, note, length, strength in [(0, h["bass"], 1.5, 1), (1.75, h["bass"] + 7, 0.6, 0.6), (2.65, h["bass"] + 12, 0.9, 0.7)]:
                    self.note("bass", note, start + off, length, 0.18 * strength, bus="bass")
                for off in [0, 2.5]:
                    self.hit("kick", start + off, 0.22 if off == 0 else 0.14)
                for off in [1, 3]:
                    self.hit("snare", start + off + 0.025, 0.16, 0.08)
                    self.hit("brush", start + off - 0.08, 0.12, -0.25)
                for j in range(8):
                    self.hit("hat", start + j * 0.5 + (0.045 if j % 2 else 0), 0.042 if j % 2 else 0.057, 0.3)
                if bar % 4 in [0, 1] and bar % 8 != 1:
                    motif = self.score["motifs"][(bar // 4 + bar % 2) % 4]
                    for off, midi, length in motif:
                        self.note("ep", midi, start + off, length, 0.035, -0.12, "lead")
                if bar % 8 == 6:
                    self.note("glass", h["notes"][-1] + 12, start + 2.25, 3.0, 0.017, 0.45, "lead")
            elif index == 2:
                for off, strength in [(0.5, 1), (1.75, 0.72), (3.25, 0.82)]:
                    for i, midi in enumerate(h["notes"]):
                        self.note("pluck", midi + 12, start + off + i * 0.012, 0.7, 0.032 * strength * activity, (i - 1.5) * 0.2)
                for off, note, length, strength in [(0, h["bass"], 0.9, 1), (1.5, h["bass"], 0.6, 0.75), (2.5, h["bass"] + 7, 0.8, 0.82), (3.5, h["bass"] + 12, 0.4, 0.5)]:
                    self.note("bass", note, start + off, length, 0.17 * strength, bus="bass", human=0.003)
                for off in [0, 1.75, 2.5]:
                    self.hit("kick", start + off, 0.21 if off == 0 else 0.16)
                for off in [1, 3]:
                    self.hit("snare", start + off + 0.018, 0.18, -0.06)
                for j in range(8):
                    self.hit("hat", start + j * 0.5 + (0.025 if j % 2 else 0), 0.047 if j % 2 else 0.035, 0.36)
                if bar % 2 == 1:
                    self.hit("rim", start + 2.75, 0.055, -0.35)
                if bar % 8 in [2, 3, 6]:
                    for off, midi, length in self.score["motifs"][(bar // 4 + bar % 2) % 4]:
                        self.note("glass", midi, start + off, length, 0.025, -0.3, "lead")
            elif index == 3:
                for off, strength in [(0.12, 1), (2.66, 0.58)]:
                    for i, midi in enumerate(h["notes"]):
                        self.note("felt", midi + (12 if i == 3 else 0), start + off + i * 0.035, 2.8, 0.047 * strength * activity, (i - 1.5) * 0.16)
                for off, note, length, strength in [(0, h["bass"], 1.5, 1), (2, h["bass"] + 7, 1.1, 0.72), (3.33, h["bass"] + 12, 0.5, 0.5)]:
                    self.note("upright", note, start + off, length, 0.19 * strength, bus="bass")
                self.hit("kick", start, 0.16)
                self.hit("kick", start + 2.66, 0.095)
                for off in [1, 3]:
                    self.hit("brush", start + off - 0.06, 0.34, 0.05)
                    self.hit("rim", start + off + 0.025, 0.07, -0.2)
                for j in range(4):
                    self.hit("hat", start + j + 0.66, 0.045 if j % 2 else 0.032, 0.42)
                if bar % 4 in [0, 2] and bar % 8 != 2:
                    for off, midi, length in self.score["motifs"][(bar // 4 + bar % 2) % 4]:
                        self.note("vibes", midi, start + off, length, 0.033, -0.24, "lead")
                if bar % 8 in [5, 7]:
                    self.note("guitar", h["notes"][-2] + 12, start + 1.66, 2.0, 0.025, 0.4, "lead")
            else:
                if bar % 2 == 0:
                    for i, midi in enumerate(h["notes"]):
                        self.note("felt", midi + (12 if i % 2 else 0), start + 0.3 + i * 0.44, 5.5, 0.04 * activity, (i - 1.5) * 0.23)
                    self.note("bass", h["bass"], start + 0.12, 6.6, 0.12, bus="bass")
                if bar % 4 in [0, 2]:
                    for off, midi, length in self.score["motifs"][(bar // 4) % 4]:
                        self.note("felt", midi, start + off, length + 1.6, 0.034, -0.15, "lead")
                if bar % 4 == 3:
                    self.note("glass", h["notes"][-1] + 12, start + 1.25, 4.5, 0.014, 0.4, "lead")
                for off in [0, 2]:
                    self.note("bass", h["bass"] + 12, start + off, 0.6, 0.026, bus="bass")
            # Soft sustained harmony every two bars, carried across loop boundary.
            if bar % 2 == 0:
                for i, midi in enumerate(h["notes"]):
                    self.note("pad", midi + (12 if index == 4 else 0), start - 0.25, 7.7, 0.017 if index == 4 else 0.010, (i - 1.5) * 0.46, "air", human=0)

    def reverb(self, dry, seconds, seed):
        rng = np.random.default_rng(seed)
        size = round(seconds * SR)
        t = np.arange(size) / SR
        result = np.zeros_like(dry)
        for channel in range(2):
            ir = filt(rng.normal(size=size), 3400) * np.exp(-t * 5.8 / seconds) * 0.007
            ir[:round(0.028 * SR)] = 0
            for off, gain in [(0.037, 0.13), (0.061, 0.09), (0.097, 0.06)]:
                ir[round((off + channel * 0.004) * SR)] += gain
            convolved = signal.oaconvolve(dry[:, channel] * 0.8 + dry[:, 1 - channel] * 0.2, ir)
            result[:, channel] = convolved[:self.n]
            result[:len(convolved) - self.n, channel] += convolved[self.n:]
        return result

    def mix(self):
        keys, bass, drums, air, lead = (self.buses[k] for k in ["keys", "bass", "drums", "air", "lead"])
        ambient = self.score["id"].startswith("04")
        wet = self.reverb(keys + lead + air, 3.8 if ambient else 2.4, self.score["seed"])
        mix = keys + bass + drums + air + lead + wet * (0.48 if ambient else 0.30)
        # Circular, musically timed stereo echoes; no state resets at the seam.
        for beats, gain in [(0.75, 0.18), (1.5, 0.09), (2.25, 0.04)]:
            mix += np.roll(lead[:, ::-1], round(beats * self.beat * SR), axis=0) * gain
        # Warm up filters from the previous cycle rather than zero state.
        warmup = SR * 3
        mix = filt(np.concatenate([mix[-warmup:], mix]), 29, "highpass")[warmup:]
        mix = filt(np.concatenate([mix[-warmup:], mix]), 13200)[warmup:]
        mix = np.tanh(mix * 1.15) / 1.15
        mix -= mix.mean(axis=0)
        return mix.astype(np.float32)


def write_wav(path, samples):
    # Explicit 24-bit little-endian PCM; no dither crossing a loop boundary.
    pcm = np.rint(np.clip(samples, -0.999999, 0.999999) * 8388607).astype(np.int32).ravel()
    packed = np.column_stack((pcm & 255, (pcm >> 8) & 255, (pcm >> 16) & 255)).astype(np.uint8)
    with wave.open(str(path), "wb") as f:
        f.setnchannels(2)
        f.setsampwidth(3)
        f.setframerate(SR)
        f.writeframes(packed.tobytes())


def run(*args):
    return subprocess.run([str(x) for x in args], check=True, capture_output=True, text=True)


def loudness(path):
    result = run("ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "loudnorm=I=-20:TP=-3:LRA=8:print_format=json", "-f", "null", "-")
    return json.loads(result.stderr[result.stderr.rfind("{"):result.stderr.rfind("}") + 1])


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--track", choices=[s["id"][:2] for s in SCORES], help="Render just one version")
    parser.add_argument("--output", type=Path, default=ROOT)
    parser.add_argument("--wav-dir", type=Path, default=ROOT.parents[1] / ".artifacts" / "background-music" / "wav")
    args = parser.parse_args()
    if not shutil.which("ffmpeg"):
        parser.error("FFmpeg must be installed and on PATH")
    output = args.output.resolve()
    args.wav_dir.mkdir(parents=True, exist_ok=True)
    for sub in ["audio", "masters", "source"]:
        (output / sub).mkdir(parents=True, exist_ok=True)
    manifest_path = output / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {"schemaVersion": 1, "created": "2026-10-16", "sampleRate": SR, "channels": 2, "bitDepth": 24, "bars": BARS, "meter": "4/4", "externalAudioSources": [], "tracks": []}
    for score in SCORES:
        if args.track and not score["id"].startswith(args.track):
            continue
        print(f"Composing {score['id']} / {score['title']}…", flush=True)
        session = Session(score)
        session.arrange()
        mix = session.mix()
        with tempfile.TemporaryDirectory() as tmp:
            raw = Path(tmp) / "unmastered.wav"
            write_wav(raw, mix)
            measured = loudness(raw)
        gain_db = min(-20 - float(measured["input_i"]), -3.2 - float(measured["input_tp"]))
        mix *= 10 ** (gain_db / 20)
        wav_path = args.wav_dir / f"{score['id']}.wav"
        flac_path = output / "masters" / f"{score['id']}.flac"
        aac_path = output / "audio" / f"{score['id']}.m4a"
        opus_path = output / "audio" / f"{score['id']}.opus"
        write_wav(wav_path, mix)
        metadata = ["-metadata", f"title={score['title']} / {score['subtitle']}", "-metadata", "album=NOIR Poker / Original Loop Studies", "-metadata", "comment=Original notes and DSP synthesis; no third-party recordings, samples or melody references."]
        run("ffmpeg", "-y", "-v", "error", "-i", wav_path, *metadata, "-c:a", "flac", "-compression_level", "8", flac_path)
        run("ffmpeg", "-y", "-v", "error", "-i", wav_path, *metadata, "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", aac_path)
        run("ffmpeg", "-y", "-v", "error", "-i", wav_path, *metadata, "-c:a", "libopus", "-b:a", "160k", opus_path)
        score_path = output / "source" / f"{score['id']}.score.json"
        score_path.write_text(json.dumps({**score, "bars": BARS, "events": session.events}, ensure_ascii=False, indent=2) + "\n")
        master_loudness = loudness(wav_path)
        entry = {k: v for k, v in score.items() if k not in ["harmony", "motifs"]}
        entry.update({"frames": session.n, "durationSeconds": round(session.n / SR, 6), "loopStartFrame": 0, "loopEndFrameExclusive": session.n, "integratedLUFS": float(master_loudness["input_i"]), "truePeakDBTP": float(master_loudness["input_tp"]), "rendererSHA256": sha(Path(__file__)), "scoreSHA256": sha(score_path), "files": {"lossless": {"path": str(flac_path.relative_to(output)), "sha256": sha(flac_path)}, "preview": {"path": str(aac_path.relative_to(output)), "sha256": sha(aac_path)}, "opus": {"path": str(opus_path.relative_to(output)), "sha256": sha(opus_path)}}})
        manifest["tracks"] = sorted([t for t in manifest["tracks"] if t["id"] != score["id"]] + [entry], key=lambda t: t["id"])
        manifest["rendererSHA256"] = sha(Path(__file__))
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
        print(f"  {entry['durationSeconds']:.3f}s, {entry['integratedLUFS']} LUFS, {entry['truePeakDBTP']} dBTP, {len(session.events)} events", flush=True)
        voice.cache_clear()


if __name__ == "__main__":
    main()
