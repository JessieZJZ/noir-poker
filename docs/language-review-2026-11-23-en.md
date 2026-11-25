# 2026-11-23 英语文案母语化审校

基线为 `b689575`（PR70 分支 `claude/tutorial-ui-optimization-a134c2` 上的提交），修改位于
`claude/lang-review-en-4275f1`。本轮把全部 2,359 条 zh-CN 源文与当前英语有效译文逐条对照，
按以英语为母语、熟悉德州扑克的玩家读法，替换生硬、直译、机器腔或前后不一致的措辞。
不改变发牌、合法动作、底池结算、机器人策略或复盘评级，也没有修改代码、`messages.json`
或其他语言。

**这是 AI 辅助审校，不是真人英语母语者的签字认证。** 运行时拼接出的复盘长句只核对了模板与
调用源码，没有在真实浏览器里逐条触发；真人母语者复核仍然需要。

## 范围与方法

- 有效文案 = `src/i18n/locales/en.json` 叠加 `src/i18n/overrides.json` 的 `"en"` 块，覆盖值优先。
  每个键只在它实际生效的位置修改：覆盖表里已有的键改覆盖值，其余改 locale 文件。没有新增或删除键。
- 覆盖全部 2,359 条：设置、牌桌与动作、日志、玩法指南、牌型、对局记录、复盘与教练段落、
  电脑角色与风格、报错、商店与隐私文案。`en.json` 中另有 660 个不再出现在 `messages.json`
  的旧键，不会显示，本轮未审校。
- 复盘片段与 `{n}` 模板先在 `src/` 中检索中文键，确认与哪些片段、哪个主语拼接后再改写。
  全部 `{n}` 占位保持不变，只在语法需要时调整顺序；`npm run i18n:check` 的占位、数字和
  研究术语校验全部通过。
- 数字、金额、筹码单位、牌面、位置缩写（BTN/SB/BB/UTG…）、人名、日期、归属与证据限制
  保持原意；没有增加源文没有的结论。按钮、标签和标题保持原长度或更短。

## 词汇与语体约定

| 主题               | 约定                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 拼写               | 现有文案以美式为主（favor、realize、analyze），统一为美式：`coloured` → `colored`，`catalogue` → `catalog`。                                |
| 引号               | 撇号与双引号统一为直引号 `'` `"`（原有 156 个直撇号、80 个弯撇号混用）。                                                                    |
| 动作               | Fold、Check、Call、Raise、All-in、Bet；按钮 `最小` 用 `Min`，与 `½ pot`、`Pot` 并列。                                                       |
| 可被匹配的新增投入 | 统一为 “new chips that can be called / the most that can be called”，不再用直译的 “additional investment that can be matched”。             |
| 复盘中的胜率       | 价格门槛、保本线中的“胜率”统一为 equity（break-even equity）。翻前胜率表与胜率计算器保留 “Win rate”，因为此前把它们改成权益表已被用户否决。 |
| 摊牌竞争力／机会   | 统一为 showdown value，不再混用 showdown potential。                                                                                        |
| 局与手             | 局 = game（Game 1、Next game、Game over），手 = hand；不再把“第 N 局”写成 Session。                                                         |
| 风格参数           | 入池宽度 Looseness、进攻倾向 Aggression、诈唬倾向 Bluffing、跟到底倾向 Calling down、强牌诱导 Trapping；情绪“连胜自信”为 Confident。        |
| 游戏设定           | “是游戏设定”译为 part of the game design，避免与设置菜单 Settings 混淆。                                                                    |
| 语体               | 简洁友好的第二人称；去掉 “this hand's decision”、名词堆叠和中文语序，复盘里电脑的动作用过去时叙述。                                         |

## 修改分类与计数

按键去重，相对基线共改变 **630** 条有效英语文案：locale 文件 **355** 条，覆盖表 **275** 条。
没有新增或删除键，其他语言的覆盖块与 locale 文件均未改动。分类按主要原因归入一类，
“措辞自然化”为其余全部修改。

| 类别                                                                       | locale | overrides | 合计 |
| -------------------------------------------------------------------------- | -----: | --------: | ---: |
| 运行时主语的语法（他/她/你/人名拼入后主谓不一致、宾格错误）                |     52 |        37 |   89 |
| 片段与占位位置错误（引导句被塞进句中、把位置当成公共牌、花色名作形容词等） |     10 |         6 |   16 |
| “可被匹配的新增投入”统一说法                                               |     22 |        12 |   34 |
| 复盘价格门槛改为 equity                                                    |     15 |         7 |   22 |
| showdown potential → showdown value                                        |      6 |         1 |    7 |
| 标签、术语与拼写一致性（局、风格参数、Min、牌数标签、美式拼写等）          |     11 |        14 |   25 |
| 仅引号／撇号统一                                                           |     26 |        28 |   54 |
| 措辞自然化（去直译、去名词化、语序、语体、扑克惯用说法）                   |    213 |       170 |  383 |

### 运行时主语的语法

`src/review/opponents.js` 等处把主语 `他`／`她` 代入模板，英语分别显示为 `they`／`she`；
`src/review/matchups.js` 与 `narrative.js` 代入 `你`（`You`）或人名。原译文大量使用
“{0} calls / {0} has / {0} is”，代入后变成 “they calls”“they has”“You is”，或把主语放在宾格位置
（“costs they”“eliminate they”“they's”）。本轮把电脑动作改为过去时叙述（they/she/人名都通顺），
把宾格位置的主语移回主语位置，并避免对这些占位使用所有格。

## 修改示例

| 源文                                                             | 修改前                                                                                                 | 修改后                                                                           |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `{0}不够这个位置的全下标准，{1}选择弃牌，留着筹码等更好的机会。` | … so {1} folds and keeps the chips … （代入后为 “so they folds”）                                      | … so {1} folded and kept the chips for a better spot.                            |
| `{0}被强牌跟注后，这手起手牌的胜算会明显下降。`                  | If {0} is called by a strong hand, …（{0} 实为前一句提示，拼出断句）                                   | {0}If a strong hand calls, this starting hand's chances drop sharply.            |
| `本轮已轮到{0}最后回应，可以免费过牌看翻牌。`                    | {0} is last to respond this round …（代入后为 “You is last”）                                          | This round, the last response falls to {0}, so checking to see the flop is free. |
| `你拿 {0} 在 {1} {2}，争取 {3} 的底池。`                         | With {0}, you {2} on {1}, …（{1} 是位置，{2} 是 “Raise to 600” 这类标签）                              | With {0} in {1}, you chose {2}, contesting a pot of {3}.                         |
| `。其中至少 {0} 无法被匹配，会退回。可被匹配的新增投入最多 {1}`  | … cannot be matched and will be returned. The additional investment that can be matched is at most {1} | … can't be called and will be returned. The most that can be called is {1}       |
| `Mia 加注，其他人都放弃了。…`                                    | Mia raises and everyone else gives up. …                                                               | Mia raises and everyone else folds. …                                            |
| `处于情绪中的对手，头像会亮起对应颜色的光环和图标…`              | … shows a matching coloured halo …                                                                     | … shows a matching colored halo …                                                |
| `底牌 2 张`／`翻牌 3 张`／`转牌 1 张`／`河牌 1 张`（指南流程行） | Hole cards · 2 / Flop 3 / Turn 1 / River 1                                                             | 2 hole cards / 3 flop cards / 1 turn card / 1 river card                         |

## 保留未改与不确定之处

- **`正在发牌…` 保留 `Dealing`**：`tests/e2e/pr70-language-fixes.spec.js` 按 320px 宽度锁定各语言不带省略号的状态，
  曾试改为 `Dealing…` 后撤回，未修改该测试。
- **胜率表与计算器保留 Win rate**：严格的扑克英语会称 equity，但此前这一语义修改已被用户否决（CN-03a 等），本轮不重开。
  只有复盘中的保本线、价格门槛改为 equity。
- **句首小写主语**：`他`、`她` 的覆盖值为小写 `they`／`she`，当模板把主语放在句首时会显示为小写；`你` 为 `You`，
  在句中会显示大写。完整修正需要在英语本地化后做句首大写／句中小写处理，属于代码改动，本轮只通过改写模板减少出现。
- **前后空格**：部分片段译文带首尾空格（例如 ` Players behind can still bet. …`），用于与相邻片段拼接，均原样保留。
- **风格首字母**：`均衡` 的首字母键 `均` 继续用 `B`（Balanced）。
- **“若改为跟注，”接整句**：`src/review/coaching.js` 的 `callingPlan` 有时接在该片段后，有时单独成句，
  英语无法用同一个小写开头同时满足两种用法；片段改为 `If you call instead: `，后接完整句子。
- **仍可能生硬之处**：以 `{0}{1}` 连续占位开头、只在特定牌局出现的长复盘模板，只能按源码推断拼接结果；
  个别句子（如 `我的决策`、`本局信息`、`本局练习` 中 Session/Game 的取舍）保留原译，需要真人在真实复盘中再看。

## 源文问题（未修改，供源文作者判断）

- `翻前牌组对比：{0}已经成对，{1}仍未成对，但面对 {2} 这样的更大对子会处于下风…`：“但”后的主语不清，
  无法确定落后于 {2} 的是 {0} 还是 {1}，英语沿用原有理解。
- `这张 {0} 是多人底池，一对更容易遇到两对或暗三条…`：主语是一张牌，却说“是多人底池”，疑似漏了“在…上”。
- `本局信息`、`本局练习` 与 `本次练习净变化` 交替使用“局”和“练习”，英语分别保留 Session/Game 的既有用法。

## 固定字符串测试

改动后首轮 `npm test` 有 11 项英语断言失败。测试意图仍能由自然英语满足的，改文案而不改测试：

- `正在发牌…`（E2E 锁定不带省略号）恢复为 `Dealing`；
- 重打说明保留 `Next hand starts a new deal`，风格参数说明保留 “only with strong hands on safe boards”；
- 淘汰提示改用 “would be eliminated”，河牌对手过牌估计改用 “estimated / estimating”，最后行动跟注改回
  “calling closes the action for this round”，按价格跟注保留 “at the current price”。

属于有意改进的措辞，只更新对应的英语断言行，测试意图不变：

| 测试文件                                       | 英语断言的修改                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/i18n.test.js`                      | 全下待回应玩家 “still to respond … could come in with strong hands”；加注权未重开整句；“last to respond this round” |
| `tests/unit/checked-reading-i18n.test.js`      | 估计语义的正则由 `/estimates\|possible\|possib/i` 放宽为 `/estimat\|possib/i`                                       |
| `tests/unit/implied-cost-review-i18n.test.js`  | 英语真值改为直撇号 `opponent's`                                                                                     |
| `tests/unit/multiway-call-review-i18n.test.js` | `calls with` → `called with`（电脑动作改为过去时）                                                                  |
| `tests/unit/pr70-locales-en-es-it-pt.test.js`  | 半池说明的 6 条含义正则改为新措辞（call is added first、don't need to press Call first 等）                         |

隐私页 `public/app-privacy.html` 由 `npm run i18n:privacy` 重新生成并经 Prettier 格式化，
差异只在英语 article 的 4 段（本地数据、公开行动观察、电脑角色设定、复盘说明）。

## 验证

- `npm run i18n:check`：2,359 条、11 种语言无缺失与占位变化；研究文案 64 条结构化与 9 条风格摘要的数字、牌面与术语保持。
- `npm test`：1,883 项全部通过。
- `npm run format:check`：通过。
- 语言 E2E（`NOIR_E2E_PORT=4201`，`i18n`、`locale-layout`、`pr70-language-fixes`、`player-research-i18n`）：首轮 108 通过、17 跳过、7 失败。
  其中 `pr70-language-fixes.spec.js:524`（桌面与手机）锁定旧的 “calls wide with”，已把英语断言改为 “called wide with”，复跑通过。
  其余 5 项均为页面启动 5 秒内未出现 `data-app-ready`（pt/fr/ru 角色介绍、菜单图标、zh-CN 离线流程），与英语文案无关；
  复跑时 `player-research-i18n` 与菜单测试通过，`i18n.spec.js:45` 的离线流程在机器负载约 40（多个并行会话同时运行 Playwright）时
  仍有多语言超时。把 `en.json` 与 `overrides.json` 临时恢复为基线后在同一负载下复跑，同一测试失败更多（13 项），
  因此判断为环境负载导致的启动超时，而非本次修改；需在空闲机器或 CI 上重跑确认。

所有修改只涉及 `en.json`、`overrides.json` 的 `"en"` 块、重新生成的隐私页、本说明文件，以及上表中的英语断言行。
未运行原生构建、模拟器或微信开发者工具；本轮也没有在真实浏览器中逐条触发所有复盘分支。

## 合并后的修正

十种语言合并进 PR 70 之后，补做了本轮留下的代码层和源文问题：

- **代词大小写**：`src/i18n/index.js` 在翻译时标记填入模板的 `你`／`他`／`她`，最后按它在整句中的位置定大小写：
  句首（或 `.` `!` `?` 之后）首字母大写，句中一律小写，冒号后保持原样。适用于 en、de、fr、es、pt、it；
  ru 只处理 `他`／`她`，保留大写的尊称 «Вы»；中日韩不变。
- **拼接空格**：非中日语言输出时把词间连续空格合并为一个，“This time, You in CO 2-bet” 现为 “This time, you in CO 2-bet”。
- **中文源文**：`翻前牌组对比` 改为“{0}已经成对，领先仍未成对的 {1}，但面对 {2}…”，主语明确；
  `这张 {0} 是多人底池` 改为“这是多人底池，在 {0} 这个牌面上，…”。各语言沿用原译，en 与 zh-TW 随源文调整。
- **“局”的用词**：统一为“局 = 一次完整的比赛”（局结束时筹码与统计归零）。`本次练习净变化` 改为 `本局净变化`，
  EV 说明里“本局电脑的实际行动原因”改为“这手牌中电脑的实际行动原因”（复盘针对单手牌）；
  en／de／es／it／ru 的“本局信息”“本局练习”由 Session 一类说法改为 Game／Partida／Spiel／Partita／Игра。
