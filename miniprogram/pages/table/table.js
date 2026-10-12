const { createWechatController } = require('../../shared/platform/wechat-controller.js');
const { phoneLayout } = require('./phone-layout.js');
const { presentCard, showdownPresentation } = require('./presentation.js');
const { completeBoardForPractice, rankText } = require('../../shared/engine/poker.js');
// Capsule 36 + Web nav 60 + top gap 8 + header 69 + live dock 146 + end gap 8 + border 2.
const VIEWPORT_CHROME_HEIGHT = 329;
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
    potHeight: 580,
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
    comparisonOpen: false,
  },
  onLoad() {
    this.updateWindow();
    this._audio = [];
    this._controller = createWechatController({
      publish: (view) => {
        const game = this._controller?.getGame();
        const board = game?.practiceBoard
          ? game.practiceBoard.map((card) => ({
              key: card.key,
              rank: rankText(card.rank),
              suit: card.symbol,
              red: card.suit === 1 || card.suit === 3,
            }))
          : view.board;
        const showdown = game ? showdownPresentation(game, view.profiles) : [];
        const presentedBoard = board.map(presentCard);
        this.setData(
          {
            ...view,
            seats: view.seats.map((seat) => ({ ...seat, cards: seat.cards.map(presentCard) })),
            heroCards: view.heroCards.map(presentCard),
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
                    return { key: index, text, type: entry.type, hero: entry.player === 0 };
                  })
              : view.logs,
            board: presentedBoard,
            canPracticeRunout: view.done && view.heroFolded && board.length < 5,
            ...this.publicLayout(presentedBoard, {
              ...view,
              seats: view.seats.map((seat) => ({ ...seat, cards: seat.cards.map(presentCard) })),
            }),
            winrate: view.stats.hands ? Math.round((view.stats.wins / view.stats.hands) * 100) : 0,
            countIndex: view.settings.playerCount - 5,
            emotionIndex: ['off', 'subtle', 'lively'].indexOf(view.settings.emotionMode),
          },
          () => this.tightenSeatRanks(),
        );
      },
      storage: {
        getItem: (key) => wx.getStorageSync(key) || null,
        setItem: (key, value) => wx.setStorageSync(key, value),
      },
      sound: (name) => this.playSound(name),
    });
    this._controller.start();
  },
  onShow() {
    this._hidden = false;
    this._controller?.show();
    if (this.data.reviewOpen && this._controller)
      this.call('review', (reviewData) => this.updateReview(reviewData));
  },
  onHide() {
    this._hidden = true;
    this._rankEpoch = (this._rankEpoch || 0) + 1;
    this._controller?.hide();
    this.stopSounds();
  },
  onUnload() {
    this._destroyed = true;
    this._controller?.destroy();
    this.stopSounds();
  },
  onResize() {
    this.updateWindow();
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
    // Live hands keep their budget; settlement can reuse the collapsed dock space.
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
      arenaWidth: (info.windowWidth - 26) / (arenaScale || 1),
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
          VIEWPORT_CHROME_HEIGHT +
          (view.done ? 82 : 0),
      );
      const fitted = phoneLayout({
        width: this.data.windowWidth,
        height: tableHeight,
        seats: view.seats,
        displayHeight: this.data.windowHeight - this.data.topInset - this.data.bottomInset - 36,
      });
      return {
        ...fitted,
        tableHeight,
        phoneLayout: true,
        phoneSeats: fitted.positioned,
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
    query.selectAll('.seat-action > text').fields({ rect: true, size: true, dataset: true });
    query.selectAll('.seat-rank-slot > .rank').fields({ rect: true, size: true, dataset: true });
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
        const lift = Math.min(0, current + (bottoms.get(id) + 6 * scale - rank.top) / scale);
        if (Math.abs(lift - current) > 0.1) patch[`phoneSeats[${index}].rankLift`] = lift;
      }
      if (Object.keys(patch).length) this.setData(patch);
    });
  },
  call(method, ...args) {
    try {
      return this._controller[method](...args);
    } catch (error) {
      wx.showToast({ title: error.message || '请重试', icon: 'none' });
    }
  },
  playSound(name) {
    if (!wx.createInnerAudioContext) return;
    const names = { fold: 'fold', check: 'check', raise: 'raise', call: 'call', deal: 'deal' };
    if (!names[name]) return;
    try {
      const audio = wx.createInnerAudioContext();
      audio.src = `/assets/sounds/${names[name]}.wav`;
      audio.volume = 0.35;
      audio.obeyMuteSwitch = false;
      const release = () => {
        const index = this._audio.indexOf(audio);
        if (index < 0) return;
        this._audio.splice(index, 1);
        audio.destroy();
      };
      audio.onEnded(release);
      audio.onError(release);
      this._audio.push(audio);
      audio.play();
    } catch {
      /* A device can block audio until the first user gesture. */
    }
  },
  stopSounds() {
    const playing = this._audio || [];
    this._audio = [];
    playing.forEach((audio) => {
      audio.stop();
      audio.destroy();
    });
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
  nextHand() {
    this.call('nextHand');
  },
  retryHand() {
    this.call('retry');
  },
  finishHand() {
    if (this.data.canPracticeRunout) {
      completeBoardForPractice(this._controller.getGame());
      this._controller.show();
      return;
    }
    this.call('finishHand');
  },
  openSettings() {
    this._settingsScroll = 0;
    this.setData({ settingsOpen: true, settingsScrollTop: 0 });
  },
  closeSettings() {
    this.closeSelect();
    this.setData({ settingsOpen: false, detailProfile: null, selection: null });
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
    this.call('peek', Number(event.currentTarget.dataset.id));
  },
  viewProfile(event) {
    this.setData({ selectedProfile: event.currentTarget.dataset.id });
    const profile = this.data.profiles.find((p) => p.id === event.currentTarget.dataset.id);
    this.setData({
      detailProfile: profile
        ? {
            ...profile,
            sizingLow: Math.round(profile.sizing[0] * 100),
            sizingHigh: Math.round(profile.sizing[1] * 100),
            research: profile.research
              ? {
                  ...profile.research,
                  formatsText: profile.research.formats.join(' · '),
                  career: profile.research.career.map((item) => ({
                    ...item,
                    references: item.sourceIds
                      .map((id) => `[${profile.sources.findIndex((s) => s.id === id) + 1}]`)
                      .join(' '),
                  })),
                  observations: profile.research.observations.map((item) => ({
                    ...item,
                    references: item.sourceIds
                      .map((id) => `[${profile.sources.findIndex((s) => s.id === id) + 1}]`)
                      .join(' '),
                  })),
                }
              : null,
            axisRows: PROFILE_AXES.map(([id, label], index) => ({
              id,
              label,
              value: profile.axes[index],
            })),
          }
        : null,
    });
    this.positionProfile(event.currentTarget.dataset.id);
  },
  positionProfile(id) {
    if (!wx.createSelectorQuery) return;
    const query = wx.createSelectorQuery();
    query.select('.profile-grid').boundingClientRect();
    query.select('.settings-modal .modal-scroll').boundingClientRect();
    query.select(`#profile-${id}`).boundingClientRect();
    query.exec(([grid, scroll, origin]) => {
      if (!grid || !scroll || !origin || !this.data.detailProfile) return;
      const height = Math.min(grid.height, scroll.height - 4);
      const top = Math.max(scroll.top + 2, Math.min(grid.top, scroll.bottom - height - 2));
      const x = Math.max(0, Math.min(grid.width, origin.left + origin.width / 2 - grid.left));
      const y = Math.max(0, Math.min(height, origin.top + origin.height / 2 - top));
      this.setData({
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
    this.setData({ detailProfile: null });
  },
  copyResearchSource(event) {
    const url = event.currentTarget.dataset.url;
    if (this.data.detailProfile?.sources.some((source) => source.url === url))
      wx.setClipboardData({ data: url });
  },
  useProfile() {
    this.call('setAllProfiles', this.data.detailProfile.id);
    this.closeProfile();
  },
  mixProfiles() {
    const ids = this.data.profiles.filter((p) => p.id !== 'balanced').map((p) => p.id);
    this.data.seatSettings.forEach((seat, index) =>
      this.call('setSeatProfile', seat.id, ids[index % ids.length]),
    );
  },
  openGuide() {
    this.setData({ guideOpen: true });
  },
  closeGuide() {
    this.setData({ guideOpen: false });
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
      opponentOptions: ['全部对手', ...names],
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
    this.setData({
      reviewOpen: true,
      reviewPerspective: 'hero',
      reviewIndex: 0,
      opponentFilter: 0,
    });
    this.call('review', (reviewData) => this.updateReview(reviewData));
  },
  closeReview() {
    this.call('cancelReview');
    this.setData({ reviewOpen: false });
  },
  openActivity() {
    this.setData({ activityOpen: true });
  },
  closeActivity() {
    this.setData({ activityOpen: false });
  },
  openPots() {
    this.setData({ potOpen: true });
    this.measurePot();
  },
  measurePot() {
    if (!wx.createSelectorQuery) return;
    wx.createSelectorQuery()
      .select('.pot-sheet .sheet-body')
      .boundingClientRect((rect) => {
        if (rect && this.data.potOpen)
          this.setData({
            potHeight: Math.min(
              rect.height + 2,
              (this.data.windowHeight - this.data.topInset - this.data.bottomInset) * 0.85,
            ),
          });
      })
      .exec();
  },
  closePots() {
    this.setData({ potOpen: false });
  },
  resetPractice() {
    this.setData({ resetOpen: true });
  },
  closeReset() {
    this.setData({ resetOpen: false });
  },
  confirmReset() {
    this.call('reset');
    this.closeReset();
    this.closeSettings();
  },
});
