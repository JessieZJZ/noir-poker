# CI 排错与近期运行记录

当前 PR 分支 `codex/ci-reliability-main` 基于远端 `main@ba2e658`，保留已合并 #27 的牌手资料、译文、Android 系统栏检查、独立 iOS 首启、端口隔离和设备就绪逻辑；本次差异仅包含 CI、复盘优化及相关回归与文档。下面的 `43b3814` / `4c9f977` 验收属于原隔离分支的历史记录，不能作为新 main 组合的通过结论。

准备 PR 期间 main 从 `c4f1ed7` 推进到 `ba2e658`，旧 main 组合 `8cfca31` 的结果单独保存在 `.artifacts/ci-pr-validation/`：单元 347/347、全量 Web 223/224，移动牌手详情交互在 30 秒全局期限内超时，失败轨迹显示标题读取约 23 秒且尚未进入候选模拟；同一代码独立桌面/移动复测 2/2，不能据此宣布全量通过。该旧组合实际 Xcode/Gradle APK/AAB 编译通过，iOS 安装后 6/6；未继续进行已过期基线的 Android 安装验收。首次语言检查的两个占位编号已由最新 main 的完整译文同步解决，CI 分支不再重复修改这些语言文件。新组合报告使用独立目录，设置重启使用 WDA，首启保留 main 的预先安装启动方式。

第一轮调查基于本地 `codex/settlement-caption-polish` 的 `966397b3ab63bfc4598c316217449c19b2a951ef`，包含 #22–#25 布局栈及已提交的结算文案改进。原目录中牌手研究等未提交修改未带入 CI worktree。后续 CI 分支已整合到原分支最新的 `43b3814d69b528ddabeed52c22ff245552e0cbb2`；第一轮 CI 提交 `5e2c54c` 保存在 `codex/ci-reliability-before-integration` 快照分支，整合仅发生在 `/tmp/noir-poker-ci-reliability`。

## 账户阻塞与执行失败

2026-10-11 核对 GitHub API：#18、#20–#25 的最新运行均为四个 job 失败且 steps 为空，其余浏览器 job 跳过。[#25 run 38116805444](https://github.com/JessieZJZ/noir-poker/actions/runs/38116805444) 的官方 annotation 明确指出最近账户付款失败或需要增加支出上限，runner 没有启动。没有读取账单详情，不能判断具体是哪一种。macOS arm64 容量 notice 是另一条提示，不能替代这个明确原因。

| PR  | 最新检查的 run                                                                  | 证据与分类                                         |
| --- | ------------------------------------------------------------------------------- | -------------------------------------------------- |
| #18 | [38068101097](https://github.com/JessieZJZ/noir-poker/actions/runs/38068101097) | 四个 job 无执行步骤；旧运行另有真实 iOS 复盘失败   |
| #19 | [38063869604](https://github.com/JessieZJZ/noir-poker/actions/runs/38063869604) | 布局 49 通过、5 失败；微信、Android、iOS job 成功  |
| #20 | [38069338309](https://github.com/JessieZJZ/noir-poker/actions/runs/38069338309) | 四个 job 无执行步骤                                |
| #21 | [38068131810](https://github.com/JessieZJZ/noir-poker/actions/runs/38068131810) | 四个 job 无执行步骤                                |
| #22 | [38082351860](https://github.com/JessieZJZ/noir-poker/actions/runs/38082351860) | 四个 job 无执行步骤                                |
| #23 | [38083436665](https://github.com/JessieZJZ/noir-poker/actions/runs/38083436665) | 四个 job 无执行步骤                                |
| #24 | [38086367706](https://github.com/JessieZJZ/noir-poker/actions/runs/38086367706) | 四个 job 无执行步骤                                |
| #25 | [38116805444](https://github.com/JessieZJZ/noir-poker/actions/runs/38116805444) | 无执行步骤，官方 annotation 确认账户付款或上限阻塞 |

空 steps 本身不能证明每个 run 都是同一账单原因；它能证明这些 run 没有提供新的代码失败证据。后续 PR 的本地报告也不能替代远程 CI 通过。

## 历史问题在当前基线中的状态

- [#19 布局 job](https://github.com/JessieZJZ/noir-poker/actions/runs/38063869604/job/114247455561) 报告 seat 3 遮挡公共牌或底池、座位相互重叠和结算亮牌等待失败。当前已有 `src/ui/settlement-layout.js` 的实际足迹碰撞避让、`src/ui/table-controller.js` 的亮牌空间预留，以及确定性布局 fixtures；本次保留这些实现，执行现有布局与全量浏览器回归，不继续叠加未经复现的布局修补。
- [#18 旧 iOS job](https://github.com/JessieZJZ/noir-poker/actions/runs/38065501945/job/114252192301) 实际编译和前三场景成功，第四场景在 30 秒内未生成复盘总览和建议。`85b85e96` 曾加入弃牌后安全提前结束模拟及公开进度诊断，但它们均不在当前 `966397b3` 的相关文件中。本次恢复这两项及其边界回归，继续要求完整复盘在原期限内生成。
- #25 的本地记录包含 iPad 首次 WebView 连接超时、重启后同包通过。这是首启稳定性风险；不能用重跑成功证明首启已稳定。本次补齐预检失败报告、失败阶段、模拟器选择与清理，保留现有连接要求和运行覆盖。
- #26 `ef757601` 是从 `be852e8` 分出的首屏修复线，未包含 #22–#25。收尾时原工作区已由另一条工作线推进到 `main` 的 `c4f1ed7`，合并了 #22 和 #26；它与本次验证基线并不等价。CI 分支保留 `43b3814` 的完整布局栈及已有首屏回归，没有把 #26 的整份旧页面覆盖进来，也没有合并新的 main。本报告不能作为 `c4f1ed7` 的验收结果。

第一轮全量浏览器诊断确认了 `966397b3` 基线中的以下问题；这些失败不能当作后续整合版本的结果：

- `play-viewport.spec.js` 的大平板英雄牌型间距要求至少 5px，960×1440 实测仅 3.8125px。`src/styles/play-viewport.css` 的英雄牌型槽、字号和身份行需一起调整，并保持发牌到结算的位置稳定。
- `readability-hints.spec.js` 的 320×900 九人桌要求公共牌至少 31px、手牌至少 44px；实测 30.11px / 41.74px。768×1024 九人桌玩家框 110.78px、姓名 13.43px，低于 118px / 14px。当前两行行动槽与更大的底牌预留增加了 `play-viewport.js` 的最小可容纳高度，整桌缩放侵蚀了已有可读性要求。应优化预留和碰撞布局，保留实际缩放后尺寸断言。
- 五人桌旧用例在 `readability-hints.spec.js` 要求亮牌完全位于玩家框上方；最新结算设计和原生场景已改为收在玩家框后方，露出可读点数与花色。应将旧断言与 `settlement-polish.spec.js` 及 `tests/native/scenarios.mjs` 的可见比例、花色可读性检查一致化，保留覆盖。
- 部分等待 `document.fonts.ready` 的 beforeEach 和点击步骤在本机繁忙时超时，不能与上面的稳定尺寸差异混同。本次保留失败轨迹；可选远程字体依赖应在单独测试中控制，避免把网络等待混入布局验收。

第一轮 CI 修复没有调整这些 UI 断言，也没有增加全局重试；保留当时结算改动，并将这些复现证据交给后续布局修复。

调查期间另一条工作线已在原分支提交 `ea889fe` 至 `43b3814`，调整上述可读性布局、亮牌断言和结算等待。这五项提交现已完整进入本 CI 分支，相关 UI 文件保持与 `43b3814` 一致，没有重复修改。后续验证以最终组合为准。

## 本次工作流与测试保障

`quality` 独立执行格式、语言资源、全量单元及生产构建。`table-geometry` 与桌面/移动 `browser-ui` 并行，使用互补筛选覆盖全部浏览器测试；任何一组失败都不会隐藏另一组的结果。微信与两端原生编译、完整安装后场景仍在每次 PR / main push / 手动运行中执行。

原生包在编译和图片验证成功后、Appium 准备与安装测试前上传。原生 E2E 的失败报告保留已完成和失败场景，预检与设备失败也进入报告。quality/微信为 15 分钟，布局/浏览器为 20 分钟，Android 为 60 分钟，iOS 为 45 分钟；原生运行步骤分别为 25/20 分钟。正常通过仍由完整断言决定，超时、诊断或可下载安装包都不代表通过。

本地恢复过程中发现，Appium 会话创建失败后，分离启动的 WDA `xcodebuild` 可能在 Appium 退出后继续存活并启动模拟器。清理现按本脚本启动的 Appium PID 捕获子进程树，在退出前终止这些子进程；回归同时验证另一测试服务保持存活。外部 Appium 服务不由脚本清理。

Android 截图复核又发现系统 UI 的 ANR 弹窗：WebView 内断言仍能继续，旧安装报告显示 7/7，但设备截图中应用已被系统弹窗覆盖，因此该批结果不作为运行通过。现每张 Android 设备截图同时保留原生层级并检查系统 ANR/崩溃控件；发现弹窗就失败，既不自动关闭弹窗，也不以 WebView 通过替代。`sys.boot_completed=1` 只能证明启动标记，不能单独证明系统 UI 可用。旧截图和报告仍保留在 `integrated-native-android/`。

iOS 最终复测在首屏连接前报应用未运行，但专用设备日志显示 App 从旧 PID 重启到新 PID，并在失败期间持续响应 XCTest 主循环请求，没有对应崩溃报告。WDA 的 `testedApplication.state` 仍可保留旧进程状态；脚本当时绕过 WDA 使用 `simctl terminate/launch`。现初始重启与设置持久化重启统一使用 WDA 的 terminate/activate 接口，让驱动同步新应用状态，保留原有首屏、WebView 和复盘期限。失败报告、Appium 与系统日志均保留。

提示时钟测试在重载前暂停，另用延迟加载入口覆盖导航超过旧固定暂停目标的情况。Playwright 可用 `NOIR_E2E_PORT` 隔离 worktree，拒绝复用已有端口服务，避免验证其他检出的代码。

## 第一轮本地验证及边界

验证证据保存在隔离 worktree 的 `.artifacts/ci-validation/`，不提交生成产物或安装工具。

- `npm run check`：349/349 单元通过，生产 Web 构建与共享微信构建成功。最初沙箱运行因文件监听限制触发一次 `EMFILE`；获准在正常环境复测后通过。
- `npm run format:check` 与 `npm run i18n:check` 通过，语言清单为 1049 条消息、11 个语言。
- 本次提示时钟修复及已有首屏回归共 16 个桌面/移动用例通过。全量 Web 诊断主动停止时为 91 通过、9 失败、2 中断、146 未运行；上节列出基线布局与等待问题。不能报告全量 E2E 通过。
- `mobile:sync`、`mobile:verify`、微信资源校验与官方 WXML/WXSS 编译器检查通过；全量单元包含微信 adapter 回归。没有使用微信 DevTools 或微信设备验收。
- Xcode iOS Simulator 编译和 Android Gradle debug APK 编译实际成功，两个包各通过 9 张本地图片、8 张头像校验。未运行 AAB 编译或商店发行。
- iOS 安装 E2E 在 `install-launch` 阶段失败，场景数为零；Appium 日志显示模拟器后来启动，但 WebDriverAgent 的 8100 端口持续拒绝连接，最终会话请求失败。Android 专用新 AVD 未进入可用设备状态，停止后未运行安装 E2E。两端均不能计为原生运行通过；没有复用另一任务的设备。

## 整合后的完整 Web 验证

`43b3814` 与 CI 修复的组合执行完整桌面、移动 Web 回归：248/248 通过，桌面和移动各 124 个，零重试。证据为 `.artifacts/ci-validation/integrated-web.log` 和 `integrated-web-results/`；第一轮失败证据仍单独保留。

原生恢复使用本次专用 iOS 模拟器和 Android AVD。清理第一轮 WDA 残留后，iOS 启动检查成功；WDA 在本 worktree 的独立 DerivedData 目录编译成功。Android 改用已安装 Hypervisor.Framework 与主机图形，启动标记 `sys.boot_completed=1`。这些是测试环境准备结果，应用安装运行的验收另行记录。

## 最终组合的验收与收尾

最终代码提交为 `4c9f977f48c6b7efb3c2bafce46819b04ce5318f`，分支 `codex/ci-reliability`，基础 UI 为 `43b3814`。随后只补充本文档。全量 Web 执行于组合提交 `5be0d72`；从该提交到最终代码提交，`src/`、`public/`、`index.html`、Vite/Playwright 配置、Web E2E 和依赖文件均没有变化，后续变更集中在原生测试脚本、单元回归和文档。

| 验证                     | 最终结果                                                           | `.artifacts/ci-validation/` 中的证据                                     |
| ------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| 单元与生产构建           | `npm run check` 355/355；Web 与共享微信构建成功                    | `final-check.log`                                                        |
| 完整 Web E2E             | 桌面 124/124、移动 124/124，共 248/248；零重试                     | `integrated-web.log`、`integrated-web-results/`                          |
| 格式与语言资源           | 通过；1049 条消息、11 个语言                                       | `final-format-check.log`、`final-i18n-check.log`                         |
| 原生源码复制校验         | `mobile:sync`、`mobile:verify` 通过                                | `final-mobile-sync.log`、`final-mobile-verify.log`                       |
| 微信资源和官方编译器检查 | `wechat:verify`、`wechat:check` 通过；adapter 回归包含于单元套件   | `final-wechat-verify.log`、`final-wechat-check.log`                      |
| 实际 iOS 编译            | Xcode 27 的 Simulator 编译成功                                     | `final-ios-build.log`                                                    |
| 实际 Android 编译        | Gradle debug APK 和未签名 AAB 成功；各验证 9 张本地图片、8 张头像  | `final-android-build.log`、`final-aab-build.log`、`final-aab-verify.log` |
| iOS 安装后运行           | iPhone 17 / iOS 27.0，完整 7/7 场景；复盘分析 2491ms               | `final-native-ios/report.json`、日志及 11 张 PNG                         |
| Android 安装后运行       | 专用 Android 16 / API 36 ARM64 AVD，完整 7/7 场景；复盘分析 2520ms | `final-native-android/report.json`、日志、11 张 PNG 和 11 份原生 XML     |

两端最终安装报告都记录 `sourceCommit=4c9f977…`、`sourceDirty=false`，源码摘要相同，且本地图片完整。Android 的每张最终截图都通过系统 ANR/崩溃控件检查。先前 `integrated-native-android/` 的 7/7 原始报告因截图存在系统 UI ANR 而无效，保留但不计入通过；`guarded-native-ios/` 的首屏失败也单独保留。没有修改旧报告来掩盖失败。

本机使用 Node 26、Xcode 27、Android ARM64；CI 配置的 Node 22、macOS 26 和 Android x86_64 runner 尚未验证。最终 iOS 运行使用本 worktree 已实际编译的官方 WDA，设置独立端口和 `usePrebuiltWDA=true`；不能据此宣布 GitHub 冷启动 WDA 已通过。微信结果限于构建、官方编译器和 adapter，没有微信 DevTools、微信设备或手机真机验收。没有商店签名或发行。

收尾仅核对本任务拥有的资源：`Noir CI Reliability` 模拟器（`2F6E1FE2-E1D4-41ED-A36F-39D383065C0A`）已为 `Shutdown`；专用 Android `emulator-5570` 已不存在，专用 AVD、Appium 和 WDA 测试进程已退出。其他任务的模拟器保持原状。工具断开后没有为清理重启设备，因此没有新的 Android 最后 ANR/飞行模式读数；最终报告、11 份原生 XML 与清理日志均保留。没有重新执行已经完成的测试。

汇总见 `.artifacts/ci-validation/summary.json`，第一轮汇总另存 `summary-first-round.json`。生成报告、截图、构建产物与测试工具只保留在此 worktree，没有加入 Git。本次只有本地提交，没有推送、创建 PR、合并或重跑远程 CI。

## 邮件、恢复与可选费用控制

工作流监听所有 PR、main push 和手动触发；#22→#23→#24→#25 各有独立 PR ref。现有 concurrency 只取消同一 ref 上的旧运行，不会合并这些不同 PR，也不会撤回已经产生的失败通知。更新多个 PR 或合并到 main 因此会产生多次运行和通知。

账户持有人需自行在 GitHub 的 Billing and licensing 检查付款状态与 Actions 预算/支出限制。代码修复不能解除账户阻塞；本次未修改账户设置，也未重跑旧远程 CI。解除后应验证准备合并的最终提交，分别检查质量、全部浏览器、微信、原生编译与安装后报告。

本次仅用显式超时和 7 天原生产物保留控制浪费，没有降低原生运行频率或减少场景。进一步选项是只对部分 PR 运行昂贵原生套件、人工标签触发或集中整合验证，但它们会降低逐个 PR 的运行证据，需用户决定。账户通知偏好能降低邮件数量，不能修复失败。

参考：[GitHub 工作流语法](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)。
