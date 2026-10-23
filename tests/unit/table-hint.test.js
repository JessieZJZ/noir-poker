import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tableHint } from '../../src/review/table-hint.js';
import { newGame, legalActions } from '../../src/engine/poker.js';
import { tableHintGame, hintCards } from '../fixtures/table-hints.js';
import { loadLocale, localizeText, SUPPORTED_LOCALES } from '../../src/i18n/index.js';

test('live hints explain premium hands, suited connectors and real call prices plainly', () => {
  const aa = tableHint(tableHintGame());
  assert.match(aa, /AA，是翻牌前最强/);
  assert.doesNotMatch(aa, /三条|；|权益|跟注占/);
  assert.match(aa, /跟注 200 后可争夺 475.*42.1%/);
  assert.match(tableHint(tableHintGame('Ks Kh')), /KK.*仅次于 AA/);
  assert.match(tableHint(tableHintGame('4d 5d')), /同花连接牌.*顺子、同花听牌/);
  const capped = tableHintGame('5h 5c', '', 200, 100);
  assert.match(tableHint(capped), /全下 100，可争夺 275.*36.4%/);
  assert.doesNotMatch(tableHint(capped), /剩余|还留|再投入|加注|过牌/);
});

test('live hints name nut draws and distinguish private pairs from the public board', () => {
  assert.match(tableHint(tableHintGame('As 2s', '8s Kh 4s')), /同花听牌，补成后是最大的同花/);
  assert.match(tableHint(tableHintGame('Qs Js', 'Ts 9h 2s')), /同时有顺子和同花听牌/);
  assert.match(
    tableHint(tableHintGame('Ks Ad', '6d 5h 3s 5d Kh')),
    /底牌击中顶对 K，与公共牌的一对 5 共同组成两对，A 作为踢脚/,
  );
  const board = tableHint(tableHintGame('2h 3h', 'Ts Js Qs Ks As', 0));
  assert.match(board, /公共牌成牌，底牌没有提高牌力/);
  assert.doesNotMatch(board, /较弱的牌跟注/);
  const river = tableHint(tableHintGame('As 2s', '8s Kh 4s 9d Jc', 0));
  assert.doesNotMatch(river, /听牌|下一张|补成/);
});

test('live hints respect all-in, folded, waiting and unavailable raise decisions', () => {
  const game = tableHintGame('As 2s', '8s Kh 4s', 0);
  game.players.slice(1).forEach((player) => (player.allin = true));
  assert.equal(legalActions(game).canRaise, false);
  assert.match(tableHint(game), /可以过牌，不用再投入/);
  assert.doesNotMatch(tableHint(game), /若下注/);
  game.players[0].allin = true;
  game.players[0].stack = 0;
  assert.match(tableHint(game), /你已全下，不用再行动/);
  assert.doesNotMatch(tableHint(game), /跟注|听牌|过牌|发牌/);
  game.players[0].allin = false;
  game.players[0].folded = true;
  assert.match(tableHint(game), /你已经弃牌/);
  game.players[0].folded = false;
  game.actor = 1;
  assert.equal(tableHint(game), '还没轮到你，先观察其他玩家的行动。');
  assert.match(tableHint(newGame()), /开始一手牌后/);
});

test('card-fact caching never reuses a price and live hints ignore hidden information', () => {
  const game = tableHintGame('As 2s', '8s Kh 4s');
  const first = tableHint(game);
  game.deck.reverse();
  game.players.slice(1).forEach((player) => (player.hole = hintCards('Ac Ad')));
  game.winners = [{ id: 1 }];
  assert.equal(tableHint(game), first);
  game.players[1].bet = game.players[1].total = game.currentBet = 400;
  game.players[1].stack = 4600;
  assert.match(tableHint(game), /跟注 400 后可争夺 875.*45.7%/);
  assert.notEqual(tableHint(game), first);
});

test('settlement hints do not invent a hero raise or conflate the result with the decision', () => {
  const game = tableHintGame('As Ah');
  game.phase = 'done';
  game.showdown = false;
  assert.match(tableHint(game), /对手都已弃牌/);
  assert.doesNotMatch(tableHint(game), /本手加注|你加注/);
  game.players[0].folded = true;
  assert.match(tableHint(game), /弃牌时要付出的筹码/);
  game.players[0].folded = false;
  game.board = hintCards('8s Kh 4s 9d Jc');
  game.showdown = true;
  assert.match(tableHint(game), /最佳牌型.*别只看最后输赢/);
});

test('live hint combinations translate completely in every supported language', async () => {
  const examples = [
    tableHintGame(),
    tableHintGame('Ks Kh'),
    tableHintGame('4d 5d'),
    tableHintGame('As 2s', '8s Kh 4s'),
    tableHintGame('Qs Js', 'Ts 9h 2s'),
    tableHintGame('Ks Ad', '6d 5h 3s 5d Kh'),
    tableHintGame('2h 3h', 'Ts Js Qs Ks As', 0),
    tableHintGame('5h 5c', '', 200, 100),
  ];
  try {
    for (const locale of SUPPORTED_LOCALES.filter(
      (locale) => !['zh-CN', 'zh-TW', 'ja'].includes(locale),
    )) {
      await loadLocale(locale);
      for (const game of examples) {
        const text = localizeText(tableHint(game));
        assert.doesNotMatch(text, /\p{Script=Han}/u, `${locale}: ${text}`);
        assert.doesNotMatch(text, /\{\d+\}/, `${locale}: ${text}`);
      }
    }
  } finally {
    await loadLocale('zh-CN');
  }
});
