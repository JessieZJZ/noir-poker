import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  renameSync,
} from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { ATTACK_POLICIES, fixedAttack, deriveSeed, seededRandom } from './bot-exploit-policy.mjs';

// Product sessions: retain actual stacks, eliminations, public observations,
// moods and the engine's limited hero rebuys. Never reset an eliminated bot.
const args = Object.fromEntries(process.argv.slice(2).map((s) => s.replace(/^--/, '').split('=')));
const list = (key, fallback) => (args[key] || fallback).split(',');
const counts = list('players', '5,6,7,8,9').map(Number);
const policies = list('policies', ATTACK_POLICIES.join(','));
const difficulties = list('difficulties', 'normal,hard');
const emotions = args.emotions || 'off';
const sessions = Number(args.sessions || 8),
  cap = Number(args.cap || 200);
const seed = Number(args.seed || 791339);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const enginePath = path.resolve(args.engine || path.join(root, 'src/engine/poker.js'));
const engine = await import(pathToFileURL(enginePath).href);
const { BOT_PROFILES } = await import(
  pathToFileURL(path.join(path.dirname(enginePath), 'bot-profiles.js')).href
);
const output = path.resolve(args.output || '.artifacts/bot-policy-audit/product-sessions');
assert.ok(output.startsWith(path.join(root, '.artifacts') + path.sep), 'Raw sessions stay local');
assert.ok(counts.every((n) => Number.isInteger(n) && n >= 5 && n <= 9));
assert.ok(policies.every((p) => ATTACK_POLICIES.includes(p)));
assert.ok(difficulties.every((d) => ['easy', 'normal', 'hard'].includes(d)));
assert.ok(['off', 'subtle', 'lively'].includes(emotions));
assert.ok([sessions, cap].every((n) => Number.isInteger(n) && n >= 1 && n <= 10000));
assert.ok(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff);
const hash = createHash('sha256');
for (const name of readdirSync(path.dirname(enginePath))
  .filter((p) => p.endsWith('.js'))
  .sort())
  hash.update(name + '\0').update(readFileSync(path.join(path.dirname(enginePath), name)));
const configuration = {
  counts,
  policies,
  difficulties,
  emotions,
  sessions,
  cap,
  seed,
  enginePath,
  sourceDigest: hash.digest('hex'),
  harnessDigest: createHash('sha256')
    .update(readFileSync(fileURLToPath(import.meta.url)))
    .update(readFileSync(new URL('./bot-exploit-policy.mjs', import.meta.url)))
    .digest('hex'),
  method:
    'actual finite product sessions; no rake; engine-limited hero rebuys; hand cap is censoring, never a win',
};
mkdirSync(output, { recursive: true });
const manifest = path.join(output, 'manifest.json');
if (existsSync(manifest)) assert.deepEqual(JSON.parse(readFileSync(manifest)), configuration);
else writeFileSync(manifest, JSON.stringify(configuration, null, 2));
const save = (file, value) => {
  writeFileSync(file + '.tmp', JSON.stringify(value, null, 2));
  renameSync(file + '.tmp', file);
};
const cells = [];
for (const count of counts)
  for (const difficulty of difficulties)
    for (const policy of policies) {
      const cell = `${count}-${difficulty}-${policy}`;
      const results = [];
      for (let session = 0; session < sessions; session++) {
        const resultFile = path.join(output, `${cell}-${session}.json`);
        if (existsSync(resultFile)) {
          results.push(JSON.parse(readFileSync(resultFile)));
          continue;
        }
        const game = engine.newGame(count);
        game.difficulty = difficulty;
        game.emotionMode = emotions;
        game.dealer = (session + count - 1) % count;
        for (const p of game.players.slice(1))
          p.botProfile = BOT_PROFILES[(p.id - 1 + session) % BOT_PROFILES.length].id;
        const hands = [],
          seats = {};
        let potWins = 0,
          actions = 0,
          heroActions = 0;
        const started = Date.now();
        for (let hand = 0; hand < cap && !game.over; hand++) {
          if (engine.needsHeroRebuy(game)) engine.rebuyHero(game);
          const before = structuredClone(game);
          const deckSeed = deriveSeed(seed, count, session, hand, 'deck');
          const policyRandom = seededRandom(deriveSeed(seed, count, session, hand, 'policy'));
          const timingRandom = seededRandom(deriveSeed(seed, count, session, hand, 'timing'));
          const oldRandom = Math.random;
          try {
            Math.random = seededRandom(deckSeed);
            engine.startHand(game);
          } finally {
            Math.random = oldRandom;
          }
          const active = game.players.filter((p) => !p.out).length;
          seats[active] = (seats[active] || 0) + 1;
          const initial = game.players.reduce((n, p) => n + p.stack + p.total, 0);
          const dealHash = createHash('sha256')
            .update(JSON.stringify({ hole: game.players.map((p) => p.hole), deck: game.deck }))
            .digest('hex');
          let n = 0;
          while (game.phase !== 'done') {
            assert.ok(++n < 1000, 'A session hand must terminate');
            if (game.phase === 'between') {
              engine.advanceStreet(game);
              continue;
            }
            if (game.actor === 0) {
              const d = fixedAttack(
                {
                  legal: engine.legalActions(game),
                  currentBet: game.currentBet,
                  pot: engine.potSize(game),
                },
                policy,
              );
              engine.act(game, 0, d.action, d.amount);
              heroActions++;
            } else
              engine.executeBotTurn(
                game,
                engine.planBotTurn(game, policyRandom, { timingRandom }),
                { expedited: true },
              );
            actions++;
            for (const p of game.players)
              for (const value of [p.stack, p.bet, p.total])
                assert.ok(Number.isSafeInteger(value) && value >= 0 && value % game.chipUnit === 0);
            assert.equal(
              game.players.reduce(
                (sum, p) => sum + p.stack + (game.phase === 'done' ? 0 : p.total),
                0,
              ),
              initial,
            );
          }
          if (game.winners.some((p) => p.id === 0)) potWins++;
          hands.push({
            hand,
            deckSeed,
            dealHash,
            before: {
              hand: before.hand,
              dealer: before.dealer,
              buyin: before.stats.buyin,
              rebuys: before.rebuys,
              players: before.players.map(({ id, stack, out }) => ({ id, stack, out })),
            },
            game: structuredClone(game),
          });
        }
        const trace = gzipSync(JSON.stringify(hands));
        const traceFile = path.join(output, `${cell}-${session}.json.gz`);
        writeFileSync(traceFile + '.tmp', trace);
        renameSync(traceFile + '.tmp', traceFile);
        const result = {
          cell,
          count,
          difficulty,
          policy,
          session,
          hands: hands.length,
          actions,
          heroActions,
          potWins,
          activeSeats: seats,
          buyinBB: game.stats.buyin / game.bigBlind,
          finalBB: game.players[0].stack / game.bigBlind,
          profitBB: (game.players[0].stack - game.stats.buyin) / game.bigBlind,
          ended: !!game.over,
          censored: !game.over,
          champion: game.over?.championId === 0,
          place: game.over?.heroPlace ?? null,
          sourceDigest: configuration.sourceDigest,
          traceSha256: createHash('sha256').update(trace).digest('hex'),
          elapsedMs: Date.now() - started,
        };
        save(resultFile, result);
        results.push(result);
        console.log(
          JSON.stringify({
            cell,
            session,
            hands: result.hands,
            profitBB: result.profitBB,
            seats,
            elapsedMs: result.elapsedMs,
          }),
        );
      }
      const sum = (key) => results.reduce((n, r) => n + r[key], 0);
      const activeSeats = {};
      for (const r of results)
        for (const [n, hands] of Object.entries(r.activeSeats))
          activeSeats[n] = (activeSeats[n] || 0) + hands;
      const summary = {
        cell,
        count,
        difficulty,
        policy,
        sessions: results.length,
        hands: sum('hands'),
        buyinBB: sum('buyinBB'),
        finalBB: sum('finalBB'),
        profitBB: sum('profitBB'),
        returnOnBuyin: sum('profitBB') / sum('buyinBB'),
        descriptiveBBPer100: (100 * sum('profitBB')) / sum('hands'),
        potWinRate: sum('potWins') / sum('hands'),
        champions: sum('champion'),
        ended: sum('ended'),
        censored: sum('censored'),
        activeSeats,
        note: 'Finite-session bankroll result; not directly comparable with fixed-depth cash BB/100. Censored sessions are reported separately.',
      };
      cells.push(summary);
      save(path.join(output, 'summary.json'), { configuration, cells });
    }
