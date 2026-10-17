# 启动、音乐、筹码声与复盘标签验收

本次改动在 `codex/startup-audio-review-polish`，GitHub PR #55 直接面向 `main`，包括未合并的原创音乐、组合声音开关和前一轮声音／机器人节奏依赖。没有合并 GitHub `main`。

## 最终行为

- 「夜色牌桌」仍为同一份原创乐谱与合成母带，播放增益由 0.8 提到 1，并重新处理 AAC 峰值余量；整曲输出比上一版增加约 2.36dB。
- 跟注、下注和加注共用原创的 340ms 摞筹码声：六次陶瓷筹码接触与桌布收尾，替换原有旋律提示。过牌、发牌、开局提示保持上轮 PCM。
- 对手复盘按当前列表从 1 连续编号，筛选后重新编号；原整手事件序号继续定位对局动态。摘要也保留直接听牌，避免有两头顺时仅写“高牌跟注”。
- Web/App 的启动占位独立于应用 CSS，子元素不能穿透隐藏状态；平台、语言和首手准备完成后一次显示牌桌。iOS 用同一份本地透明 PNG 衔接系统启动图与 WebView 就绪。
- 超过两张卡片仍露出第三张的一半，卡片保持等高；内部网格从顶部排布，标签不随同行长文案拉伸。待分析、部分完成、分析完成及对手名称换行时，上下 padding 均为 4px。

透明素材及完整生成提示见 [启动素材说明](launch-artwork.md)。四角透明，保留原玻璃圆角底板与黑桃；Android 系统蒙版使用安全区域内的独立透明图，iOS 与微信自身首屏沿用同一素材。

## 音频证据

AAC 为 1,162,422 字节、48kHz 立体声、约 93.659 秒，SHA-256：

`566a6c8d8d16e72be394fee5202573ad36a48af5f46446c856b42f9dba9ecd18`

测得约 −18.97 LUFS、−10.77 dBTP。筹码声共 14,994 个量化样本，RMS 约 0.21759，峰值约 0.69998；Web/App 输出限幅、AAC 实际解码和混音峰值回归继续通过。没有新增外部录音或采样。

## 验证层级

原始日志、报告、截图及录像位于 `.artifacts/startup-polish/`。最终应用共享源码摘要为 `0f5639307478eb2d31adda04743bdb87835137489a5eb404867bcd9afa750f06`；后续原生 Swift、测试与验收文档变化不进入该摘要，原生源码需另外核对。

| 层级             | 本轮证据                                                                                                                                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 单元与构建       | `check-delivery-final.log`：801/801，生产构建成功                                                                                                                                                               |
| 格式与翻译       | 格式检查通过；11 种语言、1519 条界面消息，结构化研究与占位符检查通过                                                                                                                                            |
| Web 全量         | `web-release.log`：512 通过、1 跳过，1 个发牌布局用例超时；该用例随后在串行专项中通过，未放宽断言或超时                                                                                                         |
| Web 修改后专项   | `web-tags-final.log` 的 26 个非标签用例通过，包含复盘布局、标题、启动和发牌；两处标签用例的换行夹具原先未提供长名称，修正夹具后 `web-tags-verified.log` 8/8 通过                                                |
| Web 标签截图     | `web-tags-screenshots.log`：390px 专项通过，保留待分析、部分完成、完成及对手换行四张原始截图；真实 Worker 计算，仅控制消息投递                                                                                  |
| 真实生产构建     | `production-tags-final/report.json`：390/1280 × 冷启动/刷新共 4 项通过；分别阻塞真实入口和 CSS，无生产 QA 接口                                                                                                  |
| 原生编译与资源   | Xcode `ios-cover-bridge-build.log`、Gradle `android-tags-build.log` 成功；`mobile-release-sync.log` 和 `mobile-release-verify.log` 一致，20 张本地图片、16 张头像和 1 条音乐                                    |
| iOS 安装运行     | `ios-verified/report.json`：最终启动和真实手牌复盘 2 项通过，其余 21 项未选择；此前 `ios/report.json` 的音乐、筹码、启动及复盘 3 项通过，之后音频源码与文件未改                                                 |
| Android 安装运行 | `android-verified/report.json` 的最终启动与音乐／筹码通过；`android-review-verified/report.json` 的最终复盘通过（其余 22 项未选择）。此前 `android-final/report.json` 的启动、音乐／筹码和真实手牌复盘 3 项通过 |
| 微信编译         | `wechat-tags-verify.log`、`wechat-tags-check.log`：源码、资源及官方 WXML/WXSS 编译通过                                                                                                                          |
| 微信实际运行     | `wechat-tags-layout-final/report.json`：8 组显示夹具通过，单行标签实测 24.5px；`wechat-final-music/report.json`：5 项播放、循环、设置与生命周期检查通过，之后仅调整标签布局                                     |

完整 Web 全量、串行复跑及新增专项是不同轮次，不能合并称为“一次全绿”。原生只覆盖所列专项，未选择项不计为通过；微信显示夹具与真实牌局／实体客户端分别报告。

最终 Android 组合轮次在音乐实下注后，上一手恰好结束，复盘准备的首个轮询读到 `done`，因此未进入行动而超时；该轮音乐与启动通过，但复盘失败仍保留。复盘等待器现在可选择通过正常“下一手”按钮推进一次，期限不变；新增单元回归覆盖这个衔接，安装版复盘单独复跑。它不改变生产思考时间或规则。

GitHub 源码提交 `8c15983` 的 Mobile build 工作流 `39019349865` 显示 7 个任务失败，没有步骤；尝试获取 quality 日志返回 404，具体原因未确认，不能计为远程 CI 通过。本地构建与安装证据单独成立。

## 原生启动迭代与产物

iOS 原始录像显示系统启动图结束到牌桌就绪间的纯背景空档。原生遮罩的早期版本因注册到被 Capacitor 替换的 content controller 而未移除，严格原生图片对照捕获了失败；保留 `ios-cover-final/` 和 `ios-release-final/`，不计为通过。最终在 `capacitorDidLoad` 接入实际 controller，弱引用消息接收器只接受本地 WebView 主文档的就绪通知，使用真实 URL 校验。最终冷启动录像为 `ios-final-cold-start.mp4`，就绪原图为 `ios-final-ready.png`，安装专项为 `ios-verified/`。

Android 最终启动录像为 `android-cold-start-final.mp4`，对应 `android-final-frames/frame-006.png`：圆角图标完整，没有矩形黑底或系统蒙版切角。较早的裁切录像保留，不用于最终结论。后续标签改动不改变启动资源。

- 最终 iOS `SceneDelegate.swift`：`eab6486defee7944fb30775116ccd343438bcf40e8655de5dd60ceacbf91c528`。
- 最终 iOS 模拟器可执行文件：`e3d64084115e2d8ee2ab6f5769adb061bca552cd579db51808bc768054275457`。
- Android debug APK：`f096af673a6996a2e2187fed34464fead283e1029977d7392e4fcbbfa69dcf1b`，文件 `.artifacts/mobile/noir-poker-debug.apk`。
- Android 原生 Java：`72a1748940fa7555af1a170f3eda2ede6f6102a5b57994801b4a244dba10adb6`，本次未改。

上述为安装模拟器／模拟设备证据。实体手机室外扬声器听感、实体震动、实体微信客户端和商店审核尚未验收；音量数值或播放状态不等于实际环境的听感。
