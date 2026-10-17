import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, advanceStreet, potSize } from '../../src/engine/poker.js';
import { visibleRecentAction, renderSeatAction } from '../../src/ui/table-scene.js';
import { checkedSeatGame } from '../fixtures/checked-actions.js';

test('a completed check stays visible during another turn, a reopened round and a missing cached label', () => {
  for (const count of [5, 6, 7, 8, 9]) {
    const game = checkedSeatGame(count);
    const mia = game.players[1];
    const budget = game.players.reduce((sum, p) => sum + p.stack, 0) + potSize(game);
    assert.match(renderSeatAction(game, mia), />过牌</);
    assert.match(renderSeatAction(game, game.players[2]), /思考中/);
    // Completed-action state must also work for snapshots with no cached text.
    mia.action = '';
    mia.lastAction = null;
    assert.equal(visibleRecentAction(game, mia).text, '过牌');
    assert.match(renderSeatAction(game, mia), />过牌</);
    act(game, 2, 'raise', game.bigBlind);
    while (game.actor !== 1) {
      assert.match(renderSeatAction(game, mia), />过牌</);
      act(game, game.actor, 'call');
    }
    assert.match(renderSeatAction(game, mia), /思考中/);
    act(game, 1, 'call');
    assert.match(renderSeatAction(game, mia), />跟注</);
    assert.equal(mia.checked, false);
    advanceStreet(game);
    assert.equal(visibleRecentAction(game, mia), null);
    assert.match(renderSeatAction(game, mia), />等待行动</);
    assert.equal(game.players.reduce((sum, p) => sum + p.stack, 0) + potSize(game), budget);
  }
});

test('a check clears only at the next street and cannot replace a later fold', () => {
  for (const street of [1, 2]) {
    const game = checkedSeatGame(9, street);
    const mia = game.players[1];
    act(game, 2, 'check');
    assert.equal(game.phase, 'between');
    assert.match(renderSeatAction(game, mia), />过牌</);
    advanceStreet(game);
    assert.equal(mia.checked, false);
    assert.match(renderSeatAction(game, mia), />等待行动</);
  }
  const game = checkedSeatGame();
  act(game, 2, 'raise', game.bigBlind);
  while (game.actor !== 1) act(game, game.actor, 'call');
  act(game, 1, 'fold');
  assert.match(renderSeatAction(game, game.players[1]), />弃牌</);
});
