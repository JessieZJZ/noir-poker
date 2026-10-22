import { reviewCardCache } from './card-cache.js';
import { bigBlindOf } from '../engine/stakes.js';
import {
  newGame,
  deckOfCards,
  act,
  advanceStreet,
  botDecision,
  partitionPots,
  evaluate,
  compare,
} from '../engine/poker.js';
import { getBotProfile, freshBotMood, botBoardFeatures } from '../engine/bot-profiles.js';
import { seedRandom, snapshotSeed } from './equity.js';
import { preparePublicRanges } from '../engine/public-ranges.js';
import { createPublicPairSampler, samplePublicPair } from '../engine/public-equity.js';
import { isChipAmount, legalRaiseTo, chipUnitOf } from '../engine/bet-sizing.js';
const copy = (v) => JSON.parse(JSON.stringify(v));
export function candidateActions(s, alternatives = []) {
  const candidates = [
    { action: 'fold', amount: 0 },
    { action: s.legal.canCheck ? 'check' : 'call', amount: s.legal.callAmount },
  ];
  if (s.legal.canRaise) {
    const targets =
      s.street === 0 && s.currentBet <= bigBlindOf(s)
        ? [2 * bigBlindOf(s), 3 * bigBlindOf(s)]
        : s.currentBet > 0
          ? [s.currentBet * 2.5, s.currentBet * 3.5]
          : [s.pot * 0.33, s.pot * 0.65];
    for (const value of targets)
      candidates.push({
        action: 'raise',
        amount: legalRaiseTo(value, s.legal),
      });
  }
  candidates.push({ action: s.action, amount: s.amount }, ...alternatives.filter(Boolean));
  return [
    ...new Map(
      candidates
        .filter(
          (a) =>
            ['fold', 'check', 'call', 'raise'].includes(a.action) &&
            (a.action !== 'raise' ||
              (s.legal.canRaise &&
                isChipAmount(a.amount, chipUnitOf(s)) &&
                a.amount >= s.legal.minRaiseTo &&
                a.amount <= s.legal.maxRaiseTo)) &&
            (a.action !== 'check' || s.legal.canCheck),
        )
        .map((a) => [
          a.action + (a.action === 'raise' ? a.amount : ''),
          {
            action: a.action,
            amount: a.action === 'raise' ? a.amount : a.action === 'call' ? s.legal.callAmount : 0,
          },
        ]),
    ).values(),
  ].slice(0, 7);
}
function sampledDeal(s, rng, weighted, ranges, cache, firstPairSampler) {
  const known = new Set([...s.hole, ...s.board].map((c) => c.key));
  const pool = deckOfCards().filter((c) => !known.has(c.key));
  const holes = new Map([[0, copy(s.hole)]]);
  for (const p of [
    ...s.players.filter((p) => p.id && !p.folded),
    ...s.players.filter((p) => p.id && p.folded),
  ]) {
    let pair;
    if (weighted && !p.folded) {
      pair =
        firstPairSampler && holes.size === 1
          ? firstPairSampler({ random: rng })
          : samplePublicPair(pool, ranges.get(p.id), {
              random: rng,
              evaluate,
              features: botBoardFeatures,
              compare,
              cache,
            });
    } else {
      const a = Math.floor(rng() * pool.length);
      let b = Math.floor(rng() * (pool.length - 1));
      if (b >= a) b++;
      pair = [pool[a], pool[b]];
    }
    holes.set(p.id, pair);
    for (const card of pair)
      pool.splice(
        pool.findIndex((candidate) => candidate.key === card.key),
        1,
      );
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return { holes, deck: pool };
}
function resume(s, deal) {
  const g = newGame(s.players.length, {
    smallBlind: s.smallBlind ?? bigBlindOf(s) / 2,
    bigBlind: bigBlindOf(s),
    startingStack: bigBlindOf(s) * 100,
    chipUnit: chipUnitOf(s),
  });
  const button = s.players.find((p) => p.position === 'BTN')?.id;
  Object.assign(g, {
    phase: 'playing',
    hand: s.hand,
    street: s.street,
    actor: 0,
    dealer: s.dealer ?? button ?? 0,
    currentBet: s.currentBet,
    minRaise: s.minRaise,
    pending: [...s.pending],
    board: copy(s.board),
    deck: copy(deal.deck),
    history: copy(s.history),
    decisions: [],
    botDecisions: [],
    logs: [],
    emotionMode: s.emotionMode || 'off',
    difficulty: ['easy', 'normal', 'hard'].includes(s.difficulty) ? s.difficulty : 'normal',
  });
  g.positions = s.players.map((p) => p.position || '');
  for (const p of s.players) {
    const mood = freshBotMood();
    mood.kind = p.botMoodKind || 'steady';
    Object.assign(g.players[p.id], {
      stack: p.stack,
      bet: p.bet,
      total: p.total,
      folded: p.folded,
      allin: p.allin,
      actedTo: p.actedTo ?? null,
      checked: p.checked || false,
      out: !!p.out,
      hole: p.out ? [] : copy(deal.holes.get(p.id)),
      botProfile: getBotProfile(p.botProfile).id,
      botMood: mood,
    });
  }
  return g;
}
// A folded hero cannot win a pot. With no unmatched contribution to refund,
// their final stack is fixed even if the other players keep betting. Ask the
// rule engine for refunds; a folded hero with an unmatched bet must continue.
function hasFinalFold(g) {
  return g.players[0].folded && !partitionPots(g).refunds.some((refund) => refund.id === 0);
}
// Sampled private information only: original opponent holes, recorded traces,
// future deck and outcome never enter these counterfactual hands.
export function compareCandidateActions(s, alternatives = [], { trials = 40 } = {}) {
  if (!Number.isInteger(trials) || trials < 2) throw Error('模拟次数至少为 2。');
  const candidates = candidateActions(s, alternatives);
  const policyDifficulties = new Set();
  const rows = candidates.map((action) => ({ action, scenarios: [] }));
  const actualIndex = candidates.findIndex(
    (a) => a.action === s.action && (a.action !== 'raise' || a.amount === s.amount),
  );
  if (actualIndex < 0) throw Error('快照中的实际行动不合法，无法比较。');
  // Conservative paired comparisons across at most seven candidates. These
  // approximate bounds cover sampling, not range or continuation-policy error.
  const comparisonCritical = trials >= 30 ? 3.5 : trials >= 12 ? 5 : 20;
  for (const weighted of [false, true]) {
    const rng = seedRandom(snapshotSeed(s) + (weighted ? 11071 : 2003));
    const ranges = new Map(preparePublicRanges(s).map((range) => [range.id, range]));
    // Initial range sampling uses the same visible board on every trial.
    // Reuse its pure candidate scores, while every deal remains newly sampled.
    const samplingCache = reviewCardCache();
    // Only the first live opponent has the same available pool across trials.
    // Keep this range proposal local to this snapshot, outside the score cache.
    const firstOpponent = s.players.find((p) => p.id && !p.folded),
      known = new Set([...s.hole, ...s.board].map((card) => card.key)),
      firstPairSampler =
        weighted && firstOpponent
          ? createPublicPairSampler(
              deckOfCards().filter((card) => !known.has(card.key)),
              ranges.get(firstOpponent.id),
              { evaluate, features: botBoardFeatures, compare, cache: samplingCache },
            )
          : null;
    const values = rows.map(() => []),
      immediate = rows.map(() => 0),
      won = rows.map(() => 0);
    for (let i = 0; i < trials; i++) {
      const deal = sampledDeal(s, rng, weighted, ranges, samplingCache, firstPairSampler),
        policySeed = Math.floor(rng() * 4294967295);
      // Candidates share a hypothetical deal. Reuse only pure board/pair
      // evaluation; never ranges, decisions or random state. Drop it before
      // the next sampled deal rather than retaining any live-hand state.
      const allInCache = new Map();
      for (let c = 0; c < candidates.length; c++) {
        const g = resume(s, deal),
          policy = seedRandom(policySeed);
        act(g, 0, candidates[c].action, candidates[c].amount);
        let actions = 0;
        while (g.phase !== 'done') {
          if (hasFinalFold(g)) break;
          if (++actions > 400) throw Error('候选行动模拟未能结束。');
          if (g.phase === 'between') advanceStreet(g);
          else {
            const d = botDecision(g, policy, { trials: 8, allInCache });
            policyDifficulties.add(d.trace.difficulty);
            act(g, g.actor, d.action, d.amount);
          }
        }
        values[c].push(g.players[0].stack - s.stack);
        if (g.winners.some((w) => w.id === 0)) won[c]++;
        if (
          g.winners.some((w) => w.id === 0) &&
          !g.showdown &&
          g.street === s.street &&
          candidates[c].action === 'raise'
        )
          immediate[c]++;
      }
    }
    rows.forEach((r, c) => {
      const mean = values[c].reduce((n, v) => n + v, 0) / trials;
      const variance = values[c].reduce((n, v) => n + (v - mean) ** 2, 0) / (trials - 1);
      const differences = values[c].map((v, i) => v - values[actualIndex][i]),
        delta = differences.reduce((sum, v) => sum + v, 0) / trials,
        deltaVariance = differences.reduce((sum, v) => sum + (v - delta) ** 2, 0) / (trials - 1),
        deltaMargin = comparisonCritical * Math.sqrt(deltaVariance / trials);
      // Diversity is only a conservative gate: it does not guarantee coverage
      // of rare losses that these samples have not observed.
      const resolution = Math.max(0.2 * bigBlindOf(s), Math.round(s.stack * 0.01));
      const buckets = new Map();
      for (const value of differences) {
        const bucket = Math.round(value / resolution);
        buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
      }
      const ordered = [...differences].sort((a, b) => a - b);
      const informative =
        trials >= 30 &&
        buckets.size >= 3 &&
        Math.max(...buckets.values()) / trials <= 0.8 &&
        ordered[Math.floor((trials - 1) * 0.9)] - ordered[Math.floor((trials - 1) * 0.1)] >
          resolution;
      r.scenarios.push({
        name: weighted ? '公开行动加权范围' : '随机范围',
        ev: mean,
        margin: 1.96 * Math.sqrt(variance / trials),
        immediateFoldWin: immediate[c] / trials,
        winRate: won[c] / trials,
        vsActual: {
          delta,
          margin: deltaMargin,
          lower: delta - deltaMargin,
          upper: delta + deltaMargin,
          informative,
        },
      });
    });
  }
  const ranked = [...rows].sort(
    (a, b) => Math.min(...b.scenarios.map((v) => v.ev)) - Math.min(...a.scenarios.map((v) => v.ev)),
  );
  const best = ranked[0];
  const stable = ranked
    .slice(1)
    .every((other) =>
      best.scenarios.every(
        (v, i) => v.ev - v.margin > other.scenarios[i].ev + other.scenarios[i].margin,
      ),
    );
  return {
    rows,
    trials,
    policyTrials: 8,
    policyDifficulties: [...policyDifficulties].sort(),
    best: best.action,
    stable,
    comparisonReady: trials >= 30,
    comparisonCritical,
    method: 'sampled-engine-rollout',
    note: '从当时局面抽样未知牌，按公开风格继续打完；你后续采用均衡机器人策略，每次判断抽样 8 次。数值是此模拟策略的筹码净变化估计，已投入视为沉没成本，包含分池、退还与之后下注；误差为近似抽样误差，不覆盖范围／策略模型错误。不是 GTO 或真人最优 EV。',
  };
}
