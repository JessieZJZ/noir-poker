# 对局记录验证（2026-10-14）

本次在 PR #43 的 `cd9331d829bc5d196dfd1d71dca252b520999963` 上实现本机对局记录，提交到独立 `codex/game-records` 分支，PR 直接面向 `main` 并包含依赖改动。功能与统计口径见 [本机对局记录](game-records.md)。未合并、未发布商店版本。

## 源码与产物

最终生产源码摘要为 `9c4bb428479c548f3590409d4ed39241379ce101447fa92bfd811a9a67cf2320`。完整功能回归和文案调整前原生运行对应 `c7d6a7281cc3c8fd242c67dca33f8e44e9b95adbc99b3008ad64056f6241404e`；两者只相差下面说明的结果文字与翻译修订。摘要覆盖 `src/`、`public/`、`scripts/` 和移动构建输入，不包含测试与文档；本次安装包构建时功能改动尚未提交，报告中的 `sourceCommit` 为依赖提交，`sourceDirty: true`，不能仅以提交号认定安装包内容。

- 文案调整前 Android debug APK SHA-256：`dad1f5b2a2d0734389a10f05bcac9e36f3658f7702d1a923f2181496aadc375c`，原包保留在 `.artifacts/game-records/packages/records-c7-debug.apk`。
- 最终文案版本 Android debug APK SHA-256：`48706f7ac2d23655ce72e7a6b804d67f0bab0e333d6322c46212542062c0a63d`；已重新编译与核验，此版本未重跑不稳定的 Android 仿真器专项。
- `MainActivity.java` SHA-256：`72a1748940fa7555af1a170f3eda2ede6f6102a5b57994801b4a244dba10adb6`。本次未修改 Java；保留 `ranchu` / `goldfish` 的软件 WebView 绘制兼容处理。
- 本地图像资源摘要：`c4650a6e2f0f0b56deba68496b3d4bac5dced1cfa026ef9b92c1f594cb55e28a`，19 张图像中包含 16 张头像。
- 产物与运行报告索引保存在本机 `.artifacts/game-records/provenance.json`；完整日志与截图保留在同目录，不提交生成目录或原生 Web 副本。

## 自动检查与 Web

`npm run check` 已通过：604 条单元回归、生产 Web 构建和微信生成。记录核心新增边界覆盖重打撤销统计、补码一次计费、所有座位未完成下注恢复、动态面额、分池退款和筹码守恒，以及空决策底牌、超出 Date 范围的时间戳等损坏数据拒绝。未修改引擎结算和合法行动逻辑。

多语言检查通过：11 个 Web/App 语言、1501 个界面键，已有结构化人物研究抽取仍覆盖 213 项与 60 个档案字段。新文案有翻译来源记录，人工语言审核仍为待办。字体已通过现有工具重新生成并验证字符覆盖。

完整 Web 回归 **405 通过、1 按平台条件跳过、0 失败**，用时 11.4 分钟，报告为 `.artifacts/game-records/web-frozen-final/`，日志为 `logs/noir-records-web-frozen-final.log`。该轮对应文案调整前的 `c7d6a728…`。新增记录回归覆盖独立页面、局/手排序、图形底牌、重打/补码、历史复盘与实时结算隔离、同局刷新恢复、下一手配置重置和语言切换。9 人历史牌桌在 320/390/700/1280 宽度检查公共牌居中、英雄卡牌/身份/牌型可见及无横向溢出，截图位于 `.artifacts/game-records/visual-final/`。

随后统一净亏损但有底池收入时的文案为“获得部分底池 · 净亏损”，同步微信及 10 个翻译目录，与已有复盘口径一致。这是文案澄清，未改变底池分配、统计条件或恢复行为。最终 `9c4bb428…` 上再次执行 `npm run check`（604/604 与生产构建通过），并复跑完整记录页面专项 **16/16**，多语言检查和微信源码/官方模板编译也再次通过。文案修订后未重跑全部 406 项；全套结果与最终专项分别保留，日志为 `noir-records-check-copy-final.log` 和 `noir-records-web-copy-final.log`。

保留早期失败，不把定向重跑当作整套通过：首次完整运行 398 通过、5 失败、1 跳过；第二次 400 通过、5 失败、1 跳过。修复了隐藏菜单按钮计数和新用例的机器人等待上限；并发浏览器输出目录冲突、运行中修改源码导致的刷新和已有短超时均保留原报告，相关用例随后分别通过。生产机器人思考速度与既有复盘等待断言未放宽。

## 原生安装运行

最终源码的 Xcode iOS 模拟器构建、Gradle Android debug 构建、`mobile:sync` 与 `mobile:verify` 均通过。源码摘要及本地资源副本一致；这些检查分别于安装运行报告保存。

iOS 在专用 iPhone 17 / iOS 27 模拟器上安装本地 `.app` 后通过 **2/2 专项**：`local-launch-and-no-login` 和 `game-records-pages-retry-and-resume`。其余 16 个场景由专项过滤明确跳过，不能声称整套原生测试通过。专项使用真实游戏操作，验证历史页面/复盘、重打保留与统计撤回、返回实时牌桌、结束 App 后同局下一手及全桌筹码守恒。文案调整前报告为 `.artifacts/game-records/native-ios-final/report.json`；文案调整后重新编译、安装并通过相同两项，最终报告与设备截图为 `.artifacts/game-records/native-ios-copy-final/report.json`，源码摘要为最终 `9c4bb428…`。

首次 iOS 附着出现空白页，失败报告和后续 WebKit 只读检查、原生截图均保留；后续专用模拟器实际运行通过。现有证据不能确定首次空白页原因。

Android 最后一次安装运行在专用 `Noir_Stakes_20261014` / API 36 仿真器上完成本地离线启动场景，记录专项失败。启动截图已人工检查，首屏卡牌、字体和布局正常；在记录专项推进真实牌局时，仿真器日志出现 QEMU 主循环和 CPU 线程停滞，设备从 ADB 消失，Appium 返回失效 session。不能确认本机 QEMU 停滞的根因，也没有对局记录运行通过证据。最终报告为 `.artifacts/game-records/native-android-cached-final/report.json`，对应 `c7d6a728…`；16 个其他场景明确跳过。已保留多个新建仿真器启动、WebView 附着及 QEMU 停滞的失败报告，不以 APK 编译成功代替运行通过，也不将仿真器绘制兼容结果推广到实体设备。

本次没有 iPhone、Android 实体设备或商店审核验收。测试进程只操作本次指定设备；既有用户设备不纳入本次证据。

## 微信小程序

共享核心与微信适配单元回归 **96/96** 通过；`wechat:verify` 和 `wechat:check` 通过，官方 WXML 编译器覆盖 13 个模板。独立 `pages/records/records` 和 `pages/history/history` 已加入工程，DevTools 专项入口为 `tests/wechat/game-records.mjs`。

最终微信包源码指纹为 `b01b640d7bc4afacd3831abbd5fb76321a55c8602ab2af2384c3b0a5d344edc7`，与 Web/App 摘要使用不同输入范围，不能直接相互比较。

DevTools 实际页面专项仍未通过，早期导航/启动超时记录位于 `.artifacts/wechat-records/`，对应更早的微信包，不能认定为当前产物运行证据。本轮系统查询显示 Mac 锁屏，已请求用户解锁；在锁屏期间不继续操作桌面界面。首次超时早于锁屏证据，因此不能断言所有失败均由锁屏导致。没有微信真机运行或发布证据。

## 证据边界

浏览器、模板编译、资源同步、Xcode/Gradle 编译、安装模拟器和实体设备是不同验证层级。以上结果均为本机运行，不代表远程 GitHub Actions 已通过。PR 在原生/微信未决项补齐前保留为草稿。
