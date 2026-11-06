import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
const studio = path.dirname(fileURLToPath(import.meta.url));
if (!process.argv[2]) throw Error("Pass the V5 output directory.");
const dir = path.resolve(process.argv[2]),
  tmp = mkdtempSync(path.join(os.tmpdir(), "noir-clarity-"));
const frames = JSON.parse(
  readFileSync(path.join(studio, "src/sharp-frames.json")),
);
const run = (cmd, args) =>
  execFileSync(cmd, args, { cwd: studio, stdio: "inherit" });
try {
  for (const [lang, id] of [
    ["zh-CN", "Shared-ZH"],
    ["en", "Shared-EN"],
  ]) {
    if (Object.keys(frames[lang]).length !== 6)
      throw Error("Six lossless scenes are required");
    const out = path.join(dir, lang);
    mkdirSync(out, { recursive: true });
    const intermediate = path.join(tmp, lang),
      audio = path.join(studio, "public/locked-audio", lang + ".m4a");
    // Render the unchanged composition at 2x density. Lossless PNG frame sequences
    // preserve fine colored UI text until the final delivery encode.
    run(process.execPath, [
      "node_modules/@remotion/cli/remotion-cli.js",
      "render",
      id,
      intermediate,
      "--sequence",
      "--image-format=png",
      "--scale=2",
      "--muted",
      "--color-space=bt709",
      "--concurrency=2",
      "--log=error",
    ]);
    for (const [name, filter, opts] of [
      ["master-3840.mp4", null, ["-crf", "12", "-level:v", "5.1"]],
      [
        "shared-preview.mp4",
        "scale=1920:886:flags=lanczos+accurate_rnd+full_chroma_int",
        [
          "-level:v",
          "4.0",
          "-b:v",
          "11M",
          "-minrate",
          "11M",
          "-maxrate",
          "11M",
          "-bufsize",
          "11M",
          "-x264-params",
          "nal-hrd=cbr:force-cfr=1",
        ],
      ],
    ]) {
      run("ffmpeg", [
        "-v",
        "error",
        "-y",
        "-framerate",
        "30",
        "-pattern_type",
        "glob",
        "-i",
        path.join(intermediate, "*.png"),
        "-i",
        audio,
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        ...(filter ? ["-vf", filter] : []),
        "-c:v",
        "libx264",
        "-profile:v",
        "high",
        "-preset",
        "slow",
        "-pix_fmt",
        "yuv420p",
        ...opts,
        "-colorspace",
        "bt709",
        "-color_trc",
        "bt709",
        "-color_primaries",
        "bt709",
        "-c:a",
        "copy",
        "-movflags",
        "+faststart",
        path.join(out, name),
      ]);
    }
    run("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-ss",
      "1.3",
      "-i",
      path.join(out, "master-3840.mp4"),
      "-frames:v",
      "1",
      path.join(out, "poster.png"),
    ]);
    const board = JSON.parse(
      readFileSync(path.join(studio, "storyboard.json")),
    );
    const stamp = (t) =>
      new Date(Math.round(t * 1000))
        .toISOString()
        .slice(11, 23)
        .replace(".", ",");
    writeFileSync(
      path.join(out, "captions.srt"),
      board.scenes
        .map(
          (s, i) =>
            i +
            1 +
            "\n" +
            stamp(s.from + 0.3) +
            " --> " +
            stamp(s.to - 0.24) +
            "\n" +
            (i === 5
              ? s[lang === "en" ? "sharedVoiceEn" : "sharedVoiceZh"]
              : s[lang === "en" ? "voiceEn" : "voiceZh"]) +
            "\n",
        )
        .join("\n"),
    );
    console.log(
      "Exported " + lang + " 3840 master + common store file; V4 audio copied",
    );
    rmSync(intermediate, { recursive: true, force: true });
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
