# 2026-10-13 对手混合打法验收

对应 `codex/deceptive-opponent-strategies`；以 main 为目标，包含尚未合入的 PR #38 共享复盘依赖。本次不改变发牌、下注合法性、结算或 25 面额规则。具体策略条件和合成参数见 [对手混合打法](opponent-deception.md)。

## 最终源码与资源

- 共享 App 源码指纹：`2238e48a1a79b385e24152d6142f1494c01b422cd2993e60df5a6a7847aab027`。最终 iOS/Android 安装报告都核对此值；构建在源码提交前进行，产物中的旧 `sourceCommit`/dirty 元数据不代表验收了旧代码，以实际源码指纹核对。
- 微信源码指纹：`0b6e19ef6012c90135c7f3870f391c858fbb6c9c30c3ef7699eedb24ef552eeb`，官方 DevTools 的九种复盘记录与此生成工程一致。
- 本地图片指纹：`694f35d82b03e2942bcc27c6674a65ce83e1477ae57bc1d9e3f800125b13252b`；两端编译产物各保留 17 张图片和 16 张牌手头像。新增解释所需字体已补齐。

## 通过项

所有本机证据路径以当前项目根目录的 `.artifacts/deception/` 为前缀；这些生成文件未提交 Git。

| 检查                         | 结果                                                                                                    | 本机证据                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `npm run check`              | 454 单元通过，Web 与微信构建通过                                                                        | `check-delivery.log`                                      |
| `format:check`、`i18n:check` | 通过；1275 条展示文案，11 语言，213 条结构化研究与 60 条原型文案仍完整                                  | `format-delivery.log`、`i18n-final.log`                   |
| 完整 Web E2E                 | 首轮 328/338；10 项 WebKit 被禁止访问 4190 端口，换到 4187 串行后 10/10 通过。全部 338 个不同用例已覆盖 | `web-accepted.log`、`webkit-retry.log`                    |
| 新增复盘 UI                  | 桌面／390px 手机下九种输出，所有语言即时切换，保持牌局数据；全部相关用例包含在上述完整集内              | `web-visual/`，完整集中的 `review-coaching.spec.js`       |
| Xcode / Gradle 编译          | 两端 Debug 编译成功，图片核验通过                                                                       | `ios-build-accepted.log`、`android-build-accepted.log`    |
| 最新副本同步与核验           | `mobile:sync` / `mobile:verify` 通过                                                                    | `mobile-sync-delivery.log`、`mobile-verify-delivery.log`  |
| 安装后 iOS                   | 3 项通过：免登录本地启动、真实加注／跟注／弃牌与结算、逐步与对手复盘                                    | `ios-runtime/report.json`，同目录原图                     |
| 安装后 Android               | 同样 3 项交互通过；视觉问题见下方                                                                       | `android-original-config/report.json`，同目录原图         |
| 微信生成与编译               | `wechat:verify`、官方 WXML/WXSS 编译检查通过                                                            | `wechat-verify-delivery.log`、`wechat-check-delivery.log` |
| 微信官方 DevTools            | 9 项通过，0 异常；读取实际渲染文字并滚动截图，埋牌／脏牌／donk／2–7 解释与共享输出一致                  | `wechat-rendered/report.json`，同目录四张原图             |

九种夹具是共享策略的确定性输出，分别覆盖翻前平跟埋牌、翻后过牌埋牌、低价平跟埋牌、脏牌开池、脏牌再加注、听牌 donk、价值 donk、2–7 开池和后街试探。外部夹具不等于随机真实牌局，也未打包到生产或原生应用。原生两端使用真实随机牌局，本轮 `observedDeceptiveMotives` 均为空，因此不声称原生现场已触发全部罕见分支；这些分支的直接显示覆盖由 Web、微信及共享单元提供。

## Android 环境与视觉限制

本机专用 AVD 为 `Noir_UI_Followup_1687`、serial `emulator-5582`，全程保留声音、禁用快照，未操作其他设备或重置整个 AVD。

- `-gpu host -feature -Vulkan` 启动后 ADB shell/安装无响应；保留 `android-emulator.log` 与 `android-runtime/report.json`，未计通过。
- `-gpu swiftshader -feature -Vulkan` 能安装，但两次被 **Appium Settings isn't responding** 系统弹窗阻断。失败截图和 `android-software/`、`android-settings-retry/` 报告保留；没有放宽系统错误断言。
- 恢复此前有效的 `-gpu swiftshader -crash-report-mode never -no-snapshot` 原始配置、保持默认 Vulkan 特征后，三项实际交互完整通过；启动日志为 `android-proven-emulator.log`。
- 软件 GPU 下牌桌原图仍有明显重复、分块和错位：`android-original-config/parity-table-native.png`。复盘弹窗原图可读，但牌桌未通过完整视觉验收，不能把几何／交互通过当作视觉通过。本次未修复该渲染问题。

仅覆盖本机 iOS Simulator、Android Emulator 和微信 DevTools；未执行实体设备或商店发布验收。翻译通过占位符、牌面／金额和运行时检查，独立母语审校仍待完成。
