import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const studio = path.dirname(fileURLToPath(import.meta.url));
const board = JSON.parse(
  readFileSync(path.join(studio, "storyboard.json"), "utf8"),
);
const run = (bin, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "",
      err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve(out)
        : reject(Error(`${bin} exited ${code}: ${err}`)),
    );
  });
const shared = process.argv.includes("--shared");
const voiceDirectory = shared ? "voice-v3" : "voice-v2";
const evidence = [];
// Two independent locale tracks; each service request stays sequential.
await Promise.all(
  [
    ["en", process.env.NOIR_TTS_EN || "en-US-EmmaNeural"],
    ["zh-CN", process.env.NOIR_TTS_ZH || "zh-CN-XiaoxiaoNeural"],
  ].map(async ([language, voice]) => {
    const folder = path.join(studio, "public", voiceDirectory, language);
    mkdirSync(folder, { recursive: true });
    for (const scene of board.scenes) {
      if (shared && scene.id !== "calculator") continue;
      const text = shared
        ? scene[language === "en" ? "sharedVoiceEn" : "sharedVoiceZh"]
        : scene[language === "en" ? "voiceEn" : "voiceZh"];
      const raw = path.join(folder, `${scene.id}.mp3`),
        wav = path.join(folder, `${scene.id}.wav`);
      writeFileSync(path.join(folder, `${scene.id}.txt`), text + "\n");
      await run("uvx", [
        "--from",
        "edge-tts==7.3.1",
        "edge-tts",
        "--voice",
        voice,
        "--rate=-4%",
        "--text",
        text,
        "--write-media",
        raw,
        "--write-subtitles",
        path.join(folder, `${scene.id}.srt`),
      ]);
      const duration = Number(
        (
          await run("ffprobe", [
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "csv=p=0",
            raw,
          ])
        ).trim(),
      );
      if (duration > scene.to - scene.from - 0.55)
        throw Error(
          `Shorten ${language}/${scene.id}, ${duration}s narration cannot be rushed to fit`,
        );
      await run("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        raw,
        "-af",
        "highpass=f=70,loudnorm=I=-16:TP=-2:LRA=9",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-c:a",
        "pcm_s16le",
        wav,
      ]);
      evidence.push({
        language,
        scene: scene.id,
        text,
        voice,
        provider: "Microsoft Edge neural TTS via edge-tts 7.3.1",
        rate: "-4%",
        tempo: 1,
        seconds: duration,
        output: `${voiceDirectory}/${language}/${scene.id}.wav`,
        pronunciation:
          scene.id === "retry" && language === "zh-CN"
            ? "Use 重新打 to disambiguate 重 as chóng; displayed copy remains 重打"
            : undefined,
      });
      console.log(`Prepared ${language}/${scene.id}: ${duration}s`);
    }
  }),
);
writeFileSync(
  path.join(studio, "public", voiceDirectory, "provenance.json"),
  JSON.stringify(evidence, null, 2) + "\n",
);
