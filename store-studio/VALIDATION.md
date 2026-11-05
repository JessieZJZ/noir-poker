# PR #70 素材与体验验收记录

日期：2026-11-06。产品源码依据 PR #70 的 `38337032eacf30eae24fdeb00da07451b1e7a099`，该 PR 在最终核对时仍为 OPEN。本工程和文档不修改应用 `src/`、规则、原生配置或生成的 Web 副本。

## 已完成的检查

- `npm run check`：1,772 个单元测试通过，0 失败；Web 与微信构建完成。
- `npm run format:check`：通过。
- `npm run mobile:sync`、`npm run mobile:verify`：通过，安装包保留本地图像、字体和音频。
- Xcode Simulator Debug 编译：成功；Gradle Android Debug APK 编译：成功。编译与运行分别记录。
- Remotion 工程 TypeScript 与 ESLint：通过。导出文件的尺寸、色彩通道、视频编码、时长、音轨、完整解码和 SHA-256 由 `verify-kit.mjs` 校验，实际结果随交付包的 `verification.json` 保存。
- 交付源文件包解压后独立执行 `npm ci`、`npx tsc --noEmit` 和 `Feature-ZH` 渲染成功，不借用原工程 node_modules。
- 全部成片与图片技术校验共 72 项通过；本地审阅页 56 个资源链接返回成功。
- 双语截图的六项体验、三种设备版式和五段视频关键帧已肉眼查看。旁白来自系统合成语音；自然度与品牌语气仍可在有旁白版和音乐版之间审阅选择。

## 实际运行与录制

Web 使用正常开发模式体验入座、设置、教程与计算器。iPhone 和 iPad 使用真实安装的本地 Simulator `.app`；Android 使用真实安装的本地 Debug APK。构建均指向上述 PR #70 源码，源码摘要为 `0f9bef5f215513aea71fd5e2ff59ee3fbf27a5c5e6022817a3f28f4ad348d91d`。

原生采集验证正常入座和结算、打开复盘及切换决策、原牌重打的底牌一致性、教程起始步骤与合法行动、通过可见选牌器输入计算器并得到胜率与 Outs、设置与训练风格。教程录制只演示开头步骤，不表示本次重新完成了全部四手教学和自由练习的全量验收。iPad 采集双语静态页面；视频分别使用 iPhone 与 Android 来源。

录制未注入牌局或测试 fixture。读取公开 App 状态来等待界面；操作使用实际控件。Android 最终采用 Playwright AndroidWebView 附着原生 APK，图像和视频来自设备 OS 的 screencap / screenrecord，不是桌面浏览器模拟手机。该入口不获取原生可访问性树；系统弹窗与显示质量另外肉眼检查。它不替代全套 Appium 原生 E2E、后台恢复和生命周期测试。

最终媒体来源：

- iPhone：`raw/ios`；英文计算器和双语复盘详细页补录自 `raw/ios-clean-repair`，逐文件映射保存在 `edit-provenance.json`。
- iPad：`raw/ipad-verified`。
- Android：`raw/android-webview-final`。APK SHA-256 为 `853f60f1d9d0434233657e8002d0735d76cc7ec77aab3609f6aebf88a2866aac`。

初期原生采集遇到启动超时、重复选牌的采集脚本问题、Emulator / Launcher ANR 和 Appium WebView 上下文重连阻塞。失败报告独立保留；后续成功采集不会把这些失败改写成通过。没有操作用户其他模拟器，没有使用实体设备或签名发行包。

## Web E2E 的实际边界

完整 `npm run test:e2e` 本轮运行 34.2 分钟后为释放机器资源主动中断：516 通过、10 失败、2 中断、518 未执行。不能报告全套通过。

针对 10 个失败的 desktop 用例，以独立端口和一个 worker 复跑：9 通过、1 失败。剩余项是 `tests/e2e/hint-banner.spec.js:94`，其第 127 行要求提示条紧随盲注且位于牌桌上方；当前界面提示条位于牌桌下部，此位置断言重复失败。应明确确认当前设计并同步布局或断言。本次没有为得到绿色测试而修改产品代码或放宽断言，也没有重新执行尚未运行的 518 项。

## 上架前仍需处理

1. 英文界面辅助文案仍有生硬译文，如 “Board has not yet been issued.”、记录中的 “The second 1 Start the house.”，以及句间缺空格。素材保持真实界面；商店介绍文案已单独润色。这是语言体验问题，不是据此认定的扑克规则错误。
2. 处理上述提示条布局回归并完成全套 Web / 已安装原生 App 验收。此次核心功能录制不是全套原生回归。
3. `mobile/store-readiness.json` 的公开隐私政策 URL 仍为空，人物素材/地区/真机等就绪标志也未改写为通过；正式发布按既有发行流程完成。
4. Google 视频需上传至自己的 YouTube 后填写 URL。价格、销售地区、评级、隐私及数据安全问卷未代填；尚未提交任何商店后台。
5. 当前提供英文和简体中文商店素材，应用支持 11 种界面语言不表示其余 9 种商店文案或母语审阅已完成。

本地技术校验、模拟器录制、签名真机验证、远端 CI 和商店审核分别验收。可编辑源文件、原始采集证据、失败诊断与最终成片一并交付；发布凭据和签名材料不包含在内。
