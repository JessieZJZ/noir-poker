# 2026-11-23 德语文案母语化审校记录

分支 `claude/lang-review-de-4d54cc`，基线 `b689575`（由 PR70 `claude/tutorial-ui-optimization-a134c2` 切出）。本轮只修改德语：`src/i18n/locales/de.json` 与 `src/i18n/overrides.json` 的 `"de"` 区块。未改动其他语言区块、`messages.json`、中文源文或任何代码。

**这是 AI 辅助的语言审校，不是真人德语母语者的签字认证。** 判断标准是“一位会打德州扑克的德语母语玩家读起来是否自然、术语是否一致”，但最终仍建议由真人母语者抽查。

## 范围与方法

- 覆盖 `messages.json` 的全部 2,359 条源文。按“override 优先于 locale”的实际生效值逐条审读，修改落在生效的位置：键在 `"de"` override 中就改 override，否则改 `de.json`。
- 用临时脚本把每条源文、当前译文和来源文件（`index.html`、`src/ui/`、`src/engine/`、`src/review/`、`characters.json`、`privacy-source.json`）分成 41 组逐组审读。脚本留在会话暂存区，未进入仓库。
- 复盘里的片段和 `{n}` 模板会在运行时拼接（`src/review/narrative.js`、`coaching.js`、`opponents.js`、`matchups.js` 等）。改写片段前先在 `src/` 中查找其中文键，确认它和哪些片段拼接，再选择能拼成通顺句子的德语写法。所有 `{n}` 槽位均保留，必要时调整了顺序。
- `de.json` 中另有 1,301 个不在当前 `messages.json` 中的旧兼容键，本轮未改动。

## 术语与语体决定

| 中文                                   | 德语                                                                | 说明                                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 称呼                                   | du                                                                  | 延续上一轮决定；把残留的 „sollte man“ 等改为 du。                                                             |
| 顺子                                   | Straße                                                              | 只用于牌型。                                                                                                  |
| 街（翻牌后各轮）                       | Street / Streets（后街 = spätere Streets）                          | 原译把“街”也写成 Straße，与顺子同词，出现过 „Karten der nächsten Straße“ 这种歧义。本轮共修正 39 个键。       |
| 本轮                                   | Setzrunde / Runde                                                   | 不变。                                                                                                        |
| 底牌                                   | Hole Cards                                                          | 统一替换 Startkarten / Handkarten；起手牌仍为 Starthand。                                                     |
| 边池 / 主池                            | Side Pot / Hauptpot                                                 | 按任务约定，替换原有的 Nebenpot。                                                                             |
| 合法动作                               | erlaubte Aktionen                                                   | 德语 „legal“ 偏“合法律的”，扑克语境用 erlaubt。                                                               |
| 跟注价格                               | Preis für den Call / Preis                                          | 替换不自然的 Callpreis。                                                                                      |
| 电脑、机器人                           | Computergegner（技术错误信息保留 Bot）                              | 不再用单独的 „Computer“ 指对手。                                                                              |
| 情绪                                   | Emotion（Emotionssimulation、Emotionsanzeigen）                     | 统一替换混用的 Stimmung / Gefühlszustand。                                                                    |
| 半诈唬、价值下注、听牌                 | Semi-Bluff、Value-Bet、Straight-Draw、Flush-Draw、Nut-Flush-Draw    | 英语借词组成德语复合词时统一加连字符。                                                                        |
| 加注                                   | der Raise（einen Raise）                                            | 修正 „das Raise / ein normales Raise“ 的性别不一致。                                                          |
| 更宽（范围）                           | breiter                                                             | 原译 „eine weitere Range“ 在德语里会被读成“另一个范围”，改为 breitere Range。                                 |
| 可被匹配的新增投入最多 X               | „von deinem zusätzlichen Einsatz können höchstens X gecallt werden“ | 替换生硬的 „der zusätzlich deckbare Einsatz“。                                                                |
| 保本门槛 / 保本胜率                    | Gewinnschwelle / nötige Gewinnquote                                 | 不变。                                                                                                        |
| 行动按钮：弃牌、过牌、跟注、加注、全下 | Passen、Checken、Mitgehen、Erhöhen、All-in                          | 保留上一轮采用的 PokerStars 德语客户端用词，新手教学也以此为基础；复盘正文使用 folden/checken/callen/raisen。 |
| 已弃牌状态                             | Gepasst · / · gefoldet                                              | 保留 `docs/pr70-language-fixes-ja-ko-de.md` 记录的约定。                                                      |

其他：引号统一用 „…“；冒号后接完整句时首字母大写；名词复合词按德语正写法合写或加连字符；尽量把名词化长句拆成自然语序。按钮、标签和标题保持原长度或更短。

## 修改统计

共改 614 个实际生效的键：`de.json` 349 个，`"de"` override 265 个。另外，`盲注已封顶` 在 `de.json` 中被 override 遮住的旧值也同步为新值（单测要求两处一致），所以 `de.json` 的改动行数是 350。下表按每个键的主要修改原因只计一次（脚本粗分，很多键同时涉及多类）。

| 类别                                                                      | de.json | override | 合计 |
| ------------------------------------------------------------------------- | ------: | -------: | ---: |
| 机器翻译残留、错译或语义错误                                              |      15 |        4 |   19 |
| “街”误用 Straße，改为 Street                                              |      14 |       25 |   39 |
| “可被匹配的新增投入”固定句式                                              |      20 |        6 |   26 |
| 底牌统一为 Hole Cards                                                     |      18 |       10 |   28 |
| 术语拼写与一致性（Semi-Bluff、Value-Bet、Draw、Side Pot、Range 复合词等） |      81 |       56 |  137 |
| 语法：Raise 的性、breiter/weiter、与格拼接片段                            |      22 |       28 |   50 |
| 其他自然语序、语体和措辞改进                                              |     179 |      136 |  315 |

## 修改示例

| 源文                                                           | 修改前                                                                                       | 修改后                                                                                                                                |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 对手风格与座位                                                 | Stile und Sitzungen des Gegners.                                                             | Gegnerstile und Sitze                                                                                                                 |
| 本手动态，按时间顺序排列                                       | Dynamischer, in Zeitordnung bestellt.                                                        | Handverlauf in zeitlicher Reihenfolge                                                                                                 |
| 全下行动结束 · 底牌已亮出，等待剩余公共牌…                     | All-in Action End · Lochkarten wurden veröffentlicht, warten auf den Rest der Tabelle ...    | All-in · Hole Cards aufgedeckt, restliche Boardkarten folgen …                                                                        |
| 本地德州扑克练习。所有筹码均为虚拟筹码…                        | Alle Chips sind virtuell, ohne Geld-Rückzahlung, Preise oder echtes Geld-Wetten.（漏译首句） | Lokales Texas-Hold’em-Training. Alle Chips sind virtuell – kein Umtausch in Geld, keine Preise, keine Echtgeldeinsätze.               |
| Outs：下一张牌能让这手牌单独领先的牌。                         | Outs: Karten der nächsten Straße, die diese Hand allein in Führung bringen.                  | Outs: Karten, die dieser Hand als nächste Karte allein die Führung verschaffen.                                                       |
| A 底牌阻断部分 AA、AK、AQ 组合，后位允许比早位更宽的开池范围。 | … In später Position kannst du eine weitere Range eröffnen als in früher Position.           | … In später Position kannst du breiter eröffnen als in früher Position.                                                               |
| 进一步了解：最小加注、半池 / 底池和边池                        | Mehr Informationen: Mindesthöhe, Halbpool/Pot und Sidepot                                    | Mehr dazu: Mindest-Raise, ½ Pot / Pot und Side Pots                                                                                   |
| 本轮还有 {0} 人能行动，过牌保留了面对{1}下注再决定的机会。     | … nach dem Check kannst du noch auf eine Bet reagieren ({1}).                                | … nach dem Check kannst du auf eine Bet von {1} noch reagieren.（并把 `该玩家`/`这些玩家` 改为与格 diesem Spieler / diesen Spielern） |

## 未改动或存疑的地方

- **行动按钮用词**：按钮仍是 Passen / Checken / Mitgehen / Erhöhen。任务要求使用 Fold/Check/Call/Raise 等标准术语，本轮把它理解为正文术语；按钮沿用上一轮依据 PokerStars 德语客户端确定的用词，新手教学全文也以此为基础。若希望按钮改为 Fold/Check/Call/Raise，需要同步改写引用按钮名的教学与牌桌提示（含这些动词的生效译文约 90 条，需逐条区分按钮名与正文）。指南里原本称按钮为 „Call“ / „Raise“ 的段落已改为引用实际按钮名。
- **已锁定的旧修复**：`避免弱 A 被强继续范围压制…`（DE 重复退化修复）、`在这两种假设下…倾向停止投入` 等有记录或单测保护的句子保持原样。
- **牌桌阶段标签**：`正在发牌…` 保留短标签 „Austeilen“。它在 320 px 宽的牌桌上显示为阶段标签，较长的 „Karten werden ausgeteilt …“ 放不下，E2E 也锁定了短标签。
- **Kandidatenaktionen**（候选行动）是偏技术的说法，但在复盘里含义一致，暂未改。
- 旧兼容键（1,301 个）未逐条审读，它们不在当前源文清单中。

## 发现的源文或代码问题（未修改，仅记录）

1. 牌型标签（如 `一对` → „Ein Paar“）作为独立标签首字母大写，被代码拼进句中时会出现 „Mit AK hast du auf K72 Ein Paar“ 这样的大写。需要代码区分“标题用标签”和“句中用标签”。
2. `本轮还有 {0} 人能行动…` 在人数为 1 时，德语会得到 „können noch 1 Spieler handeln“。中文不分单复数，代码没有单数分支。
3. `轮到你行动，` 是从 `只有强制投入或未轮到你行动，…` 中抽出的片段键，单独存在没有意义。
4. `过牌保留了面对` + `该玩家/这些玩家` + `下注再决定的机会。` 依靠片段拼接，德语需要与格；本轮把这两个代词键译成与格。如果以后代码在主格位置复用这两个键，需要拆分。
5. 新手教学说“点加注按钮”时可能实际处在无人下注、按钮显示为下注的状态，本轮未在界面中核实按钮实际文字。

## 锁定字符串与单测

- 为了少动单测，三处已锁定的说法保留原用词：边池说明中的 „gefoldeter Spieler“、重打说明中的 „Statistiken werden zurückgenommen / bereits einen Teil der Karten kennst / keine langfristige Profitabilität“、阻断说明中的 „reduziert“，以及 CL 说明里源文本身的 „chip leader“。
- 只改了两条 `de` 断言，测试意图不变：
  - `tests/unit/implied-cost-review-i18n.test.js`：„sollte man folden“ → „solltest du folden“（统一 du 语体）。
  - `tests/unit/pr70-locales-ja-ko-de.test.js`：outs 句的断言改为 „9 direkte Outs“ 与 „ein Sieg ist damit nicht garantiert“，仍检查张数、百分比和“不保证获胜”。

## 校验

- `npm run i18n:check`：通过（2,359 条源文，11 语言，无缺失或占位符变化；研究文本数字与术语保留）。
- `npm test`、`npm run format:check` 与四个语言 E2E 规格（`NOIR_E2E_PORT=4205`）的结果见提交说明与最终报告。
