# PR #27 原生运行修复与验收（2026-10-11）

本次在安装后的生产 Web bundle 上验收，通过 Appium 的 WebView 点击与原生生命周期接口操作。未使用 Vite、浏览器 QA fixtures 或注入牌局。两个本地安装包都重新编译并校验了 16 张牌手头像、共 17 张图片。

## 修复

- iOS 干净安装后先通过 Simulator 服务独立启动，再以 `autoLaunch: false` 和 `noReset: true` 连接 WDA。干净安装仍清除应用设置；保留的是测试启动后的运行进程。移除建会话后终止、替换应用进程的步骤，避免首次 WebKit 导航暂停及 WDA 跟踪已经终止的进程。独立启动日志确认 Preferences 和 App 原生调用返回，随后完整流程通过。
- 指定 `--udid` 的关闭状态 iOS 设备现在也会先启动；只在脚本自行启动设备时负责关闭。
- Android 等待 `sys.boot_completed=1` 和包管理服务可用后再安装、连接测试驱动。设备、Appium 与设备连接端口独立，两个平台按顺序运行。
- Android 旧 WebView 将 inset 留给原生窗口时，默认白底配浅色系统图标。原生窗口背景补为 `#0b1017`，并指定浅色图标。实际截图上下栏采样从 `[250,250,250]` 变为 `[11,16,23]`；新截图的对比度回归通过，旧截图被拒绝。CI 保留此图片检查，单元测试覆盖上下栏各自失败及阈值边界。
- 合并 `origin/main` 的 `c4f1ed7`，保留 16 位牌手研究、11 语言和 main 的布局、首屏及语言切换检查；两条变化的无障碍模板键同步修正全部译文。

## 本机结果

| 平台    | 测试设备                                 | 系统                                        | 实际编译                                       | 安装后流程 |
| ------- | ---------------------------------------- | ------------------------------------------- | ---------------------------------------------- | ---------- |
| iOS     | Noir Player Research E2E                 | iOS 27.0                                    | Xcode 27.0 / 27A266a，Simulator Debug App 成功 | 7/7 通过   |
| Android | Noir_Player_Research_E2E / emulator-5564 | Android 16 / API 36，WebView 133.0.6943.137 | JDK 21 / Gradle，Debug APK 成功                | 7/7 通过   |

- ios 运行：`2026-10-11T08:42:49.579Z` 至 `2026-10-11T08:44:25.998Z`；真实原生后台停留 `6019` ms，前后均由原生驱动确认后台状态，恢复后发生新行动。
- android 运行：`2026-10-11T08:44:46.014Z` 至 `2026-10-11T08:50:11.169Z`；真实原生后台停留 `6096` ms，前后均由原生驱动确认后台状态，恢复后发生新行动。

两端均覆盖本地无登录首启与首屏布局、英文/中文即时切换、设置持久保存、16 张本地头像、新增八位牌手资料及风格保存、真实加注/正额跟注/弃牌/结算、25 面值与筹码守恒、本地复盘、重打撤回统计一次/恢复原底牌、下一手，以及后台取消和恢复。结算还验证顶部查看底牌按钮和桌面锚点稳定。

两端安装后的源码指纹相同：

```
9a822ef4a380e2bf5f01f1a1cdbf7ee2c9071265bcec9942a7ee8ef1fc561b57
```

构建元数据记录 `941c44e` 后的工作区内容（`sourceDirty: true`），运行脚本与当前源码指纹一致；修复内容随后一同提交至 PR 分支。

其他回归：最新 `npm run check` 为 338/338 单元测试及 Web/微信构建通过，Web 全量 E2E 为 250/250 通过；11 语言完整资料检查、格式、两端资源同步/校验、微信资源和官方编译器检查均通过。顺序编译会生成不同的 build-info 时间戳，最后统一同步两端副本；两个已安装产物的源码指纹再次与当前源码核对一致。

完整报告、原生设备截图和 Appium 日志保存在本地：

- `.artifacts/native-e2e/pr27-repair-ios/`
- `.artifacts/native-e2e/pr27-repair-android/`（另含 `system-bars-regression.json` 和修复前后截图）
- `.artifacts/player-research-validation/native-repair-*.log`

复现命令（使用专用测试设备；测试清除所选设备上的应用数据）：

```sh
npm run mobile:ios
node scripts/native-e2e.mjs ios --udid 6AEC0834-D43D-438A-B86E-1B9CFEDB2364 --port 4735 --driver-port 8135 --output .artifacts/native-e2e/pr27-repair-ios

env JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ANDROID_HOME=/Users/zjz/Library/Android/sdk npm run mobile:android
node scripts/native-e2e.mjs android --udid emulator-5564 --port 4737 --driver-port 8227 --output .artifacts/native-e2e/pr27-repair-android
node tests/native/system-bars.mjs .artifacts/native-e2e/pr27-repair-android/local-launch-and-no-login.png
```

Android 在飞行模式下实际运行，结束后恢复原设置。iOS Simulator 没有真实无线电飞行模式，检查的是本地 bundle 和图片 origin。此记录属于模拟器/仿真器安装运行验收，不包含真机、签名发布或远程 CI 结果。微信结果仅为本地资源与官方 WXML/WXSS 编译器检查，不代表 DevTools 或真机验收。
