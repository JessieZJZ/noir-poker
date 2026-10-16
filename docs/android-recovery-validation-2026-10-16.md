# 2026-10-16 Android 安装回归与滚动对照

PR #50 已合入 `main` 的 `9d41d3155f0a5bbed6d3788644a4232cfc1d6625`，Sites 版本 60 发布成功。本次后续修改修正原生测试的参考页面滚动坐标，并明确隐私页标题的上下间距，避免新旧浏览器默认样式不同。没有放宽组件或画面的验收要求，也没有修改游戏、机器人或复盘的分析预算。

## 已确认的安装证据

- 专用 API 36 arm64 模拟器使用无窗口 host GPU、隔离 ADB、无快照冷启动、关闭 guest Vulkan，保留音频配置。版本、参数、Java 与 APK 摘要见 `.artifacts/android-recovery-working-environment.json`。这个可用组合不等于证明了此前设备失联的精确驱动根因。
- `review-parity-native-android-host-full/report.json` 的前七项通过；第八项因旧整轮 20 秒预算失败。按照游戏现有思考上限和人数修正测试等待后，`review-parity-native-android-host-remaining/report.json` 覆盖通过第 8–16 项，并复验第 5 项。没有将筛选跳过的条目计为通过。
- 上述实际运行覆盖首启、盲注、牌点重绘、方向、多人桌、震动桥接、行动提醒、音效偏好、语言与设置持久保存、16 张头像、新牌手、加注/跟注/弃牌结算、完整复盘、重打和真实后台取消。声音与振动为实际安装包的调用证据，实体听感、震感另验。
- 两轮使用同一 QA APK，包名为 `io.github.jessiezjz.noirpoker.qa`；共享源码摘要均为 `56b8e0addaf606957d9f91b2dc0eb0bbd87c2d07e316c2e6ee8ca78caf3f5d69`。

## 对照工具修正

第 17 项的 5 人桌结算对照发现：牌桌、操作区和玩家区域的高度几乎相同，但所有垂直位置统一错开约 2.2857px。原工具按距页面底部的距离恢复滚动，下方内容的累计取整差异被带到了所有测量区域。

现在记录实际 `scrollX`、`scrollY`，参考页面使用同一文档原点。保留距底部距离用于诊断。组件仍逐项要求不超过 2px，画面误差仍要求不超过 0.02；没有从测量结果中扣除一个推测偏移。

分数显示密度的真实 Chromium 回归复现了旧的超过 2px 的错位，确认同一滚动坐标下位置恢复一致，同时真实增加 4px 的组件高度仍可检出。缺失、非法滚动观察不会悄悄按底部对齐。4 项专项包含在全量 784 项单元回归中；单元回归、生产 Web/微信构建通过，见 `android-privacy-heading-check.log`。

安装后的 5 人桌复验中，牌桌和操作区顶部偏差为 0，公共牌约 0.004px，画面误差约 0.00635。`review-parity-native-android-host-final-four/report.json` 覆盖通过所有 5–9 人桌及其设置、结算和复盘对照；下一项次级页面检查在隐私页发现真实的标题间距差异。原始失败报告和截图保留。

## 隐私页的浏览器默认间距

Android 实际安装包中的 WebView 为 Chrome 133.0.6943.137。隐私页原先只指定标题字号，旧 WebView 对 `article h1` 使用 0.83em 的上下间距，新 Chromium 使用 0.67em，28px 标题因此多出约 8.96px 总间距。实测旧包标题上下各 23.24px；单独明确为 0.67em 后各为 18.76px，主体高度差由约 9.74px 降至约 0.78px。诊断见 `android-privacy-margin-diagnosis.json`；诊断中的临时覆盖已撤销，正式修改写入隐私页生成器并重新生成、编译和安装。

Web 的 36 项桌面/手机专项覆盖全部 11 种语言，并用低优先级样式层重现旧默认值，确认作者样式保持同样间距，见 `android-privacy-heading-web.log`。浏览器默认值变化的背景见 [MDN 的 h1 样式说明](https://developer.mozilla.org/en-US/blog/h1-element-styles/)。

新旧 APK 的公开资源逐文件比较中，只有隐私页和构建元数据发生变化；游戏与复盘 Web 代码保持一致。APK、资源、DEX 的原始比较结果保留于 `android-privacy-heading-apk-equivalence.json`，不将整包摘要或编译产物差异混同为业务源码差异。

## 网站一致性

Sites 源码提交 `111e202d91522f185d8e41e44b0ee923b24a5b9e` 与上述 GitHub 主分支的文件树完全一致，合并了既有 Sites 历史。已核对 60 个线上静态文件；两个 HTML 页面仅移除已识别的托管层 Cloudflare 注入后比较，其余资源逐字节核对。报告见 `sites-release60-http-verification.json`。实际生产页面的桌面、手机流程另保留独立浏览器报告，不以资源核对替代交互验证。
