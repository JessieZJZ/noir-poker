# 2026-10-16 Android 安装回归与滚动对照

PR #50 已合入 `main` 的 `9d41d3155f0a5bbed6d3788644a4232cfc1d6625`，Sites 版本 60 发布成功。本次后续修改只修正原生测试的参考页面滚动坐标，产品源码与已验 APK 保持一致；没有放宽组件或画面的验收要求。

## 已确认的安装证据

- 专用 API 36 arm64 模拟器使用无窗口 host GPU、隔离 ADB、无快照冷启动、关闭 guest Vulkan，保留音频配置。版本、参数、Java 与 APK 摘要见 `.artifacts/android-recovery-working-environment.json`。这个可用组合不等于证明了此前设备失联的精确驱动根因。
- `review-parity-native-android-host-full/report.json` 的前七项通过；第八项因旧整轮 20 秒预算失败。按照游戏现有思考上限和人数修正测试等待后，`review-parity-native-android-host-remaining/report.json` 覆盖通过第 8–16 项，并复验第 5 项。没有将筛选跳过的条目计为通过。
- 上述实际运行覆盖首启、盲注、牌点重绘、方向、多人桌、震动桥接、行动提醒、音效偏好、语言与设置持久保存、16 张头像、新牌手、加注/跟注/弃牌结算、完整复盘、重打和真实后台取消。声音与振动为实际安装包的调用证据，实体听感、震感另验。
- 两轮使用同一 QA APK，包名为 `io.github.jessiezjz.noirpoker.qa`；共享源码摘要均为 `56b8e0addaf606957d9f91b2dc0eb0bbd87c2d07e316c2e6ee8ca78caf3f5d69`。

## 对照工具修正

第 17 项的 5 人桌结算对照发现：牌桌、操作区和玩家区域的高度几乎相同，但所有垂直位置统一错开约 2.2857px。原工具按距页面底部的距离恢复滚动，下方内容的累计取整差异被带到了所有测量区域。

现在记录实际 `scrollX`、`scrollY`，参考页面使用同一文档原点。保留距底部距离用于诊断。组件仍逐项要求不超过 2px，画面误差仍要求不超过 0.02；没有从测量结果中扣除一个推测偏移。

分数显示密度的真实 Chromium 回归复现了旧的超过 2px 的错位，确认同一滚动坐标下位置恢复一致，同时真实增加 4px 的组件高度仍可检出。缺失、非法滚动观察不会悄悄按底部对齐。4 项专项及全量 784 项单元回归、生产 Web/微信构建通过，见 `android-origin-followup-check.log`。

安装后的 5 人桌复验中，牌桌和操作区顶部偏差为 0，公共牌约 0.004px，画面误差约 0.00635。剩余人数、次级页面、明细与记录返回的最终逐项结果保存于 `review-parity-native-android-host-final-four/report.json`；原始失败报告和截图保留。

## 网站一致性

Sites 源码提交 `111e202d91522f185d8e41e44b0ee923b24a5b9e` 与上述 GitHub 主分支的文件树完全一致，合并了既有 Sites 历史。已核对 60 个线上静态文件；两个 HTML 页面仅移除已识别的托管层 Cloudflare 注入后比较，其余资源逐字节核对。报告见 `sites-release60-http-verification.json`。实际生产页面的桌面、手机流程另保留独立浏览器报告，不以资源核对替代交互验证。
