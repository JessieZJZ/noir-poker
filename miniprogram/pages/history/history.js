const tablePage = require('../table/page-definition.js');
const { recordStartTime } = require('../../record-time.js');
Page({
  ...tablePage,
  data: { ...tablePage.data, historyReadOnly: true },
  onLoad(options) {
    const controller = getApp().noirController;
    const attempt = controller?.getRecord(options.id);
    if (!attempt || attempt.status !== 'completed' || !attempt.snapshot) {
      // Keep the explanation visible until acknowledged. A toast followed by
      // immediate Back looked like an unresponsive row when a file was lost.
      wx.showModal({
        title: '无法打开这手记录',
        content: '这手的完整牌谱已缺失或无法读取，不能显示详情。已保存的输赢记录会保留。',
        showCancel: false,
        confirmText: '返回列表',
        success: () => wx.navigateBack({ delta: 1 }),
      });
      return;
    }
    const session = controller
      .getRecordSummaries()
      .find((item) => item.attempts.some((row) => row.id === attempt.id));
    this._readOnlyAttempt = attempt;
    this._readOnlySessionNumber = session?.number || 1;
    tablePage.onLoad.call(this);
    this.setData({ historyStartedAt: recordStartTime(attempt.startedAt) });
  },
  onShow() {
    if (this._readOnlyAttempt) tablePage.onShow.call(this);
  },
});
