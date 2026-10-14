// Before-action public snapshots for the user's two reported review scenes.
// Only tests import this file; no fixture belongs in a production bundle.
import { cards } from './deceptive-decisions.js';
import {
  newGame,
  startHand,
  act,
  advanceStreet,
  botDecision,
  seatPosition,
  deckOfCards,
} from '../../src/engine/poker.js';
const legacyStakes = { smallBlind: 25, bigBlind: 50, startingStack: 5000, chipUnit: 25 };

export function causalReraiseGame() {
  // A scripted hand uses real legal actions and before-action engine snapshots.
  // The fixed bot record is an explanation fixture, not a measured bot sample.
  const game = newGame(6, legacyStakes);
  game.dealer = 5;
  game.difficulty = 'hard';
  game.emotionMode = 'off';
  startHand(game);
  game.players[0].hole = cards('6h 9c');
  game.players[1].hole = cards('Ad Qc');
  const used = [...game.players[0].hole, ...game.players[1].hole];
  const remaining = deckOfCards().filter((card) => !used.some((own) => own.key === card.key));
  for (const player of game.players.slice(2)) player.hole = remaining.splice(0, 2);
  game.deck = remaining;
  act(game, 3, 'call');
  act(game, 4, 'fold');
  act(game, 5, 'raise', 200);
  act(game, 0, 'raise', 350);
  const inspected = botDecision(game, () => 0.9, { trials: 1 });
  const view = {
    ...inspected.trace.view,
    pending: [...game.pending],
    opponents: inspected.trace.view.opponents.map((opponent) => ({
      ...opponent,
      name: game.players[opponent.id].name,
      position: seatPosition(game, opponent.id),
    })),
  };
  const record = {
    id: 1,
    name: game.players[1].name,
    sequence: game.history.length + 1,
    action: 'raise',
    amount: 1000,
    trace: {
      ...inspected.trace,
      view,
      reason: 'value-raise',
      exceptions: [],
      profile: 'balanced',
      sizing: { executed: true },
    },
  };
  act(game, 1, 'raise', 1000);
  game.botDecisions = [record];
  act(game, 2, 'fold');
  act(game, 3, 'call');
  act(game, 5, 'call');
  act(game, 0, 'fold');
  while (game.phase !== 'done') {
    if (game.phase === 'between') advanceStreet(game);
    else act(game, game.actor, 'check');
  }
  return game;
}

export function heroValueGame(kind = 'set-shove') {
  const game = newGame(6, legacyStakes);
  game.dealer = 5;
  if (kind === 'set-shove') game.players[0].stack = game.players[5].stack = 1500;
  startHand(game);
  game.players[0].hole = cards(kind === 'set-shove' ? '5s 5d' : 'As Ah');
  game.players[5].hole = cards('Kd Qc');
  const flop = cards(kind === 'set-shove' ? '5h Ks 9c' : '7d 4h 2c');
  const used = [...game.players[0].hole, ...game.players[5].hole, ...flop];
  const remaining = deckOfCards().filter((card) => !used.some((own) => own.key === card.key));
  for (const player of game.players.filter((player) => ![0, 5].includes(player.id)))
    player.hole = remaining.splice(0, 2);
  const burn = remaining.pop();
  game.deck = [...remaining, ...flop.slice().reverse(), burn];
  act(game, 3, 'fold');
  act(game, 4, 'fold');
  act(game, 5, 'raise', kind === 'set-shove' ? 500 : 150);
  act(game, 0, 'call');
  act(game, 1, 'fold');
  act(game, 2, 'fold');
  advanceStreet(game);
  if (kind === 'set-shove') {
    act(game, 5, 'raise', 100);
    act(game, 0, 'raise', 1000);
    act(game, 5, 'call');
  }
  while (game.phase !== 'done') {
    if (game.phase === 'between') advanceStreet(game);
    else act(game, game.actor, 'check');
  }
  return game;
}

export function weakSuitedShove() {
  return {
    smallBlind: 25,
    bigBlind: 50,
    chipUnit: 25,
    index: 0,
    hand: 1,
    hole: cards('5c 2c'),
    board: [],
    street: 0,
    position: 'CO',
    stack: 5000,
    total: 0,
    bet: 0,
    pot: 225,
    currentBet: 150,
    minRaise: 100,
    action: 'raise',
    amount: 5000,
    pending: [0, 3, 4, 5],
    legal: {
      chipUnit: 25,
      enabled: true,
      canCheck: false,
      canRaise: true,
      raiseReopened: true,
      callAmount: 150,
      toCall: 150,
      minRaiseTo: 250,
      maxRaiseTo: 5000,
    },
    players: [
      { id: 0, name: '你', position: 'CO', stack: 5000, total: 0, bet: 0 },
      { id: 1, name: 'Kai', position: 'UTG', stack: 4850, total: 150, bet: 150 },
      { id: 2, name: 'Luna', position: 'MP', stack: 5000, total: 0, bet: 0, folded: true },
      { id: 3, name: 'Theo', position: 'BTN', stack: 5000, total: 0, bet: 0 },
      { id: 4, name: 'Jade', position: 'SB', stack: 4975, total: 25, bet: 25 },
      { id: 5, name: 'Leo', position: 'BB', stack: 4950, total: 50, bet: 50 },
    ],
    history: [
      { id: 1, street: 0, action: 'raise', amount: 150 },
      { id: 2, street: 0, action: 'fold', amount: 0 },
    ],
  };
}

export function pocketTensRecords() {
  const legal = {
    chipUnit: 25,
    enabled: true,
    canCheck: false,
    canRaise: true,
    raiseReopened: true,
    callAmount: 50,
    toCall: 50,
    minRaiseTo: 100,
    maxRaiseTo: 4800,
  };
  const view = {
    smallBlind: 25,
    bigBlind: 50,
    chipUnit: 25,
    id: 1,
    hole: cards('Th Tc'),
    board: [],
    street: 0,
    position: 'UTG',
    inPosition: false,
    count: 6,
    stack: 4800,
    bet: 0,
    pot: 75,
    currentBet: 50,
    contestable: 125,
    rivals: 5,
    equity: 0.717,
    difficulty: 'hard',
    history: [],
    playsBoard: false,
    features: { draw: false, wet: false },
    opponents: [
      { id: 0, name: '你', position: 'CO', stack: 5000, bet: 0, allin: false },
      { id: 2, position: 'MP', stack: 5000, bet: 0, allin: false },
      { id: 3, position: 'BTN', stack: 5000, bet: 0, allin: false },
      { id: 4, position: 'SB', stack: 4975, bet: 25, allin: false },
      { id: 5, position: 'BB', stack: 4950, bet: 50, allin: false },
    ],
    legal,
  };
  const trace = {
    view,
    profile: 'peter',
    reason: 'value-raise',
    exceptions: [],
    equity: view.equity,
    callTolerance: 0,
    trials: 52,
    odds: 0.4,
    mode: 'off',
    mood: { kind: 'steady' },
  };
  const opening = {
    id: 1,
    name: 'Kai',
    sequence: 1,
    action: 'raise',
    amount: 150,
    trace,
  };
  const facingShove = structuredClone(opening);
  Object.assign(facingShove, { sequence: 6, action: 'call', amount: 4650 });
  Object.assign(facingShove.trace, { reason: 'premium-continue', odds: 4650 / 9675 });
  Object.assign(facingShove.trace.view, {
    stack: 4650,
    bet: 150,
    pot: 5225,
    currentBet: 5000,
    contestable: 9675,
    rivals: 1,
    opponents: [{ id: 0, name: '你', position: 'CO', stack: 0, bet: 5000, allin: true }],
    history: [
      { id: 1, street: 0, action: 'raise', amount: 150 },
      { id: 2, street: 0, action: 'fold', amount: 0 },
      { id: 0, street: 0, action: 'raise', amount: 5000 },
      { id: 3, street: 0, action: 'fold', amount: 0 },
      { id: 4, street: 0, action: 'fold', amount: 0 },
      { id: 5, street: 0, action: 'fold', amount: 0 },
    ],
    legal: { ...legal, canRaise: false, callAmount: 4650, toCall: 4850, minRaiseTo: 9850 },
  });
  return [opening, facingShove];
}
