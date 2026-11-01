import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { compactChips } from '../../src/engine/chip-format.js';
import { deckOfCards, evaluate, rankText } from '../../src/engine/poker.js';
import { createWinRateSession } from '../../src/engine/win-rate-session.js';
import { renderCardArtwork } from '../../src/ui/cards.js';

const read = (path) => readFileSync(new URL(`../../miniprogram/${path}`, import.meta.url), 'utf8');
const presentation = { exports: {} };
vm.runInNewContext(read('pages/table/presentation.js'), {
  module: presentation,
  require: (name) =>
    name.endsWith('/chip-format.js')
      ? { compactChips }
      : name.endsWith('/cards.js')
        ? { renderCardArtwork }
        : { evaluate, rankText },
});
function openPage() {
  let definition;
  const calls = [];
  const timers = new Map();
  let serial = 0;
  vm.runInNewContext(read('calculator/win-rate.js'), {
    Page: (value) => (definition = value),
    wx: {
      getWindowInfo: () => ({ statusBarHeight: 47, windowHeight: 844, safeArea: { bottom: 810 } }),
    },
    require(name) {
      if (name === '../shared/engine/poker.js') return { deckOfCards };
      if (name === './engine/win-rate-session.js')
        return {
          createWinRateSession: (options) =>
            createWinRateSession({
              ...options,
              setTimer: (callback) => (timers.set(++serial, callback), serial),
              clearTimer: (id) => timers.delete(id),
            }),
        };
      if (name === '../pages/table/presentation.js') return presentation.exports;
      assert.equal(name, '../record-navigation.js');
      return { returnToGame: () => calls.push('return') };
    },
  });
  const page = {
    ...definition,
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(patch) {
      for (const [path, value] of Object.entries(patch)) {
        const keys = path.replace(/\[(\d+)\]/g, '.$1').split('.'),
          last = keys.pop();
        keys.reduce((node, key) => node[key], this.data)[last] = value;
      }
    },
  };
  page.onLoad();
  page.onShow();
  return { page, calls, timers };
}
const tap = (page, method, dataset = {}) => page[method]({ currentTarget: { dataset } });
const picks = (page, ...keys) => keys.forEach((key) => tap(page, 'pickCard', { key }));
const runTimers = (timers) => {
  while (timers.size) {
    const [[id, callback]] = timers;
    timers.delete(id);
    callback();
  }
};

test('WeChat win rate page reproduces the shared session and reference flop', () => {
  const { page } = openPage();
  assert.equal(page.data.deck.length, 4);
  assert.deepEqual(
    [...page.data.deck].map((suit) => suit.cards.length),
    [13, 13, 13, 13],
  );
  assert.equal(page.data.deck[0].cards[0].key, '0-14');
  assert.equal(page.data.statusText, '选满两位玩家的底牌后自动计算。');
  tap(page, 'openBoardCard', { index: 0 });
  assert.equal(page.data.pickerOpen, true);
  assert.equal(page.data.pickerTitle, '翻牌第 1 张');
  picks(page, '0-6', '0-11', '2-11');
  assert.equal(page.data.pickerOpen, false);
  tap(page, 'openPlayerCard', { id: 0, index: 0 });
  assert.equal(page.data.pickerTitle, '你的第 1 张底牌');
  picks(page, '0-14', '0-13');
  tap(page, 'openPlayerCard', { id: 1, index: 0 });
  assert.equal(page.data.pickerTitle, '对手 1 的第 1 张底牌');
  picks(page, '0-8', '0-7');
  tap(page, 'addOpponent');
  const third = page.data.players[2];
  assert.equal(third.name, '对手 2');
  assert.equal(third.odds.waiting, '胜率：?');
  assert.equal(third.removable, true);
  assert.equal(third.removeLabel, '删除对手 2');
  tap(page, 'openPlayerCard', { id: third.id, index: 0 });
  picks(page, '2-10', '1-10');
  const [hero, weak, leader] = page.data.players;
  assert.equal(page.data.status, 'ready');
  assert.equal(hero.odds.win, '44.85%');
  assert.equal(hero.odds.tie, '平局 0.33%');
  assert.equal(weak.odds.win, '2.99%');
  assert.equal(leader.odds.win, '51.83%');
  assert.equal(hero.outs.count, 12);
  assert.equal(hero.outs.cards.length, 8);
  assert.equal(hero.outs.toggle, true);
  assert.equal(weak.outs.count, 0);
  assert.equal(leader.outs, null);
  assert.equal(page.data.hasOuts, true);
  assert.match(page.data.statusText, /903 种/);
  tap(page, 'toggleOuts', { id: 0 });
  assert.equal(page.data.players[0].outs.cards.length, 12);
  assert.match(hero.slots[0].card.artStyle, /^background-image/);
});

test('WeChat win rate page clears, unsets and shows the used state', () => {
  const { page } = openPage();
  tap(page, 'openPlayerCard', { id: 0, index: 0 });
  picks(page, '0-14');
  assert.equal(page.data.used['0-14'], true);
  picks(page, '0-14');
  assert.equal(page.data.pickerTitle, '你的第 2 张底牌', 'a used card cannot fill another slot');
  page.closePicker();
  tap(page, 'openPlayerCard', { id: 0, index: 0 });
  assert.equal(page.data.selected, '0-14');
  page.unsetCard();
  assert.equal(page.data.players[0].slots[0].card, null);
  assert.equal(page.data.pickerOpen, false);
  tap(page, 'addOpponent');
  assert.equal(page.data.players.length, 3);
  page.clearAll();
  assert.equal(page.data.players.length, 2);
  assert.equal(Object.keys(page.data.used).length, 0);
});

test('WeChat win rate page cancels its slices when hidden and returns to the live game', () => {
  const { page, calls, timers } = openPage();
  tap(page, 'openPlayerCard', { id: 0, index: 0 });
  picks(page, '0-14', '0-13');
  tap(page, 'openPlayerCard', { id: 1, index: 0 });
  picks(page, '0-8', '0-7');
  assert.equal(page.data.status, 'computing');
  assert.equal(page.data.players[0].odds.computing, true);
  assert.equal(page.data.players[0].odds.waiting, '计算中');
  assert.equal(timers.size, 1);
  page.onHide();
  assert.equal(timers.size, 0, 'A hidden page cannot keep calculating');
  page.onShow();
  assert.equal(timers.size, 1);
  runTimers(timers);
  assert.equal(page.data.status, 'ready');
  assert.equal(page.data.players[0].odds.win.endsWith('%'), true);
  page.onHide();
  page.onShow();
  runTimers(timers);
  page.onUnload();
  assert.equal(timers.size, 0);
  page.returnToGame();
  assert.deepEqual(calls, ['return']);
});

test('WeChat win rate entry and template keep the Web controls', () => {
  const table = read('pages/table/table.wxml'),
    page = read('calculator/win-rate.wxml'),
    style = read('calculator/win-rate.wxss'),
    app = JSON.parse(read('app.json'));
  assert.match(table, /id="resource-win-rate" bindtap="openWinRate">胜率计算器</);
  assert.deepEqual(app.subpackages.find(({ root }) => root === 'calculator')?.pages, ['win-rate']);
  for (const id of ['win-rate-add', 'win-rate-clear', 'win-rate-unset', 'win-rate-picker-back'])
    assert.match(page, new RegExp(`id="${id}"`));
  assert.doesNotMatch(page, /计算<\/button>|分享|收藏/);
  assert.match(style, /win-rate-sheet 0\.2s ease-out/);
  assert.match(style, /win-rate-spin 0\.8s linear infinite/);
});
