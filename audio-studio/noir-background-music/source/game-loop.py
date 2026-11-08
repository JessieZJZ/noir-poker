#!/usr/bin/env python3
"""Build the in-game Midnight Felt files from the tracked master, loop-ready.

The master is one exact 32-bar period. The game opens it at bar 2, beat
2-and (just after the snare; bars 2-4 carry the groove before the melody
enters at bar 5) and afterwards loops whole periods. Each delivery file starts
`MARGIN_SECONDS` before that opening, holds one full period from the opening
onward, and continues the music for `MARGIN_SECONDS` past it, so neither loop
point lies near the encoder's first or last frame:

    file frame f  <->  master frame (f + opening - margin) mod period
    loop          =    [margin, margin + period)

The delivery chains keep the earlier EQ, compression and limiter settings, but
use one static gain in place of FFmpeg's dynamic loudnorm, and no edge fades,
so the processed signal is exactly periodic and the loop jump joins two
identical continuations. The gain is chosen to match the earlier files'
integrated loudness.

Run with the studio's NumPy/SciPy environment (see README) from any directory:
    python audio-studio/noir-background-music/source/game-loop.py
"""

import hashlib
import json
import math
import subprocess
import tempfile
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
STUDIO = HERE.parent
REPO = STUDIO.parents[1]
SR = 48000
BPM = 82
OPENING_BEATS = 5.5  # bar 2, beat 2-and
MARGIN_SECONDS = 0.5

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


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    master = decode(STUDIO / "masters/01-midnight-felt.flac")
    n = len(master)
    assert n == round(32 * 4 * 60 / BPM * SR), n
    opening = round(OPENING_BEATS * 60 / BPM * SR)
    margin = round(MARGIN_SECONDS * SR)
    loop_start, loop_end = margin, margin + n
    frames = loop_end + margin
    report = {"sampleRate": SR, "bpm": BPM, "cycleFrames": n, "openingMasterFrame": opening, "frames": frames, "loopStartFrame": loop_start, "loopEndFrameExclusive": loop_end, "files": {}}
    # Three periods in, the middle one out: every filter runs from steady state.
    tiled = np.tile(master, (3, 1))
    first = n + opening - margin
    for name, spec in DELIVERY.items():
        level = integrated(process(tiled, spec["before"])[n:2 * n])
        volume = -14 - level
        for _ in range(4):
            chain = f"{spec['before']},volume={volume:.4f}dB,{spec['after']}"
            volume += spec["targetLUFS"] - integrated(process(tiled, chain)[n:2 * n])
        chain = f"{spec['before']},volume={volume:.4f}dB,{spec['after']}"
        processed = process(tiled, chain)
        cycle = processed[n:2 * n]
        assert float(np.max(np.abs(processed[2 * n:3 * n - SR] - cycle[:n - SR]))) == 0, "processed signal is not periodic"
        out = processed[first:first + frames]
        seam = float(np.max(np.abs(out[loop_end:frames] - out[loop_start:loop_start + frames - loop_end])))
        with tempfile.TemporaryDirectory() as tmp:
            wav = Path(tmp) / "loop.wav"
            ffmpeg("-y", "-f", "f32le", "-ar", SR, "-ac", 2, "-i", "-", "-c:a", "pcm_f32le", wav, data=np.ascontiguousarray(out, np.float32).tobytes())
            ffmpeg("-y", "-i", wav, "-map_metadata", "-1", "-c:a", "aac", "-b:a", spec["bitrate"], "-movflags", "+faststart", spec["path"])
        decoded = decode(spec["path"])
        assert len(decoded) == frames, (name, len(decoded), frames)
        report["files"][name] = {
            "path": str(spec["path"].relative_to(REPO)),
            "bytes": spec["path"].stat().st_size,
            "sha256": sha(spec["path"]),
            "bitrate": spec["bitrate"],
            "staticGainDB": round(volume, 4),
            "integratedLUFS": round(integrated(decoded[loop_start:loop_end]), 2),
            "peakDBFS": round(20 * math.log10(float(np.max(np.abs(decoded)))), 2),
            "processedSeamMaxDiff": seam,
            "encodedLoopJump": float(np.max(np.abs(decoded[loop_end] - decoded[loop_start]))),
        }
        print(name, json.dumps(report["files"][name]), flush=True)
    (STUDIO / "game-loop.json").write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
