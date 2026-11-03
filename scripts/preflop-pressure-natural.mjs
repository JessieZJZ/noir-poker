import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  mkdirSync,
  readdirSync,
  existsSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { freshSimulationGame } from './style-simulation-game.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((s) => s.replace(/^--/, '').split('=')));
const root = resolve(args.source || '.');
const heroRoot = resolve(args['hero-source'] || args.source || '.');
const out = resolve(args.out || '.artifacts/preflop-natural-local');
assert(
  !existsSync(join(out, 'hands.jsonl')),
  'Preserve earlier runs; use a fresh output directory',
);
mkdirSync(out, { recursive: true });
const e = await import(pathToFileURL(join(root, 'src/engine/poker.js')));
const heroEngine = await import(pathToFileURL(join(heroRoot, 'src/engine/poker.js')));
const { BOT_PROFILES } = await import(pathToFileURL(join(root, 'src/engine/bot-profiles.js')));
const seeded = (n) => () => (n = (Math.imul(n, 1664525) + 1013904223) >>> 0) / 4294967296;
const digest = (root) => {
  const h = createHash('sha256');
  for (const n of readdirSync(join(root, 'src/engine'))
    .filter((n) => n.endsWith('.js'))
    .sort())
    h.update(n).update(readFileSync(join(root, 'src/engine', n)));
  return h.digest('hex');
};
const protocol = {
  at: new Date().toISOString(),
  sourceDigest: digest(root),
  heroSourceDigest: digest(heroRoot),
  harnessDigest: createHash('sha256')
    .update(readFileSync(new URL(import.meta.url)))
    .update(readFileSync(new URL('./style-simulation-game.mjs', import.meta.url)))
    .digest('hex'),
  players: [5, 6, 7, 8, 9],
  difficulties: ['normal', 'hard'],
  seeds: [739391, 918113],
  handsPerCell: Number(args.hands || 250),
  profiles: BOT_PROFILES.map((p) => p.id),
  interpretation:
    'Natural complete hands, fresh100BB and rotating button/lineup each hand. Fixed original Hero engine and policy. Initial deals shared across configurations; executed hands are not independent shuffle clusters. No emotions.',
};
writeFileSync(join(out, 'manifest.json'), JSON.stringify(protocol, null, 2));
const cardText = (cards) =>
  cards.map((c) => '23456789TJQKA'[c.rank - 2] + 'shcd'[c.suit]).join(' ');
const rows = [];
for (const count of protocol.players)
  for (const difficulty of protocol.difficulties)
    for (const seed of protocol.seeds) {
      const stats = {
        hands: 0,
        botPreflopDecisions: 0,
        botShoves: 0,
        botShoveHands: 0,
        botShoveOpportunities: 0,
        reraiseHands: 0,
        fourBetHands: 0,
        fiveBetHands: 0,
        strongResponses: {},
        shovesByHand: {},
        shovesByProfile: {},
        heroShoves: 0,
        heroShoveAllFold: 0,
      };
      for (let h = 0; h < protocol.handsPerCell; h++) {
        const g = freshSimulationGame(e, count, h, difficulty);
        const previous = Math.random;
        Math.random = seeded(seed + h * 700001 + 19);
        try {
          e.startHand(g);
        } finally {
          Math.random = previous;
        }
        assert(g.players.every((p) => !p.out && p.hole.length === 2));
        for (const p of g.players)
          if (p.id) p.botProfile = protocol.profiles[(h + p.id - 1) % protocol.profiles.length];
        const initialHoles = g.players.map((p) => ({
          id: p.id,
          profile: p.botProfile,
          hole: cardText(p.hole),
          position: e.seatPosition(g, p.id),
        }));
        const decisions = [];
        let n = 0,
          shoved = false,
          heroShoved = false,
          botCalledHeroShove = false;
        while (g.phase !== 'done') {
          assert(++n < 800, 'Unfinished hand');
          if (g.phase === 'between') {
            e.advanceStreet(g);
            continue;
          }
          const actor = g.actor;
          const d = (actor === 0 ? heroEngine : e).botDecision(
            g,
            seeded(seed + h * 100003 + g.history.length * 7919 + 71),
          );
          const v = d.trace.view;
          if (g.street === 0) {
            const isShove = d.action === 'raise' && d.amount === v.legal.maxRaiseTo;
            const [high, low] = v.hole.map((c) => c.rank).sort((a, b) => b - a);
            const rank = (n) => '23456789TJQKA'[n - 2];
            const label =
              high === low
                ? rank(high) + rank(low)
                : rank(high) + rank(low) + (v.hole[0].suit === v.hole[1].suit ? 's' : 'o');
            const raises = g.history.filter((a) => a.street === 0 && a.action === 'raise').length;
            decisions.push({
              actor,
              profile: g.players[actor].botProfile,
              hole: cardText(v.hole),
              position: v.position,
              action: d.action,
              amount: d.amount,
              reason: d.trace.reason,
              rawEquity: v.equity,
              requiredEquity: d.trace.requiredEquity,
              callCost: v.legal.callAmount,
              pot: v.pot,
              currentBet: v.currentBet,
              raises,
              rivals: v.rivals,
              committed: v.allIn?.committedIds,
              waiting: v.allIn?.waitingIds,
              shove: isShove,
            });
            if (actor) {
              stats.botPreflopDecisions++;
              stats.botShoveOpportunities += Number(v.legal.canRaise);
              if (isShove) {
                stats.botShoves++;
                shoved = true;
                stats.shovesByHand[label] = (stats.shovesByHand[label] || 0) + 1;
                stats.shovesByProfile[g.players[actor].botProfile] =
                  (stats.shovesByProfile[g.players[actor].botProfile] || 0) + 1;
              }
              if (heroShoved && ['call', 'raise'].includes(d.action)) botCalledHeroShove = true;
              if (
                v.legal.callAmount > 0 &&
                ((high === low && high >= 6) ||
                  (high === 14 && low === 13) ||
                  (high === 13 && low === 12))
              ) {
                const key = `${label}/${v.allIn ? 'commitment' : v.currentBet > 4 * g.bigBlind ? 'large' : 'small'}`;
                const r = (stats.strongResponses[key] ||= {
                  decisions: 0,
                  fold: 0,
                  call: 0,
                  raise: 0,
                });
                r.decisions++;
                r[d.action]++;
              }
            } else if (isShove) {
              heroShoved = true;
              stats.heroShoves++;
            }
          }
          if (d.action === 'raise')
            assert(
              v.legal.canRaise &&
                d.amount >= v.legal.minRaiseTo &&
                d.amount <= v.legal.maxRaiseTo &&
                d.amount % g.chipUnit === 0,
            );
          e.act(g, actor, d.action, d.amount);
          assert(
            g.players.every(
              (p) => p.stack >= 0 && p.stack % g.chipUnit === 0 && p.total % g.chipUnit === 0,
            ),
          );
          assert.equal(
            g.players.reduce((sum, p) => sum + p.stack + (g.phase === 'done' ? 0 : p.total), 0),
            count * g.stakes.startingStack,
          );
        }
        const raises = g.history.filter((a) => a.street === 0 && a.action === 'raise').length;
        stats.hands++;
        stats.botShoveHands += Number(shoved);
        stats.reraiseHands += Number(raises >= 2);
        stats.fourBetHands += Number(raises >= 3);
        stats.fiveBetHands += Number(raises >= 4);
        stats.heroShoveAllFold += Number(heroShoved && !botCalledHeroShove);
        appendFileSync(
          join(out, 'hands.jsonl'),
          JSON.stringify({
            count,
            difficulty,
            seed,
            hand: h,
            initialHoles,
            decisions,
            history: g.history,
            board: cardText(g.board),
            refunds: g.refunds,
            payouts: g.payouts,
            finalStacks: g.players.map((p) => p.stack),
            conservation: true,
          }) + '\n',
        );
      }
      rows.push({ count, difficulty, seed, stats });
      writeFileSync(
        join(out, `${count}-${difficulty}-${seed}.json`),
        JSON.stringify(rows.at(-1), null, 2),
      );
      console.log(
        `completed ${rows.length}/20 cells, ${rows.reduce((s, r) => s + r.stats.hands, 0)} complete hands`,
      );
    }
writeFileSync(
  join(out, 'summary.json'),
  JSON.stringify(
    {
      completeHands: rows.reduce((s, r) => s + r.stats.hands, 0),
      independentShuffleClusters: protocol.seeds.length * protocol.handsPerCell,
      conservation: true,
      rows,
    },
    null,
    2,
  ),
);
