import { catalog } from "./catalog.mjs";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
const root = new URL("../", import.meta.url).pathname,
  ids = ["tutorial", "practice", "review", "retry", "records", "calculator"],
  limits = [4.15, 4.45, 4.85, 4.95, 4.55, 4.65];
const run = (bin, args) =>
  new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let a = "",
      b = "";
    p.stdout.on("data", (d) => (a += d));
    p.stderr.on("data", (d) => (b += d));
    p.on("error", reject);
    p.on("close", (c) => (c === 0 ? resolve(a) : reject(Error(b))));
  });
const jobs = Object.values(catalog).filter((x) =>
  process.env.NOIR_STORE_LOCALES
    ? process.env.NOIR_STORE_LOCALES.split(",").includes(x.locale)
    : !x.closing,
);
const evidence = [];
const checksum = (file) =>
  createHash("sha256").update(fs.readFileSync(file)).digest("hex");
async function makeInvitation(file, voice, phrases) {
  const inputs = [];
  const filters = [];
  for (const [index, { text, rate, pitch }] of phrases.entries()) {
    const part = file + "-" + index + ".mp3";
    await run("uvx", [
      "--from",
      "edge-tts==7.3.1",
      "edge-tts",
      "--voice",
      voice,
      "--rate=" + rate,
      "--pitch=" + pitch,
      "--text",
      text,
      "--write-media",
      part,
    ]);
    inputs.push("-i", part);
    const trim =
      "silenceremove=start_periods=1:start_threshold=-47dB:start_silence=0.035";
    filters.push(
      `[${index}:a]${trim},areverse,${trim},areverse,asetpts=PTS-STARTPTS,apad=pad_dur=${index === 0 ? 0.17 : 0.08}[part${index}]`,
    );
  }
  filters.push(
    "[part0][part1]concat=n=2:v=0:a=1,highpass=f=70,loudnorm=I=-16:TP=-2:LRA=9[out]",
  );
  await run("ffmpeg", [
    "-v",
    "error",
    "-y",
    ...inputs,
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[out]",
    "-ar",
    "48000",
    "-ac",
    "2",
    file + ".wav",
  ]);
}
const duration = async (file) =>
  Number(
    await run("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      file,
    ]),
  );
async function worker() {
  while (jobs.length) {
    const c = jobs.shift(),
      dir = path.join(root, "public/voice-locales", c.locale);
    fs.mkdirSync(dir, { recursive: true });
    const clips = c.closing
      ? [
          ["calculator", c.say[5], 2.2],
          ["closing", c.closing.caption, 2.45],
        ]
      : ids.map((id, i) => [id, c.say[i], limits[i]]);
    for (const [id, text, limit] of clips) {
      const file = path.join(dir, id);
      const phrases = id === "closing" ? c.closing.phrases : null;
      const performance = phrases ? JSON.stringify(phrases) : "-4%";
      const metadata = file + ".json";
      const previous = fs.existsSync(metadata)
        ? JSON.parse(fs.readFileSync(metadata))
        : null;
      if (
        !fs.existsSync(file + ".wav") ||
        previous?.text !== text ||
        previous?.voice !== c.voice ||
        previous?.performance !== performance ||
        previous?.wavSha256 !== checksum(file + ".wav")
      ) {
        if (phrases) {
          await makeInvitation(file, c.voice, phrases);
        } else {
          await run("uvx", [
            "--from",
            "edge-tts==7.3.1",
            "edge-tts",
            "--voice",
            c.voice,
            "--rate=-4%",
            "--text",
            text,
            "--write-media",
            file + ".mp3",
            "--write-subtitles",
            file + ".srt",
          ]);
          await run("ffmpeg", [
            "-v",
            "error",
            "-y",
            "-i",
            file + ".mp3",
            "-af",
            "highpass=f=70,loudnorm=I=-16:TP=-2:LRA=9",
            "-ar",
            "48000",
            "-ac",
            "2",
            file + ".wav",
          ]);
        }
        const seconds = await duration(file + ".wav");
        if (!Number.isFinite(seconds) || seconds > limit)
          throw Error(`${c.locale}/${id} is ${seconds}s (limit ${limit}s)`);
        fs.writeFileSync(
          metadata,
          JSON.stringify(
            {
              text,
              voice: c.voice,
              performance,
              wavSha256: checksum(file + ".wav"),
            },
            null,
            2,
          ) + "\n",
        );
      }
      evidence.push({
        locale: c.locale,
        id,
        text,
        voice: c.voice,
        provider: "Microsoft neural TTS via edge-tts 7.3.1",
        seconds: await duration(file + ".wav"),
        status: "prepared",
      });
      console.log(c.locale + "/" + id + " ready");
    }
  }
}
await Promise.all([worker(), worker()]);
fs.writeFileSync(
  path.join(root, "public/voice-locales/provenance.json"),
  JSON.stringify(evidence, null, 2) + "\n",
);
