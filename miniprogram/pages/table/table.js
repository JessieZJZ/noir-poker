const { createWechatController } = require('../../shared/platform/wechat-controller.js');
// The dock keeps one 108px height through action, fold, all-in and settlement.
const VIEWPORT_CHROME_HEIGHT = 230;
function tableLayout(windowWidth, height) {
  const width = Math.max(0, windowWidth - 18);
  const compact = height < 600;
  const narrow = windowWidth < 360;
  const wide = windowWidth >= 700 && height >= 480;
  const seatWidth = Math.min(wide ? 110 : 78, Math.max(40, Math.floor(width * 0.18) - 2));
  const seatHoleHeight = wide ? (compact ? 40 : 44) : compact ? (narrow ? 20 : 24) : 35;
  const seatBodyHeight = wide ? (compact ? 66 : 74) : compact ? (narrow ? 32 : 38) : 60;
  const seatCaptionHeight = wide ? (compact ? 28 : 32) : compact ? (narrow ? 22 : 26) : 30;
  const seatHeight = seatHoleHeight + seatBodyHeight + seatCaptionHeight;
  const heroCardWidth = wide ? (compact ? 70 : 76) : compact ? (narrow ? 40 : 53) : 58;
  const heroCardHeight = wide ? (compact ? 94 : 102) : compact ? (narrow ? 52 : 72) : 78;
  // The shortest screens keep name, position and stack together on one line,
  // leaving the same fixed 16px action slot without shrinking the public board.
  const heroInlineIdentity = compact && narrow;
  const heroIdentityHeight = heroInlineIdentity ? 14 : 30;
  const heroFooterHeight = heroIdentityHeight + 16;
  const heroRankHeight = heroInlineIdentity ? 8 : 12;
  const heroCardGap = 8;
  const heroBottom = 5;
  const radians = (5 * Math.PI) / 180;
  const rotatedHeight = heroCardHeight * Math.cos(radians) + heroCardWidth * Math.sin(radians);
  const heroTop =
    height -
    heroBottom -
    heroFooterHeight -
    heroCardGap -
    heroRankHeight -
    heroCardHeight -
    (rotatedHeight - heroCardHeight) / 2;
  const upperEnd = compact ? 8 + seatHeight : height * 0.1 + seatHeight * 0.8;
  const communityMinTop = upperEnd + 6;
  const communityMaxBottom = heroTop - 6;
  const maxCardHeight = Math.floor((communityMaxBottom - communityMinTop - 32) / 2);
  const centerWidth = width * 0.7 - seatWidth;
  const cardWidth = Math.max(
    20,
    Math.min(wide ? 64 : 48, Math.floor((centerWidth - 20) / 3), Math.floor(maxCardHeight / 1.35)),
  );
  const cardHeight = Math.round(cardWidth * 1.35);
  const communityHeight = 32 + 2 * cardHeight;
  return {
    width,
    height,
    compact,
    narrow,
    wide,
    seatWidth,
    seatHoleHeight,
    seatBodyHeight,
    seatCaptionHeight,
    seatHeight,
    heroCardWidth,
    heroCardHeight,
    heroFooterHeight,
    heroIdentityHeight,
    heroInlineIdentity,
    heroCardGap,
    heroRankHeight,
    heroRankOffset: heroRankHeight + (rotatedHeight - heroCardHeight) / 2,
    heroBottom,
    heroTop,
    cardWidth,
    cardHeight,
    communityHeight,
    communityTop: (communityMinTop + communityMaxBottom - communityHeight) / 2,
    lastSeatTop: height - heroBottom - heroFooterHeight - 6 - seatHeight,
  };
}
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
    layout: {},
    navRightInset: 104,
    compactNav: false,
    settingsOpen: false,
    guideOpen: false,
    reviewOpen: false,
    activityOpen: false,
    potOpen: false,
    countOptions: [5, 6, 7, 8, 9],
    emotionOptions: ['关闭', '轻微波动', '明显波动'],
    profiles: [],
    settings: { sound: true, hints: true },
    seats: [],
    board: [],
    boardTop: [],
    boardBottom: [],
    heroCards: [],
    reviewData: { steps: [] },
    detailProfile: null,
  },
  onLoad() {
    this.updateWindow();
    this._audio = [];
    this._controller = createWechatController({
      publish: (view) =>
        this.setData({
          ...view,
          seats: this.layoutSeats(view.seats),
          countIndex: view.settings.playerCount - 5,
          emotionIndex: ['off', 'subtle', 'lively'].indexOf(view.settings.emotionMode),
        }),
      storage: {
        getItem: (key) => wx.getStorageSync(key) || null,
        setItem: (key, value) => wx.setStorageSync(key, value),
      },
      sound: (name) => this.playSound(name),
    });
    this._controller.start();
  },
  onShow() {
    this._controller?.show();
    if (this.data.reviewOpen && this._controller)
      this.call('review', (reviewData) => this.setData({ reviewData }));
  },
  onHide() {
    this._controller?.hide();
    this.stopSounds();
  },
  onUnload() {
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
    const tableHeight = Math.max(
      0,
      info.windowHeight - topInset - bottomInset - VIEWPORT_CHROME_HEIGHT,
    );
    const layout = tableLayout(info.windowWidth, tableHeight);
    // Only a window resize changes these dimensions, never a poker action.
    this.setData({
      topInset,
      bottomInset,
      windowHeight: info.windowHeight,
      navRightInset,
      compactNav: info.windowWidth - 24 - navRightInset < 250,
      tableHeight,
      layout,
      seats: this.layoutSeats(this.data.seats, layout),
    });
  },
  layoutSeats(seats, layout = this.data.layout) {
    return seats.map((seat) => ({
      ...seat,
      left: (layout.width * seat.x) / 100,
      top: layout.compact
        ? seat.y < 40
          ? 8
          : seat.y < 70
            ? (8 + layout.lastSeatTop) / 2
            : layout.lastSeatTop
        : Math.min(
            seat.y >= 40 && seat.y < 70
              ? layout.lastSeatTop - layout.seatHeight - 6
              : layout.lastSeatTop,
            Math.max(8, (layout.height * seat.y) / 100 - layout.seatHeight * 0.2),
          ),
    }));
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
    this.call('finishHand');
  },
  openSettings() {
    this.setData({ settingsOpen: true });
  },
  closeSettings() {
    this.setData({ settingsOpen: false, detailProfile: null });
  },
  changeSwitch(event) {
    this.call('setPreference', event.currentTarget.dataset.key, event.detail.value);
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
  viewProfile(event) {
    const profile = this.data.profiles.find((p) => p.id === event.currentTarget.dataset.id);
    this.setData({
      detailProfile: profile
        ? {
            ...profile,
            axisRows: PROFILE_AXES.map(([id, label], index) => ({
              id,
              label,
              value: profile.axes[index],
            })),
          }
        : null,
    });
  },
  closeProfile() {
    this.setData({ detailProfile: null });
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
  openReview() {
    this.setData({ reviewOpen: true });
    this.call('review', (reviewData) => this.setData({ reviewData }));
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
  },
  closePots() {
    this.setData({ potOpen: false });
  },
  resetPractice() {
    wx.showModal({
      title: '重新练习',
      content: '重新开始本地练习并重置筹码和统计？',
      success: (result) => {
        if (result.confirm) {
          this.call('reset');
          this.closeSettings();
        }
      },
    });
  },
});
