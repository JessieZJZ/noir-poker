const tablePage = require('../table/page-definition.js');
Page({
  ...tablePage,
  data: { ...tablePage.data, historyReadOnly: true },
  onLoad(options) {
    const controller = getApp().noirController;
    const attempt = controller?.getRecord(options.id);
    if (!attempt || attempt.status !== 'completed' || !attempt.snapshot) {
      wx.showToast({ title: '这手没有结算记录', icon: 'none' });
      wx.navigateBack({ delta: 1 });
      return;
    }
    const session = controller
      .getRecords()
      .find((item) => item.attempts.some((row) => row.id === attempt.id));
    this._readOnlyAttempt = attempt;
    this._readOnlySessionNumber = session?.number || 1;
    tablePage.onLoad.call(this);
  },
});
