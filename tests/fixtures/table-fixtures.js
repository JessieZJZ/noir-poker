// Vite injects this file into the table controller ONLY in test mode.
// It deliberately uses the controller's real rendering, actions and engine.
import { deckOfCards, settle } from '../engine/poker.js';

function fixtureGame(count = 6, heroFirst = false) {
  clearTimeout(timer);
  finishing = false;
  showdown.reset();
  handReview.reset();
  epoch++;
  game = newGame(count);
  if (heroFirst) game.dealer = count - 4;
  requestedCount = count;
  $('#player-count').value = count;
  lastHand = 0;
  lastBoard = 0;
}

window.qa = {
  stop() {
    clearTimeout(timer);
  },
  heroTurn(count = 6, unequal = false) {
    fixtureGame(count, true);
    if (unequal) game.players.slice(1).forEach((p) => (p.stack = 100 + p.id * 100));
    startHand(game);
    render();
    return publicState();
  },
  allinRest() {
    clearTimeout(timer);
    while (game.phase === 'playing') {
      const legal = legalActions(game);
      act(game, game.actor, legal.canRaise ? 'raise' : 'call', legal.maxRaiseTo);
    }
    render();
    return publicState();
  },
  river(count = 6) {
    fixtureGame(count);
    startHand(game);
    while (game.street < 3 || game.phase === 'playing') {
      if (game.phase === 'between') advanceStreet(game);
      else act(game, game.actor, 'call');
    }
    render();
    return publicState();
  },
  finish() {
    clearTimeout(timer);
    if (game.phase === 'between') advanceStreet(game);
    render();
    return publicState();
  },
  scene(hole, board, { count = 6, totals, folded = [], otherHoles = {} } = {}) {
    fixtureGame(count);
    startHand(game);
    const deck = deckOfCards();
    const parse = (s) =>
      s
        .split(' ')
        .map((v) =>
          deck.find(
            (c) => c.rank === '23456789TJQKA'.indexOf(v[0]) + 2 && c.suit === 'shcd'.indexOf(v[1]),
          ),
        );
    game.board = parse(board);
    game.players[0].hole = parse(hole);
    const used = new Set([...game.board, ...game.players[0].hole].map((c) => c.key));
    for (const [id, h] of Object.entries(otherHoles)) {
      game.players[id].hole = parse(h);
      game.players[id].hole.forEach((c) => used.add(c.key));
    }
    const rest = deck.filter((c) => !used.has(c.key));
    for (const p of game.players) {
      if (p.id && !otherHoles[p.id]) p.hole = rest.splice(0, 2);
      p.total = totals?.[p.id] ?? 100;
      p.bet = p.total;
      p.stack = 5000 - p.total;
      p.folded = folded.includes(p.id);
      p.allin = false;
      p.action = p.folded ? '弃牌' : '过牌';
    }
    game.street = 3;
    game.phase = 'between';
    game.revealed = true;
    settle(game, true);
    lastBoard = 5;
    render();
    return publicState();
  },
  state() {
    return {
      ...publicState(),
      totalLogs: game.logs.length,
      wealth:
        game.players.reduce((n, p) => n + p.stack, 0) + (game.phase === 'done' ? 0 : potSize(game)),
    };
  },
};
