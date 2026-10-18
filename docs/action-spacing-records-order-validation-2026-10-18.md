# 行动提示间距与记录倒序

## 改动

- Web、iOS、Android 和微信共用样式，将行动提示及牌力表下移 6px，下注控件与牌桌预算不变。
- 对局内的手牌按最新记录在前展示，同一手的重打也按最近一次在前排列。Web 默认展开与延迟展开采用相同顺序；微信先显示最新 24 条，继续加载时追加更早的记录。
- 保存顺序、记录 ID、已结算快照、重打统计与筹码计算不变。

## 本机证据

证据目录：`.artifacts/action-spacing-records-order/`。原始失败记录保留，后续复跑使用独立文件和目录。

- Web 记录与行动提示专项首轮 54/54 通过。五种视口 320×568、390×844、820×1180、1024×1366、1280×900 实测提示条位移均为 6px、按钮位移为 0；手机上方间距 10px、下方滑杆间距 6px。读数和截图为 `web-geometry.json`、`web-mobile.png`、`web-records.png`。
- 单元首轮 843/844 通过，微信监听器构建检查超时；同一用例独立复跑 1/1 通过，未更改断言或时限。完整检查复跑记录为 `check-retry.log`；全量 Web 记录为 `web-full.log`。两者结果以日志最终状态为准。
- Xcode iOS Simulator 和 Gradle Android Debug 实际编译成功。统一 `mobile:sync`、`mobile:verify` 通过。`native-build-proof.json` 保存源码摘要、Android Java 与 APK 摘要，以及 iOS 包内元数据。
- iOS 已安装包的首启和行动提醒场景通过，提示条实测上方间距 10px、距滑杆 6px。组合运行的记录场景未打开“重新练习”确认框，失败于 `#confirm-reset` 可用性检查；单独复跑记录为 `ios-records-runtime/`。首轮 Appium 冷启动超时也单独保留。
- Android 首轮模拟器冷启动未完成；随后 swiftshader 模拟器启动成功，安装测试在 WebView 附着时遇到 renderer 断连，之后设备离线，未取得运行通过。编译和资源通过不能替代此项。
- 微信资源核验及官方 WXML/WXSS 编译 16 文件通过。DevTools 对局记录实际流程 9 项检查通过，证据为 `wechat-records-runtime/`。提示条实测下移 6px 后上方间距 8.5px、距滑杆 2px；其原生提示行高 24px，与 Web 的行布局不同。完整页面复跑记录为 `wechat-runtime-final/`。

本轮不包含实体手机、平板安装运行、商店验收或线上发布；未将浏览器、资源检查或历史结果计作这些项目通过。
