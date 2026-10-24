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
  potSize,
  seatPosition,
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
  deckSeed = Number(args['deck-seed'] ?? 711),
  // --targets=N seats 1..N with the measured profile and the rest with
  // --companions (default: the same profile); metrics cover target seats only.
  targets = Number(args.targets || count - 1),
  companions = args.companions || profile;
const isTarget = (id) => id >= 1 && id <= targets;
const mixed = ['jett', 'rook', 'owen', 'balanced', 'jett', 'rook', 'owen', 'balanced'];
if (profile !== 'mixed' && !BOT_PROFILES.some((p) => p.id === profile))
  throw Error('Invalid profile');
if (!BOT_PROFILES.some((p) => p.id === companions) && companions !== 'mixed')
  throw Error('Invalid companions');
if (!Number.isInteger(targets) || targets < 1 || targets > count - 1)
  throw Error('targets must be 1 to players − 1');
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
// First-in raises only: open size by position and limper count, separated by
// premium flag so a hand-strength sizing tell would be visible.
const opens = {};
const bb = (amount) => amount / g.bigBlind;
// Seat-level style profile of the measured bots (every seat except 0), from
// public actions only. Postflop sizing is the raise increment over pot + call.
const style = {
  unopened: 0,
  openLimps: 0,
  openRaises: 0,
  limpedPots: 0,
  overLimps: 0,
  isoRaises: 0,
  cbetChances: 0,
  cbets: 0,
  facedCbets: 0,
  foldsToCbet: 0,
  sawFlop: 0,
  showdowns: 0,
  postflopBets: 0,
  smallBets: 0,
  largeBets: 0,
  betFractionSum: 0,
  checkedThroughFlops: 0,
  heroFacedBot: 0,
  twoWay: 0,
  limpedFlops: 0,
  limpedCheckedThrough: 0,
  drawSpots: 0,
  drawRaises: 0,
  byPosition: {},
};
applyBotSettings(g, {
  emotionMode,
  assignments: Object.fromEntries(
    Array.from({ length: count - 1 }, (_, i) => {
      const id = isTarget(i + 1) ? profile : companions;
      return [i + 1, id === 'mixed' ? mixed[i % mixed.length] : id];
    }),
  ),
});
try {
  Math.random = deckRandom;
  for (let h = 0; h < hands; h++) {
    // Every hand restarts at 100 BB, so no seat stays eliminated between samples.
    g.over = null;
    g.players.forEach((p) => {
      p.stack = g.bigBlind * 100;
      p.out = false;
      p.place = null;
    });
    startHand(g);
    let actions = 0,
      flopSeats = [];
    while (g.phase !== 'done') {
      if (++actions > 1000) throw Error('unfinished hand');
      if (g.phase === 'between') {
        if (g.street === 0) {
          flopSeats = g.players.filter((p) => !p.folded).map((p) => p.id);
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
        if (g.street === 0 && isTarget(g.actor)) {
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
        if (isTarget(g.actor)) {
          const preflop = g.history.filter((a) => a.street === 0);
          if (g.street === 0 && !preflop.some((a) => a.action === 'raise')) {
            const limped = preflop.some((a) => a.action === 'call' && a.amount > 0);
            if (!limped && d.trace.view.position !== 'BB') {
              style.unopened++;
              if (d.action === 'call') style.openLimps++;
              if (d.action === 'raise') style.openRaises++;
            } else if (limped) {
              style.limpedPots++;
              if (d.action === 'call') style.overLimps++;
              if (d.action === 'raise') style.isoRaises++;
            }
          }
          if ((g.street === 1 || g.street === 2) && d.trace.view.features.draw) {
            style.drawSpots++;
            if (d.action === 'raise') style.drawRaises++;
          }
          if (g.street > 0 && d.action === 'raise') {
            const p = g.players[g.actor],
              toCall = g.currentBet - p.bet,
              fraction = (d.amount - g.currentBet) / Math.max(1, potSize(g) + toCall);
            style.postflopBets++;
            style.betFractionSum += fraction;
            if (fraction <= 0.45) style.smallBets++;
            if (fraction >= 0.85) style.largeBets++;
          }
        }
        const firstIn =
          isTarget(g.actor) &&
          g.street === 0 &&
          d.action === 'raise' &&
          !g.history.some((a) => a.street === 0 && a.action === 'raise');
        const openIndex = g.history.length,
          opener = g.actor;
        act(g, g.actor, d.action, d.amount);
        if (firstIn) {
          const limpers = g.history
            .slice(0, openIndex)
            .filter((a) => a.street === 0 && a.action === 'call').length;
          const key = `${d.trace.view.position}/${limpers}L`;
          const bucket = (opens[key] ||= {
            opens: 0,
            sizesBB: {},
            premiumBB: 0,
            premiumOpens: 0,
            otherBB: 0,
            otherOpens: 0,
            pending: [],
          });
          const size = bb(d.amount);
          bucket.opens++;
          bucket.sizesBB[size] = (bucket.sizesBB[size] || 0) + 1;
          if (d.trace.premium) (bucket.premiumOpens++, (bucket.premiumBB += size));
          else (bucket.otherOpens++, (bucket.otherBB += size));
          bucket.pending.push({ openIndex, opener });
        }
        if (g.players.some((p) => p.stack < 0 || p.stack % g.chipUnit || p.total % g.chipUnit))
          throw Error('Invalid chip ledger');
      }
    }
    if (g.history.filter((a) => a.street === 0 && a.action === 'raise').length >= 2)
      preflopReraisedHands++;
    for (const p of g.players.filter((p) => isTarget(p.id))) {
      const mine = g.history.filter((a) => a.street === 0 && a.id === p.id),
        seat = (style.byPosition[seatPosition(g, p.id)] ||= { hands: 0, vpip: 0, pfr: 0 });
      seat.hands++;
      if (mine.some((a) => a.action === 'raise' || (a.action === 'call' && a.amount > 0)))
        seat.vpip++;
      if (mine.some((a) => a.action === 'raise')) seat.pfr++;
    }
    if (flopSeats.length) {
      const bots = flopSeats.filter(isTarget),
        post = g.history.filter((a) => a.street > 0),
        flop = g.history.filter((a) => a.street === 1),
        aggressor = g.history.filter((a) => a.street === 0 && a.action === 'raise').at(-1)?.id;
      style.sawFlop += bots.length;
      if (g.showdown) style.showdowns += bots.filter((id) => !g.players[id].folded).length;
      if (!post.some((a) => a.action === 'raise')) style.checkedThroughFlops++;
      if (!g.history.some((a) => a.street === 0 && a.action === 'raise')) {
        style.limpedFlops++;
        if (!post.some((a) => a.action === 'raise')) style.limpedCheckedThrough++;
      }
      const first = flop.findIndex((a) => a.id === aggressor);
      if (
        isTarget(aggressor) &&
        first >= 0 &&
        !flop.slice(0, first).some((a) => a.action === 'raise')
      ) {
        style.cbetChances++;
        if (flop[first].action === 'raise') style.cbets++;
      }
      const cbet = flop.findIndex((a) => a.action === 'raise');
      if (aggressor !== undefined && cbet >= 0 && flop[cbet].id === aggressor) {
        const next = flop.slice(cbet + 1).findIndex((a) => a.action === 'raise');
        const responses = next < 0 ? flop.slice(cbet + 1) : flop.slice(cbet + 1, cbet + 1 + next);
        for (const id of new Set(responses.map((a) => a.id)))
          if (isTarget(id) && id !== aggressor) {
            style.facedCbets++;
            if (responses.find((a) => a.id === id).action === 'fold') style.foldsToCbet++;
          }
      }
      // Hero (seat 0) answering a bot's postflop bet, and a bot answering Hero's.
      const answered = (from, to) =>
        post.some(
          (a, i) =>
            a.action === 'raise' &&
            from(a.id) &&
            post.slice(i + 1).some((b) => b.street === a.street && to(b.id)),
        );
      const faced = answered(isTarget, (id) => id === 0);
      if (faced) style.heroFacedBot++;
      if (faced && answered((id) => id === 0, isTarget)) style.twoWay++;
    }
    for (const bucket of Object.values(opens))
      for (const { openIndex } of bucket.pending.splice(0)) {
        const after = g.history.slice(openIndex + 1).filter((a) => a.street === 0);
        const reraise = after.findIndex((a) => a.action === 'raise');
        const callers = (reraise < 0 ? after : after.slice(0, reraise)).filter(
          (a) => a.action === 'call',
        ).length;
        bucket.callers = (bucket.callers || 0) + callers;
        if (reraise >= 0) bucket.reraised = (bucket.reraised || 0) + 1;
        else if (!callers) bucket.uncontested = (bucket.uncontested || 0) + 1;
      }
    if (g.players.reduce((sum, p) => sum + p.stack, 0) !== count * g.bigBlind * 100)
      throw Error('Chip conservation failed');
  }
} finally {
  Math.random = previousRandom;
}
const total = g.players
  .filter((p) => isTarget(p.id))
  .reduce((totals, p) => {
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
    targets,
    companions,
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
    styleProfile: {
      openLimpPercent: (100 * style.openLimps) / Math.max(1, style.unopened),
      openRaisePercent: (100 * style.openRaises) / Math.max(1, style.unopened),
      overLimpPercent: (100 * style.overLimps) / Math.max(1, style.limpedPots),
      isoRaisePercent: (100 * style.isoRaises) / Math.max(1, style.limpedPots),
      cbetPercent: style.cbetChances ? (100 * style.cbets) / style.cbetChances : null,
      foldToCbetPercent: style.facedCbets ? (100 * style.foldsToCbet) / style.facedCbets : null,
      wtsdPercent: style.sawFlop ? (100 * style.showdowns) / style.sawFlop : null,
      averageBetFraction: style.postflopBets ? style.betFractionSum / style.postflopBets : null,
      smallBetPercent: style.postflopBets ? (100 * style.smallBets) / style.postflopBets : null,
      largeBetPercent: style.postflopBets ? (100 * style.largeBets) / style.postflopBets : null,
      checkedThroughFlopPercent: flops.hands ? (100 * style.checkedThroughFlops) / flops.hands : 0,
      drawRaisePercent: style.drawSpots ? (100 * style.drawRaises) / style.drawSpots : null,
      limpedFlopPercent: flops.hands ? (100 * style.limpedFlops) / flops.hands : 0,
      limpedCheckedThroughPercent: style.limpedFlops
        ? (100 * style.limpedCheckedThrough) / style.limpedFlops
        : null,
      heroFacedBotPer100: (100 * style.heroFacedBot) / hands,
      twoWayPer100: (100 * style.twoWay) / hands,
      counts: style,
    },
    openSizes: Object.fromEntries(
      Object.entries(opens)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, b]) => [
          key,
          {
            opens: b.opens,
            sizesBB: b.sizesBB,
            premiumAverageBB: b.premiumOpens ? b.premiumBB / b.premiumOpens : null,
            otherAverageBB: b.otherOpens ? b.otherBB / b.otherOpens : null,
            averageCallers: (b.callers || 0) / b.opens,
            uncontestedPercent: (100 * (b.uncontested || 0)) / b.opens,
            reraisedPercent: (100 * (b.reraised || 0)) / b.opens,
          },
        ]),
    ),
    scenario:
      '100 BB each new hand, seeded deck, hero uses baseline policy; observed ratios with actual opportunity denominators',
  }),
);
