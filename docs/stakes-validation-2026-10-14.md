# 2026-10-14 盲注、筹码与图标验证

本次实现基于当前 main，并保留已合入的复盘修正。默认 100/200、20000 筹码（100 BB），筹码面额等于小盲；小盲为 25 的正整数倍。变更盲注立即重开牌局、恢复起始筹码和清空统计。设置界面暂不增加尺度选项。

PC 的三个操作按钮底部与快捷下注区对齐，立刻发完、下一手、重打和复盘均为 52px。所有端的本地应用图标采用用户提供的 PNG，数字采用保留整数精度的 K/M 显示。

## 源码与产物

已安装、实际运行的两端包对应源码提交 `f9b8412d3eee269bada0ac55ec91737288f6ab39`，构建时源码未修改。随后仅调整了展示断言和本记录，生产源码指纹保持一致：

`04e7ad45ed8c81e14931d83d4d53b3f830e6ca02ad74a0253c87104a35ee9f59`

两端实际产物均包含 19 个本地图像资源，包括 16 个原有人物头像与新的应用图像，图像 SHA-256 校验通过。应用资源摘要为 `c4650a6e2f0f0b56deba68496b3d4bac5dced1cfa026ef9b92c1f594cb55e28a`。

## 验证结果

| 验证               | 结果                                                       | 证据                                                                                      |
| ------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `npm run check`    | 481 个单元测试通过；Web 与微信构建通过                     | `.artifacts/stakes-merged-check.log`                                                      |
| Web E2E            | 363 个场景通过；1 个仅 PC 的场景在移动项目跳过             | `.artifacts/stakes-merged-web-e2e.log`、`.artifacts/stakes-web-table-retry.log`           |
| 格式与 i18n        | 格式通过；11 个语言、1285 条文案与结构化研究覆盖检查通过   | `.artifacts/stakes-final-format-check.log`、`.artifacts/stakes-final-i18n-check.log`      |
| iOS 编译           | Xcode Simulator 编译与实际 `.app` 资源校验通过             | `.artifacts/stakes-merged-ios-build.log`                                                  |
| Android 编译       | Gradle Debug APK 编译与实际包资源校验通过                  | `.artifacts/stakes-merged-android-build.log`                                              |
| 原生同步           | `mobile:sync` 与 `mobile:verify` 通过                      | `.artifacts/stakes-merged-sync.log`、`.artifacts/stakes-merged-mobile-verify.log`         |
| iOS 安装运行       | 专用 iPhone 17 / iOS 27 Simulator 上 16 个场景全部通过     | `.artifacts/stakes/native-ios-retry/report.json`                                          |
| Android 安装运行   | 专用 Pixel 9 / Android 36 模拟器上 16 个场景全部通过       | `.artifacts/stakes/native-android-retry/report.json`                                      |
| 微信构建与编译     | 源码及资源校验通过；官方 WXML/WXSS 编译器检查 9 个文件通过 | `.artifacts/stakes-merged-wechat-verify.log`、`.artifacts/stakes-merged-wechat-check.log` |
| 微信 DevTools 运行 | 尚未完成；电脑控制工具多次确认 Mac 锁屏，等待用户解锁      | 不将编译或适配器测试记为运行通过                                                          |

Web 首轮的 10 个失败来自旧的数字展示／默认筹码预期；更新 K/M、20K 与历史尺度配置断言后，10 个场景串行复跑全部通过。其余 353 个场景首轮已通过。规则边界用例显式使用旧尺度，新增默认尺度、25/75 与 500/1000 用例验证合法金额、短全下、退款、奇数分池、守恒和整场重置。

iOS 首次安装运行的图标断言未适配 Vite 的 `./` 相对路径，修正断言后完整复跑通过。Android 首次运行受到新模拟器的 Pixel Launcher 无响应弹窗阻挡；确认弹窗属于系统启动器、处理该专用设备的启动器后完整复跑通过。初次失败报告与截图保留在 `.artifacts/stakes/native-ios/`、`.artifacts/stakes/native-android/`，未覆盖。

最终截图保存在上述 `*-retry` 目录。Android 的实际全屏 PNG 已人工查看，图标、牌桌、筹码和操作区没有花屏。桌面效果见 `.artifacts/stakes/desktop-actions.png` 与 `desktop-settled.png`。

本记录不包含实体手机、微信真机或商店发布验收。周期涨盲模式尚未启用。
