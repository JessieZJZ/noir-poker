const { pageOrientation } = require('../../device-orientation.js');
Page({
  data: { url: '', failed: false, pageOrientation: 'portrait' },
  onLoad(options) {
    this.updateOrientation();
    let url = '';
    try {
      url = decodeURIComponent(options.url || '');
    } catch {}
    this.setData({ url: /^https:\/\//.test(url) ? url : '', failed: !/^https:\/\//.test(url) });
  },
  onShow() {
    this.updateOrientation();
  },
  onResize() {
    this.updateOrientation();
  },
  updateOrientation() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.setData({ pageOrientation: pageOrientation(wx, info, getApp()) });
  },
  failed(event) {
    this._loadError = event?.detail || null;
    this.setData({ failed: true });
  },
  copyLink() {
    if (this.data.url) wx.setClipboardData({ data: this.data.url });
  },
});
