#!/usr/bin/env python3
"""Verify authored music assets, lossless PCM, mastering and loop boundaries."""

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

SR = 48000
ROOT = Path(__file__).resolve().parents[1]


def decode(path):
    result = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-acodec", "pcm_f32le", "-"], capture_output=True, check=True)
    return np.frombuffer(result.stdout, "<f4").reshape(-1, 2)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--wav-dir", type=Path, default=ROOT.parents[1] / ".artifacts" / "background-music" / "wav")
    parser.add_argument("--report", type=Path, default=ROOT / "verification.json")
    args = parser.parse_args()
    manifest = json.loads((args.root / "manifest.json").read_text())
    failures = []
    tracks = []
    if len(manifest["tracks"]) != 4:
        failures.append("Expected four finished variants")
    if manifest["externalAudioSources"]:
        failures.append("Unexpected external recording dependency")
    if hashlib.sha256((args.root / "source" / "render.py").read_bytes()).hexdigest() != manifest["rendererSHA256"]:
        failures.append("Renderer no longer matches the rendered manifest")
    for track in manifest["tracks"]:
        if track["rendererSHA256"] != manifest["rendererSHA256"]:
            failures.append(f"Track was rendered by an older script: {track['id']}")
        score_path = args.root / "source" / f"{track['id']}.score.json"
        if hashlib.sha256(score_path.read_bytes()).hexdigest() != track["scoreSHA256"]:
            failures.append(f"Score changed after rendering: {track['id']}")
        for file in track["files"].values():
            path = args.root / file["path"]
            if hashlib.sha256(path.read_bytes()).hexdigest() != file["sha256"]:
                failures.append(f"Hash mismatch: {path.name}")
        pcm = decode(args.root / track["files"]["lossless"]["path"])
        expected = round(32 * 4 * 60 / track["bpm"] * SR)
        if len(pcm) != expected or len(pcm) != track["frames"]:
            failures.append(f"Incorrect musical period: {track['id']}")
        if not np.isfinite(pcm).all() or np.max(np.abs(pcm)) >= 1:
            failures.append(f"Nonfinite/clipped PCM: {track['id']}")
        seam = float(np.max(np.abs(pcm[0] - pcm[-1])))
        derivatives = np.abs(np.diff(pcm, axis=0))
        p99 = float(np.quantile(derivatives, 0.99))
        step_limit = max(p99 * 2.5, 0.0005)
        if seam > step_limit:
            failures.append(f"Abrupt loop join: {track['id']} ({seam} > {step_limit})")
        first = float(np.sqrt(np.mean(pcm[:SR // 2] ** 2)))
        last = float(np.sqrt(np.mean(pcm[-SR // 2:] ** 2)))
        if min(first, last) < 0.001:
            failures.append(f"Near-silent intro/outro: {track['id']}")
        if abs(track["integratedLUFS"] + 20) > 0.5 or track["truePeakDBTP"] > -3:
            failures.append(f"Mastering target missed: {track['id']}")
        wav = args.wav_dir / f"{track['id']}.wav"
        identical = np.array_equal(pcm, decode(wav)) if wav.exists() else None
        if identical is False:
            failures.append(f"FLAC differs from WAV master: {track['id']}")
        codecs = {}
        for fmt in ["preview", "opus"]:
            decoded = decode(args.root / track["files"][fmt]["path"])
            if not len(decoded) or not np.isfinite(decoded).all():
                failures.append(f"Invalid compressed audio: {track['id']} / {fmt}")
            codecs[fmt] = {"decodedFrames": len(decoded), "extraFramesVersusMaster": len(decoded) - expected}
        # Retain a short explicit seam render for visual/audio inspection.
        seam_pcm = np.concatenate([pcm[-4 * SR:], pcm[:6 * SR]])
        seam_dir = args.wav_dir.parent / "seams"
        seam_dir.mkdir(parents=True, exist_ok=True)
        from render import write_wav
        write_wav(seam_dir / f"{track['id']}-seam.wav", seam_pcm)
        row = {"id": track["id"], "frames": len(pcm), "durationSeconds": round(len(pcm) / SR, 6), "integratedLUFS": track["integratedLUFS"], "truePeakDBTP": track["truePeakDBTP"], "dcOffset": [float(x) for x in pcm.mean(axis=0)], "seamStep": seam, "seamStepDBFS": round(20 * np.log10(max(seam, 1e-12)), 2), "internalStepP99": p99, "seamLimit": step_limit, "nonSilentAtBothEnds": min(first, last) >= 0.001, "flacEqualsLocalWav": identical, "formats": codecs}
        tracks.append(row)
        print(f"{track['id']}: {len(pcm) / SR:.3f}s, join {row['seamStepDBFS']} dBFS, FLAC=WAV {identical}", flush=True)
    report = {"passed": not failures, "scope": "Offline PCM, hashes, periods, codec decodability, static loudness and loop discontinuity checks. Not a subjective listening assessment or native/WeChat runtime test.", "tracks": tracks, "failures": failures}
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    if failures:
        print("\n".join(failures), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
