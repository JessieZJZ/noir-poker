# PR70 英语、西班牙语、意大利语、葡萄牙语文案修复

基线为 PR70 的 `38337032eacf30eae24fdeb00da07451b1e7a099`，修改位于
`codex/pr70-language-fixes`。本轮按原问题卡片及当前实际源码逐项核对，修复四语
locale；不改变发牌、合法动作、底池结算、机器人策略或复盘评级。

这是 AI 语言审校，并非真人母语者认证。原报告的模拟器截图用于确认旧问题，不能作为本次新译文的装机验证。

## 官方来源与核对范围

2026-11-06 联网核对以下第一方资料。使用其术语与规则定义核对中文源文含义，未调用第三方机器翻译服务，也没有逐段复制外部文章。

| 语言     | 第一方资料                                                                                                                                                                                                       | 本次核对                                                                                                               |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 英语     | [PokerStars — Poker Rules](https://www.pokerstars.com/poker/games/rules/)；[Texas Hold’em](https://www.pokerstars.com/poker/games/texas-holdem/)                                                                 | check/call/raise/fold、hole cards/community cards、side pot/split pot、no-limit、跟注计入底池尺度的含义                |
| 西班牙语 | [PokerStars España — Reglas del poker](https://www.pokerstars.es/poker/games/rules/)；[Texas Hold’em](https://www.pokerstars.es/poker/games/texas-holdem/)；[Glosario](https://www.pokerstars.es/poker/glosario) | pasar/igualar/subir/retirarse、ciega pequeña/grande、bote secundario、九类牌型名称                                     |
| 意大利语 | [PokerStars — Regole del poker](https://www.pokerstars.com/it/poker/games/rules/)；[PokerStars Italia — Regole](https://www.pokerstars.it/poker/regole)；[Glossario](https://www.pokerstars.it/poker/glossario)  | check/call/rilancio/fold、piatto laterale、scala colore/poker/full/colore/scala/tris、私人牌与公共牌的区别             |
| 葡萄牙语 | [PokerStars Brasil — Regras de Poker](https://www.pokerstars.com/pt-BR/poker/games/rules/?no_redirect=1)                                                                                                         | pagar/aumentar/desistir、small blind/big blind、pote paralelo、straight flush/quadra/full house/flush/sequência/trinca |

部分地区站点的重复抓取返回 403；本次同时保留了成功取得的官方页面内容及官方搜索索引结果，意大利语另以官方 `.com/it` 规则页交叉核对。没有据此声称地区站点始终可访问。

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
变更键清单为 `.artifacts/language-fixes/changed-keys-en-es-it-pt.json`。四语相对基线分别修改或新增 69、85、81、86 个键；78 张原卡片的逐 ID 归属和源键映射见 `.artifacts/language-fixes/coverage-en-es-it-pt.json`。

`tests/unit/pr70-locales-en-es-it-pt.test.js` 使用实际 `loadLocale` / `localizeText`，检查九类排序与独立标签一致、下注计算边界、参数限制、输牌/未发公共牌状态、动态名字和筹码单位、重打语义、无障碍名称、条件复盘和新增公共键。
这些检查可以捕捉“locale 已改但 overrides 又覆盖回旧词”的问题。

2026-11-06，合入必要覆盖值后的专项测试 **9/9 通过**；四个 locale、本测试和本文档的 Prettier 检查通过，四语 locale 的 `git diff --check` 通过。未运行全套测试或 native 构建。公共合入后需要统一运行项目检查，并重新验收窄屏按钮、横向参数表、动态日志、复盘全文及读屏名称。

## 公共部分与证据边界

- EN-08 的相邻节点空格、计算器百分比本地格式、动态 actor/BTN 日志拆分、提示位置和布局由公共代码任务处理，不能只靠修改词典解决。
- 旧 Android 模拟器英雄信息行被压扁属于观察项，本任务未归因为语言或字体，未修改图形实现。
- 未运行新的 iOS/Android 已安装应用、实体机、VoiceOver/TalkBack、长局涨盲或完整重打流程；旧截图不能当作修复后验收。
- 用户否定的同类指标解释/入口产品设计保持原样；本任务只修复真实文案、术语、可访问名称及已授权的新源文字。
