// Offline review corpus. No fixtures or diagnostics enter a client bundle.
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import {
  newGame,
  startHand,
  act,
  advanceStreet,
  botDecision,
  legalActions,
  applyBotSettings,
} from '../src/engine/poker.js';
import { createReviewInput, analyzeDecision } from '../src/review/analysis.js';
import { explainOpponent } from '../src/review/opponents.js';
import { seedRandom } from '../src/review/equity.js';
import { coachDecision } from '../src/review/coaching.js';
import { decisionContext } from '../src/review/context.js';
import { handMatchups, valuePlan } from '../src/review/matchups.js';
import { exhaustsStack } from '../src/review/presentation.js';
const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => arg.replace(/^--/, '').split('=')),
);
const hands = Number(args.hands || 1000),
  seed = Number(args.seed || 20261020);
if (!Number.isInteger(hands) || hands < 1 || hands > 2000) throw Error('hands must be 1–2000');
const trials = Number(args.trials || 600),
  rolloutTrials = Number(args.rollouts || 12);
const sourceFiles = [
  'src/engine/action-labels.js',
  ...readdirSync('src/review')
    .filter((f) => f.endsWith('.js'))
    .map((f) => 'src/review/' + f),
];
const sourceDigest = createHash('sha256')
  .update(sourceFiles.map((f) => f + readFileSync(f, 'utf8')).join('\n'))
  .digest('hex');
const start = Number(args.start || 0),
  end = Number(args.end || hands);
const manifestFile = args.start !== undefined ? `manifest-${start}.json` : 'manifest.json';
const output = path.resolve(args.output || '.artifacts/review-audit');
mkdirSync(output, { recursive: true });
const rng = seedRandom(seed),
  deckRng = seedRandom(seed + 1),
  oldRandom = Math.random;
const profiles = ['peter', 'abao', 'viktor', 'jungleman', 'dwan', 'tan', 'koon', 'balanced'];
const manifest = {
  seed,
  hands: end - start,
  start,
  end,
  trials,
  rolloutTrials,
  sourceDigest,
  source: 'real engine legal actions and before-action snapshots',
  counts: {},
  issues: [],
  files: [],
};
const count = (key) => (manifest.counts[key] = (manifest.counts[key] || 0) + 1);
const summary = (c) => c.paragraphs.slice(c.paragraphs.indexOf('复盘分析总结') + 1).join('');
// Re-render saved public analyses after wording-only repairs. Numeric estimates,
// candidate simulations and the original complete action history stay intact.
if (args.refresh) {
  for (const file of readdirSync(output)
    .filter((f) => /^hand-\d{4}\.json$/.test(f))
    .sort()) {
    const data = JSON.parse(readFileSync(path.join(output, file), 'utf8'));
    for (const entry of data.entries) {
      if (entry.perspective === 'hero' && !args['nouns-only']) {
        if (!entry.analysis) throw Error('Refresh requires a saved analysis: ' + file);
        let r = entry.analysis;
        const s = entry.snapshot,
          current = decisionContext(s);
        if (
          r.context.handClass !== current.handClass ||
          (!s.street &&
            s.action === 'raise' &&
            current.preflopRaises >= 3 &&
            !s.hole.every((card) => card.rank >= 13 && card.rank === s.hole[0].rank))
        ) {
          r = analyzeDecision(s, { trials, rolloutTrials });
          entry.analysis = r;
          entry.review.metrics = r.metrics;
          entry.review.code = r.code;
        }
        r.context = current;
        r.context.matchups = handMatchups(s, r.context);
        r.context.valuePlan = valuePlan(s, r.context, r.context.matchups);
        r.coaching = coachDecision(s, r);
        Object.assign(entry.review, {
          label: r.coaching.label,
          suggestion: r.coaching.suggestion,
          paragraphs: r.coaching.paragraphs,
          summary: summary(r.coaching),
          evidence: r.evidence,
          board: r.context.matchups.boardParts,
          strength: r.context.matchups.strengthParts,
        });
      } else if (
        entry.perspective === 'opponent' &&
        (!args['nouns-only'] || /(?:口袋|超对|顶对|非顶对) [^，。]*，/.test(entry.review.summary))
      ) {
        const r = explainOpponent(entry.record, data.roster);
        entry.review = { title: r.title, summary: summary(r), paragraphs: r.paragraphs };
      }
    }
    for (const entry of data.entries.filter((e) => e.perspective === 'hero')) {
      for (const route of Object.values(entry.analysis.routes)) {
        if (entry.snapshot.street === 3 && route?.condition?.includes('也让听牌付费'))
          route.condition = entry.analysis.context.valuePlan.reason;
      }
    }
    data.presentationDigest = sourceDigest;
    writeFileSync(path.join(output, file), JSON.stringify(data, null, 2));
  }
  console.log(JSON.stringify({ refreshed: output, presentationDigest: sourceDigest }));
  process.exit(0);
}
try {
  Math.random = deckRng;
  for (let h = 0; h < end; h++) {
    const players = 5 + (h % 5),
      smallBlind = [25, 100, 10000][h % 3];
    const game = newGame(players, {
      smallBlind,
      bigBlind: smallBlind * 2,
      startingStack: smallBlind * 200,
      chipUnit: smallBlind,
    });
    game.dealer = h % players;
    game.difficulty = ['easy', 'normal', 'hard'][h % 3];
    applyBotSettings(game, {
      emotionMode: 'off',
      assignments: Object.fromEntries(
        game.players.slice(1).map((p) => [p.id, profiles[(p.id + h) % profiles.length]]),
      ),
    });
    startHand(game);
    const initial = game.players.reduce((sum, p) => sum + p.stack + p.total, 0);
    let moves = 0;
    while (game.phase !== 'done') {
      if (++moves > 500) throw Error('Unfinished hand');
      if (game.phase === 'between') {
        advanceStreet(game);
        continue;
      }
      const id = game.actor,
        legal = legalActions(game);
      let decision = botDecision(game, rng, { trials: 8 });
      // Three legal hero policies broaden the corpus beyond the bot baseline.
      if (id === 0 && h % 4 === 1) decision = { action: legal.canCheck ? 'check' : 'call' };
      if (id === 0 && h % 4 === 2 && legal.canRaise)
        decision = { action: 'raise', amount: rng() < 0.35 ? legal.maxRaiseTo : legal.minRaiseTo };
      if (id === 0 && h % 4 === 3 && !legal.canCheck && rng() < 0.35) decision = { action: 'fold' };
      const record = id
        ? JSON.parse(
            JSON.stringify({
              id,
              name: game.players[id].name,
              hand: game.hand,
              sequence: game.history.length + 1,
              action: decision.action,
              amount: decision.amount,
              trace: decision.trace,
            }),
          )
        : null;
      act(game, id, decision.action, decision.amount);
      if (record) game.botDecisions.push(record);
    }
    if (game.players.reduce((sum, p) => sum + p.stack, 0) !== initial)
      throw Error('Chip conservation failed');
    if (h < start) continue;
    const input = createReviewInput(game),
      entries = [];
    for (const s of input.decisions) {
      const review = analyzeDecision(s, { trials, rolloutTrials });
      const text = summary(review.coaching);
      const tags = [s.action, `street-${s.street}`, `players-${players}`];
      if (exhaustsStack(s)) tags.push('all-in');
      if (review.context.draw.outs) tags.push('draw');
      if (review.context.texture.paired) tags.push('paired-board');
      if (!s.street && s.hole.every((c) => c.rank === s.hole[0].rank) && s.hole[0].rank >= 13)
        tags.push('premium');
      for (const tag of tags) count(tag);
      const faults = [];
      if (/[；;]/.test(text)) faults.push('semicolon');
      if (/跟住|仍未弃牌|还留有?\s*0(?:[，。\s]|$)/.test(text)) faults.push('wording');
      if (
        exhaustsStack(s) &&
        /你在翻后有位置|你需要重新决定是否继续|下一街的投入还要另算/.test(text)
      )
        faults.push('all-in-future-choice');
      if (faults.length) manifest.issues.push({ hand: h, index: s.index, faults });
      entries.push({
        perspective: 'hero',
        analysis: review,
        tags,
        snapshot: s,
        review: {
          label: review.coaching.label,
          suggestion: review.coaching.suggestion,
          paragraphs: review.coaching.paragraphs,
          summary: text,
          evidence: review.evidence,
          board: review.context.matchups.boardParts,
          strength: review.context.matchups.strengthParts,
          metrics: review.metrics,
          code: review.code,
        },
      });
    }
    for (const record of input.opponents) {
      const review = explainOpponent(record, input.players),
        text = summary(review);
      count('opponent');
      if (/[；;]/.test(text))
        manifest.issues.push({ hand: h, actor: record.name, faults: ['semicolon'] });
      entries.push({
        perspective: 'opponent',
        record,
        review: { title: review.title, summary: text, paragraphs: review.paragraphs },
      });
    }
    const file = `hand-${String(h).padStart(4, '0')}.json`;
    writeFileSync(
      path.join(output, file),
      JSON.stringify(
        {
          hand: h,
          analysisDigest: sourceDigest,
          players,
          roster: input.players,
          smallBlind,
          activity: input.activity,
          entries,
        },
        null,
        2,
      ),
    );
    manifest.files.push({ file, entries: entries.length });
    writeFileSync(path.join(output, manifestFile), JSON.stringify(manifest, null, 2));
    if ((h + 1) % 20 === 0)
      console.log(
        JSON.stringify({
          completed: h + 1,
          counts: manifest.counts,
          automaticIssues: manifest.issues.length,
        }),
      );
  }
} finally {
  Math.random = oldRandom;
}
console.log(
  JSON.stringify({ output, ...manifest.counts, automaticIssues: manifest.issues.length }),
);
