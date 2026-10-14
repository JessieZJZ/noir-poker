const { compactChips, compactActionAmounts } = require('../../shared/engine/chip-format.js');
const { createWechatController } = require('../../shared/platform/wechat-controller.js');
const { phoneLayout } = require('./phone-layout.js');
const { presentCard, showdownPresentation, presentationPatch } = require('./presentation.js');
const PORTRAIT_CREDITS = require('../../assets/portraits/credits.js');
const { completeBoardForPractice, rankText } = require('../../shared/engine/poker.js');
// Capsule 36 + nav 48 + gap 8 + header 48 + live dock 134 + end gap 8 + border 2.
const VIEWPORT_CHROME_HEIGHT = 284;
const PROFILE_AXES = [
  ['vpip', '入池宽度'],
  ['aggression', '进攻倾向'],
  ['bluff', '诈唬倾向'],
  ['calling', '跟到底倾向'],
  ['trapping', '强牌诱导'],
];

Page({
  data: {
    topInset: 24,
    bottomInset: 0,
    windowHeight: 800,
    tableHeight: 460,
    arenaHeight: 460,
    arenaWidth: 364,
    arenaScale: 1,
    windowWidth: 390,
    navRightInset: 104,
    compactNav: false,
    settingsOpen: false,
    guideOpen: false,
    reviewOpen: false,
    activityOpen: false,
    potOpen: false,
    resetOpen: false,
    guideExpanded: [false, false],
    potExpanded: {},
    potSheetHeight: 580,
    reviewPerspective: 'hero',
    reviewIndex: 0,
    opponentFilter: 0,
    opponentOptions: ['全部对手'],
    selectedReviewStep: null,
    countOptions: [5, 6, 7, 8, 9],
    emotionOptions: ['关闭', '轻微波动', '明显波动'],
    profiles: [],
    settings: { sound: true, hints: true },
    seats: [],
    board: [],
    boardTop: [],
    boardBottom: [],
    boardSlots: [],
    boardWidth: 152,
    boardTwoRows: true,
    heroCards: [],
    reviewData: { steps: [] },
    detailProfile: null,
    selectedProfile: 'balanced',
    settingsScrollTop: 0,
    smallBlindEditing: false,
    smallBlindDraft: '',
    comparisonOpen: false,
    homeLocked: false,
    homeOffset: 0,
    finishing: false,
    flyingChips: [],
  },
  onLoad() {
    this.updateWindow();
    this._audio = [];
    this.preloadSounds();
    this._controller = createWechatController({
      publish: (view) => {
        if (view.done || view.hand !== this.data.hand || view.replay !== this.data.replay)
          this._finishRequested = false;
        const game = this._controller?.getGame();
        const board = view.board;
        const showdown = game ? showdownPresentation(game, view.profiles) : [];
        const dealKey = `${view.hand}:${view.replay}`;
        const changedDeal = dealKey !== this._dealKey;
        if (changedDeal) {
          this._motionEpoch = (this._motionEpoch || 0) + 1;
          this.cancelCardMotion();
          this._seatFaces = new Map();
        }
        if (changedDeal || !view.settings.sound)
          for (const audio of this._audio || []) audio.stop();
        const previousCards = dealKey === this._dealKey ? this._boardCount || 0 : 0;
        this._dealKey = dealKey;
        const presentedBoard = board.map((card, index) => ({
          ...presentCard(card),
          arriving: index >= previousCards || (!changedDeal && this.data.board[index]?.arriving),
          dealDelay:
            index >= previousCards
              ? (index - previousCards) * 140
              : this.data.board[index]?.dealDelay || 0,
        }));
        this._boardCount = board.length;
        const faceArrivals = [];
        const presentedSeats = view.seats.map((seat) => {
          const before = this.data.seats.find((s) => s.id === seat.id);
          const signature = seat.cards.map((card) => card.key).join(',') || 'hidden';
          const arriving = signature !== this._seatFaces?.get(seat.id) && seat.cards.length > 0;
          this._seatFaces?.set(seat.id, signature);
          if (arriving) faceArrivals.push(seat.id);
          return {
            ...seat,
            peekArriving:
              Boolean(arriving && this._peekId === seat.id) ||
              (!changedDeal && Boolean(before?.peekArriving)),
            cards: seat.cards.map((card, index) => ({
              ...presentCard(card),
              dealDelay: index * 140,
              arriving: arriving || (!changedDeal && Boolean(before?.cards[index]?.arriving)),
            })),
            backCards: [0, 1].map((index) => ({
              key: `${dealKey}:${index}`,
              delay: seat.id * 65 + index * 140,
              arriving:
                changedDeal ||
                (!before?.cards.length && Boolean(before?.backCards[index]?.arriving)),
            })),
          };
        });
        const update = {
          ...view,
          finishing:
            view.done || view.hand !== this.data.hand || view.replay !== this.data.replay
              ? false
              : this.data.finishing,
          seats: presentedSeats,
          ...(changedDeal ? { flyingChips: [] } : {}),
          heroCards: view.heroCards.map((card, index) => ({
            ...presentCard(card),
            dealKey: `${dealKey}:${card.key}`,
            arriving: changedDeal || Boolean(this.data.heroCards[index]?.arriving),
          })),
          showdown,
          showdownContext: `${showdown.length} 人参与摊牌${game?.pots.length > 1 ? ' · 主池与边池分别结算' : ''}`,
          activePlayerCount: view.seats.length + 1,
          logs: game
            ? game.logs
                .slice()
                .reverse()
                .map((entry, index) => {
                  let text = typeof entry === 'string' ? entry : entry.text;
                  for (const player of game.players.filter(
                    (p) => p.id && p.botProfile !== 'balanced',
                  )) {
                    const profile = view.profiles.find((p) => p.id === player.botProfile);
                    const name = player.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    if (profile)
                      text = text.replace(
                        new RegExp(`\\b${name}\\b(?![（(])`, 'g'),
                        `${player.name}（${profile.short}）`,
                      );
                  }
                  return {
                    key: index,
                    text: compactActionAmounts(text),
                    type: entry.type,
                    hero: entry.player === 0,
                  };
                })
            : view.logs,
          board: presentedBoard,
          canPracticeRunout: view.done && view.heroFolded && board.length < 5,
          ...this.publicLayout(presentedBoard, {
            ...view,
            seats: presentedSeats,
          }),
          winrate: view.stats.hands ? Math.round((view.stats.wins / view.stats.hands) * 100) : 0,
          countIndex: view.settings.playerCount - 5,
          emotionIndex: ['off', 'subtle', 'lively'].indexOf(view.settings.emotionMode),
        };
        // Large research catalogs and card artwork need not cross the service/
        // view bridge on every bot turn. Preserve existing card nodes and motion.
        const patch = presentationPatch(this.data, update);
        this.setData(patch, () => this.tightenSeatRanks());
        if (changedDeal)
          this.scheduleCardMotion('deal', 1300, () => {
            const patch = {};
            this.data.heroCards.forEach((_, i) => (patch[`heroCards[${i}].arriving`] = false));
            for (const list of ['seats', 'phoneSeats'])
              this.data[list].forEach((seat, i) =>
                seat.backCards.forEach(
                  (_, j) => (patch[`${list}[${i}].backCards[${j}].arriving`] = false),
                ),
              );
            return patch;
          });
        if (board.length > previousCards)
          this.scheduleCardMotion('board', 650 + (board.length - previousCards - 1) * 140, () => {
            const patch = {};
            this.data.board.forEach((_, i) => {
              patch[`board[${i}].arriving`] = false;
              if (this.data.boardSlots[i] && !this.data.boardSlots[i].empty)
                patch[`boardSlots[${i}].arriving`] = false;
            });
            return patch;
          });
        for (const id of faceArrivals)
          this.scheduleCardMotion(`face-${id}`, 790, () => this.cardMotionPatch(id, 'arriving'));
        const peekId = this._peekId;
        if (faceArrivals.includes(peekId))
          this.scheduleCardMotion(`peek-${peekId}`, 180, () =>
            this.cardMotionPatch(peekId, 'peekArriving'),
          );
      },
      storage: {
        getItem: (key) => wx.getStorageSync(key) || null,
        setItem: (key, value) => wx.setStorageSync(key, value),
      },
      sound: (name) => this.playSound(name),
      wager: (id) => this.flyChips(id),
      notifyTurn: () => {
        if (!this._hidden && !this._destroyed && this.data.settings.sound)
          wx.vibrateShort?.({ type: 'light', fail: () => {} });
      },
    });
    this._controller.start();
  },
  onShow() {
    this._hidden = false;
    if (!this._audio?.length) this.preloadSounds();
    this._controller?.show();
    if (this._finishRequested && !this.data.done) this.finishHand();
    if (this.data.reviewOpen && this._controller)
      this.call('review', (reviewData) => this.updateReview(reviewData));
  },
  onHide() {
    this._hidden = true;
    this._motionEpoch = (this._motionEpoch || 0) + 1;
    this.cancelCardMotion();
    const stopped = {};
    for (const list of ['heroCards', 'board', 'boardSlots'])
      this.data[list]?.forEach((card, i) => {
        if (card.arriving) stopped[`${list}[${i}].arriving`] = false;
      });
    for (const list of ['seats', 'phoneSeats'])
      this.data[list]?.forEach((seat, i) => {
        stopped[`${list}[${i}].peekArriving`] = false;
        for (const cards of ['cards', 'backCards'])
          seat[cards]?.forEach((card, j) => {
            if (card.arriving) stopped[`${list}[${i}].${cards}[${j}].arriving`] = false;
          });
      });
    this.setData(stopped);
    this.setData({ finishing: false, flyingChips: [] });
    this._rankEpoch = (this._rankEpoch || 0) + 1;
    this._controller?.hide();
    this.stopSounds();
  },
  onUnload() {
    this._destroyed = true;
    this._motionEpoch = (this._motionEpoch || 0) + 1;
    this.cancelCardMotion();
    this._controller?.destroy();
    this.stopSounds();
  },
  onResize() {
    this.updateWindow();
  },
  scheduleCardMotion(key, delay, readPatch) {
    this._cardTimers ||= new Map();
    clearTimeout(this._cardTimers.get(key));
    const deal = this._dealKey;
    const timer = setTimeout(() => {
      if (this._cardTimers.get(key) !== timer) return;
      this._cardTimers.delete(key);
      if (this._hidden || this._destroyed || deal !== this._dealKey) return;
      this.setData(readPatch());
    }, delay);
    this._cardTimers.set(key, timer);
  },
  cancelCardMotion() {
    for (const timer of this._cardTimers?.values() || []) clearTimeout(timer);
    this._cardTimers?.clear();
  },
  cardMotionPatch(id, flag) {
    const patch = {};
    for (const list of ['seats', 'phoneSeats']) {
      const index = this.data[list].findIndex((seat) => seat.id === id);
      if (index < 0) continue;
      if (flag === 'peekArriving') patch[`${list}[${index}].peekArriving`] = false;
      else
        this.data[list][index].cards.forEach(
          (_, j) => (patch[`${list}[${index}].cards[${j}].arriving`] = false),
        );
    }
    return patch;
  },
  onPageScroll(event) {
    if (!this.data.homeLocked) this._homeScroll = event.scrollTop;
  },
  setOverlay(patch) {
    this._audioUnlocked = true;
    const next = { ...this.data, ...patch };
    const homeLocked = [
      'settingsOpen',
      'guideOpen',
      'reviewOpen',
      'activityOpen',
      'potOpen',
      'resetOpen',
    ].some((key) => next[key]);
    const unlocking = this.data.homeLocked && !homeLocked;
    this.setData({ ...patch, homeLocked, homeOffset: -(this._homeScroll || 0) }, () => {
      if (unlocking) wx.pageScrollTo?.({ scrollTop: this._homeScroll || 0, duration: 0 });
    });
  },
  updateWindow() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const topInset = info.statusBarHeight || 24;
    const bottomInset = Math.max(
      0,
      info.windowHeight - (info.safeArea?.bottom || info.windowHeight),
    );
    // Custom navigation still keeps WeChat's native top-right menu capsule.
    // Leave a conservative capsule-sized space if an older runtime cannot measure it.
    let navRightInset = 104;
    try {
      const rect = wx.getMenuButtonBoundingClientRect?.();
      if (
        rect &&
        [rect.left, rect.right, rect.top, rect.bottom, rect.width, rect.height].every(
          Number.isFinite,
        ) &&
        rect.width > 0 &&
        rect.height > 0 &&
        rect.left >= 0 &&
        rect.right <= info.windowWidth &&
        rect.right > rect.left &&
        rect.bottom > rect.top &&
        Math.abs(rect.right - rect.left - rect.width) <= 1 &&
        rect.top >= 0 &&
        rect.bottom <= topInset + 52
      ) {
        navRightInset = rect.width + (info.windowWidth - rect.right) + 8;
      }
    } catch {
      /* Menu measurement can be unavailable while an older client initializes. */
    }
    // The table budget stays identical through fold, settlement and retry.
    this.setData({
      topInset,
      bottomInset,
      windowHeight: info.windowHeight,
      navRightInset,
      compactNav: false,
      windowWidth: info.windowWidth,
      tableHeight: Math.max(0, info.windowHeight - topInset - bottomInset - VIEWPORT_CHROME_HEIGHT),
    });
    const arenaHeight = Math.max(300, this.data.tableHeight);
    const arenaScale = Math.min(1, this.data.tableHeight / arenaHeight);
    this.setData({
      arenaHeight,
      arenaScale,
      arenaWidth: (info.windowWidth - 18) / (arenaScale || 1),
    });
    this.setData(this.publicLayout(this.data.board));
  },
  publicLayout(board = [], view = this.data) {
    if (view.seats?.length) {
      const tableHeight = Math.max(
        0,
        this.data.windowHeight -
          this.data.topInset -
          this.data.bottomInset -
          VIEWPORT_CHROME_HEIGHT,
      );
      const fitted = phoneLayout({
        width: this.data.windowWidth,
        availableWidth: this.data.windowWidth - 18,
        height: tableHeight,
        seats: view.seats,
        displayHeight: this.data.windowHeight - this.data.topInset - this.data.bottomInset - 36,
      });
      return {
        ...fitted,
        tableHeight,
        phoneLayout: true,
        phoneSeats: fitted.positioned.map((seat) => ({
          ...seat,
          rankLift:
            view.hand === this.data.hand
              ? this.data.phoneSeats?.find((before) => before.id === seat.id)?.rankLift || 0
              : 0,
        })),
        boardSlots: Array.from(
          { length: 5 },
          (_, i) =>
            board[i] || { key: `empty-${i}`, empty: true, suit: ['♠', '♣', '♥', '♦', '♠'][i] },
        ),
      };
    }
    return {};
  },
  tightenSeatRanks() {
    if (!wx.createSelectorQuery || this._hidden || this._destroyed) return;
    const ticket = (this._rankEpoch = (this._rankEpoch || 0) + 1);
    const query = wx.createSelectorQuery();
    query.selectAll('.seat-action-word').fields({ rect: true, size: true, dataset: true });
    query.selectAll('.seat-rank-slot .rank').fields({ rect: true, size: true, dataset: true });
    query.exec(([words, ranks]) => {
      if (ticket !== this._rankEpoch || this._hidden || this._destroyed) return;
      const bottoms = new Map();
      for (const word of words || [])
        bottoms.set(
          Number(word.dataset.id),
          Math.max(bottoms.get(Number(word.dataset.id)) || 0, word.top + word.height),
        );
      const scale = this.data.arenaScale || 1;
      const patch = {};
      for (const rank of ranks || []) {
        const id = Number(rank.dataset.id),
          index = this.data.phoneSeats.findIndex((seat) => seat.id === id);
        if (index < 0 || !bottoms.has(id)) continue;
        const current = this.data.phoneSeats[index].rankLift || 0;
        // A wrapped amount can extend below the nominal two-line footprint.
        // Move either direction so its last painted line always keeps 3px.
        const lift = current + (bottoms.get(id) + 3 * scale - rank.top) / scale;
        if (Math.abs(lift - current) > 0.1) patch[`phoneSeats[${index}].rankLift`] = lift;
      }
      if (Object.keys(patch).length) this.setData(patch);
    });
  },
  call(method, ...args) {
    this._audioUnlocked = true;
    try {
      return this._controller[method](...args);
    } catch (error) {
      wx.showToast({ title: error.message || '请重试', icon: 'none' });
    }
  },
  playSound(name) {
    if (!wx.createInnerAudioContext || !this._audioUnlocked) return;
    const names = {
      fold: 'fold',
      check: 'check',
      raise: 'raise',
      call: 'call',
      deal: 'deal',
      win: 'win',
    };
    if (!names[name]) return;
    try {
      const audio = this._soundPool?.[names[name]];
      if (!audio) return;
      audio.stop();
      audio.seek?.(0);
      audio.play();
    } catch {
      /* A device can block audio until the first user gesture. */
    }
  },
  preloadSounds() {
    this._soundPool = {};
    if (!wx.createInnerAudioContext) return;
    for (const name of ['fold', 'check', 'raise', 'call', 'deal', 'win']) {
      const audio = wx.createInnerAudioContext();
      audio.src = `/assets/sounds/${name}.wav`;
      audio.volume = 1;
      audio.obeyMuteSwitch = false;
      audio.onError(() => {});
      this._audio.push(audio);
      this._soundPool[name] = audio;
    }
  },
  stopSounds() {
    (this._audio || []).forEach((audio) => {
      audio.stop();
      audio.destroy();
    });
    this._audio = [];
    this._soundPool = {};
  },
  act(event) {
    this.call('action', event.currentTarget.dataset.action);
  },
  preset(event) {
    this.call('preset', event.currentTarget.dataset.preset);
  },
  changeRaise(event) {
    this.call('setRaise', event.detail.value);
  },
  previewRaise(event) {
    // Do not write the native slider's controlled value back during dragging.
    // Only its caption changes; the final change commits once to the engine.
    const value = Math.max(
      this.data.minRaise,
      Math.min(
        this.data.maxRaise,
        Math.round(Number(event.detail.value) / this.data.chipUnit) * this.data.chipUnit,
      ),
    );
    const text = compactChips(value);
    if (text !== this.data.raiseText) this.setData({ raiseText: text });
  },
  flyChips(id) {
    if (!wx.createSelectorQuery || this._hidden || this._destroyed) return;
    const ticket = this._motionEpoch || 0;
    const query = wx.createSelectorQuery();
    query.select(id === 0 ? '.hero-info' : `#seat-body-${id}`).boundingClientRect();
    query.select('.pot-row').boundingClientRect();
    query.exec(([source, target]) => {
      if (
        !source ||
        !target ||
        ticket !== (this._motionEpoch || 0) ||
        this._hidden ||
        this._destroyed
      )
        return;
      const x = source.left + source.width / 2;
      const y = source.top + source.height / 2;
      const key = (this._chipSerial = (this._chipSerial || 0) + 1);
      this.setData({
        flyingChips: [
          ...this.data.flyingChips.slice(-6),
          ...[0, 1, 2].map((index) => ({
            key: `${key}:${index}`,
            style: `left:${x + index * 3}px;top:${y - index * 3}px;--chip-x:${target.left + target.width / 2 - x}px;--chip-y:${target.top + target.height / 2 - y}px;--chip-delay:${index * 60}ms;`,
          })),
        ],
      });
    });
  },
  nextHand() {
    this._finishRequested = false;
    this.setData({ finishing: false });
    this.call('nextHand');
  },
  retryHand() {
    this._finishRequested = false;
    this.setData({ finishing: false });
    this.call('retry');
  },
  finishHand() {
    if (this.data.canPracticeRunout) {
      this.call('finishHand');
      return;
    }
    if (this.data.finishing) return;
    this._finishRequested = true;
    this.setData({ finishing: true });
    if (!this.call('finishHand')) this.setData({ finishing: false });
  },
  openSettings() {
    this._settingsScroll = 0;
    this.call('clearStakesError');
    this.setData({ smallBlindEditing: false, smallBlindDraft: '' });
    this.setOverlay({ settingsOpen: true, settingsScrollTop: 0 });
  },
  closeSettings() {
    this.closeSelect();
    this.setOverlay({ settingsOpen: false, detailProfile: null, selection: null });
  },
  editSmallBlind() {
    this.call('clearStakesError');
    this.setData({
      smallBlindEditing: true,
      smallBlindDraft: String(this.data.settings.stakes.smallBlind),
    });
  },
  changeSmallBlind(event) {
    const value = event.detail.value;
    this.setData({ smallBlindDraft: value });
    this.call('requestSmallBlind', value);
  },
  finishSmallBlindEdit() {
    if (!this.data.stakesError) this.setData({ smallBlindEditing: false });
  },
  changeSwitch(event) {
    this.call('setPreference', event.currentTarget.dataset.key, event.detail.value);
  },
  togglePreference(event) {
    const key = event.currentTarget.dataset.key;
    this.call('setPreference', key, !this.data.settings[key]);
  },
  noop() {},
  openSelect(event) {
    const field = event.currentTarget.dataset.field;
    const id = event.currentTarget.dataset.id;
    const options =
      field === 'count'
        ? this.data.countOptions.map((n) => n + ' 人')
        : field === 'emotion'
          ? this.data.emotionOptions
          : field === 'seat'
            ? this.data.profiles.map((p) => p.short)
            : this.data.opponentOptions;
    const index =
      field === 'count'
        ? this.data.countIndex
        : field === 'emotion'
          ? this.data.emotionIndex
          : field === 'seat'
            ? this.data.seatSettings.find((s) => s.id === Number(id)).profileIndex
            : this.data.opponentFilter;
    const ticket = (this._selectEpoch = (this._selectEpoch || 0) + 1);
    const open = (rect) => {
      if (!rect || ticket !== this._selectEpoch || this._hidden || this._destroyed) return;
      const rowHeight = 36;
      const width = Math.min(220, Math.max(rect.width, field === 'seat' ? 180 : 110));
      const height = Math.min(options.length * rowHeight + 8, 260);
      const bottomLimit = this.data.windowHeight - this.data.bottomInset - 8;
      const below = Math.max(0, bottomLimit - rect.bottom - 4);
      const above = Math.max(0, rect.top - this.data.topInset - 36 - 8);
      const upwards = below < Math.min(height, 120) && above > below;
      const actualHeight = Math.max(rowHeight + 8, Math.min(height, upwards ? above : below));
      this.setData({
        selection: {
          field,
          id: id || 0,
          options,
          index,
          width,
          height: actualHeight,
          left: Math.min(this.data.windowWidth - width - 8, Math.max(8, rect.right - width)),
          top: upwards ? rect.top - actualHeight - 4 : rect.bottom + 4,
        },
      });
    };
    if (wx.createSelectorQuery) {
      const selector = field === 'seat' ? `#select-seat-${id}` : `#select-${field}`;
      wx.createSelectorQuery().select(selector).boundingClientRect(open).exec();
    } else
      open({
        left: this.data.windowWidth - 126,
        right: this.data.windowWidth - 16,
        top: 260,
        bottom: 304,
        width: 110,
      });
  },
  closeSelect() {
    this._selectEpoch = (this._selectEpoch || 0) + 1;
    this.setData({ selection: null });
  },
  chooseSelect(event) {
    const { field, id } = this.data.selection;
    const value = event.currentTarget.dataset.index;
    this.closeSelect();
    const next = { detail: { value }, currentTarget: { dataset: { id } } };
    return this[
      field === 'count'
        ? 'changeCount'
        : field === 'emotion'
          ? 'changeEmotion'
          : field === 'seat'
            ? 'changeSeat'
            : 'changeOpponentFilter'
    ](next);
  },
  changeCount(event) {
    this.call('setPreference', 'playerCount', this.data.countOptions[Number(event.detail.value)]);
  },
  changeDifficulty(event) {
    this.call('setPreference', 'difficulty', event.currentTarget.dataset.value);
  },
  changeEmotion(event) {
    this.call(
      'setPreference',
      'emotionMode',
      ['off', 'subtle', 'lively'][Number(event.detail.value)],
    );
  },
  changeSeat(event) {
    this.call(
      'setSeatProfile',
      Number(event.currentTarget.dataset.id),
      this.data.profiles[Number(event.detail.value)].id,
    );
  },
  peekSeat(event) {
    this._peekId = Number(event.currentTarget.dataset.id);
    this.call('peek', this._peekId);
    this._peekId = null;
  },
  viewProfile(event) {
    this.setData({ selectedProfile: event.currentTarget.dataset.id });
    const profile = this.data.profiles.find((p) => p.id === event.currentTarget.dataset.id);
    const detailProfile = profile
      ? {
          ...profile,
          portraitCredit: PORTRAIT_CREDITS[profile.id] || null,
          sizingLow: Math.round(profile.sizing[0] * 100),
          sizingHigh: Math.round(profile.sizing[1] * 100),
          research: profile.research
            ? {
                ...profile.research,
                formatsText: profile.research.formats.join(' · '),
                career: profile.research.career.map((item) => ({
                  ...item,
                  references: item.sourceIds.map((id) => ({
                    label: `[${profile.sources.findIndex((s) => s.id === id) + 1}]`,
                    url: profile.sources.find((s) => s.id === id)?.url,
                  })),
                })),
                observations: profile.research.observations.map((item) => ({
                  ...item,
                  references: item.sourceIds.map((id) => ({
                    label: `[${profile.sources.findIndex((s) => s.id === id) + 1}]`,
                    url: profile.sources.find((s) => s.id === id)?.url,
                  })),
                })),
              }
            : null,
          axisRows: PROFILE_AXES.map(([id, label], index) => ({
            id,
            label,
            value: profile.axes[index],
          })),
        }
      : null;
    this.positionProfile(event.currentTarget.dataset.id, detailProfile);
  },
  positionProfile(id, detailProfile) {
    const ticket = (this._profileEpoch = (this._profileEpoch || 0) + 1);
    if (!wx.createSelectorQuery) {
      this.setData({ detailProfile });
      return;
    }
    const query = wx.createSelectorQuery();
    query.select('.profile-grid').boundingClientRect();
    query.select('.settings-modal .modal-scroll').boundingClientRect();
    query.select(`#profile-${id}`).boundingClientRect();
    query.exec(([grid, scroll, origin]) => {
      if (
        !grid ||
        !scroll ||
        !origin ||
        ticket !== this._profileEpoch ||
        !this.data.settingsOpen ||
        this._hidden ||
        this._destroyed
      )
        return;
      const height = Math.min(grid.height, scroll.height);
      const top = Math.max(scroll.top, Math.min(grid.top, scroll.bottom - height));
      const x = Math.max(0, Math.min(grid.width, origin.left + origin.width / 2 - grid.left));
      const y = Math.max(0, Math.min(height, origin.top + origin.height / 2 - top));
      this.setData({
        detailProfile,
        detailBounds: {
          left: grid.left,
          top,
          width: grid.width,
          height,
          x,
          y,
          radius: Math.hypot(Math.max(x, grid.width - x), Math.max(y, height - y)),
        },
      });
    });
  },
  settingsScrolled(event) {
    this._settingsScroll = event.detail.scrollTop;
    this.closeSelect();
  },
  togglePersonaNotice() {
    this.setData({ noticeExpanded: !this.data.noticeExpanded });
  },
  toggleComparison() {
    this.setData({ comparisonOpen: !this.data.comparisonOpen });
  },
  closeProfile() {
    this._profileEpoch = (this._profileEpoch || 0) + 1;
    this.setData({ detailProfile: null });
  },
  copyResearchSource(event) {
    const url = event.currentTarget.dataset.url;
    if (this.data.detailProfile?.sources.some((source) => source.url === url))
      wx.setClipboardData({ data: url });
  },
  openResearchSource(event) {
    const url = event.currentTarget.dataset.url;
    if (
      (!this.data.detailProfile?.sources.some((source) => source.url === url) &&
        this.data.detailProfile?.portraitCredit?.url !== url) ||
      !/^https:\/\//.test(url)
    )
      return;
    wx.navigateTo({ url: `/pages/source/source?url=${encodeURIComponent(url)}` });
  },
  useProfile() {
    this.call('setAllProfiles', this.data.detailProfile.id);
    this.closeProfile();
  },
  mixProfiles() {
    this.call('toggleMixedProfiles');
  },
  openGuide() {
    this.setOverlay({ guideOpen: true });
  },
  closeGuide() {
    this.setOverlay({ guideOpen: false });
  },
  copyGuideSource(event) {
    const url = event.currentTarget.dataset.url;
    if (typeof url === 'string' && url.startsWith('https://www.pokerstars.com/'))
      wx.setClipboardData({ data: url });
  },
  toggleGuide(event) {
    const values = [...this.data.guideExpanded];
    const index = Number(event.currentTarget.dataset.index);
    values[index] = !values[index];
    this.setData({ guideExpanded: values });
  },
  togglePot(event) {
    const index = event.currentTarget.dataset.index;
    this.setData({
      potExpanded: { ...this.data.potExpanded, [index]: !this.data.potExpanded[index] },
    });
    this.measurePot();
  },
  updateReview(reviewData) {
    reviewData = {
      ...reviewData,
      steps: (reviewData.steps || []).map((step) => ({
        ...step,
        cards: (step.cards || []).map(presentCard),
        board: (step.board || []).map(presentCard),
      })),
      opponents: (reviewData.opponents || []).map((step) => ({
        ...step,
        cards: (step.cards || []).map(presentCard),
        board: (step.board || []).map(presentCard),
      })),
    };
    const opponents = reviewData.opponents || [];
    const names = [...new Set(opponents.map((step) => step.name))];
    const filter = Math.min(this.data.opponentFilter, names.length);
    const steps =
      this.data.reviewPerspective === 'hero'
        ? reviewData.steps
        : opponents.filter((step) => !filter || step.name === names[filter - 1]);
    const reviewIndex = Math.min(this.data.reviewIndex, Math.max(0, steps.length - 1));
    this.setData({
      reviewData,
      opponentOptions: [
        '全部对手',
        ...names.map((name) => {
          const step = opponents.find((step) => step.name === name);
          return step.named && step.profileName ? `${name} · ${step.profileName}` : name;
        }),
      ],
      opponentFilter: filter,
      reviewIndex,
      reviewSteps: steps,
      selectedReviewStep: steps[reviewIndex] || null,
    });
  },
  changeReviewPerspective(event) {
    this.setData({ reviewPerspective: event.currentTarget.dataset.value, reviewIndex: 0 });
    this.updateReview(this.data.reviewData);
  },
  changeOpponentFilter(event) {
    this.setData({ opponentFilter: Number(event.detail.value), reviewIndex: 0 });
    this.updateReview(this.data.reviewData);
  },
  selectReviewStep(event) {
    this.setData({ reviewIndex: Number(event.currentTarget.dataset.index) });
    this.updateReview(this.data.reviewData);
  },
  openReview() {
    this.setOverlay({
      reviewOpen: true,
      reviewPerspective: 'hero',
      reviewIndex: 0,
      opponentFilter: 0,
    });
    this.call('review', (reviewData) => this.updateReview(reviewData));
  },
  closeReview() {
    this.call('cancelReview');
    this.setOverlay({ reviewOpen: false });
  },
  openActivity() {
    this.setOverlay({ activityOpen: true });
  },
  closeActivity() {
    this.setOverlay({ activityOpen: false });
  },
  openPots() {
    this.setOverlay({ potOpen: true });
    this.measurePot();
  },
  measurePot() {
    if (!wx.createSelectorQuery) return;
    wx.createSelectorQuery()
      .select('.pot-sheet .sheet-body')
      .boundingClientRect((rect) => {
        if (rect && this.data.potOpen)
          this.setData({
            potSheetHeight: Math.min(
              rect.height + 2,
              (this.data.windowHeight - this.data.topInset - this.data.bottomInset) * 0.85,
            ),
          });
      })
      .exec();
  },
  closePots() {
    this.setOverlay({ potOpen: false });
  },
  resetPractice() {
    this.setOverlay({ resetOpen: true });
  },
  closeReset() {
    this.setOverlay({ resetOpen: false });
  },
  confirmReset() {
    this._finishRequested = false;
    this.setData({ finishing: false });
    this.call('reset');
    this.closeReset();
    this.closeSettings();
  },
});
