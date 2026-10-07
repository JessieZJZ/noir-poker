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
  profile = args.profile || 'balanced',
  policySeed = Number(args.seed ?? 781),
  deckSeed = Number(args['deck-seed'] ?? 711);
if (!Number.isInteger(hands) || hands < 1 || hands > 10000) throw Error('hands must be 1–10000');
for (const seed of [policySeed, deckSeed])
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw Error('seed must be a uint32');
const random = seeded(policySeed),
  deckRandom = seeded(deckSeed),
  previousRandom = Math.random;
const g = newGame(count);
const flops = { hands: 0, players: 0, threePlus: 0, distribution: {} };
let preflopReraisedHands = 0;
applyBotSettings(g, {
  emotionMode: 'off',
  assignments: Object.fromEntries(Array.from({ length: count - 1 }, (_, i) => [i + 1, profile])),
});
try {
  Math.random = deckRandom;
  for (let h = 0; h < hands; h++) {
    g.players.forEach((p) => (p.stack = 5000));
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
          flops.distribution[entrants] = (flops.distribution[entrants] || 0) + 1;
        }
        advanceStreet(g);
      } else {
        const d = botDecision(g, random);
        act(g, g.actor, d.action, d.amount);
      }
    }
    if (g.history.filter((a) => a.street === 0 && a.action === 'raise').length >= 2)
      preflopReraisedHands++;
  }
} finally {
  Math.random = previousRandom;
}
const total = g.players.slice(1).reduce(
  (r, p) => ({
    samples: r.samples + p.botStats.hands,
    vpip: r.vpip + p.botStats.vpip,
    pfr: r.pfr + p.botStats.pfr,
  }),
  { samples: 0, vpip: 0, pfr: 0 },
);
console.log(
  JSON.stringify({
    profile,
    players: count,
    hands,
    policySeed,
    deckSeed,
    ...total,
    vpipPercent: (100 * total.vpip) / total.samples,
    pfrPercent: (100 * total.pfr) / total.samples,
    flopHands: flops.hands,
    averageFlopPlayers: flops.hands ? flops.players / flops.hands : 0,
    threePlusFlopHands: flops.threePlus,
    threePlusFlopPercent: (100 * flops.threePlus) / hands,
    flopPlayerDistribution: flops.distribution,
    preflopReraisedHands,
    scenario: '100 BB each new hand, same seeded deck, emotions off, hero uses baseline policy',
  }),
);
