# 练习入口位置调整与验收

本次在同一分支 `codex/approved-video-chip-sound`、PR #64 继续修改。

底部移除「本地电脑对手 · 无需登录」说明及虚拟筹码短标签，将唯一的「重新练习」按钮放到「本局练习」标题右侧。Web 的空页脚不占高度，App 原有的关于与隐私入口仍可使用。按钮继续调用原有确认弹窗，取消保留当前练习，确认才重置。

顶部「玩法指南／对局记录」轮播入口改在左侧，「设置」在最右侧，源码中的顺序与视觉、键盘顺序一致。轮播保留，微信下拉菜单跟随左侧入口。已有的 11 种语言译文直接复用。

Web 与 App 使用同一个按钮样式，微信使用等宽的 70 × 44 px 按钮，避免小程序默认按钮宽度撑大标题行。

## 验证范围

canonical 同时有其他任务未提交修改。使用 `.artifacts/practice-reset/verification-source/` 隔离验证，不覆盖或提交其他任务的改动，也不新增功能分支。全部证据保存在 `.artifacts/practice-reset/`。源码对照见 `source-proof.json`：229 个参与构建／微信界面的文件和 196 个测试文件与提交内容一致。原生源码摘要为 `8c4333ef61f5db8abcd30cd009901168ca0a37d7af911ebf90f8a87d23e22688`，微信源码摘要为 `0d9595d0e1d5050d0f4b335f1befeb83f65bd8516f59c2c30727fc72f60d33d6`。微信实际工程的 116 个生成文件与默认构建结果相同，证明位于 `wechat-runtime-final-project/project-source-proof.json`。

- Web：`web.log` 和 `web-results/`，34 项全部通过。覆盖桌面／手机、5–9 人、待入座／进行中／结算、320–1700 px、11 种语言在 320／390 px 下的标题与按钮布局，以及轮播、键盘菜单、重打、取消与确认重置。原图已检查。
- 单元与生产构建：完整 `npm run check` 的末次单元阶段运行 857 项，855 通过，2 项时间相关用例失败（弹窗关闭后的点击等待、模拟器启动失败的测试子进程超时）。原断言不变，两个文件独立复跑 19 项全部通过，见 `check-delivery-final.log`、`timing-regressions-retry.log`。不能称为一次完整全绿。独立 `npm run build` 成功，见 `build-final.log`。此前新增原生场景使旧用例的总数断言需要从 27 更新为 28，微信结构断言也随模板格式调整，相关修正与失败日志均保留。
- 格式及国际化：`format-check.log`、`i18n-check.log` 通过。新增消息为零，1327 条仍在源码出现，原有 1329 条译文及全部 11 种语言保持有效。
- 微信：官方模板／样式编译 17 个文件通过。`wechat-runtime-final-project/report.json` 最终真实 DevTools 6 项全部通过，包含入座音乐与发牌、顶部顺序和下拉对齐、全部 5–9 人等待、实际按钮点击、取消与确认。原图发现按钮默认宽度偏大后增加模块样式限定，使用官方构建器生成新的 `.artifacts/wechat-practice-controls-final/` 工程，实际尺寸断言为 70 × 44 px，最终原图已复核。
- iOS：`ios-compile.log` 编译成功，`ios-runtime-final/report.json` 安装版专项 3 项通过、25 项明确跳过，覆盖入座／顶部顺序、练习标题按钮实际点击与取消／确认、无登录本地启动及 Web 牌桌对照。
- Android：`android-compile.log` QA 编译成功，`android-runtime-fresh/report.json` 最终安装版专项 3 项通过、25 项明确跳过，与 iOS 选择相同的入座、标题按钮及本地启动场景，最终原图已检查。
- 两端编译后的统一资源同步与核验通过，见 `mobile-sync.log`、`mobile-verify.log`。每个包含 20 张本地图片（16 张头像）和 2 份本地音乐，资源摘要为 `fb410fb9e11c14fd38fca586cb09cd3cd96c522db9a4152218db598820ad1c10`。

原生入座额外检查曾在歌曲从 88.45 秒自然循环至 5.75 秒时误报重新播放。测试现在观察同一个真实音频元素的 `timeupdate`，只接受进度增加，或有音轨末尾至开头的实际循环证据。没有跳过音频、改动播放器或放宽发牌断言。iOS 修正后复跑通过，报告见 `ios-runtime-final/`，先前失败保留在 `ios-runtime/`。

微信首次新按钮用例在第二次打开弹窗后过早读取确认按钮，已改为等待实际节点；之后一次连接超时、一次旧工程尺寸检查仍读到默认宽度，保留失败报告，只关闭本次测试工程并清理其编译缓存，最终使用新生成的独立工程复验。没有重启其他微信工程。

Android 原测试设备出现 QEMU 渲染线程挂起并退出。一次后续运行记录为设备不存在，未算作运行通过。关闭该专用设备后，保留原 AVD 数据，创建全新的 `Noir_Practice_Reset_20261020`（Android 35 Google APIs、Pixel 7、3 GB／2 核、swiftshader、关闭 Vulkan、音频开启），系统启动与 PackageManager 就绪后安装同一个 QA APK。运行与配置证据见 `android-fresh-emulator.log`、`android-runtime-fresh/`。

上述安装运行限于专用模拟器，微信限于真实 DevTools。实体手机、声音听感、商店发布及微信上传未执行。没有合并到 main。
