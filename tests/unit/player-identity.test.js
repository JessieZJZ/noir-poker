import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, startHand, seatPosition } from '../../src/engine/poker.js';
import { gameIdentities, actorAtPosition } from '../../src/engine/player-identity.js';
import { createActivityParts } from '../../src/ui/activity-parts.js';
import { createActivityFormatter } from '../../src/ui/activity.js';
import { createReviewInput } from '../../src/review/analysis.js';
import { explainOpponent } from '../../src/review/opponents.js';
import { causalReraiseGame } from '../fixtures/review-spots.js';

test('public activity captures names, assignments and per-hand positions without reading cards', () => {
  const game = newGame(9);
  game.dealer = 5;
  startHand(game);
  game.players[1].botProfile = 'rook';
  const position = seatPosition(game, 1);
  for (const p of game.players)
    Object.defineProperty(p, 'hole', {
      get() {
        throw Error('private hole');
      },
    });
  const present = createActivityParts(game),
    format = createActivityFormatter(game);
  const parts = present('Mia 小盲 100 · Alex 大盲 200');
  assert.deepEqual(
    parts
      .filter((p) => p.actor)
      .map(({ name, profile, position }) => ({ name, profile, position })),
    [
      { name: 'Mia', profile: '大注强攻', position },
      { name: 'Alex', profile: '', position: seatPosition(game, 2) },
    ],
  );
  game.dealer = 2;
  game.players[1].botProfile = 'rook';
  assert.equal(present('Mia 弃牌')[0].profile, '大注强攻');
  assert.equal(present('Mia 弃牌')[0].position, position);
  assert.match(format('你 跟注 300'), /你.*activity-position.*跟注 300/);
  assert.equal((format('Mia（大注强攻） 过牌').match(/大注强攻/g) || []).length, 1);
  assert.equal(format('MiaX <img>'), 'MiaX &lt;img&gt;');
});

test('review prose resolves a named actor and earlier folded identities using the stored hand', () => {
  const g = causalReraiseGame();
  g.players[1].botProfile = 'rook';
  const input = createReviewInput(g);
  const record = input.opponents[0];
  record.trace.profile = 'rook';
  const explanation = explainOpponent(record, input.players);
  assert.match(explanation.detail, /Mia（大注强攻）/);
  assert.match(explanation.detail, new RegExp(`在 ${record.trace.view.position} 位`));
  assert.ok(explanation.detail.includes('复盘分析总结'));
  const identities = gameIdentities(g);
  assert.match(actorAtPosition({ identities }, 1), /Mia（大注强攻）在 .* 位/);
  // Legacy snapshots retain available names; absent assignments are not invented.
  assert.equal(
    actorAtPosition({ players: [{ id: 3, name: 'River', position: 'BTN' }] }, 3),
    'River在 BTN 位',
  );
});
