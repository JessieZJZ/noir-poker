// The music subpackage is loaded as a local asset package, never as a screen.
Page({
  onLoad() {
    wx.reLaunch({ url: '/pages/table/table' });
  },
});
