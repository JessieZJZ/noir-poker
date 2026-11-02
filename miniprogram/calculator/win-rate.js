const { deckOfCards } = require('../shared/engine/poker.js');
const { createWinRateSession } = require('./engine/win-rate-session.js');
const { presentCard, presentationPatch } = require('../pages/table/presentation.js');
const navigation = require('../record-navigation.js');

// Text, order and thresholds mirror src/ui/win-rate.js; the session is shared.
const STREETS = [
  { label: '翻牌', slots: [0, 1, 2] },
  { label: '转牌', slots: [3] },
  { label: '河牌', slots: [4] },
];
const BOARD_MARKS = ['♠', '♣', '♥', '♦', '♠'];
const deck = deckOfCards();
const percent = (value) => `${(value * 100).toFixed(2)}%`;
const grouped = (value) => String(value).replace(/\B(?=(\d{3})+$)/g, ',');
const playerName = (player) => (player.hero ? '你' : `对手 ${player.number}`);
const boardSlotName = ({ label, slots }, index) =>
  slots.length > 1 ? `翻牌第 ${index + 1} 张` : label;
const holeSlotName = (player, index) =>
  player.hero ? `你的第 ${index + 1} 张底牌` : `对手 ${player.number} 的第 ${index + 1} 张底牌`;
const cardArtwork = new Map();
function artwork(card) {
  if (!card) return null;
  if (!cardArtwork.has(card.key)) {
    const { key, rank, suit, red, smallArtStyle } = presentCard(card);
    cardArtwork.set(card.key, { key, rank, suit, red, artStyle: smallArtStyle });
  }
  return cardArtwork.get(card.key);
}
const pickerDeck = () =>
  [0, 1, 2, 3].map((suit) => ({
    id: suit,
    cards: deck
      .filter((card) => card.suit === suit)
      .sort((a, b) => b.rank - a.rank)
      .map(artwork),
  }));
const isTarget = (target, place) =>
  target?.type === place.type && target?.index === place.index && target?.id === place.id;
function boardView(view) {
  return STREETS.map((street) => ({
    id: street.label,
    label: street.label,
    slots: street.slots.map((index) => ({
      id: index,
      index,
      mark: BOARD_MARKS[index],
      card: artwork(view.board[index]),
      active: isTarget(view.target, { type: 'board', index }),
      label: boardSlotName(street, index),
    })),
  }));
}
function oddsView(player, view, ready) {
  const { result } = player;
  if (result)
    return {
      win: `${view.method === 'sampling' ? '≈ ' : ''}${percent(result.win)}`,
      tie: `平局 ${percent(result.tie)}`,
      bar: `width:${(result.equity * 100).toFixed(2)}%;`,
      computing: false,
      waiting: '',
    };
  const computing = player.complete && view.status === 'computing';
  return {
    win: '',
    tie: '',
    bar: '',
    computing,
    waiting: computing ? '计算中' : player.complete && ready < 2 ? '等待对手底牌' : '胜率：?',
  };
}
function outsView(player) {
  const outs = player.result?.outs;
  if (!outs) return null;
  return { count: outs.length, cards: outs.map(artwork) };
}
function playersView(view) {
  const ready = view.players.filter((player) => player.complete).length;
  return view.players.map((player) => ({
    id: player.id,
    name: playerName(player),
    hero: player.hero,
    removable: player.removable,
    removeLabel: `删除对手 ${player.number}`,
    slots: player.cards.map((card, index) => ({
      id: index,
      index,
      card: artwork(card),
      active: isTarget(view.target, { type: 'player', id: player.id, index }),
      label: holeSlotName(player, index),
    })),
    odds: oddsView(player, view, ready),
    outs: outsView(player),
  }));
}
function statusText(view) {
  if (view.status === 'computing') return '正在计算全部公共牌组合…';
  if (view.status === 'idle') return '';
  const samples = grouped(view.samples);
  return view.method === 'exact'
    ? `已精确计算全部 ${samples} 种公共牌组合。`
    : `已模拟 ${samples} 次发牌，误差约 ±${(view.margin * 100).toFixed(2)}%。`;
}
function pickerTitle(view) {
  const { target } = view;
  if (!target) return '';
  if (target.type === 'board') {
    const street = STREETS.find(({ slots }) => slots.includes(target.index));
    return boardSlotName(street, target.index);
  }
  return holeSlotName(
    view.players.find((entry) => entry.id === target.id),
    target.index,
  );
}
Page({
  data: {
    topInset: 24,
    bottomInset: 0,
    streets: [],
    players: [],
    deck: [],
    used: {},
    selected: '',
    pickerOpen: false,
    pickerTitle: '',
    canAdd: true,
    hasOuts: false,
    status: 'idle',
    statusText: '',
  },
  onLoad() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this._session = createWinRateSession({ onChange: () => this.sync() });
    this.setData({
      topInset: info.statusBarHeight || 24,
      bottomInset: Math.max(0, info.windowHeight - (info.safeArea?.bottom || info.windowHeight)),
      deck: pickerDeck(),
    });
    this.sync();
  },
  onShow() {
    this._session.resume();
  },
  onHide() {
    this._session.pause();
  },
  onUnload() {
    this._session.pause();
  },
  sync() {
    const view = this._session.view();
    const patch = presentationPatch(this.data, {
      streets: boardView(view),
      players: playersView(view),
      used: Object.fromEntries(view.used.map((key) => [key, true])),
      selected: view.selected || '',
      pickerOpen: Boolean(view.target),
      pickerTitle: pickerTitle(view),
      canAdd: view.canAdd,
      hasOuts: view.players.some((player) => player.result?.outs),
      status: view.status,
      statusText: statusText(view),
    });
    if (Object.keys(patch).length) this.setData(patch);
  },
  openBoardCard(event) {
    this._session.openBoard(event.currentTarget.dataset.index);
  },
  openPlayerCard(event) {
    const { id, index } = event.currentTarget.dataset;
    this._session.openPlayer(id, index);
  },
  pickCard(event) {
    const { key } = event.currentTarget.dataset;
    this._session.pick(deck.find((card) => card.key === key));
  },
  deleteCard() {
    this._session.clearTarget();
  },
  closePicker() {
    this._session.closePicker();
  },
  addOpponent() {
    this._session.addOpponent();
  },
  removeOpponent(event) {
    this._session.removeOpponent(event.currentTarget.dataset.id);
  },
  clearAll() {
    this._session.clear();
  },
  returnToGame() {
    navigation.returnToGame();
  },
  keepPageStill() {},
});
