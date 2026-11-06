import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  ),
  raw = path.join(root, ".artifacts/store-media-v6/raw");
const actionText = {
  fold: /^弃牌/,
  check: /^过牌/,
  call: /^跟注/,
  raise: /下注|加注|开池|全下/,
};
export function filmSource(locale) {
  const candidates =
    locale === "es"
      ? ["ios-es-final", "ios-revisions", "ios"]
      : ["pt", "de", "ru"].includes(locale)
        ? ["ios-revisions", ...(locale === "ru" ? ["ios-ru"] : []), "ios"]
        : ["ios"];
  for (const folder of candidates) {
    const dir = path.join(raw, folder),
      file = path.join(dir, "capture-evidence-v2.json");
    if (!fs.existsSync(file)) continue;
    const e = JSON.parse(fs.readFileSync(file)).find(
      (e) => e.locale === locale,
    );
    if (!e) continue;
    const r = e.replay,
      c = r.correction;
    if (
      !c?.concreteAdvice ||
      !actionText[c.action]?.test(c.executedAction?.text || "")
    )
      continue;
    if (c.executedAction.street !== [0, 3, 4, 5].indexOf(c.boardCount))
      continue;
    if (c.action === "raise" && c.amount !== c.executedAction.bet) continue;
    if (
      JSON.stringify(r.originalHole) !== JSON.stringify(r.retriedHole) ||
      !e.liveActivity.changed
    )
      continue;
    if (
      ![
        "tutorial",
        "practice",
        "review",
        "retry",
        "records",
        "calculator",
      ].every((id) => fs.existsSync(path.join(dir, locale, id + ".mp4")))
    )
      continue;
    return { dir, evidence: e };
  }
  throw Error(
    "A complete actual capture with a matching correction is required for " +
      locale,
  );
}
