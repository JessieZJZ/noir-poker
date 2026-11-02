import {
  newGame,
  startHand,
  seatPosition,
  botDecision,
  act,
  advanceStreet,
  legalActions,
} from '../../src/engine/poker.js';
import { stakesFromSmallBlind } from '../../src/engine/stakes.js';
import { cards } from './deceptive-decisions.js';

export const clarityRandom = (seed) => () =>
  (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;

function deal(game) {
  const previous = Math.random;
  Math.random = clarityRandom(202610259);
  try {
    startHand(game);
  } finally {
    Math.random = previous;
  }
}

export function giveClarityHole(game, id, text) {
  for (const [index, wanted] of cards(text).entries()) {
    let found;
    for (const group of [...game.players.map((p) => p.hole), game.deck])
      for (let j = 0; j < group.length; j++) if (group[j].key === wanted.key) found = [group, j];
    if (!found) throw Error('Missing card in arranged deal');
    [game.players[id].hole[index], found[0][found[1]]] = [
      found[0][found[1]],
      game.players[id].hole[index],
    ];
  }
}

export function lunaCheapEntry({
  count = 7,
  depth = 77.5,
  hole = 'Kh 8h',
  smallBlind = 10000,
  profile = 'balanced',
  difficulty = 'normal',
} = {}) {
  const game = newGame(count, stakesFromSmallBlind(smallBlind));
  game.difficulty = difficulty;
  game.emotionMode = 'off';
  // Keep fixture identities unique in both the public history and review.
  for (const player of game.players) if (player.name === 'Luna') player.name = 'Rowan';
  deal(game);
  const target = game.players.find((p) => seatPosition(game, p.id) === 'UTG');
  if (game.actor !== target.id) throw Error('Expected first preflop actor');
  target.name = 'Luna';
  target.botProfile = profile;
  target.stack = depth * game.bigBlind;
  giveClarityHole(game, target.id, hole);
  return game;
}

// Legal scripted actions exercise presentation, not natural policy frequency.
// Every record retains its before-action view and explicit scripted provenance.
export function groupedPreflopReview({ hole = 'Ah Jh', facingSqueeze = false } = {}) {
  const game = newGame(7, stakesFromSmallBlind(10000));
  game.dealer = 3;
  game.difficulty = 'hard';
  game.emotionMode = 'off';
  ['你', 'Mia', 'Alex', 'River', 'Luna', 'Theo', 'Jade'].forEach((name, id) => {
    game.players[id].name = name;
    game.players[id].botProfile = [1, 2, 3].includes(id) ? 'vale' : 'balanced';
  });
  deal(game);
  giveClarityHole(game, 5, hole);
  for (const id of [0, 1, 2, 3]) act(game, id, 'call');
  act(game, 4, 'raise', 190000);
  if (facingSqueeze) {
    act(game, 5, 'call');
    act(game, 6, 'raise', 760000);
    act(game, 0, 'call');
    act(game, 1, 'fold');
    act(game, 2, 'call');
    act(game, 3, 'fold');
    act(game, 4, 'call');
  }
  if (game.actor !== 5) throw Error('Expected SB decision');
  const proposal = botDecision(game, clarityRandom(391));
  const record = {
    ...proposal,
    id: 5,
    name: 'Theo',
    action: facingSqueeze ? 'call' : 'raise',
    amount: facingSqueeze ? undefined : 760000,
    sequence: game.history.length + 1,
    trace: {
      ...proposal.trace,
      reason: facingSqueeze ? 'price-continue' : 'value-raise',
      reasonSource: 'scripted-action-only',
    },
  };
  act(game, record.id, record.action, record.amount);
  while (game.phase !== 'done') {
    if (game.phase === 'between') advanceStreet(game);
    else {
      const legal = legalActions(game);
      act(game, game.actor, legal.canCheck ? 'check' : 'fold');
    }
  }
  game.decisions = [];
  game.botDecisions = [record];
  return { game, record };
}
