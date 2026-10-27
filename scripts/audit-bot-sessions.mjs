import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { seededRandom, fixedAttack } from './bot-exploit-policy.mjs';

const folder = path.resolve(process.argv[2] || '.artifacts/bot-policy-audit/product-sessions');
const configuration = JSON.parse(readFileSync(path.join(folder, 'manifest.json')));
const hash = createHash('sha256');
const engineRoot = path.dirname(configuration.enginePath);
for (const name of readdirSync(engineRoot)
  .filter((s) => s.endsWith('.js'))
  .sort())
  hash.update(name + '\0').update(readFileSync(path.join(engineRoot, name)));
assert.equal(hash.digest('hex'), configuration.sourceDigest);
const engine = await import(pathToFileURL(configuration.enginePath).href);
const { BOT_PROFILES } = await import(pathToFileURL(path.join(engineRoot, 'bot-profiles.js')).href);
const observationPath = path.join(engineRoot, 'public-observations.js');
const observations = existsSync(observationPath)
  ? await import(pathToFileURL(observationPath).href)
  : null;
const report = {
  status: 'running',
  sessions: 0,
  hands: 0,
  actions: 0,
  botSnapshots: 0,
  activeSeats: {},
  profitBB: 0,
  sourceDigest: configuration.sourceDigest,
};
const historyEntry = ({ id, street, action, amount, betLabel }) => ({
  id,
  street,
  action,
  amount,
  ...(betLabel ? { betLabel } : {}),
});
for (const name of readdirSync(folder)
  .filter((s) => s.endsWith('.json.gz'))
  .sort()) {
  const result = JSON.parse(readFileSync(path.join(folder, name.replace('.json.gz', '.json'))));
  const bytes = readFileSync(path.join(folder, name));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), result.traceSha256);
  const hands = JSON.parse(gunzipSync(bytes));
  const g = engine.newGame(result.count);
  g.difficulty = result.difficulty;
  g.emotionMode = configuration.emotions;
  g.dealer = (result.session + result.count - 1) % result.count;
  for (const p of g.players.slice(1))
    p.botProfile = BOT_PROFILES[(p.id - 1 + result.session) % BOT_PROFILES.length].id;
  let actions = 0,
    heroActions = 0,
    potWins = 0;
  const seats = {};
  for (const [hand, saved] of hands.entries()) {
    assert.equal(saved.hand, hand);
    assert.equal(g.over, null);
    if (engine.needsHeroRebuy(g)) engine.rebuyHero(g);
    assert.deepEqual(
      {
        hand: g.hand,
        dealer: g.dealer,
        buyin: g.stats.buyin,
        rebuys: g.rebuys,
        players: g.players.map(({ id, stack, out }) => ({ id, stack, out })),
      },
      saved.before,
    );
    const oldRandom = Math.random;
    try {
      Math.random = seededRandom(saved.deckSeed);
      engine.startHand(g);
    } finally {
      Math.random = oldRandom;
    }
    assert.equal(
      createHash('sha256')
        .update(JSON.stringify({ hole: g.players.map((p) => p.hole), deck: g.deck }))
        .digest('hex'),
      saved.dealHash,
    );
    const active = g.players.filter((p) => !p.out).length;
    seats[active] = (seats[active] || 0) + 1;
    const traces = new Map(saved.game.botDecisions.map((r) => [r.sequence, r]));
    for (const [index, event] of saved.game.history.entries()) {
      while (g.phase === 'between') engine.advanceStreet(g);
      assert.equal(g.phase, 'playing');
      assert.equal(g.actor, event.id);
      assert.equal(g.street, event.street);
      if (event.id === 0) {
        const d = fixedAttack(
          { legal: engine.legalActions(g), currentBet: g.currentBet, pot: engine.potSize(g) },
          result.policy,
        );
        assert.equal(event.action, d.action);
        if (d.action === 'raise') assert.equal(event.amount, d.amount);
        heroActions++;
      } else {
        const record = traces.get(index + 1);
        assert.ok(record);
        assert.equal(record.action, event.action);
        if (record.action === 'raise') assert.equal(record.amount, event.amount);
        const v = record.trace.view;
        assert.deepEqual(v.hole, g.players[event.id].hole);
        assert.deepEqual(v.board, g.board);
        assert.deepEqual(v.history, g.history.map(historyEntry));
        assert.equal(v.stack, g.players[event.id].stack);
        assert.ok(!('deck' in v));
        const known = (id) =>
          result.difficulty === 'easy'
            ? null
            : observations.summarizePublicRead(g.players[id].publicReads);
        if (observations) assert.deepEqual(v.publicRead, known(event.id));
        for (const opponent of v.opponents) {
          assert.ok(!('hole' in opponent));
          assert.equal(opponent.stack, g.players[opponent.id].stack);
          if (observations) assert.deepEqual(opponent.publicRead, known(opponent.id));
        }
        report.botSnapshots++;
      }
      engine.act(g, event.id, event.action, event.amount);
      actions++;
      for (const p of g.players)
        for (const amount of [p.stack, p.bet, p.total])
          assert.ok(Number.isSafeInteger(amount) && amount >= 0 && amount % g.chipUnit === 0);
    }
    while (g.phase === 'between') engine.advanceStreet(g);
    assert.equal(g.phase, 'done');
    for (const key of ['board', 'payouts', 'refunds', 'pots', 'winners', 'over', 'rebuys', 'stats'])
      assert.deepEqual(g[key], saved.game[key]);
    assert.deepEqual(
      g.players.map(({ stack, out, place }) => ({ stack, out, place })),
      saved.game.players.map(({ stack, out, place }) => ({ stack, out, place })),
    );
    assert.equal(
      g.players.reduce((n, p) => n + p.stack, 0),
      (result.count + g.rebuys) * g.stakes.startingStack,
    );
    if (g.winners.some((p) => p.id === 0)) potWins++;
  }
  assert.equal(hands.length, result.hands);
  assert.equal(actions, result.actions);
  assert.equal(heroActions, result.heroActions);
  assert.equal(potWins, result.potWins);
  assert.deepEqual(seats, result.activeSeats);
  assert.equal((g.players[0].stack - g.stats.buyin) / g.bigBlind, result.profitBB);
  assert.equal(!!g.over, result.ended);
  assert.equal(!g.over, result.censored);
  assert.equal(g.over?.championId === 0, result.champion);
  if (!g.over) assert.equal(hands.length, configuration.cap);
  report.sessions++;
  report.hands += hands.length;
  report.actions += actions;
  report.profitBB += result.profitBB;
  for (const [n, amount] of Object.entries(seats))
    report.activeSeats[n] = (report.activeSeats[n] || 0) + amount;
}
report.status = 'passed';
writeFileSync(path.join(folder, 'independent-audit.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
