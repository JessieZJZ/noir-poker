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
const jobs = Object.values(catalog).filter(
  (x) => !["en", "zh-CN"].includes(x.locale),
);
const evidence = [];
const checksum = (file) =>
  createHash("sha256").update(fs.readFileSync(file)).digest("hex");
async function worker() {
  while (jobs.length) {
    const c = jobs.shift(),
      dir = path.join(root, "public/voice-locales", c.locale);
    fs.mkdirSync(dir, { recursive: true });
    for (let i = 0; i < 6; i++) {
      const file = path.join(dir, ids[i]),
        text = c.say[i];
      const metadata = file + ".json";
      const previous = fs.existsSync(metadata)
        ? JSON.parse(fs.readFileSync(metadata))
        : null;
      if (
        !fs.existsSync(file + ".wav") ||
        previous?.text !== text ||
        previous?.voice !== c.voice ||
        previous?.rate !== "-4%" ||
        previous?.wavSha256 !== checksum(file + ".wav")
      ) {
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
        const d = Number(
          await run("ffprobe", [
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "csv=p=0",
            file + ".mp3",
          ]),
        );
        if (d > limits[i]) {
          evidence.push({
            locale: c.locale,
            id: ids[i],
            text,
            duration: d,
            limit: limits[i],
            status: "too-long",
          });
          console.log("TOO LONG " + c.locale + "/" + ids[i] + " " + d);
          continue;
        }
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
        fs.writeFileSync(
          metadata,
          JSON.stringify(
            {
              text,
              voice: c.voice,
              rate: "-4%",
              wavSha256: checksum(file + ".wav"),
            },
            null,
            2,
          ) + "\n",
        );
      }
      evidence.push({
        locale: c.locale,
        id: ids[i],
        text,
        voice: c.voice,
        provider: "Microsoft neural TTS via edge-tts 7.3.1",
        status: "prepared",
      });
      console.log(c.locale + "/" + ids[i] + " ready");
    }
  }
}
await Promise.all([worker(), worker()]);
fs.writeFileSync(
  path.join(root, "public/voice-locales/provenance.json"),
  JSON.stringify(evidence, null, 2) + "\n",
);
if (evidence.some((item) => item.status === "too-long"))
  throw Error("Shorten the marked narration before rendering");
