# iOS 与 Android 工程

Web、iOS 和 Android 共用 `src/`、`index.html` 和规则引擎。原生工程使用 Capacitor 8.5.3，将当前源码构建的 HTML、CSS、JavaScript 和复盘 Worker 放进安装包；启动和练习不依赖在线网站。

## 快速开始

```sh
cd /Users/zjz/code/noir-poker
npm ci
npm run mobile:doctor
npm run mobile:sync
```

`mobile:sync` 不需要 Xcode 或 Android SDK，执行原始图标生成、原生模式的 Web 构建、版本同步、两端插件和资源同步，再校验源码指纹与两端资源副本。生成文件放在 `.artifacts/mobile/`，不提交到 Git。

| 操作                 | 命令                            | 环境与输出                                                                     |
| -------------------- | ------------------------------- | ------------------------------------------------------------------------------ |
| 同步两端工程         | `npm run mobile:sync`           | Node.js 22.12+；重新构建当前 Web 源码                                          |
| 检查资源是否过期     | `npm run mobile:verify`         | 检查源码指纹及两个资源副本；过期会失败                                         |
| 打开 iOS 工程        | `npm run mobile:ios:open`       | macOS + Xcode 26；先同步再打开                                                 |
| 打开 Android 工程    | `npm run mobile:android:open`   | Android Studio；先同步再打开                                                   |
| iOS 模拟器构建       | `npm run mobile:ios`            | Xcode 26；`.artifacts/mobile/ios/Build/Products/Debug-iphonesimulator/App.app` |
| Android 调试 APK     | `npm run mobile:android`        | JDK 21、Android SDK 36；`.artifacts/mobile/noir-poker-debug.apk`               |
| Android 独立测试 APK | `npm run mobile:android:qa`     | JDK 21、Android SDK 36；`.artifacts/mobile/noir-poker-qa.apk`                  |
| iOS 签名归档         | `npm run mobile:ios:archive`    | Apple Team、开发者证书；`.artifacts/mobile/NOIR-Poker.xcarchive`               |
| Android 签名 AAB     | `npm run mobile:android:bundle` | 四项签名环境变量；`.artifacts/mobile/noir-poker-release.aab`                   |

支持 iOS 15+、Android 7.0/API 24+；Android 编译和目标 SDK 为 36。Xcode 的 Swift Package Manager 管理 Capacitor，无需 CocoaPods。系统要求以 [Capacitor 环境说明](https://capacitorjs.com/docs/getting-started/environment-setup) 与 [v8 升级说明](https://capacitorjs.com/docs/updating/8-0) 为准。

独立测试 APK 的桌面名称为“NOIR Poker 测试”，包名为 `io.github.jessiezjz.noirpoker.qa`，可与现有应用并存，练习记录和设置分别保存。它使用调试签名，只供安装验收；正常 Debug 和发行包的名称、包名保持原样。测试流程会重置这个独立应用的数据。真机安装回归必须使用 `--variant qa`，并在安装前检查 APK 中的实际包名；无线连接、指定设备和可选独立 ADB 服务见 [原生 E2E](native-e2e.md#安卓真机与无线连接)。

## Web 迭代如何进入安装包

修改 `src/` 或 `index.html` 后，继续使用原来的 `npm run dev` 开发。每次执行上述打包命令都会按以下顺序工作：

1. 从当前源码执行 Vite 原生构建，输出 `.artifacts/mobile/web/`。
2. 写入 `build-info.json`，包含版本、构建号、源码 SHA256 指纹、Git 提交、是否有未提交修改及时间。
3. 复制到 iOS 的 `ios/App/App/public/` 或 Android 的 `android/app/src/main/assets/public/`。
4. 验证源码未变化、资源副本 SHA256 一致，再调用原生编译器。

直接在 Xcode 点 Build/Archive，或在 Android Studio/Gradle 中构建，也会先运行同一个 Web 构建脚本。Xcode 的第一项 Build Phase 是 `Build latest Web`，Android 的 `preBuild` 依赖 `prepareLatestWeb`。不要删除这两个入口，也不要直接运行 `cap copy` 来替代项目脚本。并行的资源准备会被互斥锁拒绝，稍后重试即可。

**更新网站不会修改用户已安装的 App。** 每次重新打包都包含当前改动；商店用户通过新的 App Store/Google Play 版本获取它们。发行配置没有 `server.url`，不以线上页面替代包内代码，也没有远程下载补丁系统。

如果刚新增、删除或升级 Capacitor 插件，先运行 `mobile:sync`，让原生插件配置同步后再从 IDE 构建。只改页面或策略时，IDE 的构建入口即可重建资源。

## 原生差异

- iPhone 仅支持正常手持的正向竖屏；iPad 保留系统支持的横竖屏方向。Android 启动默认竖屏，最小屏幕宽度达到 600dp 的平板改用系统用户方向，设备配置变化时重新判断；手机保持正向竖屏。系统在多窗口或兼容模式下调整手机窗口时，共享 Web 层仍以旋转提示阻止横屏操作；平板允许两种方向。Android 返回键不能关闭旋转提示。

- 人数、难度、风格、提示和声音设置通过 Capacitor Preferences 保存；启动时先读设置，再初始化牌桌。Web 仍使用浏览器存储，两端数据彼此独立。
- 启动时先展示 `public/launch-icon.png` 的透明外边缘图标；共享 CSS 通过 `src/styles/app.js` 异步加载并等待完成，平台设置、语言、待入座牌桌与布局就绪后一次显示牌桌。入座后才发牌和启动电脑行动，编号与音乐渐入见[入座体验](entry-experience.md)。首屏隐藏规则覆盖全部子元素，滚动指南标题不能提前穿透。Android 使用独立透明 `launch_artwork`，iOS 启动图也从相同透明素材合成；桌面 App 图标继续使用原来的 `app-icon.png`。
- App 设置中的“音效与音乐”统一控制操作音效及本地循环背景音乐，“振动”独立控制 Haptics 回合提示。新设备均默认开启；旧组合静音保留为两项关闭，之后各自持久保存。安装运行回归分别检查声音、音乐与真实 Haptics 桥接请求，并验证音乐循环、前后台和重启保存；模拟器请求通过不等于实体手机震感或听感验收。详见[背景音乐与独立振动](background-music.md)。
- 切到后台时暂停机器人和发牌等待，回到前台后从剩余思考时间继续。重打、换手或重新练习仍会取消旧任务。对局记录与筹码恢复点保存到本机 Preferences；进程被系统杀死后继续原局的新一手，未完成手的所有下注撤回且不计入统计。浏览记录和历史结算页不暂停练习，真正切到系统后台仍暂停计时。
- Android 返回键依次关闭当前对话框、下拉菜单，再按历史详情→记录列表→游戏回退；在游戏页才回到后台。iOS 的 WKWebView 开启系统边缘回退手势，记录浏览使用同一组父页面关系。“返回游戏”退出整次记录浏览，重新打开不会叠加列表。
- 处理刘海、状态栏和底部手势区域；增加包内“关于与隐私”入口，显示实际原生版本和构建号。
- Web 与原生包使用同一组本地字体，风格名称、成熟插画（均衡使用文字头像）和风格说明与 Web 保持一致。全部本地图片随包提供，无需远程字体请求。构建生成图片 SHA-256 清单，同步副本以及实际 `.app`、APK、AAB 均检查图片内容，缺失或过期会阻止交付。

## 版本与包名

`package.json` 的 `version` 是两个 App 的公开版本，必须是 `x.y.z`。`mobile/release.json` 的 `buildNumber` 是 iOS 构建号和 Android `versionCode`，每次商店提交应递增。也可在一次 CI/打包中设置 `NOIR_BUILD_NUMBER=27`，同一流程内两端保持一致。

```sh
NOIR_BUILD_NUMBER=27 npm run mobile:sync
NOIR_BUILD_NUMBER=27 npm run mobile:android
```

Xcode 在构建开始前读取项目版本，因此改变版本或构建号后先运行 `mobile:sync`。若 Xcode 本次构建设置与源码版本不一致，入口会明确失败，避免包内页面与原生版本不一致。恢复默认构建号也需要重新同步。

暂定包名为 `io.github.jessiezjz.noirpoker`。首次上架前确定最终标识；同步修改 `capacitor.config.json`、iOS Target 的 Bundle Identifier、Android `namespace`/`applicationId` 及 `MainActivity.java` 的包路径。脚本会拒绝 Capacitor 与原生标识不一致的项目。应用发布后不要通过改包名来更新同一个商店条目。

## 环境排错

- 仅装 macOS Command Line Tools 不能编译 iOS。安装完整 Xcode 26，完成首次启动和许可，必要时执行 `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`。
- Xcode 找不到 Node 时，将 `mobile/xcode.env.example` 复制为忽略的 `mobile/xcode.env`，填写本机 `NODE_BINARY` 绝对路径；例如使用 nvm 时指向对应 Node 可执行文件。
- Android 安装 JDK 21，配置 `JAVA_HOME`、`ANDROID_HOME`，在 SDK Manager 安装 SDK 36、Build Tools 36 与平台工具。Android Studio 从 Dock 启动时可能没有 shell 的 PATH，可通过 `NODE_BINARY` 指定 Node。
- `assets are stale` 或 `Web source changed`：执行 `npm run mobile:sync`，不要手动编辑资源副本。
- 两端 IDE 同时打包时如遇资源锁，等待另一端资源准备完成后重试。`NOIR_SKIP_WEB_PREPARE` 仅供已经同步并校验过的内部编译步骤使用，不要作为日常快捷方式。

## 验证与持续集成

```sh
npm run format:check
npm run check
npm run test:e2e
npm run mobile:sync
npm run mobile:verify
npm run mobile:test:setup -- ios
npm run mobile:test:ios
npm run mobile:test:setup -- android
npm run mobile:test:android
```

安装测试保存每个页面的设备截图及同内容 Web 对照图，并检查主要组件的尺寸、字号与颜色。Android 截图后若 ADB 明确报告 `device offline`，测试仅重连指定设备、确认系统就绪后重试 WebView 切换一次，并在报告中记录次数；持续断连或系统 ANR/崩溃仍会失败，游戏与复盘断言的时限不变。

排查单个安装场景时，可以用测试专用的 `NOIR_NATIVE_SCENARIOS` 选择报告中的场景名称；默认不设置时执行完整套件。多个名称用逗号分隔，空名称或未知名称会失败。未选场景明确记录为 `skipped`，局部通过不能当作一次完整运行通过：

```sh
NOIR_NATIVE_SCENARIOS=real-background-cancels-pending-action,every-player-count-matches-web,all-secondary-pages-match-web npm run mobile:test:android -- --udid TEST_EMULATOR_ID --port 4737 --driver-port 8137 --output .artifacts/native-e2e/android-focused
```

汇总多次运行时，逐项核对通过记录、安装包源码指纹与资源摘要，并保留每次原始报告及失败证据。

`.github/workflows/mobile-build.yml` 在 GitHub PR、main 更新及手动运行时构建 Android debug APK、未签名 AAB 和 iOS 模拟器 `.app`，产物在 Actions 的 Artifacts 下载。CI 的未签名 AAB 用于验证发行编译，模拟器 `.app` 用于开发验证；两者都不能直接上架。CI 不保存商店签名凭据。

独立 `quality` job 检查格式、语言资源、全部单元测试及生产构建，不依赖 Android SDK 或浏览器布局。公共区定位、固定操作区、牌面可读性、首屏、结算布局与提示横幅测试，以及桌面和移动端的其余交互测试，分别并行执行；布局失败不会跳过其余交互测试。两组覆盖完整的 `npm run test:e2e`；失败轨迹与验收截图保存在 `table-geometry-results`、`browser-ui-results-desktop` 和 `browser-ui-results-mobile`。

原生包编译并通过资源检查后立即上传，随后仍执行完整的安装后 E2E。即使安装运行失败，已上传包也能用于复现；下载到包不代表 E2E 通过。所有 job 都有显式时限，原生运行步骤另设较短时限，为失败证据上传留出时间。原生包与原生报告保留 7 天。账户启动阻塞与近期历史失败见 [CI 排错](ci.md)。

CI 在完成编译后，安装并启动真正的模拟器/仿真器 App，用 Appium 驱动 WKWebView、Android WebView 和系统前后台。验证无登录本地启动、头像加载、设置重启持久保存、下注/跟注/弃牌、结算、重打撤奖统计、下一手和后台暂停恢复；报告与完整设备截图分别放入 `ios-native-e2e-results`、`android-native-e2e-results`。安装及运行步骤见 [原生端到端验证](native-e2e.md)。真机声音听感、实际设备安全区域与商店签名仍单独验收。

## 原生国际化与发行展示

原生构建支持 11 种语言，iOS 在 `Info.plist` 声明语言，Android 使用 `res/xml/locales_config.xml`。应用内语言设置在本机持久保存；实际系统单 App 语言选择与 WebView 字体需真机验收。

`native` 构建保留当前 Web 的人物展示、头像及已有说明，仅无需远程字体请求；策略、保存的风格 ID 与规则一致。新增 Web/原生文案后按 README 的国际化命令更新资源。历史可选展示转换保留在 `scripts/native-store.mjs`，当前构建不再自动应用它。原生包使用本地图标、字体与图片，不配置远程 `server.url`。

轮到你行动时，iOS/Android 通过 `@capacitor/haptics` 的 Light impact 提示一次，后台不触发；同一回合的重复渲染不会重复调用。共享去重逻辑与浏览器、小程序相同。安装测试确认原生 Haptics 插件存在并调用实际桥接；模拟器／仿真器没有可供人感受的震动马达，真机震感需独立验收。接口依据：[Capacitor Haptics](https://capacitorjs.com/docs/apis/haptics)。

Web 手机调用支持的 `navigator.vibrate(50)`，并受浏览器用户手势限制；Safari/iOS Safari 未提供该 API，iOS App 使用原生接口，不受这一网页限制。兼容性依据：[MDN Navigator.vibrate](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate)。
