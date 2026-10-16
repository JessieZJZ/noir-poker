# 原生 App 端到端验证

这套测试通过 Appium 安装并启动实际 iOS `.app` / Android `.apk`，在应用自己的 WebView 中点击操作，再切换到原生上下文验证后台和恢复。它不打开桌面浏览器，不使用 Vite 测试模式，也不注入牌局、隐藏牌或 QA fixtures。规则测试、浏览器测试、原生编译和原生 E2E 是四种独立证据。

## 准备工具

需要 Node.js 22.12 或更新版本。iOS 需要 macOS、完整 Xcode 和一个已安装的 iOS Simulator runtime；Android 需要 JDK 21、Android SDK 36、platform-tools、emulator 和对应 system image。

```sh
node scripts/native-e2e-setup.mjs ios
node scripts/native-e2e-setup.mjs android
```

工具安装在忽略的 `.artifacts/native-tools/`，不会把 Appium 放进应用依赖。固定版本为 Appium 3.8.0、XCUITest driver 12.16.0、UiAutomator2 driver 8.7.0。Android 的 ChromeDriver 由 Appium 按设备 WebView 版本下载；第一次准备测试工具需要网络，应用测试本身加载本地资源。

Android 示例（Apple Silicon 使用 arm64-v8a；Linux CI 使用 x86_64）：

```sh
sdkmanager 'emulator' 'system-images;android-36;google_apis;arm64-v8a'
avdmanager create avd -n Noir_Poker_E2E -k 'system-images;android-36;google_apis;arm64-v8a' --device pixel_9
emulator -avd Noir_Poker_E2E -no-window -no-audio -no-snapshot -gpu swiftshader
```

## 构建并运行

```sh
npm run mobile:ios
node scripts/native-e2e.mjs ios

npm run mobile:android
node scripts/native-e2e.mjs android
node tests/native/system-bars.mjs .artifacts/native-e2e/android/local-launch-and-no-login.png
```

iOS 先对指定测试设备干净安装，用 Simulator 服务独立启动应用，再以 `autoLaunch: false` 接入 XCUITest。首启不在 WDA 附着后额外替换应用进程。后续设置持久化场景的重启通过 WDA 执行，不用外部 simctl 替换正在跟踪的进程。指定 `--udid` 的关闭状态设备也会先启动；仅关闭脚本本次启动的设备。

iOS 自动选择最新可用 runtime 中兼容的标准尺寸 iPhone，仅复用同一 runtime、同一设备类型的专用模拟器。可用 `NOIR_IOS_RUNTIME` 和 `NOIR_IOS_DEVICE_TYPE` 指定 `simctl list runtimes -j` / `simctl list devicetypes -j` 返回的完整 identifier；选择不可用或不兼容时直接失败，不自动换设备。指定 UDID 时使用该设备。报告记录自动选择的 runtime 和设备类型。

**测试执行干净安装，会清除所选测试应用的数据。** iOS 只卸载这个测试应用，保留模拟器和测试驱动，必须使用测试模拟器；默认专用模拟器在脚本自行启动时，会在完成后关闭。安卓真机强制使用下述独立 QA 包，原有应用的练习数据不受测试重置影响。

Android 要先启动专用 AVD；脚本等待系统启动完成和包管理服务就绪后才安装、连接驱动。只有一个已连接设备时自动选中，否则通过 `--udid emulator-5554` 指定。也支持 `NOIR_IOS_UDID` 和 `NOIR_ANDROID_UDID`。指定 UDID 的 iOS 设备在脚本自行启动时关闭，已启动的设备保持运行。

可指定已编译的产物和结果目录：

```sh
node scripts/native-e2e.mjs ios --app /absolute/path/App.app --output .artifacts/native-e2e/ios
node scripts/native-e2e.mjs android --app /absolute/path/app-debug.apk --udid emulator-5554
```

`--server http://127.0.0.1:4723` 可复用已启动的 Appium；没有这个参数时，脚本自行启动本地 Appium 并在结束后关闭。iOS 使用 4725 端口，Android 使用 4727。可用 `--port` 修改脚本自建服务器端口，用 `--driver-port` 指定 iOS WDA 或 Android UiAutomator2 的设备连接端口；并行任务应各用独立测试设备和端口。Android WebView 探测另分配 `min(64000, driverPort + 10000)` 起的 100 个端口及起点加 101 的 ChromeDriver 端口（未指定 driverPort 时用 9200 计算），运行前也须确认这些端口可用。`--port` 与 `--server` 不同时使用。只使用 Debug 原生外壳的调试能力，Web 内容仍是正常 native production build；上架 Release 不需要打开 WebView 调试。

## 安卓真机与无线连接

```sh
npm run mobile:android:qa
npm run mobile:test:android -- --variant qa --udid SERIAL --output .artifacts/native-e2e/android-physical
```

`--variant qa` 选择 `noir-poker-qa.apk` 和 `.qa` 包名；可选 `--app` 指定另一份 QA APK。安装前会读取 APK 的实际包名，拒绝包名不符的文件，也拒绝在真机上重置原始包。桌面名称为“NOIR Poker 测试”，练习、设置与原有应用隔离。调试辅助服务仍由 Appium 安装。

Android 11 及以上可在手机开发者选项中开启无线调试，手机与 Mac 连接同一 Wi-Fi。打开“使用配对码配对设备”，保持弹窗打开，以其中的地址和配对码执行 `adb pair IP:配对端口`；成功后若未自动连接，再用无线调试主页的地址执行 `adb connect IP:连接端口`。这两个端口不同，弹窗关闭后不能继续使用旧配对端口。用 `adb devices -l` 确认 `device` 状态，再将完整标识作为 `SERIAL`。依据：[Android 无线 ADB](https://developer.android.com/tools/adb#connect-to-a-device-over-wi-fi)。

如果需隔离旧 ADB 后台服务，可在未占用端口上启动 `adb -P 5049 nodaemon server`，配对和连接也都加 `-P 5049`，运行测试时对应加 `--adb-port 5049`；测试驱动与设备命令共用该服务。不要为排查一个设备关闭其他任务的全局 ADB 服务。真机运行保持现有网络连接，不切飞行模式，避免无线调试掉线；报告只核对本地资源来源，离线运行仍需单独验收。模拟器原有飞行模式检查保留。

模拟器也可以在启动前设置 `ANDROID_ADB_SERVER_PORT`，让它注册到同一个隔离服务；先确认目标 AVD、服务端口及模拟器端口未被其他任务使用，冷启动时保留声音且不载入旧快照。具体启动参数与设备版本写入当次报告，不能把此前设备的通过结果代入当前包。启动选项依据 [Android Emulator 命令行文档](https://developer.android.com/studio/run/emulator-commandline)。

原生触摸前仍要求连续三次位置、滚动和视口完全相同。可见性与位置改为一次 WebView 读取，稳定等待限时 30 秒，避免软件绘制模拟器每次驱动通信耗时一两秒时误报 5 秒超时。Android 先保留默认首启等待，实际 WebView 可操作后才将 UiAutomator2 `waitForIdleTimeout` 设置为 500ms 并读回核对，避免牌桌持续动画让每次触摸耗尽默认空闲等待；不关闭产品动画、不合成 DOM 点击，也不改变页面对照的 2px 几何要求。该设置依据 [UiAutomator2 官方设置说明](https://github.com/appium/appium-uiautomator2-driver#settings-api)。

## 覆盖的实际流程

- 轮到玩家时检查手牌背光、整个操作区顶部亮线与行动提示；记录入场、稳定、8 秒后的一次轻提醒，真实后台至少 9 秒后返回不重播入场，核对卡牌和按钮坐标保持不变。现有原生 Haptics 桥接检查继续保留，模拟器不能验证真实震感。

- 通过原生驱动请求横屏再恢复正常竖屏：手机 App 的 WebView 保持竖屏，平板允许横屏；两次旋转均不重新发牌。保存横屏请求时的设备截图及窗口尺寸。平板必须使用平板模拟器/仿真器执行，手机通过不能算平板通过。
  手机锁定竖屏时，UiAutomator2 可能明确报告程序锁定，iOS WDA 也可能报告 `Unable To Rotate Device`；测试记录该拒绝，再检查实际窗口保持正向竖屏、旋转提示未打开且牌局不变。平板拒绝旋转、恢复竖屏失败和其他驱动错误均直接失败。

- 从打包的 localhost origin 首启，确认原生适配器生效、没有登录要求、没有 QA fixtures。
- 在同一手底牌上保存数字重绘前后两张全设备截图。真实后台恢复后触发六次牌桌尺寸重算，按原生 WebView 边界将 CSS 坐标映射到截图像素，比较数字的着色宽高与像素数；宽高最多相差 1 像素，着色数量最多相差 7%。这样可识别 CSS 和 DOM 不变但数字实际变大、变粗的绘制问题。牌点使用固定 Manrope 700 矢量轮廓，字体许可保存在 `public/licenses/card-ranks-OFL.txt`。
- Android 首屏全设备截图额外检查系统栏背景与浅色图标的对比度，防止旧 WebView 的原生 inset 留下白底白字；单元回归覆盖对比度边界和上下栏独立失败，CI 在安装流程后执行图片检查。
- 测试滚动之前检查操作按钮全部位于首屏；开始前核对包内源码指纹和所有图片，旧包会被拒绝。
- 在安装后的 WebView 检查公共牌优先单排和空间不足时的 3+2 排列、玩家信息居中、筹码在位置标签右侧、行动提示在最下行及重复回合标签移除；弃牌到结算时牌桌位置和高度不变，结算操作缩为不侵入底部安全区域的一排。
- 同时测量玩家卡片和风格标签的四侧内边距；浏览器平板回归复用相同读数，检查实际缩放后的名称、筹码和风格字号，避免用整桌缩小抵消字体放大。
- 仅在控件超出可见区域时滚动；结算牌面排列在正常发牌动画结束后测量，避免把测试强制滚动或动画中途的牌面旋转误判为布局位移。
- 打开设置，更改人数、情绪、对手风格和声音；原生终止并重启后检查自动保存。
- 在已安装 App 内切换英文与中文，检查文案更新、文档不重载、设置保持打开且手数不变；重启后检查语言持久保存。
- 检查十六个牌手头像解码成功且地址为本地 origin，避免用字母回退掩盖资源缺失。
- 检查新增八位牌手详情的核对日期、逐条出处与来源数量，新风格在原生重启后实际应用。
- 在真实随机牌局中累计加注、正额跟注、弃牌和结算；核对实际支付金额为 25 的倍数，结算后筹码守恒。零筹码过牌不计作跟注。
- 从结算打开复盘，确认本地分析生成总览和行动建议，并能关闭弹窗。
- 重打恢复原底牌，完成手数撤回一次；下一手增加手数并清理重打状态。
- 对局记录场景使用实际 Android Activity 返回键或 iOS 边缘滑动，检查详情→列表→游戏与“返回游戏”后的再次浏览；滚动历史结算页时桌高与所有座位几何保持不变。隐私页画面对照之后通过页面自带“返回牌桌”链接恢复游戏，再执行记录场景。
- 在对手待行动时将真实原生应用切到后台至少 6 秒；被动记录原生 inactive/active 事件对应的公开状态，确认期间不前进，恢复后确实发生新行动。

后台时长由 Node 单调时钟计时，并在等待前后使用原生驱动确认应用状态为后台或暂停。Android 可能暂停 WebView 的 JavaScript，再于恢复时投递生命周期回调，因此报告将实际原生后台时长与 JS 回调间隔分别记录。

Android 测试期间打开飞行模式，结束后恢复原设置。iOS Simulator 没有真实无线电飞行模式，报告会明确标注这一限制；iOS 检查本地 Web bundle 与本地图片 origin，不把这等同于真机断网验证。

结算用例还会点击顶部座位的查看按钮，验证眼睛位于位置标签右侧、亮牌的数字和花色完整可见且不贴提示栏；牌底少量藏在玩家卡片后。测试同时检查两行行动文案没有截断，并记录查看前后的牌桌与公共区位置。

结果保存在 `.artifacts/native-e2e/<platform>/report.json`、每个流程的全设备截图以及 `appium.log` 中。报告包含设备、产物、打包源码指纹、各项实际耗时和失败原因；失败不能视为已验证。CI 需先编译产物，再执行脚本，上传这些证据；只验证 `mobile:sync` 或成功编译不能替代此流程。

缺少包、资源过期、设备选择或启动失败也会写入失败报告，`phase` 区分预检、设备准备、Appium 启动、安装、WebView 连接与场景运行。脚本自行启动的模拟器即使在 `bootstatus` 失败后也会尝试关闭。已通过场景和当前失败场景同时保留；复盘保留 30 秒完成要求，并记录公开分析进度、每步耗时及 WebView 读取错误，便于区分计算耗时与驱动故障。

脚本自行启动的 Appium 退出前，会终止它当前仍存活的子进程，包括分离启动的 WDA `xcodebuild`；仅按该 Appium PID 的父子关系清理，不扫描或终止其他测试服务。外部 `--server` 由调用方管理生命周期。报告的 `serverCleanup` 保留清理进程和错误。

Android 每次保存设备截图时还读取原生 UI 层级，遇到系统 ANR/崩溃对话框就失败并保留 `.native.xml` 和截图。WebView 内断言通过不能覆盖系统弹窗；测试不会自动关闭弹窗继续当作通过。

牌桌和结算的同内容 Web 重放也检查实际画面：按原生 WebView 坐标和 CSS 安全区裁掉系统栏，再把两张图缩为 24×48 RGB 网格。归一化通道平均绝对差必须不超过 0.02，测量值写入 `parity-*.json`；重复或缺失的绘制块会失败。该检查容许文字抗锯齿和短暂光效差异，与元素坐标、卡牌可见性检查共同使用，不能替代逐页查看原图。

Android 模拟器的 `ranchu` / `goldfish` 虚拟硬件使用独立 WebView 软件绘制层。本轮模拟器的默认和独立硬件层都出现重复绘制块，独立软件层消除了该问题；实体手机保持默认硬件加速。[Android 绘制层文档](https://developer.android.com/develop/ui/views/graphics/hardware-accel)说明软件层由 CPU 绘制，因此模拟器结果不能用来保证真机动画性能。

iOS 设置持久化场景通过同一驱动终止并激活应用，再等待真实首屏和 WebView。重启不能绕过驱动仅用 `simctl`，否则 XCTest 可能仍跟踪旧进程。首屏附着失败截图只保持原生上下文，不尝试切换到尚未知的 WebView。等待要求保持不变。

参考官方文档：[Appium drivers](https://appium.io/docs/en/latest/intro/drivers/)、[XCUITest capabilities](https://appium.github.io/appium-xcuitest-driver/latest/reference/capabilities/)、[UiAutomator2 hybrid WebView](https://github.com/appium/appium-uiautomator2-driver#hybrid-mode)。

## 2026-10-11 方向策略验证记录

本次手机保持正常手持的正向竖屏，iPad、Android 平板保留横竖屏切换。新增原生旋转场景在实际安装包中执行；Web 的横屏提示使用完整模态层，并暂停当前行动，恢复竖屏后继续原手。

- Web 全量 286 项：首轮 279 通过、7 失败；修正两处仍期待手机横屏可操作的旧测试后，单线程复测 7 项全部通过。其余五项首轮超时，复测未修改断言或时限。方向、布局和操作区专项 42 项也全部通过。首轮证据保存在 `.artifacts/validation/web-first-result/`，日志为 `web-e2e.log`、`web-retry.log`、`web-corrected.log`。
- `npm run check`：374 个单元测试及 Web/小程序构建通过。`format:check`、`i18n:check`、`wechat:verify`、`wechat:check` 和 `mobile:sync`/`mobile:verify` 通过；微信检查覆盖源码、资源、适配器和官方编译器，尚未在微信客户端运行方向验收。
- Xcode iOS Simulator 编译和 Gradle Android Debug APK 编译分别成功；两个安装包均核验 17 张本地图片、其中 16 张人物头像。Android 手机完整测试包的源码指纹为 `d6b3b7a364735c3f721a8956e7dffe92eb95b93bc1244b9703fc6ad507d0d4e9`；之后仅扩展测试脚本对 iOS 竖屏锁定拒绝的识别，未再改动应用源码，最终指纹为 `1ba5351800769569fb1437b3a0667b02e4c7a37fb1e980fe9539c4873135276f`。最终编译日志为 `ios-build-ios-rotation.log` 与 `android-build-ios-rotation.log`；各次实际安装报告另存对应源码指纹。
- Android 36 手机先出现模拟器系统服务 ANR 和 Appium Settings 启动失败；改用 host GPU、2 核、720×1600 的测试屏幕并预热独立 Appium 后仍失败。仅在本任务设备上停止并卸载 Appium Settings，驱动重新安装后恢复。实际锁定竖屏使 UiAutomator2 拒绝横屏请求，新增测试明确记录该拒绝并继续核对窗口、遮挡和牌局状态，其他异常仍失败。手机 9 个原生场景全部通过，系统栏截图检查通过；完整报告和截图位于 `.artifacts/native-e2e/android-phone-final/`。Android 平板也通过全部 9 个场景，实际 600dp 边界的窗口从 `600×904` 旋转到 `960×544` 后再恢复 `600×904`，手数不变；证据位于 `.artifacts/native-e2e/android-tablet/`，该测试包源码指纹为 `1ba5351800769569fb1437b3a0667b02e4c7a37fb1e980fe9539c4873135276f`。
- iOS 27 的 iPhone 和 iPad 首次运行停在黑屏，未达到 45 秒内出现可操作首屏的要求。预热 Appium、重新启动以及应用日志检查确认原生 Preferences 和 App 接口有响应；Web Inspector 诊断未取得可用页面，不能据此认定业务代码故障。清理本任务遗留的 WDA/模拟器诊断进程并单独重跑后，iPhone 首屏恢复，最终全部 9 个原生场景通过，证据位于 `.artifacts/native-e2e/ios-phone-verified/`。iPad 随后也通过全部 9 个场景，实际窗口从 `834×1210` 旋转到 `1210×834` 再恢复，手数不变，证据位于 `.artifacts/native-e2e/ios-tablet-verified/`。iOS WDA 会因应用界面保持竖屏而拒绝横屏请求；核对驱动源码后按实际窗口、可操作性和牌局不变验证这条手机分支，平板仍要求旋转成功。首次失败证据分别位于 `.artifacts/validation/first-attempt/ios/`、`.artifacts/native-e2e/ios-phone-retry/` 和 `.artifacts/native-e2e/ios-tablet/`。
- 用户提供的系统弹窗记录显示：2026-10-11 18:03:09，系统日历 `MobileCal` 在本任务 iPhone 模拟器 `4444EE8A-7F76-4F0C-84E6-4E4A60D3F09A` 中因启动超过 30 秒被 `FRONTBOARD / 0x8BADF00D` 终止，堆栈位于 dyld 动态库加载。它证明同期系统应用也启动异常，不能单独证明 NOIR 黑屏的原因。报告中的大型虚拟地址空间预留不能当作实际内存占用。
- [PR #31 首次 GitHub CI](https://github.com/JessieZJZ/noir-poker/actions/runs/38132794529) 的七个任务均未分配 runner，执行步骤为空。GitHub 检查注释明确说明近期账户付款失败或 Actions 支出额度需要提高；`quality` 注释保存在 `github-ci-31-failure.json`。因此远端 CI 尚未执行验证，需要账户所有者处理 Billing & plans 后重跑，不能将本地通过报告为远端通过。

所有验证日志位于忽略的 `.artifacts/validation/`。编译、资源核验和浏览器回归与实际原生运行分开记录；早期失败报告和截图保留，不覆盖成通过结果。结束时已关闭本任务的两个 Android 仿真器、iPhone/iPad 模拟器及独立 Appium 子进程；清理记录为 `appium-final-cleanup.json`。

### PR #31 合并 main 后的复验

同日合入 `origin/main` 的 `eb183ba`，解决 10 个语言文件末尾追加文案的冲突，同时保留 main 的“5 人无限注”与本 PR 的两条竖屏提示。main 的首次地区语言选择、5 人桌默认值和结算布局也完整保留。

本次 `npm run check` 的 377 个单元测试及 Web/小程序构建通过；方向、首次访问、重载、11 种语言、牌桌视口、操作区和结算布局共 98 项 Web E2E 全部通过。格式、翻译完整性、iOS/Android 资源同步与核验，以及小程序资源和官方编译器检查通过。日志为 `.artifacts/validation/conflict31-*.log`。

本次冲突复验未重新编译原生安装包或执行安装 E2E；上方四组原生运行通过记录对应合入 main 前的安装包。资源核验不能代替更新后安装包的实际运行验证。

## 2026-10-12 牌点重绘修复验证

Web/iOS/Android 的 13 种牌点改用固定 Manrope 700 矢量轮廓，保留数字颜色、上下角、原有大小和读屏标签。牌框、花色及发牌动画沿用原实现。微信使用独立 WXML 文字牌点，此次未修改其牌面。

- `npm run check` 最终通过 382 个单元测试及 Web/小程序构建。中间一轮已有进程清理测试因 `ps` 超过 5 秒而失败；同一断言的冷却后单独复测及完整检查均通过，未修改该测试或时限。日志为 `.artifacts/card-check-delivery.log`、`card-native-process-unit-cooled.log`、`card-check-complete.log`。
- Web 全量 304 项首轮 301 通过、3 项超时；声音设置、桌面结算间距、手机弃牌获胜三项在单线程复测中全部通过，未修改断言或时限。日志为 `.artifacts/card-web-full.log`、`card-web-sound-retry.log`、`card-web-layout-retry.log`、`card-web-crown-retry.log`。牌点专项 4 项和既有可读性/操作稳定性专项 22 项均通过。
- Gradle Android Debug APK 与 Xcode iOS Simulator 实际编译成功；两个最终安装包的源码指纹均为 `7e11c0d68628f84f4e19a31a9ef4f48f0eef2154737990db9eee0a6b937ecf2a`，并核验 17 张本地图片（含 16 张头像）。最终编译日志为 `.artifacts/card-android-build-final.log`、`card-ios-build-final.log`，同步与核验为 `card-mobile-sync-final.log`、`card-mobile-verify-final.log`。
- Android 15 专用模拟器（API 35，720×1600、280 dpi、host GPU、4 核/4 GiB）实际安装测试 10/10 通过。后台恢复并重绘六次后，底牌 A 的墨色区域保持 16×20 像素/138 个着色像素，8 保持 13×20/145，前后完全一致。系统栏对比度检查也通过。报告和全设备截图保存在 `.artifacts/card-native/android-verified/`。
- Android 16 补测使用预热后的 `Noir_Orientation_Phone`（API 36，1080×2424、420 dpi、host GPU、2 核/3 GiB），同一最终 APK 实际安装测试 10/10 通过。底牌 8 的墨色区域保持 22×33 像素/425 个着色像素，2 保持 23×33/384，重绘前后完全一致；系统栏对比度也通过。报告和截图为 `.artifacts/card-native/android-api36-verified/`，启动日志为 `.artifacts/card-android-api36-retry-emulator.log`。早期 API 36 故障仍保留，不将这次不同测试 AVD 的成功当作对所有模拟器冷启动的保证。
- iOS 27 专用 iPhone 模拟器实际安装测试 10/10 通过。后台恢复并重绘六次后，J 保持 19×35 像素，着色数量 277→272；9 为 24×36→24×35，483→478；差异在 1 像素及 2% 以内，符合抗锯齿容差。报告和截图保存在 `.artifacts/card-native/ios-warm-verified/`。
- `format:check`、11 种语言完整性检查、`wechat:verify` 和 `wechat:check` 通过。微信证据覆盖共享适配器回归、源码/本地资源和官方 WXML/WXSS 编译器，不代表微信客户端或真机验收。

早期环境问题均保留原始证据：Android 16 测试 AVD 首次冷启动超过 120 秒，之后出现 System UI ANR；软件 GPU 重试仍未在 240 秒内就绪且系统进程重启。干净 Android 15 软件 GPU 的首次驱动安装也超过 20 秒，预装驱动并使用预热后的 host GPU 测试设备后恢复。Appium 首次载入驱动超过 30 秒，改用独立预热服务。iOS 一轮在驱动连接后停留于系统桌面，首屏附着失败；保留失败截图，前台状态探针与预热后完整重跑通过。新增像素测试还发现 iOS 截图未保存原生坐标 XML，已修正采集器并增加单元回归、重新编译两端。

失败报告位于 `.artifacts/card-native/android/`、`android-final/`、`android-api35/`、`android-api35-final/`、`ios/`、`ios-final/`、`ios-verified/`；启动和驱动日志为 `.artifacts/card-android-*.log`、`card-native-*.log`。整个验证使用独立测试设备，未清除用户正在使用的 Android 模拟器牌局或其他任务设备的数据。
