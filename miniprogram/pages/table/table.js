const { createWechatController } = require('../../shared/platform/wechat-controller.js');
// Nav 48 + table header 30 + hint slot 20 + dock 136 + footer 22 + shell border 2.
const VIEWPORT_CHROME_HEIGHT = 258;
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
    // The action dock keeps one height in every game phase; no page scrolling.
    this.setData({
      topInset,
      bottomInset,
      windowHeight: info.windowHeight,
      navRightInset,
      compactNav: info.windowWidth - 24 - navRightInset < 250,
      tableHeight: Math.max(0, info.windowHeight - topInset - bottomInset - VIEWPORT_CHROME_HEIGHT),
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
