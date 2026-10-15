const { compactChips } = require('../../shared/engine/chip-format.js');
const { presentCard, presentationPatch } = require('../table/presentation.js');
const { recordResult } = require('../../shared/engine/game-records.js');
const navigation = require('../../record-navigation.js');
const { recordStartTime } = require('../../record-time.js');
const HAND_BATCH_SIZE = 24;
const SESSION_BATCH_SIZE = 20;
const signed = (value) => {
  const amount = Math.round(Number(value));
  return (amount < 0 ? '-' : '+') + compactChips(Math.abs(amount));
};
Page({
  data: {
    sessions: [],
    expanded: {},
    topInset: 24,
    bottomInset: 0,
    recordsError: '',
    hasMoreSessions: false,
  },
  onLoad() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.setData({
      topInset: info.statusBarHeight || 24,
      bottomInset: Math.max(0, info.windowHeight - (info.safeArea?.bottom || info.windowHeight)),
    });
    this._sessionLimit = SESSION_BATCH_SIZE;
    this._handLimits = {};
    this._cardArtwork = new Map();
    const current = getApp().noirController?.getRecordSummaries()[0];
    if (current) this.setData({ expanded: { [current.id]: true } });
  },
  onShow() {
    this._hidden = false;
    this.refreshRecords();
  },
  refreshRecords(force = false) {
    clearTimeout(this._recordsTimer);
    if (this._hidden || this._destroyed) return;
    const controller = getApp().noirController;
    const revision = controller?.getRecordsRevision();
    const recordsError = controller?.getRecordsError() || '';
    if (
      force ||
      !this._rendered ||
      this._recordsController !== controller ||
      this._recordsRevision !== revision
    ) {
      this._recordsController = controller;
      this._recordsRevision = revision;
      this._rendered = true;
      const summaries = controller?.getRecordSummaries() || [];
      const sessions = summaries.slice(0, this._sessionLimit).map((session) => ({
        id: session.id,
        number: session.number,
        endedAt: session.endedAt,
        profit: session.profit,
        playerCount: session.playerCount,
        timeText: recordStartTime(session.startedAt),
        profitText: signed(session.profit),
        winrate: session.completed ? Math.round((session.wins / session.completed) * 100) : 0,
        blindText: `${compactChips(session.stakes.smallBlind)} / ${compactChips(session.stakes.bigBlind)}`,
        hasMoreHands:
          !!this.data.expanded[session.id] &&
          session.attempts.length > (this._handLimits[session.id] || HAND_BATCH_SIZE),
        attempts: this.data.expanded[session.id]
          ? session.attempts
              .slice(0, this._handLimits[session.id] || HAND_BATCH_SIZE)
              .map((attempt) => ({
                id: attempt.id,
                hand: attempt.hand,
                status: attempt.status,
                superseded: attempt.superseded,
                refill: attempt.refill,
                profit: attempt.profit,
                cards: attempt.hole.map((card) => {
                  let artwork = this._cardArtwork.get(card.key);
                  if (!artwork) {
                    const { key, rank, suit, red, artStyle } = presentCard(card);
                    artwork = { key, rank, suit, red, artStyle };
                    this._cardArtwork.set(card.key, artwork);
                  }
                  return artwork;
                }),
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
              }))
          : [],
      }));
      const patch = presentationPatch(this.data, {
        sessions,
        hasMoreSessions: summaries.length > this._sessionLimit,
        recordsError,
      });
      // A new session may reorder the list. Send its small headings first and
      // restore expanded rows in bounded batches instead of one giant payload.
      const reordered = patch.sessions;
      if (reordered) patch.sessions = reordered.map((session) => ({ ...session, attempts: [] }));
      if (Object.keys(patch).length) this.setData(patch);
      reordered?.forEach((session, i) => {
        for (let start = 0; start < session.attempts.length; start += HAND_BATCH_SIZE) {
          const batch = {};
          session.attempts.slice(start, start + HAND_BATCH_SIZE).forEach((attempt, j) => {
            batch[`sessions[${i}].attempts[${start + j}]`] = attempt;
          });
          this.setData(batch);
        }
      });
    } else if (recordsError !== this.data.recordsError) this.setData({ recordsError });
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
    this.refreshRecords(true);
  },
  moreHands(event) {
    const id = event.currentTarget.dataset.id;
    this._handLimits[id] = (this._handLimits[id] || HAND_BATCH_SIZE) + HAND_BATCH_SIZE;
    this.refreshRecords(true);
  },
  moreSessions() {
    this._sessionLimit += SESSION_BATCH_SIZE;
    this.refreshRecords(true);
  },
  openHand(event) {
    const id = event.currentTarget.dataset.id;
    const attempt = this.data.sessions
      .flatMap((session) => session.attempts)
      .find((item) => item.id === id);
    if (!attempt || attempt.status !== 'completed') return;
    navigation.openHand(id);
  },
  returnToGame() {
    navigation.returnToGame();
  },
});
