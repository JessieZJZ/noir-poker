// Local interactive companion to the observation packets. All responses use
// the ordinary player's public perspective; private maps stay server-side.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const args = Object.fromEntries(process.argv.slice(2).map((v) => v.replace(/^--/, '').split('=')));
const root = resolve(args.root || '.');
const { newGame, startHand, botDecision, act, advanceStreet, legalActions, potSize, seatPosition } =
  await import(pathToFileURL(join(root, 'src/engine/poker.js')));
const packet = resolve(args.packet || '.artifacts/style-audit-2026-10-20/blind-round-1-isolated');
const seeded = (n) => () => (n = (Math.imul(n, 1664525) + 1013904223) >>> 0) / 4294967296;
const cards = (a) => a.map((c) => '23456789TJQKA'[c.rank - 2] + 'shcd'[c.suit]).join(' ');
const sessions = Object.fromEntries(
  [1, 2, 3].map((id) => [
    id,
    {
      key: JSON.parse(readFileSync(join(packet, 'private', `key-${id}.json`))),
      token: randomBytes(12).toString('hex'),
      number: 0,
      codeHands: {},
      game: null,
      events: [],
      evidence: [],
    },
  ]),
);
const view = (s) => {
  const g = s.game;
  if (!g) return { message: 'POST /start with {opponent:"A"}' };
  const showdown = g.phase === 'done' && g.players.filter((p) => !p.folded).length > 1;
  const who = (id) => (id === s.target ? s.code : id === 0 ? 'Hero' : `R${id}`);
  return {
    opponent: s.code,
    hand: s.number,
    phase: g.phase,
    street: g.street,
    dealer: who(g.dealer),
    board: cards(g.board),
    hero: cards(g.players[0].hole),
    pot: potSize(g),
    players: g.players.map((p) => ({
      actor: who(p.id),
      position: seatPosition(g, p.id),
      stack: p.stack,
      bet: p.bet,
      folded: p.folded,
      allin: p.allin,
      ...(p.id === 0 || (showdown && !p.folded) ? { hole: cards(p.hole) } : {}),
    })),
    legal: g.phase === 'playing' && g.actor === 0 ? legalActions(g) : null,
    events: s.events,
  };
};
function advance(s) {
  const g = s.game;
  while (g.phase !== 'done' && !(g.phase === 'playing' && g.actor === 0)) {
    if (g.phase === 'between') {
      advanceStreet(g);
      continue;
    }
    const actor = g.actor,
      d = botDecision(g, s.random);
    const v = d.trace.view;
    const chosen = d;
    const before = potSize(g);
    act(g, actor, chosen.action, chosen.amount);
    s.events.push({
      street: v.street,
      actor: actor === s.target ? s.code : `R${actor}`,
      action: chosen.action,
      ...(chosen.amount == null ? {} : { betTo: chosen.amount }),
      potBefore: before,
    });
  }
}
async function body(req) {
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 4096) throw Error('request too large');
  }
  return text ? JSON.parse(text) : {};
}
const server = createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    const parts = new URL(req.url, 'http://127.0.0.1').pathname.split('/').filter(Boolean);
    const [id, token, method] = parts,
      s = sessions[id];
    if (!s || token !== s.token) {
      res.writeHead(404);
      res.end('{}');
      return;
    }
    if (req.method === 'POST') {
      const input = await body(req);
      if (method === 'start') {
        if (!Object.hasOwn(s.key, input.opponent)) throw Error('unknown anonymous opponent');
        if (s.game && s.game.phase !== 'done') throw Error('finish the current hand first');
        s.code = input.opponent;
        const codeHand = (s.codeHands[s.code] || 0) + 1;
        s.codeHands[s.code] = codeHand;
        s.target = 1 + (s.number % 4);
        s.number++;
        s.game = newGame(5);
        // Each anonymous code gets all five positions once per five hands,
        // independently of the order in which reviewers choose opponents.
        // startHand moves the button one seat, so set the preceding button.
        const desiredDealer = (s.target - ((codeHand - 1) % 5) + 5) % 5;
        s.game.dealer = (desiredDealer - 1 + 5) % 5;
        s.game.difficulty = 'hard';
        s.game.emotionMode = 'off';
        const old = Math.random;
        Math.random = seeded(+(args.seed || 913441) + Number(id) * 7789 + s.number * 100003);
        try {
          startHand(s.game);
        } finally {
          Math.random = old;
        }
        s.game.players.forEach((p) => {
          p.botProfile = p.id === s.target ? s.key[s.code] : ['balanced', 'jett', 'rook'][p.id % 3];
        });
        s.random = seeded(313131 + Number(id) * 1031 + s.number * 70001);
        s.events = [];
        advance(s);
      } else if (method === 'action') {
        const g = s.game;
        if (!g || g.phase !== 'playing' || g.actor !== 0) throw Error('hero is not acting');
        const street = g.street,
          potBefore = potSize(g);
        act(g, 0, input.action, input.amount);
        s.events.push({
          street,
          actor: 'Hero',
          action: input.action,
          ...(input.amount == null ? {} : { betTo: input.amount }),
          potBefore,
        });
        advance(s);
      } else throw Error('unknown endpoint');
      const evidence = view(s);
      s.evidence.push(evidence);
    }
    res.end(JSON.stringify(view(s)));
  } catch (error) {
    res.writeHead(400);
    res.end(JSON.stringify({ error: error.message }));
  }
});
server.listen(+(args.port || 4197), '127.0.0.1', () => {
  console.log(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(sessions).map(([id, s]) => [
          id,
          `http://127.0.0.1:${args.port || 4197}/${id}/${s.token}`,
        ]),
      ),
    ),
  );
});
process.on('SIGTERM', () => {
  // Keep only the public transcript for reproducibility.
  import('node:fs').then(({ writeFileSync }) => {
    for (const [id, s] of Object.entries(sessions))
      writeFileSync(
        join(packet, `reviewer-${id}`, 'interactive-transcript.json'),
        JSON.stringify(s.evidence, null, 2),
      );
    server.close(() => process.exit(0));
  });
});
