import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  existsSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const studio = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(studio);
const [platform, rawArg] = process.argv.slice(2);
if (!["ios", "android", "ipad"].includes(platform) || !rawArg)
  throw Error("Use prepare-media.mjs ios|android|ipad RAW_DIRECTORY");
const raw = path.resolve(rawArg);
const repair =
  process.env.NOIR_STORE_REPAIR && path.resolve(process.env.NOIR_STORE_REPAIR);
const sourcePath = (relative) =>
  repair && existsSync(path.join(repair, relative))
    ? path.join(repair, relative)
    : path.join(raw, relative);
const planFile = path.join(studio, "src/media-plan.json");
const plan = JSON.parse(readFileSync(planFile, "utf8"));
const stills = [
  "01-practice",
  "02-tutorial",
  "03-review",
  "04-result",
  "05-calculator",
  "06-styles",
];
const scenes = ["practice", "tutorial", "review", "retry", "calculator"];
const provenance = [];
const run = (bin, args) => {
  const r = spawnSync(bin, args, { encoding: "utf8", maxBuffer: 2 ** 20 });
  if (r.status !== 0) throw Error(`${bin}: ${r.stderr}`);
  return r.stdout;
};
for (const language of (
  process.env.NOIR_STORE_PREPARE_LANGUAGES || "zh-CN,en"
).split(",")) {
  const target = path.join(studio, "public/media", platform, language);
  mkdirSync(target, { recursive: true });
  plan[platform] ??= {};
  plan[platform][language] ??= {};
  for (const id of stills) {
    const preferred = sourcePath(`${language}--${id}-detail.png`);
    const source = existsSync(preferred)
      ? preferred
      : sourcePath(`${language}--${id}.png`);
    if (!existsSync(source))
      throw Error(`Missing actual native screenshot: ${source}`);
    copyFileSync(source, path.join(target, `${id}.png`));
    plan[platform][language][id] = `media/${platform}/${language}/${id}.png`;
    provenance.push({
      kind: "native-screenshot",
      source,
      output: plan[platform][language][id],
    });
  }
  if (platform !== "ipad")
    for (const id of scenes) {
      const source = sourcePath(path.join(language, `${id}.mp4`));
      const duration = Number(
        run("ffprobe", [
          "-v",
          "error",
          "-show_entries",
          "format=duration",
          "-of",
          "default=nw=1:nk=1",
          source,
        ]).trim(),
      );
      const start = id === "calculator" ? 0.6 : Math.max(0.2, duration - 7.4);
      const destination = path.join(target, `${id}.mp4`);
      const size = platform === "ios" ? "886:1920" : "1080:2400";
      run("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        String(start),
        "-i",
        source,
        "-vf",
        `fps=30,scale=${size}:force_original_aspect_ratio=decrease,pad=${size}:(ow-iw)/2:(oh-ih)/2:color=0x0b1017,setsar=1,tpad=stop_mode=clone:stop_duration=7`,
        "-t",
        "6.4",
        "-an",
        "-c:v",
        "libx264",
        "-threads",
        "2",
        "-preset",
        "fast",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        destination,
      ]);
      plan[platform][language][id] = `media/${platform}/${language}/${id}.mp4`;
      provenance.push({
        kind: "native-recording",
        source,
        sourceDuration: duration,
        sourceStart: start,
        output: plan[platform][language][id],
        duration: 6.4,
        retiming: false,
        tailFreezeIfNeeded: true,
      });
    }
}
plan.ready = ["ios", "android", "ipad"].every((p) =>
  ["en", "zh-CN"].every((l) => plan[p]?.[l]?.["06-styles"]),
);
writeFileSync(planFile, JSON.stringify(plan, null, 2) + "\n");
writeFileSync(
  path.join(raw, "edit-provenance.json"),
  JSON.stringify(provenance, null, 2) + "\n",
);
console.log(
  `Prepared verified ${platform} captures; complete media plan: ${plan.ready}`,
);
