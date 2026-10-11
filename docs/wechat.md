# 微信小程序工程

手机在 `app.json` 和牌桌页面声明 `pageOrientation: portrait`，保持正常手持竖屏；同时启用 `resizable: true`，允许 iPad 与支持大屏模式的平板、桌面客户端旋转或调整窗口。方向变化只重算布局，不重新发牌或关闭当前弹窗。相关声明及 `onResize` 状态保留有单元回归；编译器和适配器检查不能代替微信开发者工具或实际平板验收。配置依据：[微信大屏适配指南](https://developers.weixin.qq.com/miniprogram/dev/framework/view/resizable.html)。

小程序使用本地 WXML/WXSS 界面，直接复用 `src/engine/`、`src/review/` 和人物头像源文件。它不加载在线网站，也没有账号或网络牌局。规则、筹码、电脑风格与复盘计算只有一份实现；界面与生命周期由 `src/platform/wechat-controller.js` 和 `miniprogram/` 适配。

## 导入与开发

```sh
npm ci
npm run wechat:build
npm run wechat:verify
npm run wechat:check
```

在微信开发者工具中导入 `/Users/zjz/code/noir-poker/.artifacts/wechat`，选择小程序工程。默认使用 `touristappid`，可用调试能力以当前开发者工具的游客模式为准。登录状态下若提示 AppID 不存在，可在导入窗口选择“测试号”，再把工具提供的测试 AppID 配置到本机环境变量；本地调试不需要上传或发布小程序。

已有 AppID 时通过本机环境变量配置，勿修改生成目录：

```sh
NOIR_WECHAT_APP_ID=wx你的AppID npm run wechat:build
NOIR_WECHAT_APP_ID=wx你的AppID npm run wechat:open
```

`wechat:open` 默认调用 macOS 微信开发者工具的 CLI。首次调用前需在工具的“设置 → 安全设置”开启“服务端口”。其他安装位置设置 `NOIR_WECHAT_CLI`。工程不包含发布私钥，AppID 与上传权限分开配置。

## 每次 Web 迭代如何同步

`npm run dev` 同时运行 Vite 和小程序监听器。保存 `src/`、`public/`、`miniprogram/`、`scripts/`、`mobile/` 或构建配置后，小程序重新生成到同一个导入目录；开发者工具读取更新后的文件。单独监听可运行 `npm run wechat:watch`。`npm run build` 的 `postbuild` 也自动生成小程序，`npm run platforms:sync` 一次同步小程序与 iOS/Android 最新资源。

每次生成都从当前共享源码转译 CommonJS/ES2019，把引用的 JSON 数据内嵌到 JavaScript 模块，保留共享 JavaScript 模块之间的引用，压缩并裁切全部本地头像，生成本地声音，写入文件清单和源码 SHA-256。小程序运行时无需 Node 的 JSON 模块加载器。`wechat:verify` 拒绝过期源码、损坏文件、缺失头像或不一致的 AppID。主包采用 2 MiB 的保守预算，超出就阻止构建，不把图片改为在线地址。

共享规则、策略、复盘、筹码尺度和头像的修改自动进入小程序产物。Web 的 DOM/CSS 与小程序的 WXML/WXSS 使用不同控件；新增界面特性时需要同步维护小程序适配，不能直接把任意网页 CSS 转成微信控件。项目 AGENTS.md 已加入同步维护与验证要求。

已经发布的微信版本需要重新上传、审核与发布才能更新用户客户端。本地自动生成不等于自动发布；与手机 App 一样，不绕过平台版本分发机制。

## 当前能力与验证

支持 5–9 人、25 面额筹码、最小/半池/底池/全下、电脑思考、下一手、同手重打、公开信息复盘、对手行动筛选、摊牌最佳五张牌和奖励明细、底池明细、本局动态、风格与情绪自动保存、声音开关及提示横幅。公共牌保留五个固定位置，优先五张单排，空间不足时居中显示为 3+2 两排。手机采用 Web 的逻辑尺寸和完整玩家占位，先求无碰撞布局，再按可用牌桌整体缩放：公共牌宽 44–54px，宽度不超过 360px 时为 50px，长宽比为 1.44；英雄牌为 61–72×88–104px。较宽窗口使用 48×69px 公共牌，大竖屏平板使用 82×118px。大竖屏平板放大玩家名称、筹码、风格标签、提示与操作文字；玩家卡片与风格标签保留四侧内边距。筹码放在你的位置标签右侧，最近行动放在最下行；对手行动紧贴玩家块，牌型随后显示。移除重复回合标签，保留底部操作提示；可用与禁用按钮采用明显不同的颜色。弃牌、全下等待和结算按钮缩为带内边距的一排，界面高度随之缩短，牌桌高度保持稳定；设置和详情在全屏弹窗内滚动。弃牌后尚未发出的公共牌可通过“立刻发完”预览，复用规则引擎的练习补牌，不改动实际牌面、牌堆、结算或复盘证据。

进入后台或退出页面会取消旧电脑行动与复盘任务，并释放声音上下文。返回前台重新调度当前牌局，不执行离开前的过期回调。

```sh
node --test tests/unit/wechat*.test.js
npm run wechat:check
```

控制器回归使用真实规则引擎，覆盖整手发牌、守恒、合法金额、设置生效时点、重打撤奖与统计、后台/换手取消、复盘公开快照。模板检查采用微信官方开源 [glass-easel 编译器](https://github.com/wechat-miniprogram/glass-easel)，支持 Apple Silicon 和 Linux。

这些是构建、模板与适配器验证，不等于微信 DevTools 或微信真机端到端验证。首次导入后检查 5/9 人、头像、声音、前后台、结算/重打/复盘和窄屏首屏；取得 AppID 后再验证真机预览与正式上传。

开发者工具逐页验证使用官方 `miniprogram-automator`。先完成构建，停止生成目录的监听，再重新打开工程，避免工具缓存仍引用替换前的文件。命令中的 AppID 使用本机环境配置：

```sh
npm install --prefix .artifacts/wechat-tools miniprogram-automator
/Applications/wechatwebdevtools.app/Contents/MacOS/cli close --project "$PWD/.artifacts/wechat"
NOIR_WECHAT_APP_ID=wx你的AppID npm run wechat:build
/Applications/wechatwebdevtools.app/Contents/MacOS/cli cache --clean compile --project "$PWD/.artifacts/wechat"
/Applications/wechatwebdevtools.app/Contents/MacOS/cli auto --project "$PWD/.artifacts/wechat" --auto-port 9432
node tests/wechat/run.mjs ws://127.0.0.1:9432 .artifacts/wechat-e2e
# 在另一终端启动纯 Vite 测试服务器，不启动生成目录监听器：
npx vite --host 127.0.0.1 --port 4192 --mode test
node tests/wechat/web-reference.mjs .artifacts/wechat-e2e http://127.0.0.1:4192
```

CLI 工程路径使用绝对路径。清理的仅是编译缓存，保留设置与登录；脚本会检查最新 Page 方法已经加载，并通过真实重新练习入口开始验证，避免上一次完成的牌局或旧代码被误认为当前运行结果。

报告保存真实 DevTools 的逐页截图、组件尺寸和开关、取消重置、结算、复盘交互证据；浏览器参考图通过仅测试模式存在的 fixture 重放同一手牌。截图等待有限入场动画结束，5–9 人牌桌的玩家块、公共牌组、英雄区和桌面位置与尺寸允许 3px 的跨渲染器误差。比较时去除系统状态栏、底部手势区，并为微信胶囊保留独立的 36px 区域。参考图和 DevTools 模拟器结果不代表微信真机验收。

界面对照脚本在牌局没有继续刷新时会再次点击页面现有的“加速到结算”按钮，并把这些点击记录到 `repeatedAccelerateControls`，不会注入结算状态或绕过规则引擎。这个页面截图矩阵不用于证明小程序后台计时速度；计时取消和规则边界由独立回归覆盖。WXML 的引号字符串必须保持在同一行，DevTools 会拒绝某些开源模板编译器接受的跨行字符串。

官方参考：[开发者工具 CLI](https://developers.weixin.qq.com/miniprogram/dev/devtools/cli.html)、[项目配置](https://developers.weixin.qq.com/miniprogram/dev/devtools/projectconfig.html)、[分包加载](https://developers.weixin.qq.com/miniprogram/dev/framework/subpackages.html)。

界面迭代先完成 Web 修复并运行完整单元/E2E 检查，再执行原生构建与安装运行测试，最后执行小程序生成、模板编译及适配器回归。测试报告按浏览器、模拟器/仿真器、小程序编译/mock、DevTools/真机分别记录。
