// Vite injects this file into the table controller ONLY in test mode.
// It deliberately uses the controller's real rendering, actions and engine.
import { deckOfCards, settle } from '../engine/poker.js';

function fixtureGame(count = 6, heroFirst = false) {
  seatHandVisibility.clear();
  clearTimeout(timer);
  botWait = null;
  finishing = false;
  showdown.reset();
  handReview.reset();
  epoch++;
  game = newGame(count);
  if (heroFirst) game.dealer = count - 4;
  applyBotSettings(game, pendingBotSettings);
  requestedCount = count;
  $('#player-count').value = count;
  lastHand = 0;
  lastBoard = 0;
}

window.qa = {
  hole(id) {
    return game.players[id].hole.map((c) => rankText(c.rank) + c.symbol);
  },
  stop() {
    clearTimeout(timer);
    botWait = null;
  },
  thinking() {
    return botWait
      ? { actor: game.actor, delayMs: botWait.plan.delayMs, startedAt: botWait.startedAt }
      : null;
  },
  resumeBots() {
    schedule();
    return this.thinking();
  },
  timingRecords() {
    return game.botDecisions.map((r) => ({
      id: r.id,
      action: r.action,
      thinking: r.trace.thinking,
    }));
  },
  heroTurn(count = 6, unequal = false) {
    fixtureGame(count, true);
    if (unequal) game.players.slice(1).forEach((p) => (p.stack = 100 + p.id * 100));
    startHand(game);
    render();
    return publicState();
  },
  bettingTurn(level = 2, street = 0, short = false) {
    fixtureGame(6);
    game.dealer = 5;
    if (short) game.players[0].stack = 175;
    startHand(game);
    if (street === 0) {
      if (level >= 3) act(game, 3, 'raise', 150);
      if (level >= 4) act(game, 4, 'raise', 350);
      while (game.actor !== 0) act(game, game.actor, 'fold');
    } else {
      while (game.street < street) {
        while (game.phase === 'playing') act(game, game.actor, 'call');
        advanceStreet(game);
      }
      if (level >= 2) act(game, 1, 'raise', 100);
      if (level >= 3) act(game, 2, 'raise', 300);
      while (game.actor !== 0) act(game, game.actor, level === 1 ? 'check' : 'fold');
    }
    render();
    return publicState();
  },
  potSizing({ opening = 350, wager = 800, stack = 5025 } = {}) {
    fixtureGame(6);
    game.dealer = 5;
    game.players[0].stack = stack;
    startHand(game);
    act(game, 3, 'raise', opening);
    for (const id of [4, 5, 0]) act(game, id, 'call');
    for (const id of [1, 2]) act(game, id, 'fold');
    advanceStreet(game);
    while (game.phase === 'playing') act(game, game.actor, 'check');
    advanceStreet(game);
    act(game, 3, 'raise', wager);
    act(game, 4, 'call');
    act(game, 5, 'fold');
    render();
    return publicState();
  },
  publicBoard(count = 6) {
    fixtureGame(count);
    startHand(game);
    act(game, game.actor, 'raise', 1000);
    while (game.phase === 'playing') act(game, game.actor, 'call');
    advanceStreet(game);
    render();
    return publicState();
  },
  roundActions(count = 6, runout = false, blindAllin = false) {
    fixtureGame(count, true);
    for (const p of game.players) if (p.id === 2 || (runout && p.id)) p.stack = 150;
    if (blindAllin) {
      game.players[count - 2].stack = 25;
      game.players[count - 1].stack = 50;
    }
    startHand(game);
    act(game, 0, 'raise', 150);
    while (game.phase === 'playing')
      act(game, game.actor, !runout && game.actor === 3 ? 'fold' : 'call');
    render();
    return publicState();
  },
  checkRest() {
    clearTimeout(timer);
    while (game.phase === 'playing') act(game, game.actor, 'check');
    render();
    return publicState();
  },
  botFoldTurn() {
    fixtureGame(6, true);
    startHand(game);
    act(game, 0, 'raise', 4000);
    const id = game.actor;
    game.players[id].hole = ['7s', '2h'].map((v) =>
      deckOfCards().find((c) => c.rank === Number(v[0]) && c.suit === 'shcd'.indexOf(v[1])),
    );
    const plan = planBotTurn(game, () => 0.99, { timingRandom: () => 0 });
    const startedAt = activityClock.now();
    botWait = { plan, startedAt, deadline: startedAt + plan.delayMs };
    render();
    schedule();
    return { actor: id, delayMs: plan.delayMs };
  },
  botCheckTurn() {
    fixtureGame(6, true);
    startHand(game);
    while (!legalActions(game).canCheck) act(game, game.actor, 'call');
    const id = game.actor;
    game.players[id].hole = ['7s', '2h'].map((v) =>
      deckOfCards().find((c) => c.rank === Number(v[0]) && c.suit === 'shcd'.indexOf(v[1])),
    );
    const plan = planBotTurn(game, () => 0.99, { timingRandom: () => 0 });
    const startedAt = activityClock.now();
    botWait = { plan, startedAt, deadline: startedAt + plan.delayMs };
    render();
    schedule();
    return { actor: id, delayMs: plan.delayMs };
  },
  foldFinished(street = 0) {
    fixtureGame(6, true);
    startHand(game);
    while (game.street < street) {
      while (game.phase === 'playing') act(game, game.actor, 'call');
      advanceStreet(game);
    }
    if (street > 0) act(game, game.actor, 'raise', 100);
    while (game.actor !== 0) act(game, game.actor, 'fold');
    act(game, 0, 'fold');
    while (game.phase === 'playing') act(game, game.actor, 'fold');
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
  respondToHero(raiseTo = 0, nextStreet = false) {
    clearTimeout(timer);
    botWait = null;
    const callUntilHero = () => {
      while (game.phase === 'playing' && game.actor !== 0) {
        act(game, game.actor, raiseTo ? 'raise' : 'call', raiseTo);
        raiseTo = 0;
      }
    };
    callUntilHero();
    if (nextStreet && game.phase === 'between') {
      advanceStreet(game);
      callUntilHero();
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
  retainedRiver(count = 6) {
    fixtureGame(count, true);
    startHand(game);
    while (game.street < 3) {
      if (game.phase === 'between') advanceStreet(game);
      else act(game, game.actor, 'call');
    }
    act(game, game.actor, 'raise', 100);
    act(game, game.actor, 'call');
    act(game, game.actor, 'raise', 300);
    act(game, game.actor, 'fold');
    while (game.phase === 'playing') act(game, game.actor, 'call');
    render();
    return publicState();
  },
  finish() {
    clearTimeout(timer);
    if (game.phase === 'between') advanceStreet(game);
    render();
    return publicState();
  },
  foldWin(count = 6, winner = count - 1) {
    fixtureGame(count, true);
    startHand(game);
    while (game.phase === 'playing') act(game, game.actor, game.actor === winner ? 'call' : 'fold');
    render();
    return publicState();
  },
  foldRest() {
    clearTimeout(timer);
    while (game.phase === 'playing') act(game, game.actor, 'fold');
    render();
    return publicState();
  },
  foldPotRefund(count = 6) {
    fixtureGame(count, true);
    startHand(game);
    while (game.actor !== 2) act(game, game.actor, 'fold');
    act(game, 2, 'raise', 125);
    while (game.phase === 'playing') act(game, game.actor, 'fold');
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
      p.lastAction = { text: p.action, street: 3, bet: p.bet };
    }
    game.street = 3;
    game.phase = 'between';
    game.revealed = true;
    settle(game, true);
    lastBoard = 5;
    render();
    return publicState();
  },
  reviewClosingCall(win = true) {
    fixtureGame(6);
    game.dealer = 5;
    startHand(game);
    const parse = (s) =>
      s
        .split(' ')
        .map((v) =>
          deckOfCards().find(
            (c) => c.rank === '23456789TJQKA'.indexOf(v[0]) + 2 && c.suit === 'shcd'.indexOf(v[1]),
          ),
        );
    const board = parse('Qs Jd 9c 8h 2s');
    game.players[0].hole = parse(win ? '2h 4h' : 'As Ah');
    game.players[2].hole = parse(win ? 'Ac Kd' : '2c 2d');
    const reserved = [...board, ...game.players[0].hole, ...game.players[2].hole];
    const rest = deckOfCards().filter((c) => !reserved.some((r) => r.key === c.key));
    for (const p of game.players.filter((p) => ![0, 2].includes(p.id))) p.hole = rest.splice(0, 2);
    game.deck = rest;
    while (game.actor !== 0) act(game, game.actor, 'fold');
    act(game, 0, 'call');
    act(game, 1, 'fold');
    act(game, 2, 'check');
    while (game.street < 3) {
      if (game.phase === 'between') advanceStreet(game);
      else act(game, game.actor, 'check');
    }
    game.board = board;
    act(game, 2, 'raise', win ? game.players[2].stack : 50);
    act(game, 0, 'call');
    if (game.phase === 'between') advanceStreet(game);
    render();
    return publicState();
  },
  reviewLine() {
    fixtureGame(6);
    game.dealer = 5;
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
    game.players[0].hole = parse('Ac 7h');
    const rest = deck.filter((c) => !game.players[0].hole.some((h) => h.key === c.key));
    for (const p of game.players.slice(1)) p.hole = rest.splice(0, 2);
    game.deck = rest;
    while (game.actor !== 0) act(game, game.actor, 'fold');
    act(game, 0, 'raise', 150);
    act(game, 1, 'call');
    act(game, 2, 'raise', 650);
    act(game, 0, 'call');
    act(game, 1, 'raise', 1800);
    act(game, 2, 'call');
    act(game, 0, 'call');
    while (game.phase !== 'done') {
      if (game.phase === 'between') advanceStreet(game);
      else if (game.actor === 0) act(game, 0, legalActions(game).canCheck ? 'check' : 'call');
      else playBotTurn(game, () => 0.8);
    }
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
  finishWithProfiles() {
    clearTimeout(timer);
    while (game.phase !== 'done') {
      if (game.phase === 'between') advanceStreet(game);
      else if (game.actor === 0) act(game, 0, 'call');
      else playBotTurn(game, () => 0.8);
    }
    render();
    return game.botDecisions.map((r) => ({
      id: r.id,
      profile: r.trace.profile,
      baseAxes: r.trace.baseAxes,
      axes: r.trace.axes,
    }));
  },
};
