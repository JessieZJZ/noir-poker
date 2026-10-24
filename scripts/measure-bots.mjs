import { observedBotMetrics } from '../src/engine/bot-difficulty.js';
import { BOT_PROFILES } from '../src/engine/bot-profiles.js';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  newGame,
  startHand,
  botDecision,
  act,
  advanceStreet,
  applyBotSettings,
} from '../src/engine/poker.js';
const seeded = (seed) => {
  let n = seed;
  return () => (n = (Math.imul(n, 1664525) + 1013904223) >>> 0) / 4294967296;
};
const args = Object.fromEntries(process.argv.slice(2).map((v) => v.replace(/^--/, '').split('=')));
const count = Number(args.players || 6),
  hands = Number(args.hands || 250),
  difficulty = args.difficulty || 'normal',
  emotionMode = args.emotions || 'off',
  profile = args.profile || 'balanced',
  policySeed = Number(args.seed ?? 781),
  deckSeed = Number(args['deck-seed'] ?? 711);
const mixed = ['jett', 'rook', 'owen', 'balanced', 'jett', 'rook', 'owen', 'balanced'];
if (profile !== 'mixed' && !BOT_PROFILES.some((p) => p.id === profile))
  throw Error('Invalid profile');
if (!Number.isInteger(hands) || hands < 1 || hands > 10000) throw Error('hands must be 1–10000');
for (const seed of [policySeed, deckSeed])
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw Error('seed must be a uint32');
const random = seeded(policySeed),
  deckRandom = seeded(deckSeed),
  previousRandom = Math.random;
const g = newGame(count);
if (
  !['easy', 'normal', 'hard'].includes(difficulty) ||
  !['off', 'subtle', 'lively'].includes(emotionMode)
)
  throw Error('Invalid difficulty or emotions');
g.difficulty = difficulty;
const flops = {
  hands: 0,
  players: 0,
  threePlus: 0,
  fourPlus: 0,
  fourPlusActive: 0,
  distribution: {},
};
const preflopDecisions = {},
  strongResponses = {},
  foldsByReason = {};
const sourceHash = createHash('sha256');
for (const file of ['poker', 'bot-profiles', 'bot-style', 'public-equity', 'public-ranges'])
  sourceHash.update(readFileSync(new URL(`../src/engine/${file}.js`, import.meta.url)));
let preflopReraisedHands = 0;
applyBotSettings(g, {
  emotionMode,
  assignments: Object.fromEntries(
    Array.from({ length: count - 1 }, (_, i) => [
      i + 1,
      profile === 'mixed' ? mixed[i % mixed.length] : profile,
    ]),
  ),
});
try {
  Math.random = deckRandom;
  for (let h = 0; h < hands; h++) {
    g.players.forEach((p) => (p.stack = g.bigBlind * 100));
    startHand(g);
    let actions = 0;
    while (g.phase !== 'done') {
      if (++actions > 1000) throw Error('unfinished hand');
      if (g.phase === 'between') {
        if (g.street === 0) {
          const entrants = g.players.filter((p) => !p.folded).length;
          flops.hands++;
          flops.players += entrants;
          if (entrants >= 3) flops.threePlus++;
          if (entrants >= 4) flops.fourPlus++;
          if (g.players.filter((p) => !p.folded && !p.allin).length >= 4) flops.fourPlusActive++;
          flops.distribution[entrants] = (flops.distribution[entrants] || 0) + 1;
        }
        advanceStreet(g);
      } else {
        const d = botDecision(g, random);
        if (g.street === 0 && g.actor !== 0) {
          preflopDecisions[d.action] = (preflopDecisions[d.action] || 0) + 1;
          if (d.action === 'fold')
            foldsByReason[d.trace.reason] = (foldsByReason[d.trace.reason] || 0) + 1;
          const [high, low] = d.trace.view.hole.map((c) => c.rank).sort((a, b) => b - a);
          if (
            d.trace.view.legal.callAmount > 0 &&
            ((high === low && high >= 8) || (high === 14 && low >= 12))
          ) {
            const rank = '23456789TJQKA'[high - 2];
            const type = high === low ? rank + rank : low === 13 ? 'AK' : 'AQ';
            const raises = g.history.filter((a) => a.street === 0 && a.action === 'raise').length;
            const price = d.trace.allIn
              ? 'commitment'
              : `${raises === 0 ? 'unraised' : raises === 1 ? 'single-open' : 'reraise'}/${g.currentBet <= 4 * g.bigBlind ? 'up-to-4BB' : 'over-4BB'}`;
            const bucket = (strongResponses[`${type}/${price}`] ||= {
              decisions: 0,
              folds: 0,
              calls: 0,
              raises: 0,
              checks: 0,
            });
            bucket.decisions++;
            bucket[`${d.action}s`]++;
          }
        }
        act(g, g.actor, d.action, d.amount);
        if (g.players.some((p) => p.stack < 0 || p.stack % g.chipUnit || p.total % g.chipUnit))
          throw Error('Invalid chip ledger');
      }
    }
    if (g.history.filter((a) => a.street === 0 && a.action === 'raise').length >= 2)
      preflopReraisedHands++;
    if (g.players.reduce((sum, p) => sum + p.stack, 0) !== count * g.bigBlind * 100)
      throw Error('Chip conservation failed');
  }
} finally {
  Math.random = previousRandom;
}
const total = g.players.slice(1).reduce((totals, p) => {
  for (const [key, value] of Object.entries(p.botStats)) totals[key] = (totals[key] || 0) + value;
  return totals;
}, {});
const metrics = observedBotMetrics(total);
console.log(
  JSON.stringify({
    profile,
    difficulty,
    emotionMode,
    metrics,
    players: count,
    hands,
    policySeed,
    deckSeed,
    policySourceDigest: sourceHash.digest('hex'),
    lineup: g.players.slice(1).map((p) => p.botProfile),
    preflopDecisions,
    foldsByReason,
    strongResponses,
    ...total,
    hands,
    samples: total.hands,
    vpipPercent: (100 * total.vpip) / total.hands,
    pfrPercent: (100 * total.pfr) / total.hands,
    flopHands: flops.hands,
    averageFlopPlayers: flops.hands ? flops.players / flops.hands : 0,
    threePlusFlopHands: flops.threePlus,
    threePlusFlopPercent: (100 * flops.threePlus) / hands,
    fourPlusFlopHands: flops.fourPlus,
    fourPlusFlopPercent: (100 * flops.fourPlus) / hands,
    fourPlusActiveFlopHands: flops.fourPlusActive,
    fourPlusActiveFlopPercent: (100 * flops.fourPlusActive) / hands,
    fourPlusAmongFlopsPercent: flops.hands ? (100 * flops.fourPlus) / flops.hands : 0,
    chipConservation: true,
    flopPlayerDistribution: flops.distribution,
    preflopReraisedHands,
    scenario:
      '100 BB each new hand, seeded deck, hero uses baseline policy; observed ratios with actual opportunity denominators',
  }),
);
