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
import { PRESSURE_HANDS } from './preflop-pressure-cases.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((s) => s.replace(/^--/, '').split('=')));
const root = resolve(args.source || '.');
const out = resolve(args.out || '.artifacts/preflop-shove-challenge-local');
assert(!existsSync(join(out, 'hands.jsonl')), 'Use a new output directory');
mkdirSync(out, { recursive: true });
const e = await import(pathToFileURL(join(root, 'src/engine/poker.js')));
const { BOT_PROFILES } = await import(pathToFileURL(join(root, 'src/engine/bot-profiles.js')));
const seeded = (n) => () => (n = (Math.imul(n, 1664525) + 1013904223) >>> 0) / 4294967296;
const digest = createHash('sha256');
for (const n of readdirSync(join(root, 'src/engine'))
  .filter((s) => s.endsWith('.js'))
  .sort())
  digest.update(n).update(readFileSync(join(root, 'src/engine', n)));
const protocol = {
  at: new Date().toISOString(),
  sourceDigest: digest.digest('hex'),
  harnessDigest: createHash('sha256')
    .update(readFileSync(new URL(import.meta.url)))
    .digest('hex'),
  seats: [2, 3, 5, 6, 7, 8, 9],
  difficulties: ['normal', 'hard'],
  depthBB: [20, 100],
  heroPositions: ['early', 'late'],
  handsPerCell: 20,
  seed: 662459,
  targetHands: ['AA', 'KK', 'QQ', 'JJ', 'TT', 'AKs', 'AKo', 'KQs', 'KQo', '66', '72o'],
  interpretation:
    'Deliberate Hero open-shoves with one unacted bot dealt a specified holding. Other live bots decide autonomously, no forced continuation. Late SB setup folds earlier seats before Hero and excludes those folds from results. Same20 shuffle clusters reused across configurations; not natural frequency or 1120 independent deals.',
};
writeFileSync(join(out, 'manifest.json'), JSON.stringify(protocol, null, 2));
const textCards = (a) => a.map((c) => '23456789TJQKA'[c.rank - 2] + 'shcd'[c.suit]).join(' ');
const rows = [];
for (const seats of protocol.seats)
  for (const difficulty of protocol.difficulties)
    for (const depth of protocol.depthBB)
      for (const position of protocol.heroPositions) {
        const stats = { hands: 0, allFold: 0, called: 0, target: {}, responses: {} };
        for (let h = 0; h < protocol.handsPerCell; h++) {
          const g = e.newGame(Math.max(5, seats));
          g.difficulty = difficulty;
          g.emotionMode = 'off';
          g.hand = h;
          for (const p of g.players.slice(seats)) {
            p.out = true;
            p.stack = 0;
          }
          const dealer = seats === 2 ? 0 : position === 'late' ? seats - 1 : seats - 3;
          g.dealer = (dealer + seats - 1) % seats;
          g.players[0].stack = depth * g.bigBlind;
          const prior = Math.random;
          Math.random = seeded(protocol.seed + h * 700001 + 19);
          try {
            e.startHand(g);
          } finally {
            Math.random = prior;
          }
          const target = position === 'late' || seats === 2 ? 1 : seats - 1;
          const hand = protocol.targetHands[h % protocol.targetHands.length];
          const wanted = PRESSURE_HANDS[hand]
            .split(' ')
            .map((key) =>
              e
                .deckOfCards()
                .find(
                  (c) =>
                    c.rank === '23456789TJQKA'.indexOf(key[0]) + 2 &&
                    c.suit === 'shcd'.indexOf(key[1]),
                ),
            );
          for (let i = 0; i < 2; i++) {
            const c = wanted[i];
            if (g.players[target].hole[i].key === c.key) continue;
            const arrays = [...g.players.filter((p) => !p.out).map((p) => p.hole), g.deck];
            const holder = arrays.find((a) => a.some((x) => x.key === c.key));
            const index = holder.findIndex((x) => x.key === c.key);
            holder[index] = g.players[target].hole[i];
            g.players[target].hole[i] = c;
          }
          const all = [...g.deck, ...g.players.flatMap((p) => p.hole)];
          assert.equal(new Set(all.map((c) => c.key)).size, 52);
          for (const p of g.players)
            if (p.id) p.botProfile = BOT_PROFILES[(h + p.id - 1) % BOT_PROFILES.length].id;
          const setupFolded = [];
          while (g.actor !== 0) {
            setupFolded.push(g.actor);
            assert.notEqual(g.actor, target);
            e.act(g, g.actor, 'fold');
          }
          const bank = g.players.reduce((sum, p) => sum + p.stack + p.total, 0);
          const initialHoles = g.players
            .filter((p) => !p.out)
            .map((p) => ({
              id: p.id,
              profile: p.botProfile,
              hole: textCards(p.hole),
              position: e.seatPosition(g, p.id),
            }));
          e.act(g, 0, 'raise', e.legalActions(g).maxRaiseTo);
          assert(g.players[0].allin);
          let accepted = false,
            n = 0;
          const decisions = [];
          while (g.phase !== 'done') {
            assert(++n < 700);
            if (g.phase === 'between') {
              e.advanceStreet(g);
              continue;
            }
            assert.notEqual(g.actor, 0);
            const actor = g.actor;
            const d = e.botDecision(
              g,
              seeded(protocol.seed + h * 100003 + g.history.length * 7919 + 71),
            );
            const v = d.trace.view;
            if (g.street === 0) {
              accepted ||= ['call', 'raise'].includes(d.action);
              const r = (stats.responses[g.players[actor].botProfile] ||= {
                decisions: 0,
                fold: 0,
                call: 0,
                raise: 0,
              });
              r.decisions++;
              r[d.action]++;
              if (actor === target) {
                const t = (stats.target[hand] ||= { decisions: 0, fold: 0, call: 0, raise: 0 });
                t.decisions++;
                t[d.action]++;
              }
            }
            decisions.push({
              actor,
              street: g.street,
              profile: g.players[actor].botProfile,
              action: d.action,
              amount: d.amount,
              reason: d.trace.reason,
              equity: v.equity,
              required: d.trace.requiredEquity,
              callCost: v.legal.callAmount,
              pot: v.pot,
              committed: v.allIn?.committedIds,
              waiting: v.allIn?.waitingIds,
            });
            e.act(g, actor, d.action, d.amount);
            assert(
              g.players.every(
                (p) => p.stack >= 0 && p.stack % g.chipUnit === 0 && p.total % g.chipUnit === 0,
              ),
            );
            assert.equal(
              g.players.reduce((sum, p) => sum + p.stack + (g.phase === 'done' ? 0 : p.total), 0),
              bank,
            );
          }
          stats.hands++;
          stats.allFold += Number(!accepted);
          stats.called += Number(accepted);
          appendFileSync(
            join(out, 'hands.jsonl'),
            JSON.stringify({
              seats,
              difficulty,
              depth,
              position,
              hand: h,
              target,
              targetHand: hand,
              setupFolded,
              initialHoles,
              decisions,
              allFold: !accepted,
              history: g.history,
              board: textCards(g.board),
              payouts: g.payouts,
              refunds: g.refunds,
              finalStacks: g.players.map((p) => p.stack),
              conservation: true,
            }) + '\n',
          );
        }
        rows.push({ seats, difficulty, depth, position, stats });
        writeFileSync(
          join(out, `${seats}-${difficulty}-${depth}-${position}.json`),
          JSON.stringify(rows.at(-1), null, 2),
        );
        console.log(`completed ${rows.length}/56 cells`);
      }
writeFileSync(
  join(out, 'summary.json'),
  JSON.stringify(
    {
      completeExecutions: rows.reduce((s, r) => s + r.stats.hands, 0),
      independentShuffleClusters: 20,
      conservation: true,
      rows,
    },
    null,
    2,
  ),
);
