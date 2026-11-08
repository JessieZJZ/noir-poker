# PR70 英语、西班牙语、意大利语、葡萄牙语文案修复

基线为 PR70 的 `38337032eacf30eae24fdeb00da07451b1e7a099`，修改位于
`codex/pr70-language-fixes`。本轮按原问题卡片及当前实际源码逐项核对，修复四语
locale；不改变发牌、合法动作、底池结算、机器人策略或复盘评级。

这是 AI 语言审校，并非真人母语者认证。原报告的模拟器截图用于确认旧问题；`8087f3c` / `d245…` 及更早包的截图均已归档为候选诊断，不能作为当前修复后验收。`9963cb4` / `b36332aa97c39cfc7c7416d29d94fd04435008be284c8650dc4c064c1625862d` 的 `headerfinal-*` 包也因后续页头几何/Android 绘制问题被主线程标记 superseded；葡语已看原图仅保留为候选诊断。当前等待新的冻结摘要及双端证据。

## 官方来源与核对范围

2026-11-06 联网核对以下第一方资料。使用其术语与规则定义核对中文源文含义，未调用第三方机器翻译服务，也没有逐段复制外部文章。

| 语言     | 第一方资料                                                                                                                                                                                                       | 本次核对                                                                                                               |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 英语     | [PokerStars — Poker Rules](https://www.pokerstars.com/poker/games/rules/)；[Texas Hold’em](https://www.pokerstars.com/poker/games/texas-holdem/)                                                                 | check/call/raise/fold、hole cards/community cards、side pot/split pot、no-limit、跟注计入底池尺度的含义                |
| 西班牙语 | [PokerStars España — Reglas del poker](https://www.pokerstars.es/poker/games/rules/)；[Texas Hold’em](https://www.pokerstars.es/poker/games/texas-holdem/)；[Glosario](https://www.pokerstars.es/poker/glosario) | pasar/igualar/subir/retirarse、ciega pequeña/grande、bote secundario、九类牌型名称                                     |
| 意大利语 | [PokerStars — Regole del poker](https://www.pokerstars.com/it/poker/games/rules/)；[PokerStars Italia — Regole](https://www.pokerstars.it/poker/regole)；[Glossario](https://www.pokerstars.it/poker/glossario)  | check/call/rilancio/fold、piatto laterale、scala colore/poker/full/colore/scala/tris、私人牌与公共牌的区别             |
| 葡萄牙语 | [PokerStars Brasil — Regras de Poker](https://www.pokerstars.com/pt-BR/poker/games/rules/?no_redirect=1)                                                                                                         | pagar/aumentar/desistir、small blind/big blind、pote paralelo、straight flush/quadra/full house/flush/sequência/trinca |

2026-11-06 最终文档复核时，英语规则、英语 Hold’em、意大利语 `.com/it` 规则和巴西葡语规则页仍可直接读取；西班牙地区页直接抓取返回 403，但[官方规则页](https://www.pokerstars.es/poker/games/rules/)和 [Hold’em 页](https://www.pokerstars.es/poker/games/texas-holdem/)的官方搜索索引内容可读，继续支持现用动作、盲注、私人牌/公共牌和边池术语。没有将索引结果写作成功直接抓取，也不声称地区站点始终可访问。

官方来源用于核对扑克含义；半池快捷项的实际计算、每十手涨盲、盲注封顶、最多三次半 CL 补码、重打回滚和自动提示属于本应用行为，另以现有产品源码核对，不能说是外部规则页定义的产品功能。

这些规则页通常把皇家同花顺单列为第十项。本应用引擎将其作为同花顺的最高形式，因此指南保持引擎的九类结构，不能为迎合外部目录而改成十种结算类别。

## 修复范围

| 原报告项                                | 修复内容                                                                                                                                                                                                                   |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EN-01、ES-02/03、IT-01/02、PT-02/03     | 重写基础动作和当前筹码面额版的快捷下注说明。明确过牌免费条件、跟注补差额、加注要求后续玩家重新选择；半池计算包含假设跟注金额，用户无须先按跟注。保留最小加注、面额、剩余筹码和无限注边界。未修改未使用的固定 25 筹码旧键。 |
| ES-01、IT-05、PT-01                     | 排序完整保留九类；与独立牌型标签统一，西语恢复顺子，葡语恢复 sequência，意语去掉 casa piena 等直译。动态三条和高牌踢脚说明也使用同一体系。                                                                                 |
| EN-02、ES-05、IT-06、PT-05              | 去掉 swimming pool/piscina 等错误，按起手范围、进攻/诈唬、边缘跟注和安全牌面慢打解释。原有位置、人数、牌力及合法动作优先的限制完整保留；原文并非缺少这条限制。                                                             |
| EN-07、ES-04、IT-03/X02、PT-04          | 明确全下参与额度、弃牌者无获奖资格、边池各自结算与未跟注超额退还；底池投入入口及状态使用贡献/待跟注或退还术语。只改解释，不把退款当获利。                                                                                  |
| EN-03/04、IT-04                         | 修正未在旧随机牌局命中的源码条件分支：playing the board 与分池份额、盲位继续频率、limpers、重打比较路线；个人出局不再说成整局结束。保持原条件和建议范围。                                                                  |
| EN-05/I01、ES-X01/X02、IT-07、PT-06/X01 | 重写提示、设置生效和重打说明；保留原牌/按钮/初始筹码/牌序、撤回旧结果及统计、电脑响应新选择、不能证明长期收益、下一手重新发牌。修复乱码与把重打译成退出/录像播放的文案。                                                   |
| EN-06、ES-06/08、IT-X01/X04、PT-X02     | 修复手数/按钮位日志、盲注整句、情绪日志、行动总数、非结果导向的复盘底注；数量上下文改成“仍在局中的对手：N”等不依赖单复数变化的结构。                                                                                       |
| EN-09、ES-07、IT-08/X03、PT-07          | 输掉摊牌不再表示功能不可用；翻前空公共牌区不再说委员会/建议尚未发布；修复未赢得底池、动态筹码单位、三条和高牌详情。没有根据最终输赢倒推决策优劣。                                                                          |
| IT-10、PT-X03                           | 关闭设置、关闭复盘、提示开关状态使用明确的无障碍名称。普通 X 图标不能证明朗读内容；仍需 VoiceOver/TalkBack 验证。                                                                                                          |
| ES-09、IT-09、PT-08                     | 四语重打短标签分别为 Replay、Repetir、Rigioca、Rejogar；完整长名称保留在对应的完整名称键。实际按钮排版、触摸区及重打提示由公共 UI 修改负责。                                                                               |

新增公共源文案也提供四语译文：本手之后尚余手数、下一手涨盲、盲注封顶、关闭本手重打提示、参数横滑提示、新 CL 说明、牌桌左上方提示说明，以及“短筹码优先比较全下与弃牌”的限定表达。
意语手数采用“当前手 + N”的紧凑表达，避免 N=1 时产生 `altre 1` 的性数问题。短筹码说明保留“可能”和结合位置、价格、合法动作比较，不宣称只有两种合法选择。

CL 新说明保留：当前仍在桌上的筹码领先者、每手可能变化、决赛圈前输光后每局最多三次、每次补到当时 CL 的一半、决赛圈不可补码。没有改动旧 CL 键。

葡语沿用应用既有 `você` 语体，采用巴西扑克常用名词及官方巴西站术语；不会把这次审校解释为覆盖所有葡语地区的母语认证。

## 合入与验证

`loadLocale` 先载入 locale，再叠加 `src/i18n/overrides.json`。因此仅改 locale 文件不足以修复已有覆盖键。
按语言分组的必要覆盖值和新增公共键保存在
`.artifacts/language-fixes/override-patches-en-es-it-pt.json`，由负责公共文件的 agent 统一合入；本任务没有直接编辑共享覆盖表。
`.artifacts/language-fixes/changed-keys-en-es-it-pt.json` 保留首轮改动清单（69、85、81、86 键），不是当前完整计数。后续 58 键/语的 `followup-copy-en-es-it-pt.json` 和 16 键/语的 `final-pot-scene-copy-en-es-it-pt.json` 已统一合入；第二份进一步修正了意语退款的 `Fiches` 性数搭配。78 张原卡的逐 ID 映射保留在 `.artifacts/language-fixes/coverage-en-es-it-pt.json`，`final-freeze-audit-en-es-it-pt.json` 是当时待合入清单的历史审计。

在 `9963cb4` 之后的未冻结工作树中，补充“对手最近一次翻前加注：{0}。”完整模板，四语 locale 与必要覆盖值各增加 1 键。相对 PR70 基线的当前计数如下；这是按 key 去重后的词典差异，不是把各轮 sidecar 数字相加。新增计数和有效译文核对保存在 `.artifacts/language-fixes/post-punctuation-copy-audit-en-es-it-pt.json`；此前详细键名和六项排除检查保留在 `current-doc-audit-en-es-it-pt.json`。工作树计数不表示已有新的冻结摘要或 native after。

| 语言 | locale 修改或新增 | overrides 修改或新增 | 合并后有效文案改变 |
| ---- | ----------------: | -------------------: | -----------------: |
| en   |               126 |                   28 |                126 |
| es   |               156 |                   20 |                156 |
| it   |               151 |                   19 |                151 |
| pt   |               153 |                   22 |                153 |

这四语没有删除 locale 键。初始必要覆盖 sidecar 和最终 16 键 sidecar 与当前有效值全部一致；58 键 sidecar 只有两条意语退款被更晚的 `Fiches` 文案有意替代，没有意外覆盖回退。当前指南简介、最佳五张/平手段、提示位置、半池说明、参数优先限制、actor 日志、结算资格/弃牌/全下、零头筹码及加注权提示均已纳入文案范围；规则和策略逻辑未因翻译修改。

补充公共呈现修复：底池资格名单仅按当前语言选择连接符，zh/ja 保留顿号，其余使用逗号加空格；姓名仍分别转义。最近翻前加注改为完整源句一次翻译，避免中文句号残留。`localizeGameText` 仅用于生成的局内文案，activity 在还原 actor 徽标之前调用；复盘对话框以 `data-i18n-chips` 标记覆盖时间线、说明、证据、对手说明和动态。真实筹码保留正负号和每枚整数值，网址/标识符保持，未改变规则或评级。WeakMap 保存最终显示值及原源句，以支持重复翻译和语言切换。

这三条已见路径的实际函数与最小内存 DOM API fixture 复核保存在 `.artifacts/language-fixes/game-text-path-review-en-es-it-pt.{mjs,json}`：主段、剩余筹码、事实条目尾部、加注日志和底池分配日志均格式正确；PT→ES→IT→EN→JA→简中→PT 往返及重复呈现通过。这是函数/内存验证，不是真实浏览器 DOM、装机或实体机验证；主线程浏览器与新包检查另行报告。

`tests/unit/pr70-locales-en-es-it-pt.test.js` 使用实际 `loadLocale` / `localizeText`，检查九类排序与独立标签一致、下注计算边界、参数限制、输牌/未发公共牌状态、动态名字和筹码单位、重打语义、无障碍名称、条件复盘和新增公共键。
这些检查可以捕捉“locale 已改但 overrides 又覆盖回旧词”的问题。

首轮历史验证：2026-11-06，合入必要覆盖值后的本专项测试 **9/9 通过**，当时的格式检查和差异空白检查通过。该记录不代表后续所有公共改动均已通过，也不等于 native 编译或装机运行。当前统一检查、编译与 `headerfinal-*` 证据以 `.artifacts/language-fixes/delivery.json` 及对应报告为准；本次文档核对没有重跑测试或构建。

## 公共部分与证据边界

- EN-08 的相邻节点空格、计算器百分比本地格式、动态 actor/BTN 日志拆分、提示位置和布局由公共代码任务处理，不能只靠修改词典解决。
- 旧 Android 模拟器英雄信息行被压扁属于观察项，本任务未归因为语言或字体，未修改图形实现。
- 已审过的旧候选安装包原始 PNG 与逐图结果保存在 `.artifacts/language-fixes/diagnostic-visual-qa-d245-en-es-it-pt.json`，共 90 项；由于后续公共页头/重打布局继续修复，全部仅作诊断。不得将其作为任何后续源码的 after 证据。`b363…` 葡语两端另存候选诊断报告，不能成为最终验收。新包每语需完整 8 个 journey、paragraph manifest 和该单语批次 passed 后才纳入最终验收；整页 JSON 不能证明屏外文字可见。
- 实体机、VoiceOver/TalkBack 朗读及未随机命中的特殊全下/边池/退款/实际零头分配仍不作通过声明；指南静态文字可见不等于这些运行分支都已命中。旧候选中另见名单顿号、部分复盘金额格式/句号、葡语个别 check 分支措辞。主线程已确认名单标点、生成动作句末和真实筹码小数格式属于本轮文案范围；只读定位、最小改法与探针保存在 `.artifacts/language-fixes/pt-punctuation-amount-diagnosis.md`，由主线程统一应用。引文、人名、牌面和网址不得全局替换；未随机触发分支仍不扩大声明。
- 用户否定的六项为 **CN-03a、CN-03c、CN-04a、CN-05、TW-02a、TW-02b**，不是待修清单。本次核对确认四语“获胜手数／胜率”、翻前表标题、计算器结果标签与原有效词典一致；未把翻前胜率表改为权益表、未给计算器彩条加权益标签、未将轮播父菜单改为固定“学习与工具”。父菜单 DOM/行为及计算器结果卡结构与基线一致。小数本地格式、真实机译错误修正和长译文页头留白属于其他已授权问题，不改变这六项被保留的产品语义。

## 2026-11-07 原生现场发现的重复退化补修

在 `6782b98` / `11b333…` 候选包的 Android 平板西语横屏原始截图中，公共牌下方实际出现多行重复的 `Cuarto`。
对应 `TURN · 第四张公共牌` 的 888 字符译文已存在于 PR70 基线；原始采集 JSON 的 `qa: false`、`styleInjection: false`，并非采集压力文本。
这是一项实际可见的翻译缺陷；该候选的旧图仅作为问题历史，不代表后续新摘要修复后的验收。
独立问题对照附录为 `.artifacts/language-fixes/round2/es-turn-degeneration-appendix.json`。

本组最小修改共 **10 个 locale 值**：西语 TURN 标题 1 个，英／西／意／葡弱 A 说明的分号版及逗号版各 2 个，以及意语跟注所需权益说明 1 个。没有修改源 key、覆盖表、玩法、公式或策略条件。
西语标题改为 `TURN · 4.ª carta comunitaria`，保留“第四张公共牌”含义。
弱 A 文案保留“可能被更强的继续范围压制”，并直接说明阻断部分强 A 不代表对手会足够频繁弃牌；没有把弃牌频率替换为 fold equity 金额或承诺足够的诈唬收益。
意语公式保留“有效跟注成本 ÷ 跟注后可争夺底池”，各主／边池按可获奖者分别估计，未被跟注的退还不是收益。

本次重新联网核对的第一方来源：

| 范围               | 来源与核对边界                                                                                                                                                                                                                                                                                                  |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 西语 TURN          | [PokerStars España 官方规则](https://www.pokerstars.es/poker/games/rules/)及[官方术语](https://www.pokerstars.es/poker/terms/)明确 turn 为第四张公共牌。地区规则页直接读取返回 403，官方搜索索引可读；不把索引读取写成直接抓取成功。                                                                            |
| 英语弱 A／阻断     | [PokerStars Learn — Weak Off-Suit Aces](https://www.pokerstars.com/poker/learn/strategies/when-to-play-bad-off-suit-aces-in-cash-games/)说明弱 A、Ax 组合、阻断以及位置／范围条件；仅用于术语和概念核对，不据此证明本应用某一次诈唬的弃牌率。                                                                   |
| 西语弱 A／阻断     | [PokerStars España — Apuestas de Bloqueo](https://www.pokerstars.es/poker/news/news/apuestas-de-bloqueo-pros-y-contras-de-esta-estrategia-de-poker/)使用弱 as、Ax 组合与阻断表述；没有把 blocking bet 与手牌 blocker 混为一种动作。                                                                             |
| 意语弱 A／阻断     | [PokerStars Learn IT — Assi off-suit deboli](https://www.pokerstars.it/poker/learn/strategies/assi-off-suit-deboli-nei-cash-game-moderni/)用于 asso debole、range、blocker 的含义核对；最终译文直接用 foldino abbastanza spesso 表达频率。                                                                      |
| 葡语弱 A／阻断     | [PokerStars Learn BR — Ases fracos](https://www.pokerstars.com/pt-BR/poker/learn/strategies/ases-fracos-nao-naipados-em-ring-games-modernos/)用于 ás fraco、range、bloqueador 的含义核对；最终译文直接用 desistam com frequência suficiente 表达频率。                                                          |
| 意语权益／各池资格 | [PokerStars IT 官方规则](https://www.pokerstars.com/it/poker/games/rules/)说明全下可争夺额度与各池获奖资格；[官方跟注分析](https://www.pokerstars.it/poker/learn/blog/analisi-mano-implied-odds/)的所需权益分母为跟注后总池。应用中的有效成本、各池估计及退款处理仍按本项目引擎／复盘实现核对，未更改计算逻辑。 |

新增 `tests/unit/i18n-degeneration.test.js` 检查全部 11 语言的原始 flat 词典及实际覆盖后的 effective 词典，拒绝同一连续文字片段出现至少 8 次，包含无空格文字；只重复数字或标点不作为这一文字退化缺陷。
同文件验证八次／七次边界、真实四语的弱 A 限定含义、意语公式／资格／退款限制与西语 TURN 标题。
新增 `tests/e2e/turn-title.spec.js` 使用现有仅测试模式的 `bettingTurn` fixture，经引擎合法跟注／过牌到实际四张公共牌，断言真实可见标题内容、单行及牌桌边界；没有注入替代文案。
Web 回归与后续新安装包原图必须分别报告，不能把词典或 fixture 测试声称为原生修复验收。

本次定向验证：新增 5 项与既有四语 9 项单元检查共 **14/14 通过**；TURN 标题在 desktop／mobile 两个浏览器项目中均以 1280×800 横屏视口验证，**2/2 通过**。只等待公共牌的有限运行中动画，不等待无限回合光效；实际查看两张原始 Web 截图，均见四张公共牌及单行正确标题。
日志分别为 `.artifacts/language-fixes/round2/unit-r8-degeneration-final.log` 与 `web-r8-turn-title-ready.log`。本组文件的 Prettier 检查及 `git diff --check` 通过。早期新测试的内部状态类型误断言、过宽动画等待及端口退出竞争记录均保留为测试编写过程，未计为产品失败；最终原生新包仍待主线程另行验收。

随后核对真实 `<head><title>`，发现西语把“单机”写成 `en línea`，意语标题夹杂英文，葡语品牌写为 `Noir Poker`。
因此仅追加同一个源键 `NOIR Poker · 德州扑克单机练习` 的西／意／葡 3 个值，本组累计 **13 个 locale 值**；统一保留字面品牌 `NOIR Poker`，分别采用 `Práctica de Hold'em sin conexión`、`Allenamento a Hold’em offline`、`Prática de Hold'em offline`。
术语沿用上列已核对的官方 Hold’em 规则与对应语言练习语境，不将本地离线练习描述为联网对战；没有重译其他文案。新单元检查锁定实际 effective 标题和离线含义，TURN 浏览器回归同时检查真实 document title。
追加标题后的最终定向结果为 **15/15 单元检查、2/2 浏览器检查通过**；日志为 `unit-r8-degeneration-titles-final.log`、`web-r8-turn-title-document.log`。两张新 Web 原图也已实际查看，TURN 正常；浏览器的 `<title>` 由真实 DOM 断言验证，不能从牌桌 PNG 推断系统朗读或浏览器标签栏的显示。

## 2026-11-07 R9 结果徽标前缀补修与原生绘制诊断

R8 的葡语原生大屏结算图实际显示 `Tem um fold. Um par`。逐一核对四语的三个有效源键 `已弃牌 ·`、`· 已弃牌`、`已弃牌` 后，确认前缀键与此前后缀键不同，不能只修后缀就视为该界面完成。最小修正目标如下；由主线程统一合入，不改牌型、弃牌资格或结算规则。

| 语言 | R8 有效前缀 `已弃牌 ·` | R9 目标前缀       | 边界                                                 |
| ---- | ---------------------- | ----------------- | ---------------------------------------------------- |
| 英语 | `has fold.`            | `Folded ·`        | 明确已经弃牌的状态，保留状态与实际牌型之间的中点。   |
| 西语 | `Ha sido fold.`        | `Se retiró ·`     | 使用玩家已退出本手的完成态，避免不自然的被动拼法。   |
| 意语 | `Ha fatto fold.`       | `Ha fatto fold ·` | 原有完成态本身可用，仅将句号恢复为原源键的中点分隔。 |
| 葡语 | `Tem um fold.`         | `Desistiu ·`      | 明确已经弃牌，不能表达为“有一个 fold”。              |

其余八个后缀／独立状态值的扑克含义可用，保留现值，不为风格统一扩改。运行路径是 `src/ui/table-scene.js` 中 `(hero.folded ? '已弃牌 · ' : '') + evaluate([...hero.hole, ...g.board]).label`。应保留单次本地化的空格与分隔：例如 `Desistiu · Um par` 只是“已弃牌＋实际五张牌型”的信息，不表示该玩家仍可赢取底池。

本次再次联网读取 [PokerStars 英语规则](https://www.pokerstars.com/poker/games/rules/)、[意语规则](https://www.pokerstars.com/it/poker/games/rules/)和[巴西葡语规则](https://www.pokerstars.com/pt-BR/poker/games/rules/?no_redirect=1)，分别核对 fold／fold-passare／desistir 表示放弃本手及获池资格。西语[官方规则](https://www.pokerstars.es/poker/games/rules/)直接读取仍为 403；[官方术语表](https://www.pokerstars.es/poker/glosario)的官方搜索索引明确将 fold 解释为 retirarse／no ir 并放弃赢池机会，未冒称直接抓取成功。上述新前缀是针对源意的 AI 辅助措辞修正，不是逐字引用外部文章或真人母语认证。

字形问题与文案问题分开记录。独立查看 R8 同一真实葡语牌局的三张 Android 系统原图后，A（原样）与 C（撤回临时样式）结果徽标及字形偏扁，B（只给 rank-slot／rank／直接子节点增加临时独立层规则）恢复正常。三份公开状态、目标 `Rect`／`Range`、18px 字号、23.4px 行高、已加载字体和无活动目标动画完全相同；临时样式标记为 false／true／false，QA 均为 false。这支持该组合样式与当前模拟器绘制变化的可逆因果联系，不证明某一单独 CSS 属性是唯一原因，也不推广为所有 Android 或实体设备的结论。

原件和独立核验见 `.artifacts/language-fixes/round2/pt-rank-badge-r8-observation.json`、`rank-aba-r8-verification.json` 及 `diagnostics/hero-rank-r8/`。B 是注入诊断样式的原图，**不是最终修后证据**；R9 必须按新冻结源码重新编译、运行并采集真实原图，不能将 R8 或诊断图片冒充新包 after。

## 2026-11-08 R10 葡语最佳五张牌短标签

R8 的同一张葡语结算原图 `diagnostics/hero-rank-r8/a-original.png` 中，Alex 的未获池页脚实际显示 `Os 5 melhores cartões`，上方牌型为 `Carta alta`。本次仅将精确源键 `最佳五张牌` 的葡语基础值和 override 同步改为 `As 5 melhores cartas`；使用扑克牌术语 `cartas` 及一致的阴性复数冠词 `As`，保留原数字 5 和最佳五张牌的含义。

本次直接读取的 [PokerStars Portugal — Regras do Texas Hold’em](https://www.pokerstars.pt/poker/learn/strategies/regras-do-texas-holdem/) 在目标说明和 Showdown 部分使用 `melhor mão de cinco cartas`；[官方牌型表](https://www.pokerstars.pt/poker/games/rules/hand-rankings/)同时使用 `cinco cartas` 和 `Carta alta`。这些资料支持扑克牌名词和最佳五张牌概念；简短页脚是本项目措辞，不冒称官方界面的逐字引用，也不改变既有葡语语体或构成母语认证。没有扩大扫描长策略句或其它语言。

定向单元检查基础值、override、正式 `loadLocale()` / `localizeText()` 有效值，以及切至英语后再切回葡语的缓存刷新。该单元文件实际 10/10 通过，9 个改动文件格式检查通过。既有摊牌 E2E 追加实际未获池页脚断言，本分工未执行浏览器、构建或原生运行；这些范围由协调者在 R10 冻结后另行验证。旧图及 R9 通过结果不能作为本次新源的修后验收。

## 2026-11-08 R11 人数／无限注页头字段

R10 实际生产原图 `web-r10/pt-pc-1700-header-r10.png`、`pt-pc-1280-header-r10.png` 和 `pt-tablet-landscape-header-r10.png` 的顶部把五位玩家写成 `5 jogos sem limite`（五个游戏）。本次仅枚举同一字段在十一语、5–9 人下的55个有效结果；没有扫描其它字段或长策略句。

| 语言 | 精确源键       | 原值                         | 修正值                       |
| ---- | -------------- | ---------------------------- | ---------------------------- |
| 葡语 | `5 人无限注`   | `5 jogos sem limite`         | `5 jogadores sem limite`     |
| 葡语 | `6 人无限注`   | `6 jogos sem limite`         | `6 jogadores sem limite`     |
| 葡语 | `{0} 人无限注` | `{0} Jogo sem limite`        | `{0} jogadores sem limite`   |
| 西语 | `{0} 人无限注` | `{0} Juegos sin límite`      | `{0} jugadores sin límite`   |
| 意语 | `{0} 人无限注` | `{0} Giocatore senza limite` | `{0} giocatori senza limite` |

西／意语沿用现有正确 5／6 人标签的玩家名词与复数。英语五个值和简／繁中、日、韩、德均保留。葡语本次直接复读 [PokerStars Portugal — Regras do Texas Hold’em](https://www.pokerstars.pt/poker/learn/strategies/regras-do-texas-holdem/) 中以 `jogadores` 表示桌上玩家的段落和常见六／九人格式说明，并核对[官方 Hold’em 规则](https://www.pokerstars.pt/poker/games/texas-holdem/) 的玩家与 No Limit 语境。资料支持人数名词和下注结构，简短组合标签属于本项目措辞，并非官方 UI 逐字引用或母语认证。

七个有效键均同步基础词典与 override。新增 `pr70-player-count-locales.test.js` 对全十一语、5–9 人的基础及正式有效 locale 结果逐一锁定，并检查七个覆盖键；浏览器单个流程用真实设置控件切换人数及全部语言后检查实际可见页头，共55种组合。执行结果以本轮独立日志为准，R10 采集及已中断运行保持旧源身份。
