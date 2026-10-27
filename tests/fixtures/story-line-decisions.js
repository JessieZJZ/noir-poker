import { newGame, startHand, act, advanceStreet, botDecision } from '../../src/engine/poker.js';
import { stakesFromSmallBlind } from '../../src/engine/stakes.js';
import { clarityRandom, giveClarityHole } from './review-clarity-followup.js';
import { cards } from './deceptive-decisions.js';

// The supplied screenshots start after earlier preflop actions. A limp/open
// reconstruction produces the shown 300K flop pot; it is not a recovered save.
export function riverStory({
  hole = 'Jc Js',
  river = '5c',
  betBB = 68.5,
  difficulty = 'hard',
  route = 'check-raise',
  shove = false,
  smallBlind = 10000,
  defenderBB = 111,
  heroHole = 'Jd 8c',
} = {}) {
  const game = newGame(7, stakesFromSmallBlind(smallBlind));
  const amount = (bb) => bb * game.bigBlind;
  game.dealer = 5;
  game.difficulty = difficulty;
  game.emotionMode = 'off';
  ['你', 'Mia', 'Alex', 'River', 'Luna', 'Theo', 'Jade'].forEach(
    (name, id) => (game.players[id].name = name),
  );
  const saved = Math.random;
  Math.random = clarityRandom(202610257);
  try {
    startHand(game);
  } finally {
    Math.random = saved;
  }
  game.players[0].stack += shove ? 0 : amount(123); // Later-hand stacks, not a new starting-stack rule.
  game.players[3].stack = amount(defenderBB);
  game.players[3].botProfile = 'jett';
  giveClarityHole(game, 0, heroHole);
  giveClarityHole(game, 3, hole);
  const board = cards('5h 6h Ac 3s ' + river);
  const burns = [];
  for (const card of board) {
    let found;
    for (const group of [
      ...game.players.filter((p) => ![0, 3].includes(p.id)).map((p) => p.hole),
      game.deck,
    ])
      for (let i = 0; i < group.length; i++) if (group[i].key === card.key) found = [group, i];
    if (!found) throw Error('Reserved board conflicts with active hole cards');
    const spare = game.deck.findIndex((c) => !board.some((b) => b.key === c.key));
    [found[0][found[1]], game.deck[spare]] = [game.deck[spare], found[0][found[1]]];
  }
  const reserved = new Set(board.map((c) => c.key));
  const remaining = game.deck.filter((c) => !reserved.has(c.key));
  for (let i = 0; i < 3; i++) burns.push(remaining.pop());
  game.deck = [
    ...remaining,
    ...[burns[0], ...board.slice(0, 3), burns[1], board[3], burns[2], board[4]].reverse(),
  ];
  act(game, 2, 'call');
  act(game, 3, 'raise', amount(6.5));
  for (const id of [4, 5, 6]) act(game, id, 'fold');
  act(game, 0, 'call');
  act(game, 1, 'fold');
  act(game, 2, 'fold');
  advanceStreet(game);
  if (route === 'barrel') {
    act(game, 0, 'raise', amount(10));
    act(game, 3, 'call');
  } else {
    act(game, 0, 'check');
    act(game, 3, 'check');
  }
  advanceStreet(game);
  if (route === 'barrel') {
    act(game, 0, 'raise', amount(15));
    act(game, 3, 'call');
  } else {
    act(game, 0, 'check');
    act(game, 3, 'raise', amount(7.5));
    act(game, 0, 'raise', amount(25));
    if (route === 'reraise') {
      act(game, 3, 'raise', amount(55));
      act(game, 0, 'raise', amount(90));
    }
    act(game, 3, 'call');
  }
  advanceStreet(game);
  act(game, 0, 'raise', betBB * game.bigBlind);
  return game;
}

export function storyDecision(options = {}, seed = 71) {
  const game = riverStory(options);
  return { game, decision: botDecision(game, clarityRandom(seed)) };
}
