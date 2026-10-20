# 训练风格改版验收（2026-10-20）

将具名牌手展示替换为均衡及十六种以打法命名的训练风格。均衡保留文字头像，其余使用逐张生成的成熟插画。设置、指南、座位选择、对手复盘、隐私说明与十一个 Web/App 语言使用同一套名称和说明。运行资源移除真人照片、履历、赛事资料及来源链接，历史研究仅归档于开发文档。

策略参数、下注尺度与策略分支通过基线对照保持不变。旧设置与历史记录迁移到新标识，不修改牌、筹码或统计。合入了主分支 `1ba5fe3` 的行动提示间距和记录倒序修改。

## 验证结果

| 检查               | 结果与边界                                                                                                                                                                                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 单元、构建         | 合入后 `npm run check`：847 项单元检查全部通过，Web 与小程序产物生成成功。                                                                                                                                                                                             |
| 国际化、格式       | 1324 条消息、11 种语言覆盖检查通过，结构化风格介绍完整翻译。`npm run format:check` 与差异空白检查通过。                                                                                                                                                                |
| 完整浏览器检查     | 运行 544 项，531 通过、1 跳过、12 失败。失败包含旧姓名／旧图片路径／旧署名断言与两处资源争用超时，失败证据保留。更新断言后，合入主分支的 106 项针对性检查全部通过，覆盖全部失败项、记录、指南、所有风格及语言切换。                                                    |
| 主分支衔接         | 行动提示几何检查需要等待就绪与冻结时钟下的布局帧，修正了测试采样时机，保留主分支原有 CSS。18 个桌面／手机场景连续两轮共 36 项全部通过。                                                                                                                                |
| iOS 编译与资源     | Xcode 模拟器编译成功，最终 `.app` 中的十六张本地图像通过逐字节校验，已检查无旧真人头像残留。                                                                                                                                                                           |
| Android 编译与资源 | Gradle QA APK 编译成功，包内十六张本地图像通过逐字节校验，已检查无旧真人头像残留。                                                                                                                                                                                     |
| 资源同步           | 两端编译后重新执行 `mobile:sync` 与 `mobile:verify`，两端副本均为最新资源。                                                                                                                                                                                            |
| iOS 安装运行       | 专用 iOS 27.0 模拟器 `6AEC0834-D43D-438A-B86E-1B9CFEDB2364` 安装当前 `.app`，6 个场景通过、20 个未选场景明确跳过。覆盖免登录启动、混合风格与指南、语言和设置保存、全部 17 种风格介绍及头像、完整下注结算和决策复盘。                                                   |
| Android 安装运行   | 专用 AVD `Noir_Player_Research_E2E` 的 host GPU 启动超时，切换 swiftshader 后系统启动完成。首次运行被 Pixel Launcher 无响应弹窗阻断，确认并停止该测试设备的 Launcher 后复测，又被 System UI 无响应弹窗阻断。两次运行均按失败保留报告，未记为运行通过，已停止该模拟器。 |
| 微信编译与资源     | `wechat:verify` 通过，官方 glass-easel 对 16 个模板／样式文件编译通过。主包约 2005 KiB。                                                                                                                                                                               |
| 微信 DevTools      | 实际 DevTools 运行通过，保存 36 个页面状态／截图，检查全部 17 种风格，覆盖 5–9 人桌、设置、指南、摊牌、复盘、重打和声音／振动分离，运行异常为 0。振动是 mock 调用检查，不代表真机触感。                                                                                |

## 本机证据

`.artifacts/original-characters/` 保存本轮原始日志、报告与截图，不随发行包上传。

- `integrated-check.log`、`i18n-check-final.log`、`format-delivery.log`：合入后的检查。
- `web-stable.log`、`web-stable-results/`：完整浏览器检查及失败追踪。
- `integrated-web.log`、`integrated-web-results/`：106 项通过的复测。
- `attention-stable.log`、`attention-stable-results/`：36 项通过的提示布局检查。
- `ios-build.log`、`android-build.log`、`mobile-sync.log`、`mobile-verify.log`：原生编译和同步。
- `ios-runtime/report.json`：6 个通过的安装运行场景及截图。
- `android-runtime/report.json`、`android-runtime-recheck/report.json`：两次失败的系统弹窗、原始截图和 XML。
- `compiled-package-evidence.json`：APK、原生入口 SHA-256、包内头像目录及构建信息。
- `wechat-verify.log`、`wechat-check.log`、`wechat-runtime/report.json`：小程序静态与运行证据。
- `style-web-final.png`、`wechat-runtime/settings-profiles.png`：均衡文字头像及原创风格插画。

本轮原生构建的源码摘要为 `afb9827133d90c4c0e08aae4d6b5cb09f4d9c6bf4aeefdf5bb8030bb81f2d639`，原生安装包源码提交为 `e50fdd1`。小程序构建的源码摘要为 `da7f6fdc15e1f7910041524c3e3c7dadb097d09f31a3edc5138650311cbff458`。没有实体手机、TestFlight／Play 签名分发或正式微信上传验收。商业权利、语言人工审校和地区发行审批字段保持未批准，不将改名或声明视为零侵权风险的保证。
