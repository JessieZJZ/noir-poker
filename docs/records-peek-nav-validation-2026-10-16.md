# 历史底牌动画与微信导航间距

基于已提交的对局记录版本 `13b1d92`（PR #45）单独修复，未修改另一个工作目录中的未提交优化。分支面向 `main`，包含对局记录功能依赖，未合并或部署。

## 修改

- 历史牌桌原先对所有底牌强制 `animate: false`。现在只在用户点击查看时，为指定玩家保留实时牌桌的翻牌动效及两张牌之间的 140ms 错峰；进入详情、收起、语言刷新与其他玩家保持静态。
- 保留减少动态效果、看牌按钮焦点和只读快照。实时牌桌的首次翻牌、后续更新不重复翻牌的行为不变。
- 微信设置与菜单的布局间隔从 10px 调为 4px，固定菜单宽度从 104px 调为 88px；保留 64px 的文案窗口及 34px 的设置按钮。

## 本轮通过

- `npm run check`：736 个单元测试及 Web/微信生产构建通过；渲染与记录视图专项 8 项通过。
- Web：8 个不同的桌面/手机专项通过，覆盖查看、收起、再次查看、减少动态效果、快照不变、历史页头与 5/9 人历史牌桌几何。第一次手机页头用例在 30 秒总时限内未完成，原断言及原时限单线程重跑通过；未报告完整 Web 套件通过。
- `wechat:verify`、`wechat:check`：源与资源校验、官方 13 个 WXML/WXSS 文件编译通过。保持运行回归中的导航间距上限与设置按钮尺寸断言。
- `format:check` 与差异空白检查通过。

## 验证限制

- 此分支的微信 DevTools 新工程显示 `simulator launch failed`。关闭本工程、清编译缓存并重新打开后，`reLaunch` 和 `currentPage` 仍超时，尚未测得本次导航间距的实际设备坐标。没有关闭其他工程或把编译通过算作运行通过。
- 此分支未重新编译或安装运行原生 App，未执行实体手机或商店验收。手牌背光另由 PR #47 交付和记录验证范围。

## 本机证据

均位于此工作目录忽略的 `.artifacts/`：

- `records-peek-check.log`、`records-peek-focused-unit.log`。
- `records-peek-web.log`、`records-peek-web-header-retry.log`、`records-peek-web-final.log` 及各自截图/trace。
- `records-peek-preview/flipping.png`、`records-peek-preview/peek.webm` 是浏览器实际绘制与录屏。
- `records-peek-wechat-{verify,check}.log`、`records-peek-format-check.log`。
- `records-nav-runtime/`、`records-nav-runtime-retry/`、`records-nav-runtime-current/` 保留 DevTools 超时报告，`stage` 区分重开与获取当前页。
