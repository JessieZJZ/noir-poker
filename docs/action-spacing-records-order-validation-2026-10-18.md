# 行动提示间距与记录倒序

## 改动

- Web、iOS、Android 和微信共用样式，将行动提示及牌力表下移 6px，下注控件与牌桌预算不变。
- 对局内的手牌按最新记录在前展示，同一手的重打也按最近一次在前排列。Web 默认展开与延迟展开采用相同顺序；微信先显示最新 24 条，继续加载时追加更早的记录。
- 保存顺序、记录 ID、已结算快照、重打统计与筹码计算不变。

## 本机证据

证据目录：`.artifacts/action-spacing-records-order/`。原始失败记录保留，后续复跑使用独立文件和目录。

- Web 记录与行动提示专项首轮 54/54 通过。五种视口 320×568、390×844、820×1180、1024×1366、1280×900 实测提示条位移均为 6px、按钮位移为 0；手机上方间距 10px、下方滑杆间距 6px。读数和截图为 `web-geometry.json`、`web-mobile.png`、`web-records.png`。
- `npm run check` 最终 844/844 单元及 Web/微信生产构建通过。首轮 843/844，微信监听器构建检查超时；同一用例独立复跑 1/1 后，完整检查复跑通过，未更改该断言或时限。日志为 `check.log`、`wechat-watch-retry.log`、`check-retry.log`。原生画面采样回归调整后，相关原生测试工具单元 10/10 通过。
- Web 全量首轮 538 通过、15 失败、1 跳过；15 项串行复跑通过 14 项，余下 320px 复盘标签用例独立复跑通过。累计 553 项不同用例通过、1 跳过，并非一次无失败的全量运行。首轮启动/模块获取超时及失败截图保留在 `web-first-results/`，串行失败记录保留在 `web-retry-results/`；日志为 `web-full.log`、`web-retry.log`、`web-last-retry-final.log`。未调整 Web 断言或时限。
- Xcode iOS Simulator 和 Gradle Android Debug 实际编译成功。统一 `mobile:sync`、`mobile:verify` 通过。`native-build-proof.json` 保存源码摘要、Android Java 与 APK 摘要，以及 iOS 包内元数据。安装包源码摘要均为 `4684a769abad91b79a7cbea4a2c95860f96ebbaf02c4360811a11c01c1a5c4fb`。
- iOS 已安装包的首启和行动提醒场景通过，提示条实测上方间距 10px、距滑杆 6px。对局记录、重打与重启恢复场景在 `ios-records-final/` 单独复跑通过，累计 3 项不同安装场景通过，其余场景明确跳过。组合运行的记录场景曾未打开确认框，复跑还遇到共享 Appium 服务退出；失败证据和首轮 Appium 冷启动超时均单独保留。
- Android 最终在专用 API 35、host GPU 模拟器上首启、持续提醒与对局记录共 3/3 安装场景通过，其余场景明确跳过。证据为 `android-runtime-stable/`；上方间距为 9.57px、距滑杆 6px，并已查看原始设备截图确认画面清晰。分数密度下新增间距检查按整数 CSS 像素比较；原有页面对照的 2px 容差没有更改。提醒场景将原先分开的“等待稳定阶段”和“读画面”合为同一次取样，保留原有 5 秒等待预算，避免慢驱动在两次通信之间跨入补提醒阶段。早期冷启动失败、swiftshader renderer 断连及模拟器退出、分数密度检查与提醒取样竞争的失败均保留。
- 微信资源核验及官方 WXML/WXSS 编译 16 文件通过。DevTools 对局记录实际流程 9 项检查通过，证据为 `wechat-records-runtime/`。提示条实测下移 6px 后上方间距 8.5px、距滑杆 2px；其原生提示行高 24px，与 Web 的行布局不同。完整页面复跑 36 页通过、0 运行异常，记录为 `wechat-runtime-final/`。新增间距断言最初错误地套用了 Web 的 10px 下限；确认微信行布局后，改为同时校验实际 6px 位移、上方至少 8px 和下方不重叠，原始失败报告保留。

- 最终 `npm run format:check` 通过。

本轮不包含实体手机、平板安装运行、商店验收或线上发布；未将浏览器、资源检查或历史结果计作这些项目通过。
