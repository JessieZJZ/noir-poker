// External scripted deals use real engine actions and legal before-action views.
import {
  newGame,
  startHand,
  act,
  advanceStreet,
  deckOfCards,
  legalActions,
  planBotTurn,
  executeBotTurn,
} from '../../src/engine/poker.js';
import { cards } from './deceptive-decisions.js';
// Reference amounts describe the original 25/50 deals. An optional stakes
// configuration scales their stacks and actions together, through real rules.
const LEGACY_STAKES = { smallBlind: 25, bigBlind: 50, startingStack: 5000, chipUnit: 25 };
const scaleAmount = (game, amount) => (amount * game.bigBlind) / LEGACY_STAKES.bigBlind;
export const allInRandom = (seed) => () =>
  (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
function table(count, dealer, stacks = {}, stakes = LEGACY_STAKES) {
  const game = newGame(count, stakes);
  game.dealer = dealer;
  game.difficulty = 'hard';
  game.emotionMode = 'off';
  for (const [id, stack] of Object.entries(stacks))
    game.players[id].stack = scaleAmount(game, stack);
  startHand(game);
  return game;
}
function deal(game, assigned, board = '') {
  const community = board ? cards(board) : [];
  for (const [id, hole] of Object.entries(assigned)) game.players[id].hole = cards(hole);
  const known = [...Object.keys(assigned).flatMap((id) => game.players[id].hole), ...community];
  const remaining = deckOfCards().filter((card) => !known.some((other) => other.key === card.key));
  for (const p of game.players.filter((p) => !Object.hasOwn(assigned, p.id)))
    p.hole = remaining.splice(0, 2);
  if (community.length) {
    const sequence = [remaining.pop(), ...community.slice(0, 3)];
    for (const card of community.slice(3)) sequence.push(remaining.pop(), card);
    game.deck = [...remaining, ...sequence.reverse()];
  } else game.deck = remaining;
}
export function coldShoveResponse(hole = 'As Ah', stakes = LEGACY_STAKES) {
  const game = table(6, 2, {}, stakes);
  deal(game, { 0: '9d 8c', 1: hole });
  act(game, 0, 'raise', scaleAmount(game, 5000));
  return game;
}
// Reproduce a recorded nine-seat decision with five pending responses. This
// tests the explanation of the executed fold, not whether folding QQ is optimal.
export function pendingShoveResponse(stakes = LEGACY_STAKES) {
  const game = table(9, 2, {}, stakes);
  game.difficulty = 'normal';
  game.players[1].botProfile = 'owen';
  deal(game, { 0: '9d 8c', 1: 'Qc Qs' });
  act(game, 6, 'raise', scaleAmount(game, 225));
  act(game, 7, 'fold');
  act(game, 8, 'fold');
  act(game, 0, 'raise', scaleAmount(game, 5000));
  return game;
}
export function openerShoveResponse(
  hole = 'As Ah',
  heroStack = 5000,
  raiseTo = heroStack,
  stakes = LEGACY_STAKES,
) {
  const game = table(6, 5, { 0: heroStack }, stakes);
  deal(game, { 0: '9d 8c', 3: hole });
  act(game, 3, 'raise', scaleAmount(game, 150));
  act(game, 4, 'fold');
  act(game, 5, 'fold');
  act(game, 0, 'raise', scaleAmount(game, raiseTo));
  act(game, 1, 'fold');
  act(game, 2, 'fold');
  return game;
}
export function flopShoveResponse(
  hole = 'Qs Qd',
  heroStack = 5000,
  callerStack = 5000,
  stakes = LEGACY_STAKES,
) {
  const game = table(5, 3, { 0: heroStack, 1: callerStack }, stakes);
  deal(game, { 0: '9d 8c', 1: hole }, 'Js 7h 2c');
  for (const id of [2, 3, 4, 0]) act(game, id, 'call');
  act(game, 1, 'check');
  advanceStreet(game);
  act(game, 0, 'raise', game.players[0].stack);
  return game;
}
export function multiRaiseShoveResponse(hole = 'Qs Qd', stakes = LEGACY_STAKES) {
  const game = table(6, 5, {}, stakes);
  deal(game, { 0: '9d 8c', 1: 'Ks Kd', 3: hole });
  act(game, 3, 'raise', scaleAmount(game, 150));
  act(game, 4, 'raise', scaleAmount(game, 500));
  act(game, 5, 'call');
  act(game, 0, 'raise', scaleAmount(game, 5000));
  act(game, 1, 'call');
  act(game, 2, 'fold');
  return game;
}
export function largeFourBetResponse(hole = '7s 7h', raiseTo = 4000, stakes = LEGACY_STAKES) {
  const game = table(6, 5, {}, stakes);
  deal(game, { 0: '9d 8c', 3: hole });
  act(game, 3, 'raise', scaleAmount(game, 150));
  act(game, 4, 'raise', scaleAmount(game, 350));
  act(game, 5, 'fold');
  act(game, 0, 'raise', scaleAmount(game, raiseTo));
  act(game, 1, 'fold');
  act(game, 2, 'fold');
  return game;
}
export function oldShortAllInSideBet(stakes = LEGACY_STAKES) {
  const game = table(5, 3, { 1: 100 }, stakes);
  deal(game, { 0: '9d 8c', 1: 'Qs Qd', 3: 'Ah Jd' }, 'Js 7h 2c');
  for (const id of [2, 3, 4, 0]) act(game, id, 'call');
  act(game, 1, 'raise', scaleAmount(game, 100));
  for (const id of [2, 3, 4, 0]) act(game, id, 'call');
  advanceStreet(game);
  act(game, 0, 'check');
  act(game, 2, 'raise', scaleAmount(game, 50));
  return game;
}
export function earlierShortAndFlopShoveResponse(stakes = LEGACY_STAKES) {
  const game = table(5, 3, { 1: 100 }, stakes);
  deal(game, { 0: '9d 8c', 1: 'As Ah', 2: 'Ks Kd' }, 'Js 7h 2c');
  for (const id of [2, 3, 4, 0]) act(game, id, 'call');
  act(game, 1, 'raise', scaleAmount(game, 100));
  for (const id of [2, 3, 4, 0]) act(game, id, 'call');
  advanceStreet(game);
  act(game, 0, 'raise', game.players[0].stack);
  return game;
}
export function riverShoveResponse(
  hole = '2c 3d',
  board = 'As Ks Qs Js Ts',
  stakes = LEGACY_STAKES,
) {
  const game = table(5, 3, {}, stakes);
  deal(game, { 0: '9d 8c', 1: hole }, board);
  for (const id of [2, 3, 4, 0]) act(game, id, 'call');
  act(game, 1, 'check');
  for (let street = 1; street <= 3; street++) {
    advanceStreet(game);
    if (street < 3) while (game.phase === 'playing') act(game, game.actor, 'check');
  }
  act(game, 0, 'raise', game.players[0].stack);
  return game;
}
export function topPairDonkResponse(stakes = LEGACY_STAKES) {
  const game = table(6, 5, {}, stakes);
  deal(game, { 0: 'Qc Tc', 1: 'As Jh' }, 'Jd 7c 2h');
  for (const id of [3, 4, 5]) act(game, id, 'fold');
  act(game, 0, 'raise', scaleAmount(game, 150));
  act(game, 1, 'call');
  act(game, 2, 'fold');
  advanceStreet(game);
  return game;
}
export function nearAllInDrawResponse(stakes = LEGACY_STAKES) {
  const game = table(9, 8, { 1: 175 }, stakes);
  deal(game, { 0: 'Ah Kd', 1: 'Qs Js' }, 'Ts 9d 2s');
  for (const id of [3, 4, 5, 6, 7, 8, 0, 1]) act(game, id, 'call');
  act(game, 2, 'check');
  advanceStreet(game);
  for (const id of [1, 2, 3, 4, 5, 6, 7, 8]) act(game, id, 'check');
  act(game, 0, 'raise', scaleAmount(game, 100));
  return game;
}
export function headsUpShoveResponse(
  hole = '7h 7d',
  board = '7s Jh 9h Th',
  stakes = LEGACY_STAKES,
) {
  const game = table(5, 3, {}, stakes);
  deal(game, { 0: 'Ac Kd', 1: hole }, board);
  for (const id of [2, 3, 4]) act(game, id, 'fold');
  act(game, 0, 'call');
  act(game, 1, 'check');
  const targetStreet = cards(board).length - 2;
  for (let street = 1; street <= targetStreet; street++) {
    advanceStreet(game);
    if (street < targetStreet) while (game.phase === 'playing') act(game, game.actor, 'check');
  }
  act(game, 0, 'raise', game.players[0].stack);
  return game;
}
export function finishAfterResponse(game, decision) {
  act(game, game.actor, decision.action, decision.amount);
  return finishScriptedHand(game);
}
function finishScriptedHand(game) {
  while (game.phase !== 'done') {
    if (game.phase === 'between') advanceStreet(game);
    else act(game, game.actor, legalActions(game).canCheck ? 'check' : 'fold');
  }
  return game;
}
export function reviewedAllInGame(kind = 'flop-qq') {
  const game =
    kind === 'multi-qq'
      ? multiRaiseShoveResponse()
      : ['deep-nonallin', 'deep-value-jam'].includes(kind)
        ? openerShoveResponse('As Ah', 5000, 4000)
        : kind === 'made-redraw'
          ? headsUpShoveResponse()
          : kind === 'draw-fold'
            ? headsUpShoveResponse('Qs 7s', 'Ts 9d 2s')
            : kind === 'shared-royal'
              ? riverShoveResponse()
              : flopShoveResponse();
  // Preserve the deliberately sampled flat-call copy check separately from
  // the new, more common AA value shove over the same non-all-in 80BB bet.
  const plan = planBotTurn(game, allInRandom(kind === 'deep-nonallin' ? 2 : 1), {
    timingRandom: allInRandom(2),
  });
  executeBotTurn(game, plan, { expedited: true });
  return finishScriptedHand(game);
}
