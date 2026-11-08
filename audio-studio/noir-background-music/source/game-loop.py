#!/usr/bin/env python3
"""Build the in-game Midnight Felt files: a two-bar intro, then a sample-exact loop.

The tracked lossless master is a steady-state cycle: frame 0 already carries
the reverb and note tails of bar 32, so starting there sounds like joining the
song halfway. This script renders a short intro from silence (Bbmaj9 and
A7sus(b9), the cycle's own turnaround, with pads, keys, bass and a brush/hat
pickup), plays bar 1 onward linearly, then crossfades over one bar into the
unchanged periodic master. Players start at frame 0 once and afterwards loop
between `loopStartFrame` and `loopEndFrameExclusive`, which lie inside the
periodic part, so the jump is between identical continuations.

The delivery chains keep the earlier EQ, compression and limiter settings, but
use one static gain in place of FFmpeg's dynamic loudnorm, so the processed
signal is periodic too. The gain is chosen to match the previous files'
integrated loudness. A short tail after the loop end keeps the jump away from
the encoder's final frame.

Run with the studio's NumPy/SciPy environment (see README) from any directory:
    python audio-studio/noir-background-music/source/game-loop.py
"""

import hashlib
import importlib.util
import json
import math
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from scipy import signal

HERE = Path(__file__).resolve().parent
STUDIO = HERE.parent
REPO = STUDIO.parents[1]
spec = importlib.util.spec_from_file_location("noir_render", HERE / "render.py")
render = importlib.util.module_from_spec(spec)
spec.loader.exec_module(render)
SR, BARS, filt = render.SR, render.BARS, render.filt

INTRO_BARS = 2
CROSSFADE_BARS = 1
LOOP_START_BARS = 2  # after the intro; half a bar of margin past the crossfade
TAIL_SECONDS = 0.5

DELIVERY = {
    "desktop": {
        "path": REPO / "public/audio/background-music.m4a",
        "bitrate": "96k",
        "before": "highpass=f=80,equalizer=f=1600:t=o:w=2:g=3",
        "after": "alimiter=limit=0.23:attack=5:release=80:level=false:latency=true",
        "targetLUFS": -18.97,
    },
    "mobile": {
        "path": REPO / "public/audio/background-music-mobile.m4a",
        "bitrate": "128k",
        "before": "highpass=f=100,equalizer=f=1600:t=o:w=2:g=4,acompressor=threshold=0.035:ratio=4:attack=5:release=100:makeup=4",
        "after": "alimiter=limit=0.4:attack=5:release=80:level=false:latency=true",
        "targetLUFS": -13.67,
    },
}


def ffmpeg(*args, data=None):
    return subprocess.run(["ffmpeg", "-hide_banner", "-v", "error", *map(str, args)], input=data, check=True, capture_output=True)


def decode(path):
    out = ffmpeg("-i", path, "-f", "f32le", "-ac", "2", "-ar", SR, "-").stdout
    return np.frombuffer(out, np.float32).reshape(-1, 2).astype(np.float64)


def process(samples, chain):
    raw = np.ascontiguousarray(samples, np.float32).tobytes()
    out = ffmpeg("-f", "f32le", "-ar", SR, "-ac", 2, "-i", "-", "-af", chain, "-f", "f32le", "-", data=raw).stdout
    return np.frombuffer(out, np.float32).reshape(-1, 2).astype(np.float64)


def integrated(samples):
    raw = np.ascontiguousarray(samples, np.float32).tobytes()
    err = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-", "-af", "loudnorm=print_format=json", "-f", "null", "-"], input=raw, check=True, capture_output=True).stderr.decode()
    return float(json.loads(err[err.rfind("{"):err.rfind("}") + 1])["input_i"])


class Linear(render.Session):
    """The same notes and draws as the cycle, deposited on a linear timeline."""

    def __init__(self, score, lead_beats, length):
        super().__init__(score)
        self.cycle = self.n
        self.offset = round(lead_beats * self.beat * SR)
        self.n = length
        self.buses = {k: np.zeros((length, 2), np.float32) for k in self.buses}

    def add(self, bus, samples, beat, gain, pan=0):
        start = self.offset + round(beat * self.beat * SR)
        v = samples[:, None] * np.array([math.cos((pan + 1) * math.pi / 4), math.sin((pan + 1) * math.pi / 4)], np.float32) * gain
        lo, hi = max(start, 0), min(start + len(v), self.n)
        if hi > lo:
            self.buses[bus][lo:hi] += v[lo - start:hi - start]

    def intro(self):
        # A separate generator, so the body keeps the master's exact draws.
        self.rng = np.random.default_rng(self.score["seed"] + 1)
        harmony = self.score["harmony"]
        first, second = harmony[14], harmony[15]
        # Bar one: the pad swells from silence, keys roll in, a soft root enters.
        for i, midi in enumerate(first["notes"]):
            self.note("pad", midi, -8, 4.6, 0.012, (i - 1.5) * 0.46, "air", human=0)
            self.note("ep", midi, -8 + 0.5 + i * 0.14, 3.2, 0.052 * 0.42, (i - 1.5) * 0.14)
        self.note("bass", first["bass"], -6, 2.0, 0.18 * 0.35, bus="bass")
        self.note("glass", first["notes"][-1] + 12, -8 + 2.25, 3.0, 0.012, 0.45, "lead")
        # Bar two: the turnaround with bass, then hats and a brush lead into bar 1.
        for i, midi in enumerate(second["notes"]):
            self.note("pad", midi, -4, 4.6, 0.012, (i - 1.5) * 0.46, "air", human=0)
            self.note("ep", midi, -4 + 0.08 + i * 0.05, 3.2, 0.052 * 0.62, (i - 1.5) * 0.14)
        self.note("bass", second["bass"], -4, 1.5, 0.18 * 0.65, bus="bass")
        self.note("bass", second["bass"] + 12, -4 + 2.65, 0.9, 0.18 * 0.45, bus="bass")
        self.hit("brush", -1.08, 0.07, -0.25)
        for j, gain in enumerate([0.016, 0.024, 0.032, 0.042]):
            self.hit("hat", -2 + j * 0.5 + (0.045 if j % 2 else 0), gain, 0.3)

    def mix(self):
        keys, bass, drums, air, lead = (self.buses[k] for k in ["keys", "bass", "drums", "air", "lead"])
        dry = keys + lead + air
        rng = np.random.default_rng(self.score["seed"])
        size = round(2.4 * SR)
        t = np.arange(size) / SR
        wet = np.zeros_like(dry)
        for channel in range(2):
            ir = filt(rng.normal(size=size), 3400) * np.exp(-t * 5.8 / 2.4) * 0.007
            ir[:round(0.028 * SR)] = 0
            for off, gain in [(0.037, 0.13), (0.061, 0.09), (0.097, 0.06)]:
                ir[round((off + channel * 0.004) * SR)] += gain
            wet[:, channel] = signal.oaconvolve(dry[:, channel] * 0.8 + dry[:, 1 - channel] * 0.2, ir)[:self.n]
        mix = keys + bass + drums + air + lead + wet * 0.30
        for beats, gain in [(0.75, 0.18), (1.5, 0.09), (2.25, 0.04)]:
            shift = round(beats * self.beat * SR)
            mix[shift:] += lead[:-shift, ::-1] * gain
        mix = filt(filt(mix, 29, "highpass"), 13200)
        return (np.tanh(mix * 1.15) / 1.15).astype(np.float64)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    score = render.SCORES[0]
    cycle = render.Session(score)
    cycle.arrange()
    steady = cycle.mix().astype(np.float64)
    master = decode(STUDIO / "masters/01-midnight-felt.flac")
    n = cycle.n
    assert master.shape == (n, 2), master.shape
    gain = float(np.sum(master * steady) / np.sum(steady * steady))
    residual = float(np.max(np.abs(master - steady * gain)))
    # The renderer must reproduce the tracked master before any reuse.
    assert residual < 1e-5, residual
    bar = round(4 * cycle.beat * SR)
    intro = INTRO_BARS * bar
    fade_end = intro + CROSSFADE_BARS * bar
    loop_start = intro + LOOP_START_BARS * bar
    loop_end = loop_start + n
    frames = loop_end + round(TAIL_SECONDS * SR)

    linear = Linear(score, INTRO_BARS * 4, fade_end)
    linear.arrange()
    linear.intro()
    head = linear.mix() * gain
    extended = frames + 2 * SR
    periodic = master[(np.arange(extended) - intro) % n]
    timeline = periodic.copy()
    timeline[:intro] = head[:intro]
    w = 0.5 - 0.5 * np.cos(np.pi * np.arange(fade_end - intro) / (fade_end - intro))
    timeline[intro:fade_end] = head[intro:fade_end] * (1 - w[:, None]) + periodic[intro:fade_end] * w[:, None]

    report = {"sampleRate": SR, "bpm": score["bpm"], "introBars": INTRO_BARS, "crossfadeBars": CROSSFADE_BARS, "cycleFrames": n, "frames": frames, "loopStartFrame": loop_start, "loopEndFrameExclusive": loop_end, "renderResidual": residual, "files": {}}
    for name, spec_ in DELIVERY.items():
        cycle_in = np.tile(master, (3, 1))
        level = integrated(process(cycle_in, spec_["before"])[n:2 * n])
        volume = -14 - level
        for _ in range(4):
            out = process(cycle_in, f"{spec_['before']},volume={volume:.4f}dB,{spec_['after']}")[n:2 * n]
            volume += spec_["targetLUFS"] - integrated(out)
        processed = process(timeline, f"{spec_['before']},volume={volume:.4f}dB,{spec_['after']}")[:frames]
        seam = float(np.max(np.abs(processed[loop_end:frames] - processed[loop_start:loop_start + frames - loop_end])))
        with tempfile.TemporaryDirectory() as tmp:
            wav = Path(tmp) / "loop.wav"
            ffmpeg("-y", "-f", "f32le", "-ar", SR, "-ac", 2, "-i", "-", "-c:a", "pcm_f32le", wav, data=np.ascontiguousarray(processed, np.float32).tobytes())
            ffmpeg("-y", "-i", wav, "-map_metadata", "-1", "-c:a", "aac", "-b:a", spec_["bitrate"], "-movflags", "+faststart", spec_["path"])
        decoded = decode(spec_["path"])
        assert len(decoded) == frames, (name, len(decoded), frames)
        encoded_seam = float(np.max(np.abs(decoded[loop_end:frames] - decoded[loop_start:loop_start + frames - loop_end])))
        report["files"][name] = {
            "path": str(spec_["path"].relative_to(REPO)),
            "bytes": spec_["path"].stat().st_size,
            "sha256": sha(spec_["path"]),
            "bitrate": spec_["bitrate"],
            "staticGainDB": round(volume, 4),
            "integratedLUFS": round(integrated(decoded[loop_start:loop_end]), 2),
            "peakDBFS": round(20 * math.log10(float(np.max(np.abs(decoded)))), 2),
            "processedSeamMaxDiff": seam,
            "encodedSeamMaxDiff": encoded_seam,
            "firstFrameAbs": float(np.max(np.abs(decoded[0]))),
        }
        print(name, json.dumps(report["files"][name]), flush=True)
    (STUDIO / "game-loop.json").write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
