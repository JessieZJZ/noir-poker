require('./shared/platform/wechat-compat.js');
App({
  onHide() {
    this.noirController?.hide();
  },
  onShow() {
    this.noirController?.show();
  },
});
