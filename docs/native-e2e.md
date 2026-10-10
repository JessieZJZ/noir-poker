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
```

默认 iOS 新建或复用专用 `Noir Poker E2E` 模拟器，避免修改正在使用的其他模拟器。Android 要先启动专用 AVD；只有一个已连接设备时自动选中，否则通过 `--udid emulator-5554` 指定。也支持 `NOIR_IOS_UDID` 和 `NOIR_ANDROID_UDID`。

**测试执行干净安装，会清除所选测试设备上的应用数据。请只指定测试设备，不要选择存有个人练习数据的设备。** iOS 只卸载这个测试应用，保留模拟器和测试驱动。默认专用模拟器在脚本自行启动时，会在完成后关闭。

可指定已编译的产物和结果目录：

```sh
node scripts/native-e2e.mjs ios --app /absolute/path/App.app --output .artifacts/native-e2e/ios
node scripts/native-e2e.mjs android --app /absolute/path/app-debug.apk --udid emulator-5554
```

`--server http://127.0.0.1:4723` 可复用已启动的 Appium；没有这个参数时，脚本自行启动本地 Appium 并在结束后关闭。iOS 使用 4725 端口，Android 使用 4727。只使用 Debug 原生外壳的调试能力，Web 内容仍是正常 native production build；上架 Release 不需要打开 WebView 调试。

## 覆盖的实际流程

- 从打包的 localhost origin 首启，确认原生适配器生效、没有登录要求、没有 QA fixtures。
- 测试滚动之前检查操作按钮全部位于首屏；开始前核对包内源码指纹和所有图片，旧包会被拒绝。
- 打开设置，更改人数、情绪、对手风格和声音；原生终止并重启后检查自动保存。
- 检查八个牌手头像解码成功且地址为本地 origin，避免用字母回退掩盖资源缺失。
- 在真实随机牌局中累计加注、正额跟注、弃牌和结算；核对实际支付金额为 25 的倍数，结算后筹码守恒。零筹码过牌不计作跟注。
- 从结算打开复盘，确认本地分析生成总览和行动建议，并能关闭弹窗。
- 重打恢复原底牌，完成手数撤回一次；下一手增加手数并清理重打状态。
- 在对手待行动时将真实原生应用切到后台至少 6 秒；被动记录原生 inactive/active 事件对应的公开状态，确认期间不前进，恢复后确实发生新行动。

后台时长由 Node 单调时钟计时，并在等待前后使用原生驱动确认应用状态为后台或暂停。Android 可能暂停 WebView 的 JavaScript，再于恢复时投递生命周期回调，因此报告将实际原生后台时长与 JS 回调间隔分别记录。

Android 测试期间打开飞行模式，结束后恢复原设置。iOS Simulator 没有真实无线电飞行模式，报告会明确标注这一限制；iOS 检查本地 Web bundle 与本地图片 origin，不把这等同于真机断网验证。

结果保存在 `.artifacts/native-e2e/<platform>/report.json`、每个流程的全设备截图以及 `appium.log` 中。报告包含设备、产物、打包源码指纹、各项实际耗时和失败原因；失败不能视为已验证。CI 需先编译产物，再执行脚本，上传这些证据；只验证 `mobile:sync` 或成功编译不能替代此流程。

参考官方文档：[Appium drivers](https://appium.io/docs/en/latest/intro/drivers/)、[XCUITest capabilities](https://appium.github.io/appium-xcuitest-driver/latest/reference/capabilities/)、[UiAutomator2 hybrid WebView](https://github.com/appium/appium-uiautomator2-driver#hybrid-mode)。
