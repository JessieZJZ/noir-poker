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
const [platform, arg] = process.argv.slice(2);
if (!["ios", "android", "ipad"].includes(platform) || !arg)
  throw Error("Use ios|android|ipad RAW_DIRECTORY");
const raw = path.resolve(arg),
  report = JSON.parse(readFileSync(path.join(raw, "report.json"), "utf8"));
if (!["passed", "captured"].includes(report.status))
  throw Error("A successful real capture report is required");
if (process.env.NOIR_STORE_EN_REPAIR) {
  const repairReport = JSON.parse(
    readFileSync(
      path.join(path.resolve(process.env.NOIR_STORE_EN_REPAIR), "report.json"),
      "utf8",
    ),
  );
  if (
    !["passed", "captured"].includes(repairReport.status) ||
    repairReport.build.sourceDigest !== report.build.sourceDigest
  )
    throw Error(
      "English repair must be a successful capture of the same bundled source",
    );
}
const board = JSON.parse(
  readFileSync(path.join(studio, "storyboard.json"), "utf8"),
);
const planFile = path.join(studio, "src/media-plan.json"),
  plan = JSON.parse(readFileSync(planFile, "utf8"));
const run = (bin, args) => {
  const r = spawnSync(bin, args, { encoding: "utf8", maxBuffer: 4e6 });
  if (r.status !== 0) throw Error(r.stderr || String(r.error));
  return r.stdout;
};
// Detect when the public board visibly clears, not a delayed driver return.
const boardClearedAt = (source, requested, fallback) => {
  const r = spawnSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      source,
      "-vf",
      "fps=10,crop=iw*0.55:ih*0.18:iw*0.225:ih*0.42,scale=64:64",
      "-pix_fmt",
      "gray",
      "-f",
      "rawvideo",
      "-",
    ],
    { maxBuffer: 12e6 },
  );
  if (r.status !== 0) throw Error(r.stderr.toString());
  const counts = [];
  for (let i = 0; i + 4096 <= r.stdout.length; i += 4096) {
    let n = 0;
    for (const x of r.stdout.subarray(i, i + 4096)) if (x > 180) n++;
    counts.push(n);
  }
  const baseline = counts.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
  for (let i = Math.floor(requested * 10); i < counts.length - 1; i++)
    if (
      baseline > 10 &&
      counts[i] < baseline * 0.42 &&
      counts[i + 1] < baseline * 0.42
    )
      return i / 10;
  return fallback;
};
const provenance = [];
for (const language of ["en", "zh-CN"]) {
  const dest = path.join(studio, "public/media", platform, language);
  mkdirSync(dest, { recursive: true });
  plan[platform] ??= {};
  plan[platform][language] ??= {};
  for (const [target, candidates] of Object.entries({
    "01-practice": ["01-practice"],
    "02-tutorial": ["02-tutorial"],
    "03-review": ["03-review-detail"],
    "04-result": ["04-retry"],
    "05-calculator": ["05-calculator"],
    "06-styles": ["06-styles"],
    "07-records": ["07-records"],
    "07-record-detail": ["07-record-detail"],
  })) {
    const localRaw =
      language === "en" && process.env.NOIR_STORE_EN_REPAIR
        ? path.resolve(process.env.NOIR_STORE_EN_REPAIR)
        : raw;
    const source = path.join(localRaw, `${language}--${candidates[0]}.png`);
    if (!existsSync(source)) throw Error("Missing " + source);
    copyFileSync(source, path.join(dest, target + ".png"));
    plan[platform][language][target] =
      `media/${platform}/${language}/${target}.png`;
    provenance.push({
      kind: "actual-native-screenshot",
      source,
      output: plan[platform][language][target],
    });
  }
  if (platform === "ipad") continue;
  const languageRaw =
    language === "en" && process.env.NOIR_STORE_EN_REPAIR
      ? path.resolve(process.env.NOIR_STORE_EN_REPAIR)
      : raw;
  const events = JSON.parse(
    readFileSync(
      path.join(languageRaw, `${language}--edit-events.json`),
      "utf8",
    ),
  );
  for (const scene of board.scenes) {
    const source = path.join(languageRaw, language, scene.id + ".mp4");
    const sourceDuration = Number(
      run("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "csv=p=0",
        source,
      ]).trim(),
    );
    const es = events[scene.id]?.events || [];
    const at = (name) => {
      const e = es.find((x) => x.name === name);
      if (!e) throw Error(`Missing ${language}/${scene.id}/${name}`);
      return e.at;
    };
    let cuts;
    if (scene.id === "tutorial") {
      const t = at("tutorial-continue:done");
      cuts = [
        [Math.max(0.1, t - 1.3), 1.8],
        [t + 0.1, 2.8],
      ];
    }
    if (scene.id === "practice")
      cuts = [
        [Math.max(0.1, at("live-action:done") - 1.6), 2],
        [at("activity-visible") + 0.2, 3],
      ];
    if (scene.id === "review")
      cuts = [
        [Math.max(0.1, at("open-review:done") - 1.1), 1.6],
        [Math.max(at("open-review:done"), at("review-ready") - 0.2), 1.2],
        [at("reason-visible") + 0.15, 2.6],
      ];
    if (scene.id === "retry") {
      const cleared = boardClearedAt(
        source,
        at("start-replay"),
        at("start-replay:done"),
      );
      cuts = [
        [Math.max(0.1, cleared - 1.1), 0.8],
        [Math.max(0.1, cleared - 0.3), 1],
        [at("replay-dealt") - 0.1, 1.5],
        [at("different-decision:done") - 0.7, 2.2],
      ];
    }
    if (scene.id === "records")
      cuts = [
        [Math.max(0.1, at("open-records:done") - 0.8), 1.2],
        [at("records-list-visible") + 0.4, 1.6],
        [at("open-record-detail:done") - 0.5, 2.3],
      ];
    if (scene.id === "calculator")
      cuts = [
        [0.3, 1.5],
        [Math.max(0.3, sourceDuration - 4.2), 3.7],
      ];
    const size = platform === "ios" ? "1290:2796" : "1080:2400";
    const inputs = cuts.flatMap(([start, duration]) => [
      "-ss",
      String(start),
      "-t",
      String(duration),
      "-i",
      source,
    ]);
    const filters = cuts.map(
      ([, d], i) =>
        `[${i}:v]fps=30,scale=${size}:force_original_aspect_ratio=decrease,pad=${size}:(ow-iw)/2:(oh-ih)/2:color=0x0b1017,setsar=1,tpad=stop_mode=clone:stop_duration=3,trim=duration=${d},setpts=PTS-STARTPTS[v${i}]`,
    );
    filters.push(
      cuts.map((_, i) => `[v${i}]`).join("") +
        `concat=n=${cuts.length}:v=1:a=0[out]`,
    );
    const result = path.join(dest, scene.id + ".mp4");
    run("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      ...inputs,
      "-filter_complex",
      filters.join(";"),
      "-map",
      "[out]",
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
      result,
    ]);
    plan[platform][language][scene.id] =
      `media/${platform}/${language}/${scene.id}.mp4`;
    provenance.push({
      kind: "real-recording-editorial-cuts",
      source,
      sourceDuration,
      cuts: cuts.map(([start, duration]) => ({ start, duration })),
      output: plan[platform][language][scene.id],
      retiming: false,
      description:
        "Remove waiting time; retain actual visible button transitions and newly rendered results. No UI or state reconstruction.",
      events: es,
    });
  }
}
plan.revision = 2;
plan.captureRevisions ??= {};
plan.captureRevisions[platform] = {
  sourceDigest: report.build.sourceDigest,
  sourceCommit: report.build.sourceCommit,
  productCommit: "94e56b1ef009f0729508491e5f2155fd37d2bf99",
  actualNative: true,
};
plan.ready = ["ios", "android", "ipad"].every(
  (p) => plan.captureRevisions[p]?.actualNative,
);
writeFileSync(planFile, JSON.stringify(plan, null, 2) + "\n");
writeFileSync(
  path.join(raw, "edit-provenance-v2.json"),
  JSON.stringify(provenance, null, 2) + "\n",
);
console.log(`Prepared ${platform}; all V2 captures ready: ${plan.ready}`);
