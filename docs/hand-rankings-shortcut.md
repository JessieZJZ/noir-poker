# 操作区牌力表入口

Web、iOS、Android 与微信的操作提示行右侧提供“牌力表”。思考期间和轮到玩家行动时均可打开；按钮不依赖下注权限。

点击后打开现有玩法指南，并将正文定位到牌型强弱排序、同牌型比较说明及九组示例。顶部 QUICK GUIDE 与关闭按钮保持固定，不遮住定位目标。重复打开仍能重新定位；顶部菜单中的“玩法指南”始终从正文开头打开。关闭后回到原来的牌桌滚动位置，不发新牌、不修改筹码或行动。

Web/App 共用 `index.html`、`src/ui/guide-menu.js`。微信保留相同的 `hand-rankings` 定位目标，由指南生成器生成节点 ID；在弹窗渲染完成后设置 `scroll-into-view`。迟到的打开回调不能改变已经关闭或重新打开的指南。

按钮已覆盖全部 11 种 Web/App 语言，微信采用中文。新文案使用现有字体子集所覆盖的字符。

验证命令：

```sh
npm run check
npm run test:e2e
npm run i18n:check
npm run format:check
npm run wechat:verify
npm run wechat:check
npm run mobile:ios
npm run mobile:android
npm run mobile:sync
npm run mobile:verify
```

专项覆盖：`tests/e2e/guide-header.spec.js`、`tests/unit/wechat-page.test.js`、原生 `hand-rankings-shortcut` / `guide-sticky-header` 场景、`tests/wechat/run.mjs`。

浏览器、资源/模板编译、安装版模拟器和微信 DevTools 各自记录，不将其中一种替代另一种。完整结果见本次交付报告。
