const { sliderRaiseTo } = require('../../shared/ui/bet-sizing.js');
const { compactChips, compactActionAmounts } = require('../../shared/engine/chip-format.js');
const { createWechatController } = require('../../shared/platform/wechat-controller.js');
const { phoneLayout } = require('./phone-layout.js');
const { numericWidthScale, numericColumnWidth } = require('../../shared/ui/numeric-width.js');
const {
  presentCard,
  showdownPresentation,
  presentationPatch,
  coalesceArrayPatch,
} = require('./presentation.js');
const { completeBoardForPractice, rankText } = require('../../shared/engine/poker.js');
const navigation = require('../../record-navigation.js');
const {
  pageOrientation,
  windowInfo,
  watchWindow,
  stopWindowWatch,
} = require('../../device-orientation.js');
const {
  entryWelcomeCorridor,
  entryWelcomeScale,
} = require('../../shared/ui/entry-welcome-scale.js');
const { heroPlaceStyle, heroTrophy, seatTrophy } = require('../../shared/ui/trophy-placement.js');
// The waiting message's natural size, measured in DevTools: its button (150px
// plus padding) and four stacked lines.
const ENTRY_WELCOME_SIZE = { width: 184, height: 132 };
const {
  WECHAT_RECORDS_BUDGET,
  createSnapshotFiles,
  ceremonySoundFiles,
  PREMIUM_SPARKS,
  CONFETTI_PIECES,
} = require('./game-effects.js');
// Match responsive chrome to the pixels reserved around the fitted arena.
// Phones retain their original budget; tablet touch controls need more room.
function viewportChrome(width, height) {
  const tablet = width >= 601 && height >= 601;
  const navHeight = tablet ? 76 : 48;
  const tableHeaderHeight = tablet ? 66 : 50;
  const liveDockHeight = tablet ? (width > height ? 152 : 208) : 154;
  return {
    navHeight,
    tableHeaderHeight,
    liveDockHeight,
    compactDockHeight: tablet ? 76 : 64,
    chromeHeight: 36 + navHeight + 8 + tableHeaderHeight + liveDockHeight + 8,
  };
}
const PROFILE_AXES = [
  ['vpip', '入池宽度'],
  ['aggression', '进攻倾向'],
  ['bluff', '诈唬倾向'],
  ['calling', '跟到底倾向'],
  ['trapping', '强牌诱导'],
];

module.exports = {
  data: {
    tableReady: false,
    topInset: 24,
    bottomInset: 0,
    windowHeight: 800,
    tableHeight: 460,
    arenaHeight: 460,
    arenaWidth: 364,
    arenaScale: 1,
    windowWidth: 390,
    pageOrientation: 'portrait',
    navRightInset: 104,
    compactNav: false,
    ...viewportChrome(390, 800),
    resourceMenuOpen: false,
    resourceLabel: '玩法指南',
    resourcePreviousLabel: '对局记录',
    resourceRolling: false,
    resourceReducedMotion: false,
    historyReadOnly: false,
    settingsOpen: false,
    guideOpen: false,
    guideScrollTarget: '',
    guideScrollTop: 0,
    reviewOpen: false,
    activityOpen: false,
    potOpen: false,
    resetOpen: false,
    guideExpanded: [false, false, true],
    potExpanded: {},
    potSheetHeight: 580,
    reviewPerspective: 'hero',
    reviewIndex: 0,
    opponentFilter: 0,
    opponentOptions: ['全部对手'],
    selectedReviewStep: null,
    countOptions: [5, 6, 7, 8, 9],
    emotionOptions: ['关闭', '轻微波动', '明显波动'],
    // Kept in data: a WXML <text> renders wrapped source lines as line breaks.
    emotionIntro:
      '情绪只调整当前难度内的入池、进攻与跟注倾向，不增加策略能力。轻微波动的情绪持续 3 手；明显波动影响更大，持续 4 手，也更容易再次触发。',
    moodLegend: [
      { kind: 'frustrated', name: '急于追回', text: '· 橙色火焰：大额亏损后入池更宽、更常跟到底' },
      {
        kind: 'cautious',
        name: '收紧避险',
        text: '· 蓝色盾牌：大额亏损后入池更紧，少进攻、少跟注',
      },
      { kind: 'confident', name: '连胜自信', text: '· 金色星星：连续盈利后入池与进攻略增' },
      {
        kind: 'reactive',
        name: '受压反击',
        text: '· 红色闪电：4 手内三次被同一对手加注弃牌后更多加注与诈唬',
      },
    ],
    profiles: [],
    settings: { sound: true, music: true, vibration: true, hints: true },
    seats: [],
    board: [],
    showdown: [],
    hasShowdown: false,
    boardTop: [],
    boardBottom: [],
    boardSlots: [],
    boardWidth: 152,
    boardTwoRows: true,
    heroCards: [],
    turnPhase: '',
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
    raiseControl: { enabled: false, position: 0, key: 'initial' },
    flyingChips: [],
    premiumSparks: PREMIUM_SPARKS,
    confettiPieces: CONFETTI_PIECES,
    crownStyle: '',
  },
  onLoad() {
    this.updateWindow();
    this._audio = [];
    if (!this._readOnlyAttempt) this.preloadSounds();
    this._controller = createWechatController({
      createReviewWorker:
        typeof wx.createWorker === 'function' ? () => wx.createWorker('workers/review.js') : null,
      publish: (view) => {
        if (
          !view.canRaise ||
          view.hand !== this.data.hand ||
          view.replay !== this.data.replay ||
          view.street !== this.data.street
        )
          this._raiseGesture = null;
        if (!this._readOnlyAttempt && typeof getApp === 'function')
          getApp().noirMusic?.setEnabled(view.settings.music);
        if (view.done || view.hand !== this.data.hand || view.replay !== this.data.replay)
          this._finishRequested = false;
        const game = this._controller?.getGame();
        const board = view.board;
        const showdown = game ? showdownPresentation(game, view.profiles) : [];
        const dealKey = `${view.sessionNumber}:${view.hand}:${view.replay}`;
        const changedDeal = dealKey !== this._dealKey;
        if (changedDeal) {
          this._motionEpoch = (this._motionEpoch || 0) + 1;
          this.cancelCardMotion();
          this._seatFaces = new Map();
        }
        if (changedDeal || !view.settings.sound) {
          this.cancelSoundTail();
          for (const audio of this._audio || []) audio.stop();
        }
        // Records keep the live hand running offscreen. Its new cards must
        // settle immediately; there is no visible animation timer while hidden.
        const animate = !this._hidden && (!this._readOnlyAttempt || Number.isInteger(this._peekId));
        const previousCards = dealKey === this._dealKey ? this._boardCount || 0 : 0;
        this._dealKey = dealKey;
        const presentedBoard = board.map((card, index) => ({
          ...presentCard(card),
          arriving:
            animate &&
            (index >= previousCards || (!changedDeal && this.data.board[index]?.arriving)),
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
          const arriving =
            animate && signature !== this._seatFaces?.get(seat.id) && seat.cards.length > 0;
          this._seatFaces?.set(seat.id, signature);
          if (arriving) faceArrivals.push(seat.id);
          return {
            ...seat,
            peekArriving:
              animate &&
              (Boolean(arriving && this._peekId === seat.id) ||
                (!changedDeal && Boolean(before?.peekArriving))),
            cards: seat.cards.map((card, index) => ({
              ...presentCard(card),
              dealDelay: index * 140,
              arriving:
                animate && (arriving || (!changedDeal && Boolean(before?.cards[index]?.arriving))),
            })),
            backCards: (view.waitingForSeat ? [] : [0, 1]).map((index) => ({
              key: `${dealKey}:${index}`,
              delay: seat.id * 65 + index * 140,
              arriving:
                animate &&
                (changedDeal ||
                  (!before?.cards.length && Boolean(before?.backCards[index]?.arriving))),
            })),
          };
        });
        const update = {
          ...view,
          raiseControl: this.controlForRaise(view),
          raiseDragging: Boolean(this._raiseGesture),
          tableReady:
            (view.waitingForSeat || view.heroCards.length === 2) && view.seats.length >= 4,
          finishing:
            view.done || view.hand !== this.data.hand || view.replay !== this.data.replay
              ? false
              : this.data.finishing,
          seats: presentedSeats,
          ...(changedDeal ? { flyingChips: [] } : {}),
          heroCards: view.heroCards.map((card, index) => ({
            ...presentCard(card),
            dealKey: `${dealKey}:${card.key}`,
            arriving: animate && (changedDeal || Boolean(this.data.heroCards[index]?.arriving)),
          })),
          showdown,
          hasShowdown: showdown.length > 0,
          showdownContext: `${showdown.length} 人参与摊牌${game?.pots.length > 1 ? ' · 主池与边池分别结算' : ''}`,
          activePlayerCount: view.seats.length + 1,
          logs: view.logs,
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
        // A render-layer drag owns its thumb and caption until commit/cancel.
        // An unrelated public redraw must not restore the last committed amount
        // or send a committed value back into the moving render-layer thumb.
        if (this._raiseGesture) {
          delete update.sliderValue;
          delete update.raiseText;
          delete update.raiseTo;
        }
        // Large research catalogs and card artwork need not cross the service/
        // view bridge on every bot turn. Preserve existing card nodes and motion.
        const startsCeremony = !!view.ceremony && view.ceremony.key !== this.data.ceremony?.key;
        if (startsCeremony) update.crownStyle = '';
        const patch = presentationPatch(this.data, update);
        if (Object.keys(patch).length)
          this.setPresentationData(patch, () => {
            this.tightenSeatRanks();
            // Readiness marks only the UI. App foreground owns music: delayed
            // table paints behind records must not pause or resume that player.
            if (update.tableReady && !this._readOnlyAttempt && typeof getApp === 'function') {
              getApp().noirTableReady = true;
            }
            if (startsCeremony) this.aimCrown(view.ceremony);
          });
        if (changedDeal && animate)
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
      readOnlyAttempt: this._readOnlyAttempt || null,
      readOnlySessionNumber: this._readOnlySessionNumber || null,
      snapshots: this._readOnlyAttempt ? undefined : createSnapshotFiles() || undefined,
      recordsBudget: WECHAT_RECORDS_BUDGET,
      toast: (title) => wx.showToast?.({ title, icon: 'none', duration: 3000 }),
      storage: {
        getItem: (key) => wx.getStorageSync(key) || null,
        setItem: (key, value) => wx.setStorageSync(key, value),
      },
      sound: (name) => this.playSound(name),
      wager: (id) => this.flyChips(id),
      publishAttention: (turnPhase) => {
        if (!this._destroyed) this.setData({ turnPhase });
      },
      notifyTurn: () => {
        if (!this._hidden && !this._destroyed && this.data.settings.vibration)
          wx.vibrateShort?.({ type: 'light', fail: () => {} });
      },
    });
    if (!this._readOnlyAttempt) {
      if (typeof getApp === 'function') getApp().noirController = this._controller;
      this._controller.start();
    } else {
      this._controller.show();
      this._initialHistoryShown = true;
    }
  },
  joinTable() {
    this.call('join');
  },
  onShow() {
    const returningFromRecords = Boolean(this._browsingRecords);
    this._hidden = false;
    this._browsingRecords = false;
    const resized = this.updateWindow();
    watchWindow(this);
    this.readResourceMotionPreference();
    this.startResourceRotation();
    if (!this._readOnlyAttempt && !this._audio?.length) this.preloadSounds();
    // The same controller has kept publishing while records were visible.
    // Re-showing it would repaint an already-current page during native Back.
    if (!this._initialHistoryShown && !returningFromRecords) this._controller?.show();
    this._initialHistoryShown = false;
    if (!returningFromRecords || resized) {
      this._numberWidths?.clear();
      // Embedded fonts may settle just after the first native measurement.
      this.scheduleCardMotion('number-font', 1000, () => {
        this._numberWidths?.clear();
        this.tightenSeatRanks();
        return {};
      });
    }
    // Hidden actions can change amounts/ranks. Measure their final paint once,
    // retaining existing width scales until a real difference is observed.
    if (returningFromRecords) this.tightenSeatRanks();
    if (this._finishRequested && !this.data.done) this.finishHand();
    if (this.data.reviewOpen && this._controller)
      this.call('review', (reviewData) => this.updateReview(reviewData));
  },
  onHide() {
    stopWindowWatch(this);
    this._hidden = true;
    this.cancelRaise();
    clearTimeout(this._resourceTimer);
    clearTimeout(this._resourceMotionTimer);
    this.setData({ resourceRolling: false });
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
    this.setPresentationData(stopped);
    this.setData({ finishing: false, flyingChips: [] });
    this._rankEpoch = (this._rankEpoch || 0) + 1;
    if (!this._browsingRecords) this._controller?.hide();
    this.stopSounds();
  },
  onUnload() {
    stopWindowWatch(this);
    this._destroyed = true;
    this._raiseGesture = null;
    clearTimeout(this._resourceTimer);
    clearTimeout(this._resourceMotionTimer);
    if (typeof getApp === 'function' && getApp().noirController === this._controller)
      delete getApp().noirController;
    this._motionEpoch = (this._motionEpoch || 0) + 1;
    this.cancelCardMotion();
    this._controller?.destroy();
    this.stopSounds();
  },
  onResize(event) {
    this.updateWindow(event);
  },
  onReady() {
    watchWindow(this);
  },
  setPresentationData(patch, callback) {
    this.setData(coalesceArrayPatch(this.data, patch), callback);
  },
  scheduleCardMotion(key, delay, readPatch) {
    if (this._hidden || this._destroyed) return;
    this._cardTimers ||= new Map();
    clearTimeout(this._cardTimers.get(key));
    const deal = this._dealKey;
    const timer = setTimeout(() => {
      if (this._cardTimers.get(key) !== timer) return;
      this._cardTimers.delete(key);
      if (this._hidden || this._destroyed || deal !== this._dealKey) return;
      this.setPresentationData(readPatch());
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
  setOverlay(patch, onReady) {
    this._audioUnlocked = true;
    if (typeof getApp === 'function') getApp().noirMusic?.unlock();
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
      onReady?.();
    });
  },
  updateWindow(event) {
    const app = getApp();
    const measured = windowInfo(wx, event, app);
    // Scrolling/keyboard chrome must not refit the table. Live and archive pages
    // reuse one window budget until an actual width/orientation change.
    const valid =
      measured.windowWidth > 0 &&
      measured.windowHeight >
        viewportChrome(measured.windowWidth, measured.windowHeight).chromeHeight;
    if (valid && (!app.noirViewport || app.noirViewport.windowWidth !== measured.windowWidth))
      app.noirViewport = {
        ...measured,
        safeArea: measured.safeArea ? { ...measured.safeArea } : undefined,
      };
    const info = app.noirViewport || measured;
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
        rect.right >= info.windowWidth - 120 &&
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
    const chrome = viewportChrome(info.windowWidth, info.windowHeight);
    const viewport = {
      ...chrome,
      pageOrientation: pageOrientation(wx, measured, app),
      topInset,
      bottomInset,
      windowHeight: info.windowHeight,
      navRightInset,
      compactNav: false,
      windowWidth: info.windowWidth,
      tableHeight: Math.max(0, info.windowHeight - topInset - bottomInset - chrome.chromeHeight),
    };
    if (Object.entries(viewport).every(([key, value]) => this.data[key] === value)) return false;
    const arenaHeight = Math.max(300, viewport.tableHeight);
    const arenaScale = Math.min(1, viewport.tableHeight / arenaHeight);
    Object.assign(viewport, {
      arenaHeight,
      arenaScale,
      arenaWidth: (info.windowWidth - 18) / (arenaScale || 1),
    });
    const layout = this.publicLayout(this.data.board, this.data, { ...this.data, ...viewport });
    const wasDragging = !!this._raiseGesture;
    this._raiseGesture = null;
    this._raiseEpoch = (this._raiseEpoch || 0) + 1;
    // A single atomic update avoids a frame with the new window but old seats.
    const patch = presentationPatch(this.data, {
      ...viewport,
      ...layout,
      raiseDragging: false,
      raiseControl: this.controlForRaise({ ...this.data, ...viewport }),
      ...(wasDragging ? { raiseText: compactChips(this.data.raiseTo) } : {}),
    });
    if (Object.keys(patch).length) this.setPresentationData(patch);
    return true;
  },
  publicLayout(board = [], view = this.data, viewport = this.data) {
    if (view.seats?.length) {
      const chrome = viewportChrome(viewport.windowWidth, viewport.windowHeight);
      const tableHeight = Math.max(
        0,
        viewport.windowHeight - viewport.topInset - viewport.bottomInset - chrome.chromeHeight,
      );
      const fitted = phoneLayout({
        width: viewport.windowWidth,
        availableWidth: viewport.windowWidth - 18,
        height: tableHeight,
        seats: view.seats,
        displayHeight: viewport.windowHeight - viewport.topInset - viewport.bottomInset - 36,
      });
      // The positioned rows are rendered as phoneSeats. Do not send a third,
      // unused copy of every profile and card over the service/view bridge.
      const { positioned, ...geometry } = fitted;
      // As on Web, the waiting message keeps its size unless the players beside
      // it would crowd it; it sits centred at 44% of the arena height.
      const entrySize = chrome.navHeight > 48 ? { width: 230, height: 168 } : ENTRY_WELCOME_SIZE;
      const halfHeight = entrySize.height / fitted.arenaScale / 2;
      const corridor = entryWelcomeCorridor(
        positioned.map((seat) => {
          const profile = seat.parts?.[1] ?? {
            left: 0,
            top: 0,
            width: seat.width,
            height: seat.height,
          };
          return {
            left: seat.left + profile.left,
            top: seat.top + profile.top,
            width: profile.width,
            height: profile.height,
          };
        }),
        {
          centerX: fitted.arenaWidth / 2,
          top: fitted.arenaHeight * 0.44 - halfHeight,
          bottom: fitted.arenaHeight * 0.44 + halfHeight,
        },
      );
      // The champion's trophy follows the shared rules on the same layout boxes
      // Web measures, so it rests in the same spot on every platform.
      const box = ({ left, top, width, height }) => ({
          left,
          top,
          right: left + width,
          bottom: top + height,
        }),
        seatParts = fitted.positioned.map((seat) =>
          (seat.parts || [{ left: 0, top: 0, width: seat.width, height: seat.height }]).map(
            (part) => box({ ...part, left: seat.left + part.left, top: seat.top + part.top }),
          ),
        ),
        boardBox = box(fitted.public),
        hero = box(fitted.hero),
        heroCards = { ...hero, bottom: hero.top + fitted.heroHeight },
        heroPlace = view.heroCrowned ? heroTrophy(heroCards, { above: boardBox.bottom }) : null;
      const trophyFor = (index) => {
        const place = seatTrophy(seatParts[index][1] || seatParts[index][0], {
          bounds: { left: 0, right: fitted.arenaWidth },
          obstacles: [...seatParts.filter((_, j) => j !== index).flat(), boardBox, hero],
        });
        return {
          trophySide: place.side,
          trophyStyle: `width:${place.width}px;height:${place.height}px;--trophy-gap:${place.gap}px;`,
        };
      };
      return {
        ...geometry,
        heroPlaceStyle: view.heroPlaced
          ? heroPlaceStyle({
              room: (hero.top - boardBox.bottom) * fitted.arenaScale,
              scale: fitted.arenaScale,
            })
          : '',
        heroTrophyStyle: heroPlace
          ? `width:${heroPlace.width}px;height:${heroPlace.height}px;left:calc(50% - ${heroPlace.width / 2}px);bottom:calc(100% + ${heroPlace.gap - heroPlace.drop}px);`
          : '',
        entryScale: entryWelcomeScale({
          arenaScale: fitted.arenaScale,
          contentWidth: entrySize.width,
          corridorWidth: corridor * fitted.arenaScale,
        }),
        tableHeight,
        phoneLayout: true,
        phoneSeats: positioned.map((seat, index) => {
          const before = this.data.phoneSeats?.find((previous) => previous.id === seat.id);
          return {
            ...seat,
            ...(seat.crowned ? trophyFor(index) : {}),
            rankLift: view.hand === this.data.hand ? before?.rankLift || 0 : 0,
            stackWidthScale: before?.stack === seat.stack ? before.stackWidthScale || 1 : 1,
            nameFit: !view.done && before?.name === seat.name ? before.nameFit || false : false,
            nameWidthScale:
              !view.done && before?.name === seat.name ? before.nameWidthScale || 1 : 1,
          };
        }),
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
    query.selectAll('.seat-body > .stack').fields({
      rect: true,
      size: true,
      dataset: true,
      computedStyle: ['font-size', 'font-family', 'font-weight'],
    });
    query.selectAll('.seat-name-measure').fields({ rect: true, size: true, dataset: true });
    query.selectAll('.seat-name .position').fields({ rect: true, size: true, dataset: true });
    query.exec(([words, ranks, numbers, names, positions]) => {
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
      const metrics = this.data.textMetrics;
      // Seats (and their text metrics) may not be laid out yet.
      if (!metrics) {
        if (Object.keys(patch).length) this.setPresentationData(patch);
        return;
      }
      const available = numericColumnWidth({
        profileWidth: this.data.profileWidth,
        padding: metrics['profile-padding'],
        avatar: metrics['player-avatar'],
      });
      this._numberWidths ||= new Map();
      for (const number of numbers || []) {
        const index = this.data.phoneSeats.findIndex(
          (seat) => seat.id === Number(number.dataset.id),
        );
        if (index < 0 || !(number.width > 0)) continue;
        const seat = this.data.phoneSeats[index];
        if (String(number.dataset.number) !== seat.stack) continue;
        const key = `${seat.stack}|${number['font-size'] || metrics['player-stack']}|${number['font-family'] || 'Barlow Condensed'}|${number['font-weight'] || 600}`;
        let width = this._numberWidths.get(key);
        if (width === undefined) {
          width = number.width / scale / (Number(number.dataset.widthScale) || 1);
          if (this._numberWidths.size >= 256) this._numberWidths.clear();
          this._numberWidths.set(key, width);
        }
        const fitted = numericWidthScale(width, available);
        if (Math.abs(fitted - (seat.stackWidthScale || 1)) > 0.0001)
          patch[`phoneSeats[${index}].stackWidthScale`] = fitted;
      }
      if (!this.data.done) {
        for (const name of names || []) {
          const index = this.data.phoneSeats.findIndex(
            (seat) => seat.id === Number(name.dataset.id),
          );
          const position = positions?.find(
            (badge) => Number(badge.dataset.id) === Number(name.dataset.id),
          );
          if (index < 0 || !position || !(name.width > 0)) continue;
          const width =
            this.data.profileWidth -
            metrics['profile-padding'] * 2 -
            2 -
            position.width / scale -
            3 -
            0.25;
          const fitted = numericWidthScale(name.width / scale, width);
          const fit = fitted >= 0.75 && fitted < 1;
          const actual = fit ? fitted : 1;
          const seat = this.data.phoneSeats[index];
          if (seat.nameFit !== fit) patch[`phoneSeats[${index}].nameFit`] = fit;
          if (Math.abs((seat.nameWidthScale || 1) - actual) > 0.0001)
            patch[`phoneSeats[${index}].nameWidthScale`] = actual;
        }
      }
      if (Object.keys(patch).length) this.setPresentationData(patch);
    });
  },
  call(method, ...args) {
    this.unlockAudio();
    try {
      return this._controller[method](...args);
    } catch (error) {
      wx.showToast({ title: error.message || '请重试', icon: 'none' });
    }
  },
  unlockAudio() {
    this._audioUnlocked = true;
    if (!this._readOnlyAttempt && typeof getApp === 'function') getApp().noirMusic?.unlock();
  },
  // The flying trophy lands on the champion's hidden resting trophy.
  aimCrown(ceremony) {
    if (!wx.createSelectorQuery) return;
    const target = ceremony.heroWon ? '#hero-trophy' : `#seat-trophy-${ceremony.championId}`;
    wx.createSelectorQuery()
      .in(this)
      .select(target)
      .boundingClientRect()
      .exec(([rect] = []) => {
        if (!rect || this._destroyed || this.data.ceremony?.key !== ceremony.key) return;
        const x = rect.left + rect.width / 2 - this.data.windowWidth / 2,
          y = rect.top + rect.height / 2 - this.data.windowHeight * 0.45;
        this.setData({
          crownStyle: `--trophy-x:${Math.round(x)}px;--trophy-y:${Math.round(y)}px;--trophy-scale:${(rect.height / 100).toFixed(3)}`,
        });
      });
  },
  playSound(name) {
    if (this._hidden || !wx.createInnerAudioContext || !this._audioUnlocked) return;
    const names = {
      fold: 'fold',
      check: 'check',
      raise: 'chip',
      call: 'chip',
      deal: 'deal',
      win: 'win',
      champion: 'champion',
      crowned: 'crowned',
      farewell: 'farewell',
    };
    if (!names[name]) return;
    // Finish both knocks before a following result cue. Keep only the latest
    // pending cue, and discard it on hide, mute, retry or a new deal.
    if (this._checkTail) {
      this._soundAfterCheck = name;
      return;
    }
    try {
      const audio = this._soundPool?.[names[name]];
      if (!audio) return;
      // Mini-program audio has no shared mix limiter. Keep the latest UI cue
      // alone so boosted PCM never sums several independent context peaks.
      for (const other of this._audio || []) if (other !== audio) other.stop();
      audio.stop();
      audio.seek?.(0);
      this._activeSound = audio;
      if (name === 'check') this.holdCheck(1000);
      audio.play();
    } catch {
      /* A device can block audio until the first user gesture. */
    }
  },
  holdCheck(delay) {
    clearTimeout(this._soundTailTimer);
    const epoch = this._soundEpoch || 0;
    this._checkTail = true;
    this._soundTailTimer = setTimeout(() => {
      if (epoch !== (this._soundEpoch || 0)) return;
      this._soundTailTimer = null;
      this._checkTail = false;
      const next = this._soundAfterCheck;
      this._soundAfterCheck = null;
      if (next && !this._hidden && !this._destroyed && this.data.settings.sound)
        this.playSound(next);
    }, delay);
  },
  preloadSounds() {
    if (this._audio?.length && this._soundPool) return;
    // DevTools hot reload can run onShow without replaying onLoad's fields.
    // Dispose any orphaned contexts before rebuilding a complete sound pool.
    this.stopSounds();
    if (!wx.createInnerAudioContext) return;
    for (const name of ['fold', 'check', 'chip', 'deal', 'win']) {
      const audio = wx.createInnerAudioContext({ useWebAudioImplement: true });
      audio.src = `/assets/sounds/${name}.wav`;
      audio.volume = 1;
      audio.obeyMuteSwitch = false;
      if (name === 'check')
        audio.onPlay?.(() => {
          // Count the two knocks from actual playback, not a potentially slow
          // first decode. The request-time timeout only bounds a failed player.
          if (this._activeSound === audio && this._checkTail && !this._hidden && !this._destroyed)
            this.holdCheck(240);
        });
      audio.onError((error) => {
        this._audioErrors ||= [];
        this._audioErrors.push({ name, code: error.errCode, message: error.errMsg });
        if (this._audioErrors.length > 8) this._audioErrors.shift();
      });
      this._audio.push(audio);
      this._soundPool[name] = audio;
    }
    for (const [name, path] of Object.entries(ceremonySoundFiles())) {
      const audio = wx.createInnerAudioContext();
      audio.src = path;
      audio.volume = 1;
      audio.obeyMuteSwitch = false;
      audio.onError(() => {});
      this._audio.push(audio);
      this._soundPool[name] = audio;
    }
  },
  stopSounds() {
    this.cancelSoundTail();
    (this._audio || []).forEach((audio) => {
      audio.stop();
      audio.destroy();
    });
    this._audio = [];
    this._soundPool = {};
    this._activeSound = null;
  },
  cancelSoundTail() {
    this._soundEpoch = (this._soundEpoch || 0) + 1;
    clearTimeout(this._soundTailTimer);
    this._soundTailTimer = null;
    this._checkTail = false;
    this._soundAfterCheck = null;
  },
  act(event) {
    this.cancelRaise();
    this.call('action', event.currentTarget.dataset.action);
  },
  preset(event) {
    this.cancelRaise();
    this.call('preset', event.currentTarget.dataset.preset);
  },
  raiseView() {
    return {
      currentBet: this.data.currentBet,
      pot: this.data.potAmount,
      legal: {
        enabled: this.data.canAct,
        canRaise: this.data.canRaise,
        chipUnit: this.data.chipUnit,
        minRaiseTo: this.data.minRaise,
        maxRaiseTo: this.data.maxRaise,
        callAmount: this.data.callAmount || 0,
      },
    };
  },
  controlForRaise(view = this.data) {
    return {
      enabled: !!view.canRaise && !this._hidden && !this._destroyed,
      position: view.sliderValue || 0,
      key: [
        this._raiseEpoch || 0,
        view.sessionNumber,
        view.hand,
        view.replay,
        view.street,
        view.currentBet,
        view.potAmount,
        view.minRaise,
        view.maxRaise,
      ].join(':'),
    };
  },
  acceptsRail(message) {
    return (
      this.data.canRaise &&
      !this._hidden &&
      !this._destroyed &&
      message.key === this.data.raiseControl.key &&
      !(this._endedRaise?.key === message.key && message.id <= this._endedRaise.id)
    );
  },
  railPreview(message) {
    if (!this.acceptsRail(message)) return;
    this.previewRaise({ detail: { value: message.position } });
    this._raiseGesture = { ...this._raiseGesture, key: message.key, id: message.id };
  },
  railCommit(message) {
    if (!this.acceptsRail(message)) return;
    this._endedRaise = { key: message.key, id: message.id };
    this.changeRaise({ detail: { value: message.position } });
  },
  railCancel(message) {
    if (!this.acceptsRail(message)) return;
    this._endedRaise = { key: message.key, id: message.id };
    this.cancelRaise();
  },
  changeRaise(event) {
    if (!this.data.canRaise || this._hidden || this._destroyed) return;
    this._raiseGesture = null;
    this.call('setRaisePosition', event.detail.value);
  },
  cancelRaise() {
    this._raiseGesture = null;
    this._raiseEpoch = (this._raiseEpoch || 0) + 1;
    this.setData({ raiseDragging: false, raiseControl: this.controlForRaise() });
    if (this.data.canRaise && !this._hidden && !this._destroyed) this._controller?.show();
  },
  previewRaise(event) {
    if (!this.data.canRaise || this._hidden || this._destroyed) return;
    this.unlockAudio();
    this._controller?.engageTurn();
    const value = sliderRaiseTo(this.raiseView(), event.detail.value);
    if (value === null) return;
    this._raiseGesture = { position: event.detail.value };
    // WXS moves the visible thumb without a logic/view bridge round trip.
    // Only update the caption;
    // feeding its position back through setData during a drag fights touch input.
    this.setData({
      raiseText: compactChips(value),
      raiseDragging: true,
      raisePreviewPosition: Math.max(
        0,
        Math.min(this.data.sliderLimit, Number(event.detail.value) || 0),
      ),
    });
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
    this._raiseGesture = null;
    this._finishRequested = false;
    this.setData({ finishing: false });
    this.call('nextHand');
  },
  retryHand() {
    if (this._raiseGesture) this.cancelRaise();
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
          sizingLow: Math.round(profile.sizing[0] * 100),
          sizingHigh: Math.round(profile.sizing[1] * 100),
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
  startResourceRotation() {
    clearTimeout(this._resourceTimer);
    if (this._hidden || this._destroyed || this._readOnlyAttempt || this.data.resourceReducedMotion)
      return;
    this._resourceTimer = setTimeout(() => {
      if (!this.data.resourceMenuOpen && !this.data.homeLocked) this.rollResourceLabel();
      this.startResourceRotation();
    }, 4200);
  },
  rollResourceLabel() {
    clearTimeout(this._resourceMotionTimer);
    this.setData({
      resourcePreviousLabel: this.data.resourceLabel,
      resourceLabel: this.data.resourceLabel === '玩法指南' ? '对局记录' : '玩法指南',
      resourceRolling: true,
    });
    this._resourceMotionTimer = setTimeout(() => {
      this.setData({ resourceRolling: false });
    }, 400);
  },
  readResourceMotionPreference() {
    if (this._readOnlyAttempt || !wx.createSelectorQuery) return;
    const query = wx.createSelectorQuery();
    const node = query.select?.('#resource-menu-button');
    if (!node?.fields) return;
    node.fields({ computedStyle: ['animation-duration'] }, (style) => {
      if (this._hidden || this._destroyed || !style) return;
      const reduced = parseFloat(style['animation-duration']) === 0;
      if (reduced === this.data.resourceReducedMotion) return;
      this.setData({
        resourceReducedMotion: reduced,
        resourceRolling: false,
        resourceLabel: '玩法指南',
      });
      clearTimeout(this._resourceMotionTimer);
      this.startResourceRotation();
    });
    query.exec();
  },
  toggleResourceMenu() {
    this._audioUnlocked = true;
    clearTimeout(this._resourceMotionTimer);
    this.setData({ resourceMenuOpen: !this.data.resourceMenuOpen, resourceRolling: false });
  },
  closeResourceMenu() {
    this.setData({ resourceMenuOpen: false });
  },
  openRecords() {
    this.closeResourceMenu();
    this._browsingRecords = true;
    navigation.openRecords({
      fail: () => {
        this._browsingRecords = false;
      },
    });
  },
  openGuide() {
    this.showGuide();
  },
  openHandRankings() {
    this.showGuide('hand-rankings');
  },
  showGuide(target = '') {
    this.closeResourceMenu();
    const token = (this._guideOpenToken = (this._guideOpenToken || 0) + 1);
    this.setOverlay({ guideOpen: true, guideScrollTarget: '', guideScrollTop: 0 }, () => {
      if (this.data.guideOpen && this._guideOpenToken === token && target)
        this.setData({ guideScrollTarget: target });
    });
  },
  closeGuide() {
    this._guideOpenToken = (this._guideOpenToken || 0) + 1;
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
    const selectedIndex = this.data.reviewSteps?.[this.data.reviewIndex]?.index;
    const retainedIndex = steps.findIndex((step) => step.index === selectedIndex);
    const reviewIndex =
      retainedIndex >= 0
        ? retainedIndex
        : Math.min(this.data.reviewIndex, Math.max(0, steps.length - 1));
    const selectedStep = steps[reviewIndex];
    if (this.data.reviewPerspective !== 'hero' && selectedStep && !selectedStep.analyzed) {
      Object.assign(selectedStep, this.call('reviewOpponent', selectedStep.index) || {});
    }
    const actorId = this.data.reviewPerspective === 'hero' ? 0 : selectedStep?.id;
    const activity = (reviewData.activity || []).map((event) => ({
      ...event,
      emphasized: Number.isInteger(actorId) && event.player === actorId,
      current:
        Number.isInteger(actorId) &&
        event.player === actorId &&
        event.sequence === selectedStep?.sequence,
    }));
    this.setData({
      reviewData,
      reviewActivity: activity,
      opponentOptions: [
        '全部对手',
        ...names.map((name) => {
          const step = opponents.find((step) => step.name === name);
          return step.named && step.profileName
            ? `${name}，${step.profileName.replace(/\s*·\s*/g, '，')}`
            : name;
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
      reviewActivityOpen: true,
      reviewPerspective: 'hero',
      reviewIndex: 0,
      opponentFilter: 0,
    });
    this.call('review', (reviewData) => this.updateReview(reviewData));
  },
  toggleReviewActivity() {
    this.setData({ reviewActivityOpen: !this.data.reviewActivityOpen });
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
};
