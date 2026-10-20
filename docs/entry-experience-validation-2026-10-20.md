# 入座体验验收记录

日期：2026-10-20。行为说明见[入座体验](entry-experience.md)。本轮包括待入座牌桌、进入时音乐渐入、设置入口和轮播、小文案对齐、收起空操作区，以及真实下一局／手编号。

## 版本与范围

修改保留在本对话的 `codex/approved-video-chip-sound` 分支及 PR #64。没有合并到 main。

canonical 目录同时存在其他未提交工作。验收版本固定在 `.artifacts/entry-experience/verification-source/`，由当前分支和本次修改生成，不创建另一个功能分支，不覆盖其他工作。参与原生源码摘要的 196 个文件与提交内容逐项对照。最终源码证明位于 `.artifacts/entry-experience/fixed-version-source-proof.json`。

- 最终原生源码摘要：`c1743895e4cf45eab9640d351498e9420ef750d1a90323e5f43ba23229a4b0e1`。
- 最终微信源码摘要：`3c2bcafdb540f7325c2857e55ad797c8fc1922b5b14bb7d805611d171fad3703`。
- 原生本地资源摘要：`fb410fb9e11c14fd38fca586cb09cd3cd96c522db9a4152218db598820ad1c10`，20 张本地图片，其中 16 张风格头像，2 份背景音乐。

## Web 与单元回归

- 最终专项 24 项全部通过，桌面与手机各 12 项。覆盖 5–9 人待入座、筹码守恒、不创建空记录、只入座一次、发牌展示期间禁止行动、前后台取消与恢复、续局与待生效设置、真实本地音频播放和渐入，以及全部 11 种语言在 320／390 px 触摸视口下的等待页。另覆盖横屏恢复、公共牌区域和复盘滚动提示的复测。
- 全量浏览器尝试保留：288 通过、3 失败、2 中断、277 未运行。高负载下结束大范围运行后进行了上述串行复测。原先 3 个失败项全部纳入最终 24 项；其中俄语顶部新增设置文字导致 5 px 溢出是实际问题，已修复并新增多语言窄屏回归。不能把合计覆盖称为一次完整全绿运行。
- 固定版本的 `npm run check` 单元部分运行 855 项：854 通过，1 项微信监听构建等待超时。该项原断言不变，单独复跑通过。之后独立执行 Web／微信生产构建成功。原始 `check` 运行仍记录为失败，不能改称一次完整通过。
- 最终 `format:check`、`i18n:check` 通过；11 种语言、1329 条源文案及占位符校验通过。

证据均在 `.artifacts/entry-experience/`：

- `web-header-final.log`、`web-header-final-results/`：最终 24 项。
- `web-fixed-version.log`、`web-fixed-version-results/`：大范围尝试及原始失败轨迹。
- `check-fixed-final.log`、`watch-final-retry.log`：完整单元尝试及唯一失败项的复跑。
- `build-header-final.log`、`format-header-final.log`、`i18n-header-final.log`：最终构建、格式及语言检查。

## 微信小程序

原生模板和样式使用官方 glass-easel 编译器检查，17 个文件通过；源码／生成物校验通过。真实 DevTools 专项使用固定版本生成的工程及独立自动化端口，清除该工程编译缓存后加载，保留、恢复测试前的设置和对局记录。

专项检查真实 `InnerAudioContext` 在首次点击前的播放进度和渐入音量、紧凑设置入口、点击入座后的发牌、前后台处理器恢复位置、续局编号及全部 5–9 人等待牌桌。报告、截图和最终生成物指纹保存在 `wechat-header-runtime/`；先前两轮 5 项通过报告亦保留在 `wechat-fixed-runtime/` 和 `wechat-runtime-delivery/`。

末次只调整顶部偏移后，`wechat-header-runtime/` 连接超时。生成结束后重新打开该工程再试，系统工具确认 Mac 已锁屏，必须手动解锁，末轮运行尚未通过。不得将先前 5 项通过算作此次末轮通过；重试报告目录为 `wechat-header-final-runtime/`。

生命周期部分调用真实 App 处理器，不能代替实体微信客户端切后台或实体手机扬声器听感。没有执行正式上传。

## iOS 与 Android

最终 Xcode 和 Gradle 编译成功，`mobile:sync`、`mobile:verify` 通过。实际 App／APK 内源码摘要与最终固定版本一致，本地图片与音乐资源完整。

本轮安装运行未取得完整通过：

- iOS 一轮已到达真实待入座页面，验证了触摸前音乐播放、设置尺寸、空操作区、真实点击入座、发牌完成和音乐连续；该轮随后因新增测试在原生上下文读取 WebView 而失败，已改为记录真实前后台事件边界。后续复跑遇到模拟器关闭过渡、WDA 启动和首屏等待阻塞，未取得修正后完整运行通过。没有把此前其他功能的 iOS 通过数计入本次。
- Android 第一次安装运行被 Pixel Launcher 无响应弹窗阻断，保留原始截图。只重启本次专用 AVD，并将资源降低为 2 核／2 GB，保持音频开启；复跑仍在原生首屏 AccessibilityNodeInfo／WebView 附着阶段超时。没有隐藏系统弹窗或把编译结果算作运行通过。
- 当时本机负载多次超过 500，保留全部失败证据并结束本次拥有的模拟器和原生自动化服务。未关闭其他任务的设备或开发工具。末次桌面检查另确认 Mac 已锁屏，已经请求手动解锁。

日志：`ios-header-compile.log`、`android-header-final-compile.log`、`mobile-delivery-final-verify.log`。安装运行报告：`ios-fixed-runtime/`、`ios-entry-final-runtime/`、`android-runtime/`、`android-fixed-runtime/`。

最终窄屏修正后的原生安装运行仍未验收，PR 保持草稿。实体手机、签名分发及商店验收未执行。
