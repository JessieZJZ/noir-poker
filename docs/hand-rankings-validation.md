# 牌力表与手机音乐回归报告（2026-10-17）

操作提示行右侧新增“牌力表”，覆盖 Web、iOS、Android 和微信。点击打开现有指南，将牌型排序、比较说明和九组示例定位到固定标题下方；重复打开重新定位，普通指南入口仍从开头打开。Web/App 的 11 种语言均已覆盖。

手机 App、触摸浏览器和微信改用同源增强音乐母带；桌面文件和播放增益保持原样。平均响度由 −18.97 提升至 −13.67 LUFS（+5.30 dB），解码 RMS 提高约 5.21 dB，峰值 −6.94 dBTP。曲目、节奏和约 93.659 秒循环不变。微信在动作音效期间将音乐临时降到 0.5，650 ms 后恢复；静音、后台和释放会取消计时及迟到回调。

手机常见的单声道合并也已检查：200–5000 Hz 频段能量损失约 0.09 dB，没有明显的左右声道抵消。证据为 `mobile-music-mono-compatibility.json`。

## 源码与产物

- 分支：`codex/hand-rankings-shortcut`；PR [#58](https://github.com/JessieZJZ/noir-poker/pull/58)，目标 `main`。包含尚未合入的 PR #55/#56 依赖；未合并 GitHub main。
- 音乐调整前的 v2 安装包编译自干净提交 `8293c35ff6ee8bef1234f6a53bfe16b9a9de5c77`，共享源码摘要为 `7824e69a9133122d18abc3d9b4ec65dad1f2405067e494cc118cb8030bdd96e5`。
- 增强音乐 v3 安装包编译自干净提交 `5c3633d8b1731fa11bfb1024008128705ef1ef22`，共享源码摘要为 `f9c98688ad1adff3b5b3914052b7ca5b2ce1f0b7f6bc6f2f953ce8034d5f0ae7`。此后仅修正测试及文档，运行源码摘要不变。
- v3 产物：`.artifacts/hand-rankings/App-v3.app`、`.artifacts/hand-rankings/noir-poker-debug-v3.apk`。APK SHA-256：`0cbb1c02c1e5cb8943dcc885bdd19f0753f197d14cb9c764f52537b19b7475c7`。
- Xcode / Gradle 均实际编译成功；两端最后统一 `mobile:sync`、`mobile:verify` 通过，20 个本地图像、16 个头像及 2 个 AAC 文件保留。安装包验证与浏览器检查分别记录。
- 手机音乐 1,570,495 字节，SHA-256 为 `411fea885fc40696dfa6202c6c04e12da523c6bdbe9f063a565e71d7b6cbf58d`；桌面音乐仍为 `566a6c8d8d16e72be394fee5202573ad36a48af5f46446c856b42f9dba9ecd18`。
- 当前微信包摘要：`60ba798752fa341735f9dace8086583fdc12ce00bb78b9af5debc893bf0b83fd`。微信仅打包增强音乐一份，分包预算通过。

本机证据根目录为 `.artifacts/hand-rankings/`，下文路径均相对于该目录。报告保留失败、重查、中止说明、设备原图和 native XML。

## 单元、Web 与资源检查

| 检查                      | 实际结果                                                                                   | 证据                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| 最终 `npm run check`      | 824/824 单元通过，Web / 微信构建成功                                                       | `check-delivery-final.log`                                                                                   |
| Web 整体基线              | 532 项中首次 529 通过、1 条件跳过、2 失败；两项定向复查通过，531 个可执行用例均有通过证据  | `web-final.log`、`web-final-results/`                                                                        |
| 最终音频及入口专项        | 20/20；含触摸浏览器选择增强母带、解码响度、峰值、循环、开关、后台恢复、11 种语言与指南定位 | `mobile-music-web.log`                                                                                       |
| 原指南动画 / 窄屏语言复查 | 4/4、2/2；保留原断言                                                                       | `guide-motion-recheck.log`、`narrow-i18n-recheck.log`                                                        |
| 本地化                    | 11 种语言、1520 条文案通过                                                                 | `i18n-check.log`                                                                                             |
| 微信源文件及模板编译      | 源码、资源验证通过；官方 WXML/WXSS 编译器 16 个文件通过                                    | `wechat-verify-mobile-music.log`、`wechat-check-mobile-music.log`                                            |
| 原生同步与编译            | Xcode / Gradle 通过，两端副本及本地资源核验通过                                            | `ios-build-mobile-music.log`、`android-build-mobile-music.log`、`mobile-sync-v3.log`、`mobile-verify-v3.log` |
| 响度与混音                | 手机 RMS +5.21 dB，0 个饱和采样；微信单音效叠加峰值上界约 0.924；App 限幅专项通过          | `mobile-music-measurements.json`、`mobile-music-web.log`                                                     |
| 格式                      | 最终全量通过                                                                               | `format-delivery-final.log`                                                                                  |

Web 整体结果来自全量加定向复查，不能表述为一次无中断全绿。唯一跳过项是手机项目不适用的桌面操作区对齐检查。增强母带之后仅执行受影响音频与入口专项；其他界面运行源码未变化。

最终单元检查前曾有一项原生点击驱动回归失败：弹窗关闭后的滚动恢复发生在首次位置采样之前，驱动可能接受稳定但偏离中心的位置。已修正首次采样重新居中，并把测试恢复时序改为确定触发；专项 16/16 和最终全量 824/824 通过。音乐循环探针另有 3 项检查，确认必须实际观察尾段和回环，暂停或未完成的 seek 不能制造通过。

## 微信 DevTools

使用 canonical checkout 的 `.artifacts/wechat`，关闭目标工程并清编译缓存后重载；未手改生成目录，也未关闭其他工程。

| 运行         | 实际结果                                                                                         | 证据                                       |
| ------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| 整体基线     | 36 个页面/状态通过；含 5–9 人桌、设置、真实牌局、复盘、重试、反馈和入口                          | `wechat-full/report.json`                  |
| 复盘布局基线 | 8 组组合通过                                                                                     | `wechat-review-layout/report.json`         |
| 最终增强音乐 | 6/6；真实本地 AAC 解码、循环、筹码音效期间压低及恢复、独立开关、生命周期处理、设置持久化，无异常 | `wechat-mobile-music-final/report.json`    |
| 最终入口     | 两次真实点击均定位，9 组示例存在；目标未被 66px 标题遮挡，普通指南 scrollTop=0                   | `wechat-mobile-music-shortcut/report.json` |

新增音频探针首次出现重复变量解析错误及对音效期间正常压低状态的错误断言，已修正并保留早期日志；最终六项为同一次完整通过。DevTools 的真实解码与生命周期处理不代替实体微信客户端听感或电机震动验收。

## 安装版原生

使用独立的 iOS Simulator 和 Android Emulator，真实安装产物并保持音频启用，未向生产包注入发牌/复盘 fixture。未连接实体手机。

| 范围             | 实际结果                                                                                                                              | 证据                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| iOS 整体基线     | 25 个场景有通过证据；32 个页面对照，其中 12 个含绘制网格比较，最大平均通道误差约 0.0178，阈值 0.02                                    | `ios-full-final/report.json`、`ios-review-remainder/report.json`、`ios-guide-painted-final/report.json`     |
| iOS 增强音乐     | 4/4；真实播放与筹码音效、循环与独立开关、后台恢复及持久化、牌力表、指南固定标题                                                       | `ios-mobile-music/report.json`                                                                              |
| Android 增强音乐 | 4 个不同场景均有通过证据；指南定位及滚动后的设备原图已检查                                                                            | `android-mobile-music/report.json`、`android-mobile-music-remainder/report.json`                            |
| Android 整体     | 25 个不同场景有通过证据：旧母带界面基线 14 项 + 增强母带其余 11 项；32 个页面对照、12 个绘制网格比较，最大误差约 0.01095（阈值 0.02） | `android-host-full/`、`android-foreground-remainder/`、`android-final-ui-remainder/`、`android-final-five/` |

iOS 整体是首次前 18 项加修正后 9 项的去重覆盖，不能表述为一次无中断全绿。Android 的旧母带与增强母带分别记录摘要；`native-baseline-and-mobile-music-coverage.json` 保存每个场景、产物和绘制对照的来源。两个版本间运行源码差异仅为六个音频相关路径，聚合脚本会验证此范围，不能将跨版本覆盖说成最终源码的一次全量运行。

本轮原生驱动修正和保留的失败：

- iOS 页尾按钮使用稳定测量后的真实屏幕触摸；指南截图等待真实合成帧，保留早期帧，未放宽绘制阈值。
- Android 前后台切换有过短暂 WebView 调试连接丢失。恢复最多一次激活重试，必须验证原页面标记；重载、重启、持续断流仍失败。原进程在失败时仍存活，未将其报告为 App 崩溃。
- Android 增强音乐循环首次查询已读到回环后第 3.725 秒，错过旧检查的“前三秒”窗口。新探针记录真实媒体事件，实测先到 93.458542 秒，再回到 0；不依赖驱动恰好在短窗口轮询。
- 默认桌未修改时，Web 和原生 Preferences 两处均为 null 属正常状态。盲注场景已接受相等的未保存默认值，仍要求非法输入不保存、合法输入真实保存、重打撤回统计及下一手筹码守恒。
- 待行动后台检查曾因切换调试上下文过慢，进入后台时已轮到玩家而失败。现在先准备页面标记，向明确选定的本机设备发送 HOME，再由 Appium 验证后台；未改变游戏计时或断言。实测原生后台 6103 ms，暂停时对手 Mia 待行动，返回前台状态未变且之后继续行动。路由与页面保护专项 13/13 通过；外部 Appium、不明确设备、非法端口和原生操作错误不会触发猜测或伪造事件。
- 原复盘布局场景结束时提前发下一手，影响紧接的结算复盘；已改为保留结算手并断言 phase=done。

## 已发布网站与边界

生产网站第 67 版：[NOIR Poker](https://noir-poker-practice.daring-oak-8798.chatgpt.site)。源提交为 `80869240b08b8fb40bcfca021e3ff38cdbebc69f`，运行源码摘要与 v3 相同；后续改动只有测试和文档。

65 个静态资源逐字节一致，包括两份 AAC；两个 HTML 的源内容未改变，仅增加托管平台的 Cloudflare 脚本。线上真实点击牌力表后目标位于固定标题下方约 12px，九组示例存在，桌面播放原音量文件。见 `production/publication-verification.json`、`production/guide-report.json`、`production/hand-rankings.png`；首次 HTTP 超时及未归一化 HTML 的字节差异记录也保留。

GitHub Actions 的本轮运行 [39035344109](https://github.com/JessieZJZ/noir-poker/actions/runs/39035344109) 返回失败，7 个 job 没有可读步骤，日志接口返回 BlobNotFound / 404；未确认平台侧原因，不将本机验证表述为远程 CI 通过。

实体手机在一般嘈杂环境、半音量下的实际听感尚未实测；App 和小程序需更新安装包/资源后生效。本轮没有应用商店、正式签名包或正式微信版本上传验收。
