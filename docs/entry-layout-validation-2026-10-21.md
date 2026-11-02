# 宽屏练习布局与入座间距验收

同一分支 `codex/approved-video-chip-sound`、PR #64 继续修改。宽屏和移动端统一为牌桌在上、练习模块紧接在下，移除右侧提示卡片。提示统一在盲注下方显示，开关位于设置，长文轮播、阅读时限及手动滚动保留。动态在页面下方自然展开，增加日志不会拉高牌桌或主动改变页面阅读位置。

所有端的「重新练习」按钮高度从 44 px 降为 32 px，中文宽度保持 70 px。待入座盲注与等待文案顶部对齐；隐藏的英雄位置标记不再占位，「你」与筹码使用 6 px 间距。入座、续局、音乐和重置确认流程保留。

## 验证基线与范围

共享 checkout 同时有其他任务修改训练风格。以 `1328885fa7ada2f99b311f1074b428fd3840c63b` 加本次 `5fb3430` 界面修改建立 `.artifacts/entry-layout/verification-source/`，没有覆盖其他修改。此目录运行全部构建和安装验证。同分支随后提交的 `d3c9092` 八风格调整不在这些安装产物内，其验证由[对应任务记录](style-validation-2026-10-21.md)说明，不以本报告代替。证据保存在 `.artifacts/entry-layout/`。构建及微信界面 234 个文件、测试 202 个文件的对照清单见 `source-proof.json`。

- 完整 `npm run check`：872 项单元全部通过，生产构建通过，见 `check.log`。此后新增原生高盲注场景，相关场景选择和计数单元按最终源码独立复测 2 项通过，见 `native-selection.log`。
- Web 专项最初 56 项中 54 通过，2 项为测试盲注配置层级错误；修正为既有的 `stakes` 配置后，两端同一新增用例均通过，见 `web.log`、`web-stakes.log`。覆盖 5–9 人、待入座／进行中／结算、320–2256 px，以及 11 种语言在 320／390 px 的入口。
- 动态单列布局专项 4 项通过，验证日志完整顺序、自然展开、牌桌高度和页面阅读位置，见 `web-flow.log`。旧版右侧栏独立滚动的断言改为新布局断言，保留了稳定性检查。
- Web 全量收集 586 项：579 通过、6 失败、1 项桌面专属用例按设计跳过，见 `web-all.log`。4 个时间相关失败保留原断言复测，2 个旧侧栏布局断言按新设计更新，并保留牌桌高度和页面阅读位置检查。最终桌面／手机串行复测 12 项全部通过，覆盖全部 6 项失败情况，见 `web-final-retry.log`、`web-final-retry-results/`。这是全量尝试加最终复测的结果，不是一次全量全绿。
- 国际化和格式检查通过，见 `i18n.log`、`format-final.log`。没有新增用户文案。
- 微信官方构建及 17 个 WXML／WXSS 编译通过；真实 DevTools 专项 6 项通过，见 `wechat-build-check.log`、`wechat-runtime/report.json`。检查实际高盲注标题、英雄间距、70 × 32 px 按钮、真实点击、取消与确认重置及全部 5–9 人等待画面，原图已检查。实际打开的独立工程 116 个文件与默认构建清单一致。canonical 的 `.artifacts/wechat` 也已用官方构建器重新生成、核验和编译，见 `canonical-wechat-build.log`；其中并发风格工作未被本专项验收覆盖。
- iOS：Xcode 编译通过，安装版专项 4 项通过、26 项明确跳过，见 `ios-compile.log`、`ios-runtime/report.json`。覆盖初次进入音乐与发牌、高盲注重启等待、标题按钮实际点击与取消／确认、本地无登录及 Web 牌桌对照。原始设备 PNG 已检查。
- Android：Gradle QA 编译通过，见 `android-compile.log`；安装运行验收未通过，不能报告为原生运行成功。末次 `android-runtime-initialized-install/report.json` 在 WebView 附着阶段遇到脚本超时，随后设备断开；`android-host-emulator.log` 记录 QEMU 主循环与四个 CPU 线程挂起，模拟器进程以 139 退出。因设备已经退出，最终截图／日志抓取也未能完成。多个早期失败、实际系统无响应原图和工具日志均保留。
- 两端编译后的统一 `mobile:sync` 与 `mobile:verify` 通过，见 `mobile-sync.log`、`mobile-verify.log`。保留 20 张本地图片、其中 16 张头像，以及 2 份音乐，资源摘要 `fb410fb9e11c14fd38fca586cb09cd3cd96c522db9a4152218db598820ad1c10`。原生安装源码摘要 `1613b4159c743f5047346b06c3e49188b456e3ea0c6719900de14372631976f2`，微信源码摘要 `5f87f9eb21eb7e295f6ab3e2fe731a660165960f63dd98b0401af6a15eb1f809`。

Android 首次启动时出现系统 Pixel Launcher 无响应、自动化进程崩溃和 WebView 连接失败，保留 `android-runtime/` 原报告、PNG、XML 及 `android-startup-crash.log`。没有把失败算作通过。iOS 安装检查完成后关闭本次专用 iOS 模拟器，重启同一台专用 Android 模拟器后仍出现系统界面无响应，停止原设备尝试，保留 `android-runtime-reboot/`、`android-reboot-device.png` 和事件日志。随后创建 `Noir_Entry_Layout_20261021`，使用 Android 35 Google APIs、Pixel 7、4 GB／4 核；保留 swiftshader_indirect 与 host 两套启动记录。新设备分别在辅助测试工具启动和其 APK 默认 20 秒安装等待阶段失败，见 `android-runtime-fresh/`、`android-runtime-host/`、`android-runtime-initialized-ready/`。最终改用独立本地 Appium 服务，复用已安装的辅助组件（`skipDeviceInitialization: true`），仅把测试工具的安装等待设为 120 秒；生产 App 仍执行干净安装，界面断言、系统异常拦截与画面对照不变。外部服务首次未就绪时的一次连接失败也单独保留在 `android-runtime-initialized/`。这些环境失败均不算运行通过。辅助工具安装等待调整后已进入真实 App 的 WebView 连接，随后 QEMU 挂起退出。未放宽应用初始化、布局或交互断言，未把部分配置成功算作安装验收通过。

本轮仅覆盖模拟器／开发工具，实体手机、声音听感、商店分发及微信上传未执行。PR 没有合并到 main。

本机资源在同时运行的其他验证期间多次显著升高，本轮观测到 load average 超过 500；这是环境观测，不据此认定单一根因。按本机调试手册对重复 ANR、crash、驱动断流留证停止的要求，结束该设备的重试，没有关闭其他任务、清空 AVD 或修改宿主安全设置。外部 Appium 服务已关闭，专用 iOS 模拟器已关闭，Android 原设备已停止，新设备已因上述崩溃退出。
