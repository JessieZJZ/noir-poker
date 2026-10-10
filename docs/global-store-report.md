# NOIR Poker 全球上架指导报告

报告日期：2026-10-10。发行者：郑建宙；公开支持邮箱：958182284@qq.com。用户已确认 Apple Developer 会员注册完成。产品保持免登录、本地单机训练、虚拟筹码和商店买断制。

## 当前结论

工程准备不等于已经具备全球发行资格。发布国家／地区、应用支持语言、商店资料语言是三个独立配置。先完成签名包验收、译文审校、人物权利处理及商店申报，再开放满足条件的地区。不要以“全球”替代逐地区检查。

目标语言共 11 种：简体中文、英文、繁体中文（台湾用语）、日文、韩文、西班牙文、意大利文、葡萄牙文（通用初稿）、德文、法文、俄文。葡萄牙与巴西的地区用语、拉美西班牙语、香港繁体用语需要分别审校，不能把一个语言条目当成全部地区本地化验收。

发布信息与待完成状态在 `mobile/store-readiness.json`。会员注册是已完成项；支持页沿用公开 GitHub Issues，尚未部署含正式主体的长期有效公开隐私政策 URL，尚未确认语言审校、人物权利、地区准入及签名真机验收，因此发行预检必须保持失败状态。这种失败表示缺少发行证据，而不是应用无法运行。

## 国际化分支的历史验证

以下结果对应国际化分支 `27789fd`，保留为该版本的历史记录，不代表当前构建。该版本曾匿名替换人物展示；后续跨端工程已恢复与 Web 一致的姓名和本地头像，并增加安装实际 App 的端到端测试。当前验证入口见 [原生端到端验证](native-e2e.md) 和 [微信工程](wechat.md)。以下历史结果不包含商店签名包和真机验收。

| 检查                  | 已验证结果                                                                                                                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`       | 265 项单元测试通过，生产 Web 构建成功。                                                                                                                                           |
| `npm run i18n:check`  | 11 种语言、1053 条源文案，资源非空且动态占位符一致；不代表母语审校通过。                                                                                                          |
| 浏览器                | 国际化专项 26 项通过；完整桌面／手机矩阵 198 项通过；同步最新布局依赖后，头部、提示与首屏追加回归 30 项通过。                                                                     |
| 原生资源              | `mobile:sync` 和 `mobile:verify` 已通过。两端编译入口会分别重打包，完成两端编译后再次同步并验证，避免不同构建时间的资源副本被视为过期。                                           |
| iOS 实际编译          | Xcode 27 的 Debug 模拟器构建成功，产物 `.artifacts/mobile/ios/Build/Products/Debug-iphonesimulator/App.app`；没有执行正式签名 Archive 或上传。                                    |
| Android 实际编译      | JDK 21／SDK 36 的 Debug APK 构建成功，产物 `.artifacts/mobile/noir-poker-debug.apk`；没有生成本次正式签名发行 AAB。当前 Debug APK 未包含 `.so`，仍需复核最终发行包。              |
| 编译后的原生 Web 资源 | 在 Chromium 中阻断外部网络，11 种语言均能启动、显示 9 个不同原创策略原型；无真人资料入口及 `window.qa` 测试夹具。这是打包资源检查，不能替代 WKWebView／Android WebView 真机测试。 |
| `npm run store:check` | 按预期报告 5 个待完成项：公开政策 URL、母语审校、素材权利、地区准入、签名真机验收。没有将这些字段伪造为通过。                                                                     |

浏览器验收使用隔离源码快照，结束时对 `src/`、`scripts/`、`public/`、入口、构建配置和依赖清单进行逐文件比对，确认与拟提交源码一致。可复核记录保留在本地 `.artifacts/global-check.log`、`.artifacts/global-final-e2e.log`、`.artifacts/global-header-final.log`、`.artifacts/global-ios.log`、`.artifacts/global-android.log` 及 `.artifacts/mobile/native-locale-verification.json`；这些生成记录不进入 Git。当前版本为 1.0.0，构建号为 1；签名发行前仍需按商店上传记录递增。

## 国际化设计与验收

语言资源随 App 离线打包，不调用在线翻译服务。系统语言用于首次选择，用户选择覆盖系统设置；不支持的语言回退英文。设置同步到本机 Preferences。切换语言立即更新文案，设置页面保持打开；进行中的对局、手牌、筹码、人数、难度和对手设置保留。

本次在 UI 渲染边界处理文本、标题、无障碍标签及 HTML 文本节点；游戏规则、历史数据、复盘决策快照和 Worker 消息保持原表示。语言不会改变下注合法性、短全下重开、分池资格、25 面额、退还、结算或复盘依据。中文仍可随时选择。

翻译资源是工程初稿。长文采用离线 M2M100 机器翻译，繁体中文采用 OpenCC 台湾用语转换；英文核心术语、规则提示与高频标签另外整理覆盖。生成来源和需修复占位符的记录见 `src/i18n/translation-provenance.json`，临时模型与工具不进入发行包。覆盖率、非空值和浏览器验收能够发现遗漏、布局溢出及控制失效，不能证明各语言表达自然或扑克术语准确。发行前请具备扑克知识的母语审校人员逐语言检查：fold／check／call／raise-to、短全下与加注权重开、累计加注总额、底池与边池、权益与获胜比例、EV 与误差保护带、虚拟筹码声明、隐私政策。禁止把“抽样估计”译成保证盈利、精确 GTO 或真实胜率。

逐语言验收至少覆盖：首次系统语言选择、手动切换及重启保留；5／9 人桌；开池／跟注／过牌／全下；全下跟注及边池；多人平分；弃牌后补牌；复盘及对手解释；重打和下一手；设置与完整指南；原生关于／隐私。重点测 320／390 像素手机、横屏、iPad／Android 平板及 200% 字体；德文、法文、俄文长标签和日韩字体必须真机复核。仅对实际审校通过的语言设置 `linguisticReviewApproved`。

## 商业权利与产品边界

当前原生构建按产品要求保留与 Web 一致的具名风格、人物头像、来源署名和已有说明，全部图片离线随包提供；此前的自动匿名替换不再启用。规则和数值策略仍共用原引擎。图片完整性由源码清单、原生副本和实际 App/APK/AAB 的 SHA-256 校验保障；人物合规评估不在本次工程变更范围内。

本 App 只提供虚拟筹码单机练习；不销售筹码、不提现、不兑换奖金、不组织真人对赌、不接入赌场、不推广真钱赌博。保持这些边界。付费下载本身不是下注；若将来加入真钱、可兑换物品、比赛奖品、赌场广告或真实赌博辅助，需要重新评估产品和平台政策。参见 [Apple 审核规则](https://developer.apple.com/app-store/review/guidelines/) 与 [Google 赌博政策](https://support.google.com/googleplay/android-developer/answer/9877032/)。

## 年龄、目标人群与地区

这是模拟扑克赌博，应如实申报高频模拟赌博，不能按无赌博的教育工具填问卷。Apple 当前通用新评级中高频模拟赌博对应 18+；旧系统、韩国、澳大利亚等显示可能不同。Google 通过 IARC 问卷形成地区评级，同时准确申报 Target audience and content；不要面向儿童营销或选择儿童类别。最终以后台生成的评级与区域审核为准。[Apple 年龄评级](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions/)、[Google 内容评级](https://support.google.com/googleplay/android-developer/answer/9859655?hl=en)。

| 地区／市场     | 发布前动作                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 韩国           | Google 对包含赌博／赌场元素的游戏要求发布前取得 GRAC 评级证书；Apple 也可能要求地区评级及 RCN。未取得适用材料前不开放。                          |
| 中国大陆       | 核实游戏审批编号及相关主体／许可要求；付费游戏不能仅凭开发者会员上架。未完成适用审批前不开放。Google Play 的实际服务可用性也不能按其他地区推断。 |
| 欧盟           | 商业买断发行需准确判定 trader 身份并完成平台核验；Apple 会公开所需联系信息，不能以 GitHub 链接替代 trader 验证。                                 |
| 澳大利亚、巴西 | 使用平台生成的地区评级并检查是否收到本地评级／监管补件；不要把巴西真钱固定赔率牌照要求套用到本 App，也不要忽略模拟赌博评级。                     |
| 其他地区       | 检查商店可用性、游戏分类、当地限制、收款／制裁限制及支持能力；语言已翻译不表示地区已获准销售。                                                   |

俄罗斯及白俄罗斯目前不能通过 Google Play 下载付费应用及其更新，因此买断版不能承诺覆盖这两个市场；俄语界面可服务其他市场的俄语用户。提交前重新核对平台状态。[Google 付费应用限制](https://support.google.com/googleplay/android-developer/answer/11950272?hl=en)。

地区依据：[Google 特定国家／地区要求](https://support.google.com/googleplay/android-developer/answer/6223646?hl=en)、[Apple 中国大陆游戏要求](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information/)、[Apple 欧盟 DSA trader 要求](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements/)。具体许可适用性应由发行主体结合当地要求确认，不在报告中保证“所有国家可上架”。

## 隐私与支持资料

本机牌局和复盘不上传；设置留在设备；当前牌局在运行内存；无登录、广告、分析或跟踪 SDK。卸载／清除应用数据可移除设置，系统备份可能恢复。商店处理买断购买，开发者 App 不接收银行卡资料。用户主动发送支持邮件时，发行者会收到用户邮箱和用户提供的内容；仅为处理问题使用，不要求提交完整敏感牌局记录，问题处理后不再保留不必要的信息。

正式政策需同时覆盖发行者、邮箱、各类处理目的、数据留存和删除方式、第三方外链／邮件服务。无数据收集也需要政策和商店申报。Google 要求可公开访问、不受地理限制的 HTML 政策 URL；仓库文件及只在包内存在的说明不能代替这个 URL。发布公开政策后填入 `privacyPolicyUrl`，并核对商店资料中的主体一致。[Google User Data](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en)、[Apple App Privacy](https://developer.apple.com/app-store/app-privacy-details/)。

“Data Not Collected／不收集数据”应基于最终发行包、SDK、网络检查及平台定义确认，不把系统自身商店处理自动算成 App 上传，也不要漏报后续新 SDK。原生 Preferences 使用的 UserDefaults Required Reason API 声明当前为 CA92.1，提交前审查最终 Archive 中的隐私清单和第三方 SDK。[Apple 隐私清单](https://developer.apple.com/documentation/bundleresources/privacy_manifest_files)。无账号创建不需要凭空新增账号删除功能。

## Apple 上架操作

1. 已注册会员；在 App Store Connect 完成发行主体资料。买断需接受 Paid Apps Agreement，并完成银行和税务信息；会员本身不能替代付费协议。
2. 确认最终 `io.github.jessiezjz.noirpoker` Bundle ID、SKU、版本和递增构建号；正式发布后不能随意更换应用身份。配置 Team、证书／描述文件，签名材料留在密钥管理或 CI Secrets。
3. 使用完整 Xcode 26 或以上及适用 SDK。Apple 当前要求自 2026-04-28 起用 Xcode 26+ 和 iOS 26+ SDK 上传；这与最低支持 iOS 版本是两个概念。[提交要求](https://developer.apple.com/news/upcoming-requirements/)。
4. 按 `docs/mobile-release.md` 运行 `NOIR_APPLE_TEAM_ID=... npm run mobile:ios:archive`；Organizer Validate App、上传到 Connect，再通过 TestFlight 安装真实分发包。模拟器 `.app` 和浏览器通过不能替代 Archive、签名与真机。
5. 配置 11 种适用商店本地化资料、真实截图、App Privacy、年龄问卷、价格、发行地区、支持／隐私 URL、出口合规问卷。当前未增加自研加密，但必须依据实际 SDK 和网络能力回答；不要未经检查就写死 ITSAppUsesNonExemptEncryption。
6. Review Notes 使用下方说明，不提供不存在的登录账户；建议手动发布以便控制发布时间。先 TestFlight 再提交审核，获批后按地区计划开放。

## Google Play 上架操作

1. 创建／验证 Google Play 开发者账户、公开主体、联系信息及收款资料；当前仅确认 Apple 会员，Google 账号状态待用户完成。创建付费条目前确定买断模式，Google 免费应用以后改付费有限制。[价格规则](https://support.google.com/googleplay/android-developer/answer/9858738?hl=en)。
2. 使用 Play App Signing，安全备份 upload keystore。运行签名 `npm run mobile:android:bundle`，上传 AAB；Debug APK 或未签名 CI AAB 不能当成已完成发行签名。[签名](https://developer.android.com/studio/publish/app-signing)。
3. Android 工程目前 target／compile SDK 36；Google 当前要求自 2026-08-31 起新应用和更新面向 API 36 或以上，提交时按后台确认适用期限。还应检查所有 `.so` 和最终安装包对 16 KB 页大小的兼容性，不能仅从 target SDK 推断。[Target API](https://support.google.com/googleplay/android-developer/answer/11926878)、[16 KB 页大小](https://developer.android.com/guide/practices/page-sizes)。
4. 完成 Data safety、IARC 内容评级、目标受众、无广告声明、App access（全部可用，无登录）、隐私 URL、分类、联系邮箱、付费价格与国家／地区配置。
5. 若为 2023-11-13 之后创建的个人账号，当前申请生产权限前要求至少 12 名测试者连续参加封闭测试 14 天；以后台适用要求为准。先内部测试，再封闭测试、生产访问申请。[测试要求](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)。
6. 测试 Play 生成的真实安装包、升级、离线启动、返回键和后台恢复；分阶段发布并查看 Android vitals、崩溃／ANR。Console 提示的开发者身份／Android 包名验证也需完成。

## 商店材料与审核说明初稿

11 种语言的应用名称、副标题、短描述与完整描述初稿见 `mobile/store-listings.json`；提交前与界面译文一起审校，核对商店字符限制与截图。英文名称：NOIR Poker。Apple subtitle 初稿：Offline Hold'em Practice。Google short description 初稿：Offline Texas Hold'em practice with virtual chips and decision reviews.

英文描述初稿：

> Practice no-limit Texas Hold'em offline against computer opponents at 5–9 player tables. Choose difficulty and training styles, review decisions using information available before each action, and replay the original deal to compare your choices. All chips are virtual, have no cash value and cannot be redeemed. No account, ads or in-app purchases. Decision reviews use heuristic and simulation estimates; they do not guarantee optimal play or profit. One purchase provides the complete app.

审核说明初稿：

> This is an offline, single-player Texas Hold'em practice app. All opponents are computer-controlled. Chips are virtual, cannot be purchased or redeemed, and there are no cash prizes, real-money wagering or links promoting gambling services. All features are available after downloading the paid app; there is no login, subscription or in-app purchase. Open Settings to change the language, table size and difficulty. Finish a hand to open Review or Retry. Decision grading uses before-action public snapshots; it does not inspect opponents' hidden cards or the future deck. Core play and review work in airplane mode. Support: 958182284@qq.com.

截图使用实际发行界面，每种商店本地化资料都与实际可用语言一致。至少准备牌桌、设置、决策复盘三类截图；避免真人照片、未经授权赛事标识、稳赚／专业精确复刻宣传。Google 主图、图标、截图与 Apple 各设备截图按提交当天后台规格制作，不能把浏览器截图直接标成真机发行包验收。[Apple 截图规格](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)、[Google 图形资料](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en)。

## 提交顺序与发布门槛

1. 工程验收：`npm run check`、`npm run test:e2e`、`npm run format:check`、`npm run i18n:check`。
2. 原生资源验收：`npm run mobile:sync`、`npm run mobile:verify`。
3. 发布资料预检：`npm run store:check`；补齐所有缺失信息和实际验收证据后通过。
4. 发行编译与签名：Android 签名 AAB、iOS 已验证 Archive，构建号递增，版本与商店一致。
5. 母语审校、真实设备／分发渠道验收、人物权利及地区准入确认；在发布清单保存证据。
6. 完成商店后台资料、协议、测试资格和审核；获批后手动／分阶段开放已满足条件的市场。

本报告不表示已上传、提交审核或发布，也不表示已获得人物授权、地方许可、评级证书或商店批准。最终验收记录应逐项写明产物路径／构建号／设备／结果／负责人，不用浏览器通过替代真实商店签名包测试。
