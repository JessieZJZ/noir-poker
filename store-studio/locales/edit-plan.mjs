import { filmSource } from "./sources.mjs";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
const root = process.cwd(),
  out = path.join(root, ".artifacts/store-media-v6/edit-plan.json");
const locales = ["zh-TW", "ja", "ko", "es", "it", "pt", "de", "fr", "ru"],
  scenes = ["tutorial", "practice", "review", "retry", "records"];
const plans = {};
for (const locale of locales) {
  const dir = filmSource(locale).dir,
    events = JSON.parse(
      fs.readFileSync(path.join(dir, locale + "--edit-events.json")),
    ),
    metrics = {};
  for (const s of scenes) {
    const file = path.join(dir, locale, s + ".mp4");
    const raw = execFileSync(
      "ffmpeg",
      [
        "-v",
        "error",
        "-i",
        file,
        "-vf",
        "scale=80:174,fps=30",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "gray",
        "-",
      ],
      { maxBuffer: 128 * 1024 * 1024 },
    );
    const frame = 80 * 174,
      diff = [0];
    for (let i = frame; i < raw.length; i += frame) {
      let sum = 0;
      for (let p = 0; p < frame; p++)
        sum += Math.abs(raw[i + p] - raw[i - frame + p]);
      diff.push(sum / frame);
    }
    metrics[s] = diff;
  }
  const event = (s, name) => {
    const e = events[s].events.find((e) => e.name === name);
    if (!e) throw Error(locale + " missing " + name);
    return e;
  };
  const peak = (s, a, b) => {
    const d = metrics[s],
      lo = Math.max(1, Math.round(a * 30)),
      hi = Math.min(d.length - 1, Math.round(b * 30));
    let n = lo;
    for (let i = lo + 1; i <= hi; i++) if (d[i] > d[n]) n = i;
    return { at: n / 30, delta: d[n] };
  };
  const touch = (s, name) => {
    const a = event(s, name),
      b = event(s, name + ":done");
    // Simulator recording can begin later than the command clock. Search the
    // earlier frames for these large, unambiguous page/deal transitions too.
    const transition = peak(
      s,
      a.at -
        (["start-replay", "open-record-detail"].includes(name) ? 1.8 : 0.3),
      b.at + 0.1,
    );
    if (
      (name === "start-replay" && transition.delta < 4) ||
      (name === "open-record-detail" && transition.delta < 10)
    )
      throw Error(locale + "/" + name + " needs a visible transition review");
    return {
      ...transition,
      name,
      target: a.target,
      requestedAt: a.at,
      driverDone: b.at,
    };
  };
  const actual = {
    review: touch("review", "open-review"),
    replay: touch("retry", "start-replay"),
    decision: touch("retry", "different-decision"),
    menu: touch("records", "open-menu"),
    history: touch("records", "open-records"),
    detail: touch("records", "open-record-detail"),
    tutorialAction: touch("tutorial", "tutorial-action"),
  };
  const feedMark = event("practice", "activity-visible").at,
    feed = peak("practice", feedMark - 0.6, feedMark + 0.3),
    reasonMark = event("review", "reason-visible").at,
    reason = peak(
      "review",
      event("review", "review-ready").at + 0.1,
      reasonMark + 0.1,
    );
  const cuts = {
    tutorial: [
      [0.5, 0.9],
      [event("tutorial", "tutorial-continue:done").at + 0.05, 1.0],
      [Math.max(0, actual.tutorialAction.at - 1.1), 2.7],
    ],
    practice: [
      [Math.max(0, feed.at - 1.65), 2.2],
      [feed.at + 0.55, 2.8],
    ],
    review: [
      [Math.max(0, actual.review.at - 1.3), 3],
      [reason.at + 0.1, 2.4],
    ],
    retry: [
      [Math.max(0, actual.replay.at - 1.3), 2.4333333333],
      [Math.max(0, actual.decision.at - 1.85), 3.0666666667],
    ],
    records: [
      [Math.max(0, actual.menu.at - 0.87), 2.6],
      [Math.max(0, actual.detail.at - 0.93), 2.5],
    ],
    calculator: [[0, 5.2]],
  };
  // Keep both the menu tap and its destination visible even on slower drivers.
  if (actual.history.at > cuts.records[0][0] + 2.6 - 0.35) {
    cuts.records = [
      [Math.max(0, actual.menu.at - 0.65), 1.3],
      [Math.max(0, actual.history.at - 0.5), 1.3],
      [Math.max(0, actual.detail.at - 0.8), 2.5],
    ];
  }
  const cues = {
    tutorial: [],
    practice: [],
    review: [],
    retry: [],
    records: [],
    calculator: [],
  };
  const add = (s, e) => {
    let acc = 0;
    for (const [start, duration] of cuts[s]) {
      if (e.at >= start && e.at < start + duration) {
        cues[s].push({
          name: e.name,
          frame: Math.round((acc + e.at - start) * 30),
          target: e.target,
        });
        break;
      }
      acc += duration;
    }
  };
  add("tutorial", actual.tutorialAction);
  add("review", actual.review);
  add("retry", actual.replay);
  add("retry", actual.decision);
  add("records", actual.menu);
  add("records", actual.history);
  add("records", actual.detail);
  plans[locale] = {
    source: dir,
    actual: { ...actual, feed, reason },
    cuts,
    cues,
  };
  console.log(
    locale,
    JSON.stringify(
      Object.fromEntries(
        Object.entries(actual).map(([k, v]) => [k, Number(v.at.toFixed(2))]),
      ),
    ),
  );
}
fs.writeFileSync(out, JSON.stringify(plans, null, 2));
