const { compactChips } = require('../../shared/engine/chip-format.js');
const { presentCard, presentationPatch } = require('../table/presentation.js');
const { recordResult, sessionStanding } = require('../../shared/engine/game-records.js');
const navigation = require('../../record-navigation.js');
const { recordStartTime } = require('../../record-time.js');
const HAND_BATCH_SIZE = 24;
const SESSION_BATCH_SIZE = 20;
// A game's hands are rendered only while its list is within one screen of the
// viewport; farther lists keep their height as an empty placeholder, so the
// page scrolls the same while only nearby rows exist. Until a list has been
// measured its height is estimated from its rows.
const ROW_ESTIMATE = 73;
const LIST_PADDING = 13;
const HEADING_ESTIMATE = 190;
// Card faces are page data shared by every row; a row only names its faces.
const artKey = (card) => 'c' + card.key.replace('-', '_');
// A lost hand with no net chip change reads "-0", as on Web.
const signed = (value, loss = false) => {
  const amount = Math.round(Number(value));
  return (amount < 0 || (amount === 0 && loss) ? '-' : '+') + compactChips(Math.abs(amount));
};
Page({
  data: {
    sessions: [],
    cardArt: {},
    // Every game starts expanded; only the games the reader folds stay folded.
    collapsed: {},
    topInset: 24,
    bottomInset: 0,
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
    this._screen = info.windowHeight || 640;
    this._near = new Set();
    this._heights = {};
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
    // Storage failures are announced once as a toast, never kept on the page.
    const notice = controller?.takeRecordsNotice?.();
    if (notice) wx.showToast?.({ title: notice, icon: 'none', duration: 3000 });
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
      const listed = summaries.slice(0, this._sessionLimit);
      const shownCount = (session) =>
        Math.min(session.attempts.length, this._handLimits[session.id] || HAND_BATCH_SIZE);
      // Before the observer reports, fill the games the first two screens show.
      if (!this._observing) {
        let top = 0;
        for (const session of listed) {
          if (top > this._screen * 2) break;
          if (!this.data.collapsed[session.id]) this._near.add(session.id);
          top += HEADING_ESTIMATE + shownCount(session) * ROW_ESTIMATE;
        }
      }
      const art = {};
      const sessions = listed.map((session) => {
        const open = !this.data.collapsed[session.id],
          filled = open && this._near.has(session.id),
          shown = shownCount(session),
          measured = this._heights[session.id];
        return {
          id: session.id,
          number: session.number,
          endedAt: session.endedAt,
          profit: session.profit,
          playerCount: session.playerCount,
          timeText: recordStartTime(session.startedAt),
          profitText: signed(session.profit),
          winrateText: session.completed
            ? Math.round((session.wins / session.completed) * 100) + '%'
            : '—',
          standing: sessionStanding(session),
          blindText: `${compactChips(session.stakes.smallBlind)} / ${compactChips(session.stakes.bigBlind)}`,
          expanded: open,
          filled,
          listStyle:
            open && !filled
              ? `height:${measured?.shown === shown ? measured.height : shown * ROW_ESTIMATE + LIST_PADDING}px`
              : '',
          hasMoreHands: open && session.attempts.length > shown,
          attempts: filled
            ? session.attempts
                .slice()
                .reverse()
                .slice(0, shown)
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
                      artwork = { face: { key, art: artKey(card), rank, suit, red }, artStyle };
                      this._cardArtwork.set(card.key, artwork);
                    }
                    if (!this.data.cardArt[artwork.face.art])
                      art[`cardArt.${artwork.face.art}`] = artwork.artStyle;
                    return artwork.face;
                  }),
                  attemptText: attempt.attempt ? `重打${attempt.attempt}` : '',
                  profitText:
                    attempt.profit === null
                      ? '—'
                      : signed(attempt.profit, recordResult(attempt) === 'loss'),
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
        };
      });
      // At most 52 faces, sent once each before the rows that use them.
      if (Object.keys(art).length) this.setData(art);
      const patch = presentationPatch(this.data, {
        sessions,
        hasMoreSessions: summaries.length > this._sessionLimit,
      });
      // A new session may reorder the list. Send the small headings first and
      // each game's rows in bounded batches instead of one giant payload.
      const batches = [];
      const defer = (index, session) => {
        if (session.attempts.length) batches.push([index, session.attempts]);
        return { ...session, attempts: [] };
      };
      if (patch.sessions) patch.sessions = patch.sessions.map((session, i) => defer(i, session));
      for (const key of Object.keys(patch)) {
        const index = /^sessions\[(\d+)\]$/.exec(key)?.[1];
        if (index !== undefined) patch[key] = defer(Number(index), patch[key]);
      }
      const lists = sessions
        .filter((session) => session.expanded)
        .map((session) => session.id)
        .join(' ');
      const settled = () => {
        this.measureLists();
        if (lists !== this._observedLists) this.observeLists(lists);
      };
      const updates = [patch];
      for (const [i, attempts] of batches)
        for (let start = 0; start < attempts.length; start += HAND_BATCH_SIZE) {
          const batch = {};
          attempts.slice(start, start + HAND_BATCH_SIZE).forEach((attempt, j) => {
            batch[`sessions[${i}].attempts[${start + j}]`] = attempt;
          });
          updates.push(batch);
        }
      const pending = updates.filter((update) => Object.keys(update).length);
      pending.forEach((update, i) =>
        this.setData(update, i === pending.length - 1 ? settled : undefined),
      );
      if (!pending.length && lists !== this._observedLists) this.observeLists(lists);
    }
    this._recordsTimer = setTimeout(() => this.refreshRecords(), 1000);
  },
  // Watch every expanded list against the viewport grown by one screen above
  // and below; entering fills its rows, leaving swaps them for a placeholder.
  observeLists(lists) {
    this._observedLists = lists;
    this._observer?.disconnect();
    if (!this.createIntersectionObserver || !lists) return;
    this._observing = true;
    this._observer = this.createIntersectionObserver({ observeAll: true }).relativeToViewport({
      top: this._screen,
      bottom: this._screen,
    });
    this._observer.observe('.hand-list', (result) => {
      const id = result.dataset?.id,
        near = result.intersectionRatio > 0;
      if (!id || near === this._near.has(id)) return;
      if (near) this._near.add(id);
      else this._near.delete(id);
      clearTimeout(this._nearTimer);
      this._nearTimer = setTimeout(() => this.refreshRecords(true), 30);
    });
  },
  // Filled lists record their real height for the placeholder that replaces
  // them, keyed by how many rows they showed. The observer reports only
  // changes, so a list filled from the first-screen estimate that is in fact
  // farther away is released here.
  measureLists() {
    if (!this.createSelectorQuery) return;
    this.createSelectorQuery()
      .selectAll('.hand-list')
      .fields({ dataset: true, size: true, rect: true })
      .exec(([lists] = []) => {
        let released = false;
        for (const list of lists || []) {
          const session = this.data.sessions.find((item) => item.id === list.dataset?.id);
          if (!session?.filled || !list.height) continue;
          this._heights[session.id] = { shown: session.attempts.length, height: list.height };
          if (list.bottom < -this._screen || list.top > this._screen * 2) {
            this._near.delete(session.id);
            released = true;
          }
        }
        if (released) {
          clearTimeout(this._nearTimer);
          this._nearTimer = setTimeout(() => this.refreshRecords(true), 30);
        }
      });
  },
  onHide() {
    this._hidden = true;
    clearTimeout(this._recordsTimer);
  },
  onUnload() {
    this._destroyed = true;
    clearTimeout(this._recordsTimer);
    clearTimeout(this._nearTimer);
    this._observer?.disconnect();
  },
  toggleSession(event) {
    const id = event.currentTarget.dataset.id;
    this.setData({ collapsed: { ...this.data.collapsed, [id]: !this.data.collapsed[id] } });
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
