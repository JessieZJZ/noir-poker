# 2026-10-13 复盘改造验收

本次改变共享复盘解释和 Web/App/微信界面，不改变下注、结算、筹码面额或发牌规则。玩家评级仍只读取自己的行动前底牌与公开快照；对手面板只在结算后使用实际记录。新解释区分两头顺、卡顺、双卡顺、组合听牌，结合新牌、公开下注线、位置、人数、价格与有效后手。已经弃牌、本人全下或对手全下时不会虚构后续诈唬决策。

值得保留时隐藏练习重点及重复时间线评级；其余步骤以黄色展示建议动作并保留练习重点。实际选择、调整卡片、候选路线／模拟数字模块已删除；保留关键信息与跨街公开行动。对手先显示具体行动依据，末尾最多两条参考数字；筛选器附上已分配的真实牌手原型名字。新增解释覆盖十一语言并补齐本地字体。

## 源码与资源

- 基于 `origin/main` 的 `d5fbb11`，改动位于 `codex/contextual-review-coaching`，通过 PR 提议，未合入 main。
- 最终共享 App 源码指纹：`7ef936e67e5ec98a153e9a4f9f1da3209b2125f805b7b4ed1f08b3bc664dbd99`。两端安装报告均核对该值；生成时的 `sourceCommit`/`sourceDirty` 是构建时记录，以源码指纹核对最后的源代码。
- 本地图片指纹：`694f35d82b03e2942bcc27c6674a65ce83e1477ae57bc1d9e3f800125b13252b`，17 张图片、其中 16 张牌手头像。
- 微信最终指纹：`d0d6b556d91fb272340472cdbc453cf33adbd7460b57de57683be2fe2bb9334d`。

## 通过的检查

| 检查                           | 结果                                                 | 本机证据（项目根目录下）                                     |
| ------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------ |
| 最后源码 `npm run check`       | 444 单元通过，Web／微信构建通过                      | `.artifacts/review-coaching/check-boundary.log`              |
| `format:check`、十一语言检查   | 通过；语言资源覆盖与语言审校分别记录                 | `format-accepted.log`、`i18n-delivery.log`，均在上述证据目录 |
| 完整 Web E2E                   | 333/334 首轮通过；葡语首屏超时的同一场景串行复跑通过 | `web-full.log`、`web-pt-retry.log`                           |
| 最后边界修正后的 Web 复盘 E2E  | 桌面／窄屏 20 项通过，包含十一语言即时切换           | `web-boundary.log`                                           |
| Xcode／Gradle 实际编译         | 均通过                                               | `ios-build-boundary.log`、`android-build-boundary.log`       |
| `mobile:sync`／`mobile:verify` | 两端副本、源码与图片核对通过                         | `mobile-sync-boundary.log`、`mobile-verify-boundary.log`     |
| 安装 iOS App 的复盘专项        | 3 场景通过                                           | `ios-review-final/report.json`                               |
| 安装 Android APK 的复盘专项    | 3 场景交互通过；画面限制见下文                       | `android-reviewed/report.json`                               |
| 微信 DevTools 复盘专项         | 7 检查通过，0 运行异常                               | `wechat-accepted/report.json`                                |
| 微信资源／官方编译器           | 通过                                                 | `wechat-verify-delivery.log`、`wechat-check-delivery.log`    |

App 专项在实际安装产物中完成启动、真实加注／跟注／弃牌、结算、Worker 复盘与对手面板，核对重复模块移除、关键信息、条件练习重点和参考数字数量。没有把 Vite 测试快照注入 App。每端仅把这三条复盘相关场景作为最终专项通过结论，不冒充完整原生套件通过。

微信专项先通过正常页面方法分配谭老板原型并打完真实一手，核对筛选姓名与三个实际对手步骤；再以外部公开快照核对两头顺、弃牌后不再生成未来诈唬和黄色弃牌建议。报告明确标注快照场景；快照文件不会进入小程序包。最后的黄色练习重点实际背景为 `rgba(101, 87, 50, 0.2)`，左边框为 `rgb(228, 206, 160)`。

## 运行限制和保留的失败

iOS 冷启动时曾两次停在空白首屏检查；独立启动后可正常显示，随后最后源码的安装专项通过。失败资料留在 `ios-native-final/` 和 `ios-native-fresh/`，最终通过资料位于 `ios-review-final/`。

Android 的 host GPU 曾导致 QEMU 主线程挂起／模拟器退出，继而导致驱动连接丢失。使用软件 GPU、禁止崩溃报告上传后，`emulator-5582` 完成最后源码的三条安装交互场景；复盘和对手弹窗原图可正常阅读，但牌桌原图出现重复绘制、错位的花屏。不能把这个交互通过报告为 Android 完整画面验收。失败与 GPU 启动日志均保留，未修改 App 或扩大截图容差来隐藏问题。

微信整页矩阵曾停在进入复盘前的结算牌型与行动文字间距断言。本次没有把该矩阵算作完整通过；上述复盘专项独立完成。旧失败记录位于 `wechat/report.json`。

相关截图均保存在 `.artifacts/review-coaching/` 的上述平台子目录，包括 `parity-review-native.png`、`parity-opponent-review-native.png`、微信两头顺、弃牌建议和牌手选择器原图。

## 2026-10-14 合并 main 的冲突复验

本轮将 `origin/main` 的 `3ac3368a8bae8772e920cef131976bfc44647caa` 合入 PR #38 原分支 `codex/contextual-review-coaching`。语言资源保留双方新增译文；本地字体根据合并后的源码重新生成。微信控制器同时保留复盘所需的牌手资料查询、手动分配与混合阵容切换。对手复盘保留简化界面，并接入 main 的小尺度 3-bet 防守解释与有边界的策略近似提示；没有修改下注或结算规则。

新增回归验证小尺度再加注防守的具体解释、最多两条参考信息、不误用随机范围权益作为触发依据，以及十一语言中的证据限制。Web 测试通过实际规则引擎生成这条下注线，fixtures 仍只进入 Vite 测试模式。

本轮证据均位于 `.artifacts/pr38-conflict/`，与上方合并前的记录分开：

- `npm run check`：466 个单元测试及 Web／微信构建通过，日志 `check.log`。`format:check` 和 `i18n:check` 通过，当前提取清单为 1,284 条文案。
- 复盘 Web 专项桌面／窄屏 8 项通过，日志 `web-review-fixed.log`。新增 fixture 首次运行的行动席位错误已修正，失败轨迹保留在 `web-review-first-failure/`。
- 完整 Web 首轮 353/358 通过，五项失败均为等待超时；保持源码、断言与时限不变，以单线程复跑五项全部通过。日志为 `web-full.log`、`web-retry.log`，首轮轨迹保留在 `web-full-first-results/`。
- Xcode iOS Simulator 与 Gradle Android Debug 实际编译通过，日志 `ios-build.log`、`android-build.log`。`mobile:sync`／`mobile:verify` 通过；两个产物均核验 17 张本地图片、其中 16 张头像。共享源码指纹为 `05d44eca5ae9e69d948f6f08477e19a179e5641a2a3f59ad10392d443fd6d02a`；Android 原生源码与 APK 的独立 SHA-256 保存在 `android-build-sha256.txt`。
- `wechat:verify`／`wechat:check` 通过；官方 WXML/WXSS 编译器核验 9 个文件。官方 DevTools 复盘专项 7 项通过、0 运行异常，报告 `wechat-review/report.json`，微信源码指纹为 `4ada8cc1677f66b17ef8198a9d1812de331f0a92b16124f80e07da011d99cf30`。公开快照与实际牌局场景在报告中分别标记。

本轮安装 E2E **未通过**。两端首次都停在 Appium 冷启动；服务预热后，iOS 的两次运行均未在首屏等待期限内出现可操作页面，截图为空白首屏，阶段为 `webview-attach`。Android 的两次运行均在首屏设备截图发现 `System UI isn't responding` 弹窗，阶段为 `scenarios`；重启专用 AVD、将显示降至 720×1600／280 dpi 后仍出现同一系统弹窗。最终报告为 `ios-review-final/report.json`、`android-review-final/report.json`，之前的服务启动、首次运行与截图也保留在各自目录中。没有把编译、资源核验或 Web 通过写成原生运行通过，也没有完成实体设备或商店验收。

已清理本轮两个独立 Appium 服务及其子进程，关闭本轮专用 Android AVD，恢复其临时密度设置；iOS runner 关闭自己启动的测试设备。清理记录为 `final-server-cleanup.json`。其他任务的模拟器、仿真器和服务未被关闭。
