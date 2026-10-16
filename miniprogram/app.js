require('./shared/platform/wechat-compat.js');
const music = require('./shared/platform/wechat-background-music.js');
const settings = require('./shared/platform/wechat-controller.js');
App({
  onLaunch() {
    let sound = true;
    try {
      sound =
        JSON.parse(wx.getStorageSync(settings.WECHAT_SETTINGS_KEY) || 'null')?.sound !== false;
    } catch {}
    this.noirMusic = music.createWechatBackgroundMusic(wx, {
      enabled: sound,
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
