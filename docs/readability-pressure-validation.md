# 2026-10-13 可读性、抗压与跨端反馈验证

介绍卡片顶部对齐，座位头像跨风格与筹码两行，公共牌放大。混合阵容记录自动分配座位，取消时只撤回这些分配；手动选择保留。指南新增九种牌型的五张牌示例及 HJ、CO 等位置解释，Web/App 覆盖全部 11 种语言。

标准与进阶对手按价格保留小尺度 3-bet 防守，覆盖均衡、所有职业原型及轻微情绪；大尺度、短后手、全下、4-bet 和弱牌仍经过过滤。这是本地启发式模拟，不能据此宣称跟注盈利或 GTO 最优。边界回归与既有 25 面额、筹码守恒检查均通过。

小程序的筹码、发牌、快速发完、亮牌及音效时序对齐 Web；详情引用内联，滑杆拖动只更新金额文本，放手提交值。Web/App 与小程序共享确定性 PCM，六种 WAV 按采样核验相等；弃牌、下注音量相对旧 Web 增大约 5.1、4.1dB。当前回合提醒按决策去重，后台不派发。

| 验证                               | 本轮结果                                   | 证据                                                                              |
| ---------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------- |
| 单元测试及生产构建                 | 454 项通过，Web/小程序构建通过             | check.log                                                                         |
| Web 全量 E2E                       | 336 项通过                                 | web-final-e2e-2.log                                                               |
| 格式、翻译、小程序资源和官方编译器 | 通过；1305 条文案、11 个语言；9 个编译文件 | format-final.log、i18n-final.log、wechat-verify-final.log、wechat-check-final.log |
| iOS Xcode 编译与安装运行           | 14 项通过、32 对同内容 Web 截图            | ios-build.log、ios/report.json                                                    |
| Android Gradle 编译与安装运行      | 14 项通过、32 对同内容 Web 截图            | android-build-final.log、android/report.json                                      |
| 微信 DevTools 运行与 Web 重放      | 35 页通过、35 对截图通过、无异常           | wechat/report.json、wechat/web-reference.json                                     |
| 原生资源同步与核验                 | 通过；每端 17 张图片、含 16 张头像         | mobile-sync-final.log、mobile-verify-final.log                                    |

本轮全部证据在忽略的 `.artifacts/readability-pressure/`。`comparison.html` 汇集 99 对截图及共享音效试听，`validation-manifest.json` 记录来源、数量、绘制测量和原生壳指纹。图片来自实际安装包或 DevTools，保留原图。

Web/App 打包源指纹为 `033fca429e6f8cfa9ef9f9f4bef7f9c9ef0ca38feee99c8f4ac851b1130c3842`，小程序源指纹为 `0f1d43dd05be8105a2752209b02b02ca30be0eb8955be078f3fb701272e9a50e`。iOS 运行包早于仅涉及小程序说明位置与测试的后续提交，但共享源指纹与当前代码一致；Android 额外的原生壳修改及最终 APK 单独记录在 `android-shell-build.json`。

## 绘制回归与失败记录

Android 默认及独立硬件绘制层在测试模拟器出现重复画面，坐标断言没有发现该问题。新增整页 RGB 网格检查捕获了差异：硬件层首屏平均差约 0.069，超过 0.02 阈值；软件层首屏约 0.006，通过。兼容处理仅对 `ranchu` / `goldfish` 虚拟硬件启用 WebView 软件层，实体手机保留默认硬件加速。最终安装回归在 Android 16、1080×2424、420dpi 的专用 `Noir_Readability_Feedback_E2E` 上执行，使用 SwiftShader、关闭 guest Vulkan 特性。失败证据在 `android-host-gpu/`、`android-before-software-layer/`、`android-hardware-layer/`，未覆盖为通过。

iOS 本轮保留的 12 对牌桌／结算截图另行通过同一绘制检查，平均差约 0.0038–0.0055，见 `ios/paint-verification.json`；该检查是在已有截图上补测，不冒充重新运行全部安装场景。Android 最终完整运行执行了该断言。iOS 曾有一次自动化重连停在空白页，独立冷启动正常，完整重跑通过；首次证据保留在 `ios-relaunch-first-attempt/`。

## 验证范围

iOS/Android 是实际安装的模拟器／仿真器测试；微信是实际 DevTools 自动化及独立的官方编译器检查。原生震动插件调用已完成，小程序在真实回合派发路径中通过 wx mock 检查；没有连接实体手机，不能据此保证真实听感、震感或动画性能。Safari 网页不支持 Navigator.vibrate，iOS App 使用原生 Haptics。参见 [MDN Navigator.vibrate](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate) 和 [Capacitor Haptics](https://capacitorjs.com/docs/apis/haptics)。

最后的 Web 应用代码在全量 E2E 后没有变化；之后修改了小程序两行行动说明下的牌型位置，以及测试和 Android 模拟器绘制兼容处理。原生编译、安装运行、资源核验和浏览器结果分别记录。
