Page({
  data: { url: '', failed: false },
  onLoad(options) {
    let url = '';
    try {
      url = decodeURIComponent(options.url || '');
    } catch {}
    this.setData({ url: /^https:\/\//.test(url) ? url : '', failed: !/^https:\/\//.test(url) });
  },
  failed(event) {
    this._loadError = event?.detail || null;
    this.setData({ failed: true });
  },
  copyLink() {
    if (this.data.url) wx.setClipboardData({ data: this.data.url });
  },
});
