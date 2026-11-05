import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const studio = path.dirname(fileURLToPath(import.meta.url));
const board = JSON.parse(
  readFileSync(path.join(studio, "storyboard.json"), "utf8"),
);
const run = (bin, args) => {
  const r = spawnSync(bin, args, { encoding: "utf8", maxBuffer: 2 ** 20 });
  if (r.status !== 0) throw Error(`${bin}: ${r.stderr}`);
  return r.stdout;
};
const evidence = [];
for (const [language, voice] of [
  ["en", "Samantha"],
  ["zh-CN", "Tingting"],
]) {
  const folder = path.join(studio, "public/voice", language);
  mkdirSync(folder, { recursive: true });
  for (const scene of board.scenes) {
    const text = scene[language === "en" ? "voiceEn" : "voiceZh"];
    const textFile = path.join(folder, `${scene.id}.txt`);
    const raw = path.join(folder, `${scene.id}.aiff`);
    const result = path.join(folder, `${scene.id}.wav`);
    writeFileSync(textFile, text);
    run("say", [
      "-v",
      voice,
      "-r",
      language === "en" ? "170" : "205",
      "-f",
      textFile,
      "-o",
      raw,
    ]);
    const duration = Number(
      run("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=nw=1:nk=1",
        raw,
      ]).trim(),
    );
    const available = scene.to - scene.from - 0.65;
    const tempo = Math.max(1, duration / available);
    if (tempo > 1.24)
      throw Error(`Shorten ${language}/${scene.id}: narration is ${duration}s`);
    run("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      raw,
      "-af",
      `atempo=${tempo},highpass=f=90,loudnorm=I=-16:TP=-2:LRA=6,afade=t=in:d=0.025,afade=t=out:st=${Math.max(0, duration / tempo - 0.06)}:d=0.06`,
      "-ar",
      "48000",
      "-ac",
      "2",
      "-c:a",
      "pcm_s16le",
      result,
    ]);
    evidence.push({
      language,
      scene: scene.id,
      text,
      voice,
      provider: "macOS system speech",
      sourceDuration: duration,
      tempo,
      output: result,
    });
  }
}
writeFileSync(
  path.join(studio, "public/voice/provenance.json"),
  JSON.stringify(evidence, null, 2) + "\n",
);
console.log(
  "Prepared bilingual scene narration, 48 kHz stereo, with measured durations",
);
