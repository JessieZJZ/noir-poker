require('./shared/platform/wechat-compat.js');
const music = require('./shared/platform/wechat-background-music.js');
const settings = require('./shared/platform/wechat-controller.js');
App({
  onLaunch() {
    let enabled = true;
    try {
      enabled =
        JSON.parse(wx.getStorageSync(settings.WECHAT_SETTINGS_KEY) || 'null')?.music !== false;
    } catch {}
    this.noirMusic = music.createWechatBackgroundMusic(wx, {
      enabled,
      active: true,
      loadSource: () => require.async('./music/source.js'),
    });
  },
  onHide() {
    this.noirMusic?.setActive(false);
    this.noirController?.hide();
  },
  onShow() {
    this.noirMusic?.setActive(true);
    this.noirController?.show();
  },
});
