const { compactChips } = require('../../shared/engine/chip-format.js');
const { presentCard } = require('../table/presentation.js');
const { recordResult } = require('../../shared/engine/game-records.js');
const navigation = require('../../record-navigation.js');
const signed = (value) => {
  const amount = Math.round(Number(value));
  return (amount < 0 ? '-' : '+') + compactChips(Math.abs(amount));
};
const timeText = (timestamp) => {
  const date = new Date(timestamp);
  const two = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`;
};
Page({
  data: { sessions: [], expanded: {}, topInset: 24, bottomInset: 0, recordsError: '' },
  onLoad() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.setData({
      topInset: info.statusBarHeight || 24,
      bottomInset: Math.max(0, info.windowHeight - (info.safeArea?.bottom || info.windowHeight)),
    });
    const current = getApp().noirController?.getRecords()[0];
    if (current) this.setData({ expanded: { [current.id]: true } });
  },
  onShow() {
    this._hidden = false;
    this.refreshRecords();
  },
  refreshRecords() {
    clearTimeout(this._recordsTimer);
    if (this._hidden || this._destroyed) return;
    const controller = getApp().noirController;
    const sessions = (controller?.getRecords() || []).map((session) => ({
      ...session,
      timeText: timeText(session.startedAt),
      profitText: signed(session.profit),
      winrate: session.completed ? Math.round((session.wins / session.completed) * 100) : 0,
      blindText: `${compactChips(session.stakes.smallBlind)} / ${compactChips(session.stakes.bigBlind)}`,
      attempts: session.attempts.map((attempt) => ({
        ...attempt,
        cards: attempt.hole.map(presentCard),
        attemptText: attempt.attempt ? `重打${attempt.attempt}` : '',
        profitText: attempt.profit === null ? '—' : signed(attempt.profit),
        resultText:
          recordResult(attempt) === 'unfinished'
            ? '未完成'
            : recordResult(attempt) === 'playing'
              ? '进行中'
              : recordResult(attempt) === 'win'
                ? attempt.profit < 0
                  ? '获得部分底池 · 净亏损'
                  : '赢'
                : '输',
      })),
    }));
    this.setData({ sessions, recordsError: controller?.getRecordsError() || '' });
    this._recordsTimer = setTimeout(() => this.refreshRecords(), 1000);
  },
  onHide() {
    this._hidden = true;
    clearTimeout(this._recordsTimer);
  },
  onUnload() {
    this._destroyed = true;
    clearTimeout(this._recordsTimer);
  },
  toggleSession(event) {
    const id = event.currentTarget.dataset.id;
    this.setData({ expanded: { ...this.data.expanded, [id]: !this.data.expanded[id] } });
  },
  openHand(event) {
    const id = event.currentTarget.dataset.id;
    const attempt = getApp().noirController?.getRecord(id);
    if (!attempt || attempt.status !== 'completed') return;
    navigation.openHand(id);
  },
  returnToGame() {
    navigation.returnToGame();
  },
});
