// Local-only opponent prose audit. Production policy and settled ledgers stay
// intact; refreshing wording never replays a new action or regrades the hero.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { loadPhase3Source, playPhase3Hand } from './audit-review-phase3.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const output = path.resolve(args.output || '.artifacts/opponent-observer-audit');
assert(output.startsWith(path.resolve('.artifacts') + path.sep), 'Raw hands remain local');
fs.mkdirSync(output, { recursive: true });
const api = await loadPhase3Source(args.source || '.');
const seed = Number(args.seed || 20261026);
const hands = Number(args.hands || 4000);
assert(Number.isInteger(hands) && hands >= 1 && hands <= 4000);
const summary = (r) => r.paragraphs.slice(r.paragraphs.indexOf('复盘分析总结') + 1).join('');
// Screening candidates, not a semantic quality score. Inspect every remaining
// hit; price facts such as "需要再补" and binding rules are deliberately allowed.
const advice =
  /应(?:该|当)?(?:比较|避免|继续|收紧)|需要(?:结合|重新|比较|按)|仍需(?:结合|另作|重新|控制)|(?:再遇|面对).*?时[，,].*?(?:要|可重新|按价格)|不能只(?:凭|因|因为)|还要(?:核对|结合|确认)|下一街.*?(?:要看|重新|要另)|后续.*?(?:要按|仍要)|当时可以直接过牌|也可结合底牌和对手范围比较|(?:建议|提醒|下次)/u;
const report = {
  seed,
  sourceDigest: api.fingerprint.digest,
  hands: 0,
  records: 0,
  hits: [],
  coverage: {},
  reasonAction: {},
  status: 'running',
};
const count = (key) => (report.coverage[key] = (report.coverage[key] || 0) + 1);
for (let i = 0; i < hands; i++) {
  const file = path.join(output, `hand-${String(i).padStart(4, '0')}.json.gz`);
  let data;
  if (args.refresh) {
    data = JSON.parse(gunzipSync(fs.readFileSync(file)));
  } else {
    assert(!fs.existsSync(file), 'Never overwrite raw simulation evidence');
    const played = playPhase3Hand(api, i, { seed });
    const input = api.review.createReviewInput(played.game);
    data = {
      configuration: played.configuration,
      deckSeed: played.deckSeed,
      policySeed: played.policySeed,
      initialDeal: played.initialDeal,
      game: played.game,
      policyLog: played.policyLog,
      transitions: played.transitions,
      identities: input.players,
      records: input.opponents,
      before: [],
    };
  }
  count(data.configuration.scene ? 'targeted' : 'natural-deal');
  const narratives = data.records.map((record, index) => {
    const explanation = api.opponent.explainOpponent(record, data.identities);
    const text = summary(explanation);
    report.records++;
    count(`action:${record.action}`);
    count(`street:${record.trace.view.street}`);
    count(`style:${record.trace.profile}`);
    const pair = `${record.trace.reason}:${record.action}`;
    report.reasonAction[pair] = (report.reasonAction[pair] || 0) + 1;
    if (advice.test(text))
      report.hits.push({
        hand: i,
        index,
        action: record.action,
        reason: record.trace.reason,
        text,
      });
    assert(!/undefined|NaN|\[object Object\]/u.test(text));
    assert(text.includes('选择'), 'Actual action remains visible');
    return explanation;
  });
  count(`seats:${data.configuration.players}`);
  count(`difficulty:${data.configuration.difficulty}`);
  count(`emotion:${data.configuration.emotionMode}`);
  if (args.refresh) {
    data.after = narratives;
    data.presentationDigest = api.fingerprint.digest;
  } else {
    data.before = narratives;
    data.simulationDigest = api.fingerprint.digest;
  }
  fs.writeFileSync(file, gzipSync(JSON.stringify(data)));
  report.hands++;
  if ((i + 1) % 100 === 0) {
    fs.writeFileSync(
      path.join(output, args.refresh ? 'after-progress.json' : 'before-progress.json'),
      JSON.stringify(report),
    );
    console.log(
      `${args.refresh ? 'refresh' : 'simulate'} ${i + 1}/${hands}, ${report.records} opponent explanations, ${report.hits.length} screening hits`,
    );
  }
}
report.status = 'complete';
fs.writeFileSync(
  path.join(output, args.refresh ? 'after-report.json' : 'before-report.json'),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    hands: report.hands,
    records: report.records,
    screeningHits: report.hits.length,
    sourceDigest: report.sourceDigest,
  }),
);
