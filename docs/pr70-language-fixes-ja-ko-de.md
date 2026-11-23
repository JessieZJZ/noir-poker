# PR70 日语、韩语、德语文案修正记录

基线：PR70 `38337032eacf30eae24fdeb00da07451b1e7a099`。修正工作树为 `/Users/zjz/.codex/worktrees/pr70-language-fixes/noir-poker`，分支 `codex/pr70-language-fixes`。核对日期为 2026-11-06。

本分工修改 `src/i18n/locales/ja.json`、`ko.json`、`de.json`，新增定向单元回归。共享代码及 `overrides.json` 由协调者整合。本次是 AI 辅助语言修正与规则核对，没有把 AI 评审称为真人母语认证。原报告的随机原生牌局没有命中的分支仍保留该证据边界。

## 可靠来源与采用范围

| 语言/用途          | 实际核对来源                                                                                                                                                                                       | 采用范围与边界                                                                                                                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 日语行动术语       | [JOPT 官方托管的日文 Poker TDA 2024 规则](https://japanopenpoker.com/wp-content/uploads/2024/11/2024-Poker-TDA-Rules-PDF-Longform-Redlines-Vers-1.0-FINAL_Japanese.pdf)                            | 已读取 PDF 的行动用词、ホールカード、ショーダウン、サイドポット与未获跟注下注的处理；用来排除电话、洞牌等多义词误译。没有把线下赛事的流程规则移植进游戏。                                                          |
| 日语牌型名称       | [GP 出版的 The Gang 日文原版说明书](https://www.gp-inc.jp/assets/pdf/gangpoker_rule.pdf)                                                                                                           | 出版商原文的搜索索引可读到フォーカード、フルハウス、ストレート等名称和 A2345 说明；完整 PDF 当前重定向后超过浏览工具的体积限制，因此没有声称逐页核验。采用牌型名称，德州扑克判定另与本项目及 PokerStars 规则核对。 |
| 日语交叉核对       | [任天堂扑克介绍](https://www.nintendo.com/jp/others/playing_cards/howtoplay/poker/index.html)                                                                                                      | 仅核对日语牌型词汇。此页是换牌扑克及其玩法约定，含花色优先级，**不能**作为本项目 Hold’em 花色平等或下注规则的依据；未采用这些差异规则。                                                                            |
| 韩语规则及基本词汇 | [PokerTH 第一方韩文规则](https://webclient.pokerth.net/rules?lang=ko)、[韩文术语表](https://webclient.pokerth.net/glossary?lang=ko)、[牌型表](https://webclient.pokerth.net/hand-rankings?lang=ko) | 核对체크/콜/폴드/레이즈/올인、홀 카드、팟、스몰/빅 블라인드、턴/리버、키커、사이드 팟及花色无大小。牌型行使用原有示例牌采用且第一方规则也使用的포카드/트리플。未套用 PokerTH 自己的盲注、计时、局数等配置。        |
| 韩语 TDA 获取边界  | [Poker TDA 官方论坛的 2026 韩语翻译帖](https://www.pokertda.com/forum/index.php?topic=1762.0)                                                                                                      | 已确认译者与校对者署名，但帖子所链 Dropbox 当前无法读取，论坛管理员也曾报告链接失效。没有把它记成已读的韩文规则依据。                                                                                              |
| 德语规则及词汇     | [PokerStars 德语规则](https://www.pokerstars.de/poker/games/rules/)、[PokerStars 德语牌型](https://www.pokerstars.com/de/poker/games/rules/hand-rankings/)                                         | 核对 Check/Call/Raise/Fold、Vierling/Full House/Straight/Drilling、Kicker、Pot、All-in 和 Side Pot。选择玩家常用的 Straße，与既有示例牌统一；统一使用 du。皇家同花顺仍是同花顺的最高形式，本项目仍保留九大类别。   |
| 跨语言规则含义     | [PokerStars Hold’em 规则](https://www.pokerstars.com/poker/games/rules/)                                                                                                                           | 核对最佳五张可任选五张、弃牌者不能获池、全下只争自己覆盖部分、无人跟注超额退还与 No-Limit 可超过底池下注；实际筹码面额和加注上限仍以项目引擎为准。                                                                 |

PokerStars 的 `/ja/` 规则链接本轮跳转英文，`/ko/` 资源不可用，没有把英文落地页称为日/韩官方译文。以上来源用于词汇和规则含义校验；设置何时生效、重打如何撤回数据、每次判断抽样 8 次、CL 补码政策与倒计时均核对本项目源码，不借外部资料证明其策略最优。

## 修正范围

三个 locale 分别修正日语 140、韩语 135、德语 137 个键。数量包含当前完整消息、同一功能相邻辅助名称和保留的旧标点兼容键；不把兼容键另算成运行中新增问题。完整逐键新值交付在 `.artifacts/language-fixes/changes-ja-ko-de.json`。

- 指南统一九种牌型、check/call/fold、发牌阶段、下注总额与本次支付、最小加注、半池/底池尺度、边池与退款、复盘/EV/重打限制、设置生效时间和提示位置。日语不再漏掉顺子；韩语保留 A2345 低顺子；德语完整指南对玩家使用 du。
- 底池资格、人数、贡献、退款和分配使用明确扑克用词。金额、姓名、人数、牌面和占位符不改变。
- 复盘已完成输赢采用事实陈述，未获底池不再写成“摊牌不可用”；空公共牌说明不再写成委员会/董事会。牌局日志用完整模板保存姓名、手号、BTN 和 SB/BB 金额。
- 设置明确自动保存在此设备、难度立即生效、风格/情绪下一手生效、当前手及重打保留原设置；关闭设置、复盘、应用信息与重打提示的辅助名称明确关闭对象。
- 已核当前源码的 A 阻断、outs、德语昂贵跟注和模拟 EV 限制分支，修正文案。outs 表示目标组合的候选完成牌与下一张概率，不冒充最后获胜概率。德语昂贵跟注保留两种范围假设并明确倾向停止投入。
- 新公共键：本手之后另打 N 手才涨盲、下一手涨盲、盲注封顶、关闭重打提示、CL 与最多三次补码/决赛圈禁补、参数表横滑提示、提示位于牌桌左上角、短筹码比较标题与条件性说明。原提示位置兼容键仍准确描述旧位置，当前新键明确左上角。

`overrides.json` 的合并优先级高于 locale。冲突键和新增公共键按语言交付在 `.artifacts/language-fixes/override-patches-ja-ko-de.json`，分别为 15 / 12 / 13 项；已由协调者统一合入。不能只修改 locale 后假定已生效。

## 原卡 ID 对应关系

| 原卡 ID                         | 处理与定位                                                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| JA-01                           | 九类排序整句及各牌型标签统一。                                                                                              |
| JA-02                           | `过牌 / 跟注`、无需补筹码条件和弃牌说明。                                                                                   |
| JA-03a、JA-03b、JA-03c、JA-03d  | 完整重打说明、真实短 CTA、复盘入口和 EV 段；补齐旧结算/统计撤回、最新结果及已知牌局限制。                                   |
| JA-04                           | 完整未结算底池说明、待跟注/退还、`· {5} 人`、资格/投入/分配标签。                                                           |
| JA-05a、JA-05b                  | 当前 A 阻断与 outs 分支；源码级修正，原随机 native 未命中边界保留。                                                         |
| JA-05c、JA-05d                  | 空公共牌、手号/盲注完整日志和练习净变化。                                                                                   |
| JA-06a、JA-06b、JA-06c          | 自动保存/生效说明、设置关闭 AX、保存对象与玩家人数。AX 只以名称元数据证明，不把 X 图形当错误文本。                          |
| JA-ADD-01                       | `开始第一手` → `最初のハンドを始める`。                                                                                     |
| JA-ADD-02                       | 缩短参加/コール标签并增加横滑提示译文；列宽和自然换行由公共 CSS 处理。                                                      |
| JA-ADD-03                       | 已完成摊牌但没赢底池的事实陈述；原报告仅 iOS 输牌局命中。                                                                   |
| JA-ADD-04                       | Android 模拟器英雄行压扁属于公共绘制观察，交协调者定位，未声称是所有实体 Android。                                          |
| JA-ADD-05                       | 状态短文案 `本手结束` → `終了`；公共布局仍需复核。                                                                          |
| JA-ADD-06                       | 协调者确认 `src/review/tournament.js` 可见建议后改中文源标题/说明；三语已加入新键，启发式仍保留位置/价格/合法行动条件。     |
| JA-ADD-07                       | 提示开关/滑动/收起/本机保存完整段；新源键对应左上位置。                                                                     |
| KO-01                           | 当前面额的半池/底池加注整段，不采用旧固定 25 版本。                                                                         |
| KO-02                           | 边池完整段明确是已弃牌者无法争夺；未获跟注超额退款不算额外盈利。                                                            |
| KO-03                           | 训练参数整段：开始牌范围、raise 频率、边缘 call、安全 board 上 slowplay 和规则优先级。                                      |
| KO-04                           | 重打撤回原结算/统计、采用最新结果、同牌序与长期收益限制。                                                                   |
| KO-05                           | 变更后的保存成功反馈和下一手生效。                                                                                          |
| KO-06                           | 当前持 A 后位分支；去除不雅“后位”和洞牌误译，保留部分组合阻断含义。原报告仍为条件性源码证据。                               |
| KO-07                           | 当前模拟 note 保留 8 次、均衡型 bot、沉没成本、分池/退款/后续下注、模型误差及非 GTO/真人最优 EV。原报告仍为条件性源码证据。 |
| KO-08a、KO-08b、KO-08c、KO-08d  | 排序与示例统一、kicker/花色/A2345、check/call 条件、홀 카드/플랍/턴/리버。                                                  |
| KO-09a、KO-09b                  | 复盘空公共牌、已完成赢牌和完整日志模板。                                                                                    |
| KO-09c                          | 提供完整 `{0} 模拟状态：{1} · {2}` 译文；协调者修复组合 actor 名字令模板失配的公共路径。                                    |
| KO-10                           | 参数译名/横滑说明可用；手机词中换行交公共 CSS。                                                                             |
| KO-11                           | Android 模拟器英雄行绘制观察交公共修复；不据此推断实体机。                                                                  |
| KO-ADD-01                       | 名称可发现性建议；`파이널 테이블` 不是明确错译，按协调者决策保留。没有把二人阈值改成三人或改动规则。                        |
| DE-01                           | 当前 expensive-call 封口分支停止投入的方向修正；仍保留两种假设。原报告未 native 命中。                                      |
| DE-02                           | 九大牌型与示例牌名称一致。                                                                                                  |
| DE-03a、DE-03b                  | Check/Call 条件、未跟注/退还状态和完整资格说明。                                                                            |
| DE-04                           | 当前面额尺度说明，保留面对下注计入 call 后再算增量、最小 raise/stack 和 No-Limit 条件。                                     |
| DE-05                           | 训练参数整段，不把牌范围称泳池宽度，并保留规则/局面优先级。                                                                 |
| DE-06a、DE-06b                  | 提示完整段和开关状态明确对象是 Tischhinweise，新源段位置为左上。                                                            |
| DE-06c、DE-06d                  | 重打同牌序/撤回数据和新 deal；手号/盲注日志及会话净变化。                                                                   |
| DE-ADD-01、DE-ADD-02、DE-ADD-03 | 输牌/赢牌均用已完成事实；筛选项 `Alle Gegner`。                                                                             |
| DE-ADD-04                       | 小数/百分比格式由公共格式化代码统一，不在译文里替换数字或改变精度。                                                         |
| DE-ADD-05                       | 同 Android 模拟器英雄行观察，交公共修复。                                                                                   |
| DE-ADD-06                       | 指南新译段统一 du；辅助按钮用自然动词形式，保留对局和规则含义。                                                             |

## 检查与待验收边界

已运行 `node --test tests/unit/pr70-locales-ja-ko-de.test.js`，8/8 通过。回归覆盖：九类排序与示例一致、check/fold/边池资格与退款、重打撤回及限制、真实引擎生成的模拟 note、A 阻断/outs/昂贵跟注含义、已完成结果、公有信息边界、完整动态日志以及新增倒计时/保存/AX 文案。真实引擎 note 测试也确认原 game 状态没有被本地化或模拟改写。

已逐键核对修正键的正式 `loadLocale()` + `localizeText()` 输出与合并后的新译文一致，三语有效输出偏差均为 0。占位符保留检查通过。仅检查此次触及文件的格式；没有在本分工运行全套测试、构建 native、编译或操作模拟器。修正后的 Web 布局和新装 iOS/Android 画面由协调者统一构建/采集，旧审计 PNG 只证明修正前现场。

仍需要公共代码的项目包括：手机参数表列宽/换行与横滑提示显隐、日语状态空间、德语百分比区域格式、动态日志 actor 组合匹配和 Android 英雄行比例。韩语 final table 的额外 heads-up 说明为产品建议，暂未引入新标签。以上不得以“已翻译”代替布局或装机验收。

## 2026-11-07：德语重复退化句的有限修正

本轮只修改 `de.json` 中 `避免弱 A 被强继续范围压制；阻断部分强 A 不等于足够弃牌率。` 及其中文逗号兼容键这两个值。旧值各为 830 字符，几乎全部是循环的 `ein starker`，不传达原意。当前可见分支位于 `src/review/routes.js` 的 `squeeze-candidate` 主路线 `tradeoff`，实际采用逗号键；两键均无 `overrides.json` 覆盖。本轮没有修改路线判定、牌局规则、其他文案或设备状态。

两键统一修为：

> Vermeide es, mit einer schwachen Ax-Hand gegen die starke Range, mit der dein Gegner weiterspielt, dominiert zu werden. Dass du einige starke Ax-Kombinationen blockierst, bedeutet noch nicht, dass dein Gegner oft genug foldet.

本轮实际读取的第一方德语依据：

- [PokerStars 德语 Glossar](https://www.pokerstars.de/poker/learn/strategies/poker-glossar/) 的 Blockers、Dominieren、Range 条目：分别核对持牌减少对手可持组合、相同高牌下较差 kicker 被压制，以及范围而非某张已知底牌的含义。
- [PokerStars 德语 blocker 组合说明](https://www.pokerstars.de/poker/learn/strategies/einfuehrung-in-block-einsaetze-auf-dem-river/)：核对持 A 会减少对手 Ax 组合，以及 blocker 选择仍需考虑对方会弃掉哪些范围。本轮仅采用术语与组合关系，未把文章的河牌尺度或建议移植进翻前挤压逻辑。
- [partypoker 德语 Fold Equity 说明](https://www.partypoker.de/de/poker/how-to-play/strategy/poker-odds/fold-equity)：交叉核对弃牌概率与由弃牌获得的额外权益不宜混为同一个定量指标。中文源句为“足够弃牌率”，因此译为 `oft genug foldet`，保留“对方会不会足够频繁弃牌”的判断，没有声称 blocker 本身保证足够 Fold Equity。

日语、韩语仅只读核对这两个对应值：两者保留弱 A、对手继续范围、部分强 A 组合阻断和“不等于足够弃牌率”的否定方向，没有本轮明确的反向语义错误，因此保留原值。两文件字节 SHA 在检查前后一致；这不是对其他旧长句的自然程度或完整语义背书。

有限重复扫描覆盖日语 3742、韩语 3742 个有效键（locale 与 override 合并后），两语均未发现相同 2–80 字符片段连续重复至少 8 次，或重复至少 8 次且占正文 40% 以上的分句。此机械筛查不能证明整库翻译正确。扫描记录为 `.artifacts/language-fixes/round2/repetition-ja-ko-de-before.json`；其中德语恰命中本轮两键。定向 `loadLocale()` / `localizeText()` 断言已确认两键实际生效且两种中文标点输出一致，记录为 `de-blocker-repair-validation.json`。既有三语单元回归 8/8 通过。

本轮属于原报告随机牌局未自然命中的条件分支源码修复，没有追加 native 复现声明。先前 `11b333` 原图保持原始版本身份；新字典需由协调者重新构建、记录新 digest 后验证。

## 2026-11-07：保留字面品牌的页面标题

仅修正三语的同一源键 `NOIR Poker · 德州扑克单机练习`，品牌统一保留字面 `NOIR Poker`，其余部分准确表述离线 Hold’em 练习：

| 语言 | 新页面标题                              |
| ---- | --------------------------------------- |
| 日语 | NOIR Poker · オフラインのホールデム練習 |
| 韩语 | NOIR Poker · 오프라인 홀덤 연습         |
| 德语 | NOIR Poker · Offline-Hold’em-Training   |

日语 `ホールデム` 与前述 [JOPT 官方托管 TDA 日文规则](https://japanopenpoker.com/wp-content/uploads/2024/11/2024-Poker-TDA-Rules-PDF-Longform-Redlines-Vers-1.0-FINAL_Japanese.pdf) 用词一致；韩语 `오프라인`、`홀덤`、`연습` 与 [PokerTH 第一方韩文玩法页](https://webclient.pokerth.net/how-to-play?lang=ko) 的离线练习说明一致；德语采用 [PokerStars Learn 德语](https://www.pokerstars.de/poker/learn/strategies/how-to-deal-with-downswings/) 使用的 Hold’em、Training 形式，以常规德语复合词表达练习用途。页面标题是本项目的译文，不冒称这些来源对应用的认证。本轮未修改其他标题/规则或设备，三键均无 override 覆盖，另以正式 `loadLocale()` / `localizeText()` 核验实际输出。

## 2026-11-07：R9 已弃牌状态与牌型的分隔前缀

源键 `已弃牌 ·` 用于已弃牌英雄的结算牌型标签，完整内容是“已弃牌状态 · 最佳五张牌型”。`table-controller.js` 和 `table-scene.js` 均在五张公共牌已公开后组合这个前缀与真实 evaluator 的牌型名称；展示牌型不会恢复弃牌者的争池资格。

本次有限核对覆盖三语的 `已弃牌 ·`、`· 已弃牌`、`已弃牌` 九个有效值，只修正两项确定错误：

| 语言 | 源键     | 原有效值   | 修正值           | 原因                                                 |
| ---- | -------- | ---------- | ---------------- | ---------------------------------------------------- |
| 日语 | 已弃牌 · | フィールド | フォールド済み · | field 误译为“场地”，且丢失状态与牌型间的中点分隔符。 |
| 德语 | 已弃牌 · | hat Fold.  | Gepasst ·        | 不是正确的已弃牌状态表达，且丢失中点分隔符。         |
| 韩语 | 已弃牌 · | 폴드 ·     | 保留 폴드 ·      | 原本已准确表达弃牌标签并保留分隔符。                 |

三语的后缀 `· 已弃牌` 与独立状态 `已弃牌` 含义正确，均保留。日语组合示例改为 `フォールド済み · ツーペア`，德语改为 `Gepasst · Zwei Paare`，韩语继续使用 `폴드 · 투페어`。协调者同步维护基础字典与有效 override，避免修正被旧覆盖值遮住。

本次重新实际读取的第一方依据为 [JOPT 托管的 Poker TDA 日文规则](https://japanopenpoker.com/wp-content/uploads/2024/11/2024-Poker-TDA-Rules-PDF-Longform-Redlines-Vers-1.0-FINAL_Japanese.pdf) 第 3 条的 `フォールド` 行动术语、[PokerTH 韩文术语表](https://webclient.pokerth.net/glossary?lang=ko) 的 `Fold (폴드)`，以及 [PokerStars 德文术语表](https://www.pokerstars.com/de/poker/terms/) 的 `Fold / Passen` 和[德文帮助页](https://www.pokerstars.de/help/articles/show-hole-card/149921/) 中表示已完成弃牌的 `gepasst` 用法。`済み` 与 `Gepasst ·` 是本项目的简洁状态标签，不冒称原文逐字引用，也不更改引擎规则。

新增回归使用正式 `loadLocale()` / `localizeText()` 检查十一语有效前缀及九类牌型组合，并在测试模式使用既有 `qa.scene`、真实 evaluator/settlement/renderer 检查已弃牌英雄标签。浏览器检查覆盖 320、390、768、1024 宽度下完整 Range、实际裁剪祖先，以及 Android 专用牌型图层不改变 Web/iOS 标签字号和几何。给 Chromium 添加平台 CSS 标记只能证明选择器和几何，不是 Android 或 iOS 原生字形绘制证明；原生像素验收由协调者对新版本另行采集。旧 R8 的 `a820/3fad` 原图保留原始版本身份，不能用新字典或浏览器回归改写旧图结论。

本轮定向单元 2/2、浏览器 22/22 通过（十一语 × 两个既有项目，各检查四种尺寸）。浏览器初版曾错误要求 iOS 与 Web 的绝对坐标相同；定位到既有 `controls-layout.css` 为 iOS 保留至少 10px 的底部安全间距后，改为核对 Web/iOS 各自基线在 Android 图层切换前后保持一致，同时继续要求三种 CSS 平台的完整文字与 Range 不裁剪。该调整保留平台原有差异，没有修改产品样式或放宽文字可见性检查。失败与最终日志分别保留为 `folded-prefix-e2e-r9.log`、`folded-prefix-e2e-r9-r2.log`，单元日志为 `folded-prefix-unit-r9.log`，均位于本地 `.artifacts/language-fixes/round2/`。本分工未运行完整构建或 native 测试。

2026-11-08 的 R10 补修仅涉及葡语未获池页脚 `最佳五张牌`，日／韩／德译文不变。[葡语第一方依据与精确范围](pr70-language-fixes-en-es-it-pt.md#2026-11-08-r10-葡语最佳五张牌短标签)另列；本文件的 R9 通过数保留原版本身份，不能作为 R10 编译或原生验收。

2026-11-08 的 R11 只修正已观察的人数／无限注页头字段。对十一语5–9人的55个有效结果枚举后，日／韩／德及其既有模板均正确，保留原值。[七个有效修复键与官方依据](pr70-language-fixes-en-es-it-pt.md#2026-11-08-r11-人数无限注页头字段)另列；新增回归覆盖本组三语全部人数，不扩大为整目录认证。R10 图审与运行证据仍属旧源，不计入 R11。
