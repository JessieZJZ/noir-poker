# 2026-10-14 待生效盲注与金额显示验证

本记录固定于 PR44 合入前的 `6205e128` 源码与安装包。后续策略及复盘合入的 Web 验证见 [PR44 整合记录](pr44-integration-validation-2026-10-14.md)；下方原生与微信结果不代表后续合并源码已经重验。

所有端的“牌桌与声音”新增起始盲注入口。默认 100/200、20K；点击小盲输入完整数字，只接受 25 的正整数倍且最多 50K，非法输入显示红色提示且不改变已保存配置。合法输入自动派生两倍大盲、100 BB 筹码，并展示“下一手起始盲注xx/xx·筹码恢复为xx，统计重新开始”。

当前手保持原配置。连续重打恢复原手牌、原尺度并撤回该手结算一次，同时保留新设置；下一手才应用新尺度，恢复所有人的起始筹码、清空整场统计并取消旧手异步工作。改回当前尺度会取消待生效重置。刷新按保存尺度开始新练习。

牌桌、动态记录、复盘、统计及设置提示中的筹码与盲注金额统一使用 K/M，包括紧贴“至”的 `加注至1200`、`全下至18800`，显示为 `加注至1.2K`、`全下至18.8K`。1000 起用 K，1000000 起用 M；保留整数筹码精度。年份、手数和百分比不转换，金额编辑框使用完整数字。

本分支包含首次尺度、52px PC 操作按钮和用户提供的薄荷黑桃图标改动，直接提议合入 main；尚未合并或发布。

## 源码与安装包

最终实际安装包由干净的源码提交 `6205e1289f9e273eb515f7bcb82db8b5e5acd558` 编译，包含指南两段金额及十个译文的修正。共享生产源码指纹为：

`8d7f2fa5322b5f83163200e2c1b1e2cdacc6f87597de142a22b59dc7f2bef53e`

后续仅更新验证文档，不改变安装包的生产源码。

Xcode Simulator `.app` 与 Gradle Debug APK 分别编译通过；同步副本与实际产物均验证了 19 个本地图像资源，包括 16 个原有人物头像及新的应用图像。图像摘要为：

`c4650a6e2f0f0b56deba68496b3d4bac5dced1cfa026ef9b92c1f594cb55e28a`

最终微信包摘要为 `795b4b276bae5ad0129ab87ae322afdd78f3651f03a3c931bd2b284f0c1bee00`，大小 1573052 字节。完整运行、Web 对照和盲注回归使用这一相同包。

## 验证结果

| 验证                | 结果                                                                            | 证据                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 单元与构建          | 498 个单元测试通过；Web 与微信构建通过                                          | `.artifacts/pending-blinds-guide-final-check-retry.log`                                                                           |
| Web E2E             | 最终源码完整运行 375 个场景通过，1 个桌面专用场景在移动项目跳过                 | `.artifacts/pending-blinds-final-web.log`                                                                                         |
| 新功能重点 Web 回归 | 之前的补充回归：17 通过、1 个桌面专用场景跳过                                   | `.artifacts/pending-blinds-focused-web-retry.log`                                                                                 |
| 国际化              | 11 个语言、1292 条文案、213 条结构化研究及 60 个资料标签检查通过                | `.artifacts/pending-blinds-guide-i18n.log`                                                                                        |
| 格式                | 完整格式检查通过                                                                | `.artifacts/pending-blinds-guide-format.log`                                                                                      |
| 原生编译            | 最终源码 iOS Xcode Simulator 与 Android Gradle Debug APK 编译及包内资源校验通过 | `.artifacts/pending-blinds-guide-ios-build.log`、`.artifacts/pending-blinds-guide-android-build.log`                              |
| 原生同步            | mobile:sync、mobile:verify 通过                                                 | `.artifacts/pending-blinds-guide-mobile-sync.log`、`.artifacts/pending-blinds-guide-mobile-verify.log`                            |
| iOS 安装运行        | 最终包在专用 iPhone 17 / iOS 27 Simulator 完整运行 17 项全部通过                | `.artifacts/pending-blinds/native-ios-complete/report.json`                                                                       |
| Android 安装运行    | 最终包在专用 Pixel 9 / Android 36 模拟器完整运行 17 项全部通过                  | `.artifacts/pending-blinds/native-android-complete/report.json`                                                                   |
| 微信资源与编译      | 最终源码资源校验及官方 WXML/WXSS 编译器 9 文件检查通过                          | `.artifacts/pending-blinds-guide-wechat-verify.log`、`.artifacts/pending-blinds-guide-wechat-check.log`                           |
| 微信 DevTools       | 最终版本 35 页面及 35 组同牌局 Web 布局对照通过；运行异常 0                     | `.artifacts/pending-blinds/wechat-final-runtime/report.json`、`.artifacts/pending-blinds/wechat-final-runtime/web-reference.json` |
| 微信盲注运行        | 最终版本 8 项检查通过；运行异常 0；当前牌局和保存设置恢复 100/200、20K          | `.artifacts/pending-blinds/wechat-final-stakes/report.json`                                                                       |

新增指南金额回归复用 11 个语言的桌面与移动旅程，22 项全部通过；日志为 `.artifacts/pending-blinds-guide-web-retry.log`。首轮新增断言误选了两个详情摘要，唯一定位最小加注节后重跑通过，原测试错误日志保留。

规则边界覆盖默认配置、25/75、500/1000 和 50K/100K，验证下注面额、短全下、加注重开、退款、奇数分池、筹码守恒与整场重置。设置回归覆盖 0、负数、小数、非 25 倍数、K/M、指数写法、上限边界、保存、取消待生效配置、连续重打和下一手重置。

## 首次失败与复跑

指南修正前的首批包来自 `ca500049`，共享指纹为 `12022cc45faa9a78f14e78b4774fe6087ec56436cf3009a3cc2624fff0a1b061`。该批 iOS 完整 17 项通过，Android 相同 APK 的 14 + 1 + 2 项分别通过；汇总为 `.artifacts/pending-blinds/android-baseline-aggregate.json`，未将局部报告冒充一次完整通过。最终指南包的两端完整 17 项运行已另行通过，表格列出最终报告。

首批完整 Web 两个旧可读性用例失败时，开发服务经历了源码更新；稳定源码下串行复跑两项均通过，没有修改产品逻辑。首轮轨迹保留在 `.artifacts/pending-blinds-web-initial-failures/`。

iOS 首轮新场景使用了不能等待 Promise 的同步 WebView 执行方式。改为异步探针与轮询读取真正的 Capacitor Preferences 后，完整 17 项通过。Android 首轮在真实点击耗时接近截止时丢弃了已经完成的状态；修正为操作后读取真实完成状态，仍保留原截止时间。第二轮前 14 项通过，包括本次新增的完整换盲场景。

Android 第二轮后台检查同样在真实跟注后没有读取新状态。失败截图已显示机器人正在思考；测试却返回空值并超时。修正等待函数为操作后读取真实的待行动对手，保留原 15 秒期限及实际前后台断言。新增单元回归模拟最后一次轮询中的慢点击；测试专用场景筛选明确记录跳过项，默认完整套件不变。

Android 局部补验的后台检查通过后，QEMU 模拟器进程退出，设备从 ADB 消失；Mac 崩溃记录为 SIGSEGV，故障线程处于 QEMU HangDetector。驱动在截图后无法恢复 WebView 上下文，页面对照因此中断。该记录保留在 `native-android-final/`（含 `emulator-crash.ips`）；没有将其视为产品 WebView 崩溃。仅重新启动本次专用 AVD，GPU 从 swiftshader 改为 host，其余启动参数和 APK 不变，另存补验报告。host 冷启动补验同样发生 QEMU HangDetector 崩溃，报告保留在 `native-android-host-retry/`，没有扩大时限或隐藏失败。获得用户许可后，仅关闭已确认的其他三台模拟器释放资源，再以同一 host 参数和 APK 补验剩余两项。上述现象不证明 GPU 或资源占用是崩溃根因，也不证明长期稳定性。

指南首轮单元检查发现日文新文案的“横”不在本地字体子集中；改用同义的“表示される”说明按钮上显示的金额，保留事实金额。字形覆盖、498 项单元检查和最终 11 语言浏览器旅程均通过。初次日志为 `.artifacts/pending-blinds-guide-final-check.log`，最终通过日志另存。

微信首轮设置页的原生按钮默认宽度使辅助说明多出一行，Web 对照超出既有 3px 容差。限制微信小盲编辑控件为 82px 后，完整 35 组重新通过，容差没有扩大。

各轮初次报告、失败截图及日志分别保留在 `.artifacts/pending-blinds/native-ios/`、`native-android/`、`native-android-retry/`、`wechat-runtime/`、`wechat-stakes-runtime/`，最终报告另存目录，没有覆盖失败证据。

## 运行证据边界

原生新场景安装并运行真正的包，使用 WebView 内的可见输入框、实际 input 事件及按钮点击，读取真正的原生 Preferences；完成重打原牌、保留待生效设置、下一手 100 BB 恢复和统计清零。输入通过输入框原生 setter 与事件驱动，未验证实体键盘／输入法逐键输入。Android 模拟器的原始全屏 PNG 已查看，图标、数字、牌桌与操作区没有花屏。

微信 DevTools Stable 2.02.2608080 使用 iPhone 12/13 (Pro) 模拟器。最终完整矩阵保留 100% 倍率原始 PNG（780×1688，逻辑 390×844，密度 2），35 组 Web 对照沿用实际微信牌局和既有 3px 容差。实际设置控件与控制器完成输入红色提示、保存、重打原尺度、下一手应用、守恒和旧异步工作取消。验收后恢复自适应 93% 显示比例和默认牌局设置。

微信振动和外部导航接口使用模拟，音效只验证实际 Page 播放请求；原生反馈回归检查实际桥接请求。上述结果不等于实体手机的听感、震感、微信真机运行或外部网页加载验收。DevTools 的弃用、预加载及较大复盘数据传输警告仍存在，运行异常为 0 不代表没有工具警告。

本记录是本地编译、浏览器、安装的模拟器／仿真器 App 及微信 DevTools 证据。没有将这些结果当作 GitHub CI、实体手机、商店签名或发布通过。

## 远程 CI

提交 `6205e128` 的 [GitHub Actions 运行](https://github.com/JessieZJZ/noir-poker/actions/runs/38527034110) 中，七个任务均标记失败，但 `steps` 为空且 `runner_id` 为 0，未得到代码检查或编译运行的结果。可用接口没有提供失败注释；本地验收通过不代表这次远程 CI 通过。
