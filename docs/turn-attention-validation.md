# 行动提醒验证记录

2026-10-15，PR #47。实现提交 `0f4dec9`；后续仅扩展原生测试与验证文档。共享源码摘要：`a76916c2eaac0b2de37d19019557d4ad23bca0c05dcf9e77d707d4606074c6ec`。

## 已通过

- `npm run check`：624 个单元测试及 Web/小程序生产构建。另对新增的共享 WXSS 完全一致断言、原生场景选择回归进行专项复测。
- Web：397 项通过，1 项按原有条件跳过。全量中的 5 项复盘等待超时在单线程专项复测中全部通过，未修改断言与时限；桌面、手机的行动提醒专项均通过。
- `format:check`、`i18n:check`、`wechat:verify`、`wechat:check`；11 种 Web/App 语言均覆盖新增行动提示。
- 微信 DevTools：35 页、0 运行异常，35 组同内容 Web 对照。实测一次补提醒、调节下注取消、后台取消与返回稳定状态，卡牌及操作区尺寸保持不变。
- Xcode iOS Simulator 与 Gradle Android Debug 实际编译成功。`mobile:sync`、`mobile:verify` 及安装产物本地资源核验通过；每端包含 19 张本地图片、其中 16 张人物头像。
- Android API 35 安装运行：本地启动、盲注与图标、原生震动桥接、行动提醒、静音开关这 5 个相关场景通过。另单独扩展行动提醒场景，真实后台至少 9 秒后返回，确认原生 inactive 事件清除视觉状态、入场不重复、补提醒仅一次，卡牌与按钮坐标保持不变。

## 尚未通过

- iOS 安装运行：新建 iPhone 17 Pro 与闲置专用 iPhone 17 模拟器均停在空白首屏，未达到可操作页面的附着前提。重跑、独立启动诊断后仍未通过。不含此次提醒的新近对照安装包也在本次专用设备复现，不能将编译或浏览器 WebKit 检查算作 iOS 运行通过。
- Android 扩大回归：硬件图形模式下提醒及静音专项通过后，随机牌局结算用例在冠位查看底牌按钮被固定页头遮挡处失败；后续场景未运行。首次软件图形模式运行还遇到模拟器线程挂起、驱动断连；失败报告均保留，不将相关专项通过扩张为完整原生套件通过。
- GitHub 首次工作流失败，quality job 的执行步骤为空；本地检查不代表远端 CI 通过。未更改账户设置或手动重触发 CI。
- 未执行实体手机震感、声音听感或商店验收。

## 本机证据

所有路径相对仓库，位于忽略的 `.artifacts/`，不随 Git 提交：

- `turn-cue-check-final.log`、`turn-cue-shared-style-unit.log`、`turn-cue-native-selection-delivery.log`。
- `turn-cue-web-full-final.log`（桌面完整部分）、`turn-cue-web-mobile-final.log`、`turn-cue-web-parity-retry.log`、`turn-cue-web-review-retry.log`。
- `turn-cue-wechat-runtime/report.json`、`turn-cue-wechat-runtime/web-reference.json` 及逐页 PNG。
- `turn-cue-ios-build.log`、`turn-cue-android-build.log`、`turn-cue-mobile-verify.log`、`turn-cue-native-build-proof.json`（Android Java 与 APK 摘要）。
- `turn-cue-native-android-host/report.json`（5 项通过及扩大回归失败）、`turn-cue-native-android-attention-lifecycle/report.json`（扩展后的提醒场景通过，17 项明确跳过）及设备原始 PNG/XML。
- `turn-cue-native-ios/`、`turn-cue-native-ios-retry/`、`turn-cue-native-ios-warm-device/` 中的失败报告与截图；`turn-cue-ios-baseline-proof.json`、`turn-cue-ios-baseline-blank.png`、`turn-cue-ios-startup-log.txt` 为对照与启动诊断。
