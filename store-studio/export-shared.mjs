import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
const studio = path.dirname(fileURLToPath(import.meta.url));
if (!process.argv[2]) throw Error("Pass the shared video output directory.");
const dir = path.resolve(process.argv[2]);
const tmp = mkdtempSync(path.join(os.tmpdir(), "noir-shared-film-"));
const board = JSON.parse(readFileSync(path.join(studio, "storyboard.json")));
const run = (cmd, args) =>
  execFileSync(cmd, args, { cwd: studio, stdio: "inherit" });
const stamp = (t) =>
  new Date(Math.round(t * 1000)).toISOString().slice(11, 23).replace(".", ",");
try {
  for (const [lang, id] of [
    ["zh-CN", "Shared-ZH"],
    ["en", "Shared-EN"],
  ]) {
    const out = path.join(dir, lang);
    mkdirSync(out, { recursive: true });
    const intermediate = path.join(tmp, id + ".mp4"),
      final = path.join(out, "shared-preview.mp4");
    run(process.execPath, [
      "node_modules/@remotion/cli/remotion-cli.js",
      "render",
      id,
      intermediate,
      "--codec=h264",
      "--crf=15",
      "--audio-bitrate=320k",
      "--pixel-format=yuv420p",
      "--color-space=bt709",
      "--concurrency=2",
      "--log=error",
    ]);
    run("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-i",
      intermediate,
      "-map",
      "0:v",
      "-map",
      "0:a",
      "-c:v",
      "libx264",
      "-profile:v",
      "high",
      "-level:v",
      "4.0",
      "-preset",
      "fast",
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
      "-colorspace",
      "bt709",
      "-color_trc",
      "bt709",
      "-color_primaries",
      "bt709",
      "-c:a",
      "aac",
      "-b:a",
      "256k",
      "-ac",
      "2",
      "-ar",
      "48000",
      "-movflags",
      "+faststart",
      final,
    ]);
    run("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-ss",
      "1.3",
      "-i",
      final,
      "-frames:v",
      "1",
      path.join(out, "poster.png"),
    ]);
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
    console.log("Exported one shared master for " + lang);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
