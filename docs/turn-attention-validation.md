# 行动提醒验证记录

## 2026-10-16 当前版本：思考中同款手牌边框、双向脉冲，等待验证

按最新截图澄清，手牌边框贴合每张牌自身的圆角和倾斜轮廓，移除包住两张牌的大框及原有背光。每张牌复用对手“思考中”的薄荷绿细边框和 `turn-glow` 动画，按 2 秒节奏一直循环至玩家行动完成；入场、等待、补提醒及调节下注均不停止。边框放在卡牌伪元素上，不覆盖发牌动画，不改变卡牌、按钮或文字位置。“轮到你行动”显式固定常亮，取消动画、透明度过渡和文字光晕；操作区顶部加粗为两束 2px 细光，以 1.6 秒周期分别从中心向左右移动并逐渐消退。两束光宽度不变，去掉整条线缩放、粗光晕和单向扫光。

提示文案恢复统一的常规字重和颜色，以中文逗号连接，例如“轮到你行动，跟注需要 200 筹码。”；Web/App 各语言同步使用相应标点。

按用户最新要求，先完成特效修改，等待用户通知后再验证。回归代码已随新方案更新，本版未运行测试、构建或设备验证；下方中间方案及旧版记录不代表本版通过。

## 2026-10-16 历史中间方案：柔光与横向扫光（已替换）

移除手牌的描边光环和两层伪元素，仅保留一层在元素边界前完全透明的渐变；取消圆角裁剪，避免出现椭圆硬边。入场仍为 3.2 秒、单次补提醒为 2.2 秒，静止背光不透明度收淡至 0.24。操作区顶部亮线加粗至 3px 并横向扫过；等待时亮线与“轮到你行动”按 1.4 秒周期持续明暗呼吸，文字和按钮尺寸保持不变。减少动态效果、后台及行动结束时停止呼吸，震动逻辑不变。

- `npm run check`：624 个单元及 Web/微信生产构建通过；提醒、震动与微信控制器专项 32 项通过，原生测试工具专项 8 项通过。
- Web 桌面/手机 16 项专项全部通过；最终 8 项提醒专项再次通过。通过真实 CSS 动画帧取样确认亮线发生横向移动，亮线明暗差超过 0.6、文字明暗差超过 0.4；单层渐变、无圆角与描边、无伪元素、柔光收淡、几何稳定、减少动态效果和后台取消均覆盖。
- Xcode iOS Simulator、Gradle Android Debug 实际重新编译成功，统一 `mobile:sync` / `mobile:verify` 通过，安装包包含 19 张本地图片及 16 张人物头像。该中间方案共享源码摘要：`edd5cd2d967c5ab73547b5c9c6dfce67baaea94cb03e3b6b0bf34591f28ece97`。
- iOS 安装运行提醒专项通过：本轮可操作首屏正常，先前的空白首屏没有复现。当前证据不能证明已修复环境根因；仅选择此提醒场景，其他 17 项未执行。
- 微信资源核验、官方 10 文件 WXML/WXSS 编译及 `format:check` 通过。具体运行证据及范围记录在本轮证据目录。

证据位于忽略的 `.artifacts/`：`turn-glow-v3-check.log`、`turn-glow-v3-focused-unit.log`、`turn-glow-v3-native-harness-unit.log`、`turn-glow-v3-web.log`、`turn-glow-v3-web-final.log`、`turn-glow-v3-{ios,android}-build.log`、`turn-glow-v3-mobile-verify.log`、`turn-glow-v3-native-build-proof.json`。`turn-glow-v3-preview/turn-attention.gif` 为实际 Web 录屏，包含入场、静止柔光、持续呼吸和补提醒；原始视频与静态帧保留在同目录。

## 2026-10-16：增强手牌背光

入场延长至 3.2 秒，8 秒未操作后的单次补提醒延长至 2.2 秒。背光扩大为薄荷绿主光、青色与暖金色流光及扩散光环；收淡后保留更清晰的稳定背光。操作区亮线沿用原有短动效，震动逻辑不变。

- `npm run check`：624 个单元测试及 Web/小程序生产构建通过；提醒、震动与微信适配器专项 32 项通过。
- 本轮 Web 专项共 22 个不同用例通过：桌面/手机的提醒、静音与震动、布局稳定检查。首次几何比较误将独立发牌动画的中间帧纳入基准；补充等待有限发牌动画完成后，6 项提醒测试重新全部通过。
- iOS Simulator 与 Android Debug 均重新实际编译成功；统一 `mobile:sync` 和 `mobile:verify` 通过。
- `wechat:verify`、`wechat:check` 与 `format:check` 通过。DevTools 35 页、0 运行异常及 35 组同内容 Web 对照通过；实测入场 3.2 秒和补提醒 2.2 秒，保留峰值原图。
- Android API 35 安装包专项通过：3 层动画均为 3.2 秒，真实后台 9.20 秒后返回不重复入场，补提醒仅一次，卡牌与按钮坐标完全一致。此次仅选中提醒场景，另 17 项明确跳过；安装共享源摘要为 `44879ea82fc4151a8a3c4c16b89fd361e206c16f060601b65bc7ce80658dd3ee`。
- 原生首次服务冷启动超时；预热服务后 Android 设置服务尚未就绪，随后出现 `System UI isn't responding` 系统对话框，均留存失败记录。仅对本任务的 AVD 独立重启，等待系统及 PackageManager 就绪后上述专项通过，未修改断言或关闭其他模拟器。
- iOS 当前安装包仍停在空白首屏，未完成 WebView 附着，运行不通过。编译和 Android 专项不能替代 iOS 验收；没有执行实体手机震感或商店验收。

本轮证据均在忽略的 `.artifacts/`：`turn-glow-v2-check.log`、`turn-glow-v2-focused-unit.log`、`turn-glow-v2-web.log`、`turn-glow-v2-web-fixed.log`、`turn-glow-v2-{ios,android}-build.log`、`turn-glow-v2-mobile-verify.log`。`turn-glow-v2-preview/hand-glow.gif` 是 Web 实际录屏，`turn-glow-v2-wechat-runtime/hero-turn-entry.png` 是 DevTools 原图。

运行证据：`turn-glow-v2-wechat-runtime/{report,web-reference}.json`、`turn-glow-v2-native-android-reboot/report.json` 及设备 PNG/XML，`turn-glow-v2-native-ios-warm/report.json`；`turn-glow-v2-native-build-proof.json` 另存 Android Java、APK 摘要。失败保留在 `turn-glow-v2-native-{android,ios}/`、`turn-glow-v2-native-android-warm/`、`turn-glow-v2-native-android-ready/`，不覆盖最终通过记录。首次 Web 对照在 DevTools 报告尚未完成时被完整性检查拒绝；完成 35 页后重新执行并通过。

## 2026-10-15：首次行动提醒

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
