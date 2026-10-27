# 入座体验验收记录

日期：2026-10-20。行为说明见[入座体验](entry-experience.md)。本轮包括待入座牌桌、进入时音乐渐入、设置入口和轮播、小文案对齐、收起空操作区，以及真实下一局／手编号。

## 版本与范围

修改保留在本对话的 `codex/approved-video-chip-sound` 分支及 PR #64。没有合并到 main。

canonical 目录同时存在其他未提交工作。验收版本固定在 `.artifacts/entry-experience/verification-source/`，由当前分支和本次修改生成，不创建另一个功能分支，不覆盖其他工作。参与原生摘要及微信界面的 229 个文件与提交内容逐项对照。最终源码证明位于 `.artifacts/entry-experience/fixed-version-source-proof.json`。

- 最终原生源码摘要：`1a6d3134f6a4e683c287f9ce0d9f9a7d8e042cd50b3d8fd23ae26ca14a1af09e`。
- 最终微信源码摘要：`9d7274d6402de80e8ee6b27773378206c5f33b044e024c408540b47f6feed777`。
- 原生本地资源摘要：`fb410fb9e11c14fd38fca586cb09cd3cd96c522db9a4152218db598820ad1c10`，20 张本地图片，其中 16 张风格头像，2 份背景音乐。

## Web 与单元回归

- 最终专项 24 项全部通过，桌面与手机各 12 项。覆盖 5–9 人待入座、筹码守恒、不创建空记录、只入座一次、发牌展示期间禁止行动、前后台取消与恢复、续局与待生效设置、真实本地音频播放和渐入，以及全部 11 种语言在 320／390 px 触摸视口下的等待页。另覆盖横屏恢复、公共牌区域和复盘滚动提示的复测。
- 全量浏览器尝试保留：288 通过、3 失败、2 中断、277 未运行。高负载下结束大范围运行后进行了上述串行复测。原先 3 个失败项全部纳入最终 24 项；其中俄语顶部新增设置文字导致 5 px 溢出是实际问题，已修复并新增多语言窄屏回归。不能把合计覆盖称为一次完整全绿运行。
- 固定版本的 `npm run check` 单元部分运行 855 项：854 通过，1 项微信监听构建等待超时。该项原断言不变，单独复跑通过。之后独立执行 Web／微信生产构建成功。原始 `check` 运行仍记录为失败，不能改称一次完整通过。
- 最终 `format:check`、`i18n:check` 通过；11 种语言、1329 条源文案及占位符校验通过。

证据均在 `.artifacts/entry-experience/`：

- `web-header-final.log`、`web-header-final-results/`：最终 24 项。
- `web-fixed-version.log`、`web-fixed-version-results/`：大范围尝试及原始失败轨迹。
- `check-fixed-final.log`、`watch-final-retry.log`：完整单元尝试及唯一失败项的复跑。
- `build-header-final.log`、`format-header-final.log`、`i18n-header-final.log`：最终构建、格式及语言检查。

## 微信小程序

原生模板和样式使用官方 glass-easel 编译器检查，17 个文件通过；源码／生成物校验通过。真实 DevTools 专项使用固定版本生成的工程及独立自动化端口，清除该工程编译缓存后加载，保留、恢复测试前的设置和对局记录。

专项检查真实 `InnerAudioContext` 在首次点击前的播放进度和渐入音量、紧凑设置入口、点击入座后的发牌、前后台处理器恢复位置、续局编号及全部 5–9 人等待牌桌。报告、截图和最终生成物指纹保存在 `wechat-header-runtime/`；先前两轮 5 项通过报告亦保留在 `wechat-fixed-runtime/` 和 `wechat-runtime-delivery/`。

末次只调整顶部偏移后，`wechat-header-runtime/` 连接超时，随后系统工具确认 Mac 已锁屏，失败报告保留在 `wechat-header-final-runtime/`。用户解锁后，旧验收工程仍显示开发工具自身的 `something wrong in electron appservice`。只关闭这个测试工程，使用官方构建器生成新的独立工程 `.artifacts/wechat-unlocked-entry/`，源码摘要及 116 个生成文件与最终版本完全一致，未改写生成代码或重启其他工程。

新工程的真实 DevTools 专项 5 项通过，证据保存在 `wechat-unlocked-fresh-runtime/`。随后检查原始截图发现等待标题被原有 30 px 页眉裁切、姓名旁还绘制了空的位置标记。待入座页眉改用完整的 50 px 预留空间并收起空提示行，只在入座后绘制位置标记；游戏中与历史页布局不变。

最终增加标题／盲注实际边界及空标记检查后，真实 DevTools 的 5 项再次全部通过，相关单元回归 3 项通过。最终报告、待入座原图和工程源码对照证明位于 `wechat-visual-final-runtime/`，由官方构建器生成的工程为 `.artifacts/wechat-entry-visual-final/`，实际自动化端口为 9479。没有将此前通过次数累计成本次通过数。

原生验证驱动的修正改变了构建源码摘要，因此重新生成最终微信工程 `.artifacts/wechat-entry-reconnect-final/`。首次打开出现开发工具的 `simulator launch failed`，清除此测试工程的编译缓存并重开后，同一组 5 项全部通过。最终报告与原图位于 `wechat-reconnect-retry-runtime/`，`project-source-proof.json` 核对实际打开工程与默认生成物的 116 个文件；首轮失败保留在 `wechat-reconnect-final-runtime/`。原始待入座截图已检查，标题、盲注与姓名显示完整。

生命周期部分调用真实 App 处理器，不能代替实体微信客户端切后台或实体手机扬声器听感。没有执行正式上传。

## iOS 与 Android

最终 Xcode 和 Gradle QA 编译成功，两端编译后统一执行的 `mobile:sync`、`mobile:verify` 通过。实际安装的 App／APK 内源码摘要与最终固定版本一致，本地图片与音乐资源完整。

最终安装运行选择本次相关的 4 项，每端 4 项通过，另外 23 项明确跳过，未称为全套原生回归：

- `entry-waiting-music-and-first-deal`：首次触摸前音乐播放、渐入、待入座零发牌／零下注、设置样式、收起空操作区、真实点击入座、发牌等待及前后台恢复。
- `local-launch-and-no-login`：真实本地包启动、本地资源、无登录练习及牌桌 Web 对照。
- `background-music-loop-and-independent-vibration`：实际音乐循环、后台恢复、声音与震动独立控制，以及真实重启后保留关闭偏好。
- `real-background-cancels-pending-action`：真实切后台取消待执行动作，返回后继续。

最终报告与原始设备截图分别位于 `ios-reconnect-runtime/`、`android-reconnect-runtime/`。两端待入座原图及入座后牌桌已经检查，没有用截图尺寸断言代替查看实际画面。

### 失败证据与修正

- iOS 解锁后的新专用模拟器先通过入座及本地启动，但音乐专项在重启步骤停留启动图。检查本机 XCUITest 驱动实现发现切换 `NATIVE_APP` 不会释放旧 Web Inspector；驱动会话退出后，相同 App 页面自行恢复。验证程序现于应用停止期间释放旧会话，再以 `noReset:true`、`fullReset:false`、`autoLaunch:false` 连接已安装应用，之后激活。没有重装或清除该步骤正在验证的偏好。最终完整选择运行通过，报告记录 `driverSessionResets: 1`，对应重启后仍然静音的截图；修正相关单元及运行器回归 10 项通过。
- Android 原 host GPU 运行出现 Pixel Launcher／System UI 无响应，只停止本次专用 AVD，改用 swiftshader、2 核／2 GB，保持音频开启。该环境的上一版 4 项通过保存在 `android-swiftshader-runtime/`；最终驱动版本重新编译并安装后再次通过 4 项，不累计成 8 项。
- 早先锁屏、高负载下的安装／附着失败，以及中途修正测试上下文的报告全部保留在 `ios-fixed-runtime/`、`ios-entry-final-runtime/`、`ios-fresh-runtime/`、`android-runtime/`、`android-fixed-runtime/` 等目录。没有关闭其他任务的设备或开发工具，也没有隐藏系统错误弹窗。

最终编译和资源证据：`ios-reconnect-compile.log`、`android-reconnect-compile.log`、`mobile-reconnect-delivery-sync.log`、`mobile-reconnect-delivery-verify.log`。单元证据：`native-reconnect-unit.log`。最终格式与国际化检查见 `format-reconnect-final.log`、`i18n-reconnect-final.log`。

安装运行结果对应本次专用 iPhone 模拟器和 Android 模拟器，实体手机、扬声器听感、签名分发及商店验收未执行。PR 保持草稿，没有合并。
