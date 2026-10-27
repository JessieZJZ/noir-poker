import assert from 'node:assert/strict';

export const PRESSURE_HANDS = {
  AA: 'As Ah',
  KK: 'Ks Kd',
  QQ: 'Qs Qd',
  JJ: 'Js Jh',
  TT: 'Ts Th',
  AKs: 'As Ks',
  AKo: 'As Kd',
  KQs: 'Ks Qs',
  KQo: 'Ks Qh',
  66: '6s 6h',
  '72o': '7s 2h',
};

export const PRESSURE_LINES = [
  'open-10',
  'open-40',
  'open-75',
  'early-jam-20',
  'early-jam-50',
  'early-jam-100',
  'late-jam-20',
  'late-jam-50',
  'late-jam-100',
  '3bet-jam-20',
  '3bet-jam-50',
  '3bet-jam-100',
  '4bet-jam-100',
  '5bet-jam-100',
  'multi-caller-jam-100',
  'unopened-20',
  'unopened-100',
  'reraise-3bet-10',
  'reraise-4bet-25',
  'reraise-5bet-50',
];

// Script only the public line up to the decision under test. Every payment,
// legal action and settlement continues to belong to the production engine.
export function preflopPressureCase(
  engine,
  { seats, kind, hand, difficulty = 'hard', smallBlind = 100 },
) {
  assert([2, 3, 5, 6, 7, 8, 9].includes(seats));
  assert(PRESSURE_LINES.includes(kind));
  if (seats === 2 && kind === 'multi-caller-jam-100') return null;
  const game = engine.newGame(Math.max(5, seats), {
    smallBlind,
    bigBlind: smallBlind * 2,
    startingStack: smallBlind * 200,
    chipUnit: smallBlind,
  });
  const bb = game.bigBlind;
  game.difficulty = difficulty;
  game.emotionMode = 'off';
  for (const p of game.players.slice(seats)) {
    p.out = true;
    p.stack = 0;
  }
  const unopened = kind.startsWith('unopened-');
  const targetOpens =
    unopened ||
    kind.startsWith('3bet-') ||
    kind.startsWith('5bet-') ||
    kind === 'reraise-3bet-10' ||
    kind === 'reraise-5bet-50';
  const late = kind.startsWith('late-');
  const target = targetOpens || late ? 1 : seats - 1;
  const dealer = targetOpens
    ? seats === 2
      ? 1
      : seats - 2
    : seats === 2
      ? 0
      : late
        ? seats - 1
        : seats - 3;
  game.dealer = (dealer + seats - 1) % seats;
  if (unopened) game.players[target].stack = Number(kind.split('-').at(-1)) * bb;
  else if (kind.includes('jam')) game.players[0].stack = Number(kind.split('-').at(-1)) * bb;
  engine.startHand(game);

  const parse = (text) =>
    text
      .split(' ')
      .map((key) =>
        engine
          .deckOfCards()
          .find(
            (c) =>
              c.rank === '23456789TJQKA'.indexOf(key[0]) + 2 && c.suit === 'shcd'.indexOf(key[1]),
          ),
      );
  const own = parse(PRESSURE_HANDS[hand] || hand);
  assert(own.every(Boolean));
  const remaining = engine.deckOfCards().filter((c) => !own.some((o) => o.key === c.key));
  for (const p of game.players)
    p.hole = p.out ? [] : p.id === target ? own : remaining.splice(0, 2);
  game.deck = remaining;
  const foldTo = (id) => {
    let n = 0;
    while (game.actor !== id) {
      assert(++n < seats);
      engine.act(game, game.actor, 'fold');
    }
  };
  const raise = (amount) => engine.act(game, game.actor, 'raise', amount * bb);
  if (unopened) foldTo(target);
  else if (targetOpens) {
    foldTo(target);
    raise(3);
    foldTo(0);
    if (kind.startsWith('3bet-')) raise(Number(kind.split('-').at(-1)));
    else {
      raise(kind === 'reraise-3bet-10' ? 10 : 9);
      if (kind !== 'reraise-3bet-10') {
        assert.equal(game.actor, target);
        raise(23);
        assert.equal(game.actor, 0);
        raise(kind === 'reraise-5bet-50' ? 50 : Number(kind.split('-').at(-1)));
      }
    }
  } else if (kind.startsWith('4bet-') || kind === 'reraise-4bet-25') {
    foldTo(0);
    raise(3);
    foldTo(target);
    raise(9);
    assert.equal(game.actor, 0);
    raise(kind === 'reraise-4bet-25' ? 25 : 100);
  } else {
    foldTo(0);
    raise(Number(kind.split('-').at(-1)));
    if (kind.startsWith('multi-caller')) engine.act(game, game.actor, 'call');
    foldTo(target);
  }
  assert.equal(game.actor, target);
  assert.equal(engine.seatedRing(game).length, seats);
  return game;
}

export function finishPressureCase(engine, source, decision) {
  const game = structuredClone(source);
  const bank = game.players.reduce((sum, p) => sum + p.stack + p.total, 0);
  engine.act(game, game.actor, decision.action, decision.amount);
  let n = 0;
  while (game.phase !== 'done') {
    assert(++n < 100);
    if (game.phase === 'between') engine.advanceStreet(game);
    else engine.act(game, game.actor, engine.legalActions(game).canCheck ? 'check' : 'call');
  }
  assert.equal(
    game.players.reduce((sum, p) => sum + p.stack, 0),
    bank,
  );
  assert(game.players.every((p) => p.stack >= 0 && p.stack % game.chipUnit === 0));
  assert(game.payouts.every((amount) => amount >= 0 && amount % game.chipUnit === 0));
  return game;
}
