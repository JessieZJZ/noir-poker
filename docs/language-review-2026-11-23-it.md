# 2026-11-23 意大利语全量母语化审校

基线为 `claude/tutorial-ui-optimization-a134c2`（PR70 分支）上的 `b689575`，修改位于 `claude/lang-review-it-60d8c4`。本轮按意大利语母语、熟悉线下与线上扑克的玩家视角，逐条阅读全部 2,359 条 zh-CN 源文及其意语有效译文，把直译、机翻腔、术语不统一和错误译文改为自然的意语表达。

这是 AI 辅助的语言审校，不是真人意大利语母语者的签字认证。规则含义沿用 `docs/pr70-language-fixes-en-es-it-pt.md` 已核对的 PokerStars 意语规则与术语，本轮未调用任何第三方机器翻译服务；发牌、合法动作、底池结算、机器人策略、复盘评级及源码均未修改。

## 范围

- 有效文案为 `src/i18n/locales/it.json` 叠加 `src/i18n/overrides.json` 的 `"it"` 区块，覆盖优先。每个键在其生效位置修改：已在覆盖表中的键改覆盖值，其余改 locale 文件。没有修改其他语言区块、`messages.json`、中文源文或任何代码。
- 覆盖设置、牌桌与动作、牌局日志、玩法指南、牌型、对局记录、复盘与教练段落、角色与玩家研究、错误提示、商店与隐私文案。
- 复盘中大量句子由 `src/review/*.js` 运行时拼接。改写片段或 `{n}` 模板前，先在 `src/` 中查找该中文键的拼接方式，保证拼接后的意语句子通顺；所有 `{n}` 槽位保留，必要时调整顺序。
- 数字、金额、筹码单位、牌面、位置代码（BTN/SB/BB/UTG/CO…）、人名、日期、署名、链接和证据限定均保持原样，没有新增源文没有的结论。
- 按钮、标签、标题等短文案保持原长度或更短。

## 术语与语体决定

| 中文                     | 意语采用                                                                                     | 说明                                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 弃牌 / 过牌 / 跟注       | 按钮保留 `Fold` / `Check` / `Call`；正文用 fare fold/foldare、fare check、chiamare/fare call | 沿用 PR70 已定的按钮名；正文混用的 passare（易与 check 混淆）、mollare 改为 foldare                                      |
| 加注 / 再加注            | rilanciare / controrilanciare；挤压 squeeze；隔离 rilancio di isolamento                     | 正文不再用英文 raise；`shove` 统一为 all-in                                                                              |
| 筹码 / 面额              | `fiches`（阴性复数）/ `taglio` delle fiches                                                  | 原来 chip 与 fiches 各约一半，统一为 fiches；仅保留专有名 `chip leader (CL)`                                             |
| 小盲 / 大盲 / 盲注       | piccolo buio / grande buio / bui；代码 SB、BB 不变                                           | 去掉正文中的 small blind / big blind                                                                                     |
| 庄位                     | bottone（BTN）                                                                               |                                                                                                                          |
| 街 / 本轮                | street（la street）/ questo giro (di puntate)                                                | 原 strada/strade 为直译；“路径”义的 strade 保留                                                                          |
| 底牌 / 公共牌            | carte coperte、le tue carte / carte comuni、board                                            | 去掉 carte private、comunitarie 等不统一说法                                                                             |
| 成牌 / 听牌 / 补牌       | mano fatta / progetto / outs                                                                 | 去掉 mano (già) formata、punto（作“当前牌”义）                                                                           |
| 卡顺 / 两头顺 / 双卡顺   | scala interna (gutshot) / scala bilaterale / doppia scala interna                            | 原来 incastro 与 interna 混用                                                                                            |
| 口袋对子 / 暗三条        | coppia servita / set                                                                         | 原 coppia in mano 统一为 coppia servita                                                                                  |
| 前位 / 中位 / 后位       | prime posizioni / posizione intermedia / ultime posizioni                                    | 去掉 early、late、posizione avanzata（意义含糊）                                                                         |
| 尺度 / 薄价值            | size / valore sottile；半诈唬 semi-bluff；埋牌 slowplay；平跟 flat call                      | 去掉 dimensione、misura、sizing、semibluff 混写                                                                          |
| 可被匹配的新增投入最多 X | la parte di puntata che può essere chiamata è al massimo X                                   | 原 “investimento aggiuntivo che può essere coperto” 读不懂；退回部分对应 “non può essere chiamato e ti verrà restituito” |
| 胜率（保本所需）         | equity（ti serve almeno il X di equity）；表格列仍为 % vittorie                              |                                                                                                                          |
| 合法 / 对手              | consentito / avversario                                                                      | 去掉 legale、rivale                                                                                                      |
| 局 / 手                  | partita / mano                                                                               | 原 sessione 与 partita 混用                                                                                              |

语体统一用 tu。撇号统一为排印撇号 ’（基线有 166 条使用直撇号，现为 0），引号统一为 «…»。

## 修改统计

相对基线按键去重的词典差异：

| 文件                                | 修改键数 |
| ----------------------------------- | -------: |
| `src/i18n/locales/it.json`          |      555 |
| `src/i18n/overrides.json` 的 `"it"` |      533 |
| 合并后有效文案改变                  |    1,085 |

没有新增或删除键。locale 的 555 个键中包含 3 个被覆盖或已不在 `messages.json` 的人数标签旧键（`6 人无限注`、`{0} 人无限注`、`人无限注`），它们仍参与运行时回退与人数标签回归，因此同步为 “N giocatori · No Limit”。主要类别如下（一条可同时属于多类，数字为“locale / 覆盖表”）：

| 类别                                                        | 涉及键数 |
| ----------------------------------------------------------- | -------: |
| chip → fiches 统一                                          |  56 / 52 |
| 撇号改为 ’（多数同时有其他改写）                            | 53 / 113 |
| passare / mollare 表示弃牌改为 fold / foldare               |  23 / 16 |
| “copribile / può essere coperto” 改为“可被跟注”的清晰表达   |   27 / 4 |
| mano formata → mano fatta                                   |   3 / 51 |
| carte private / comunitarie → carte coperte / carte comuni  |  18 / 17 |
| dimensione / misura / sizing → size                         |   9 / 15 |
| strada → street                                             |   10 / 5 |
| early / late / avanzata → prime / ultime posizioni          |   2 / 14 |
| semibluff → semi-bluff；shove → all-in；rivale → avversario |  37 / 26 |
| 完整句首尾多余空格                                          |  92 / 33 |

其余改动为整句重写：拆开或合并机翻长句、修正主谓一致和阴阳性、把“Questo è…”式直译改成自然句式、复盘提示改成玩家口吻。

## 修正示例

| 键（节选）                                              | 修改前                                                           | 修改后                                                                |
| ------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------- |
| `公共牌{0}`                                             | Il consiglio {0}                                                 | Board {0}                                                             |
| `转牌 1 张`（指南流程条）                               | Torna 1                                                          | 1 al turn（同组为 3 al flop、1 al river）                             |
| `牌桌已就绪，开始你的第一手。`                          | La tavola è pronta, inizi la prima mano.                         | Il tavolo è pronto: inizia la tua prima mano.                         |
| `本手尚未结束，或缺少原始发牌记录。`                    | …o il record originale dell'accordo è mancato.                   | …oppure manca la registrazione della distribuzione originale.         |
| `未被跟注的`（日志片段）                                | Non è chiamato.                                                  | non chiamate                                                          |
| `均`（多人跟注拼接片段）                                | E（拼成 “Alex、MiaECall 600”）                                   | `: `（拼成 “Alex、Mia: Call 600”）                                    |
| `本地德州扑克练习。所有筹码均为虚拟筹码…`               | 漏译第一句                                                       | Allenamento a Texas Hold’em in locale. Tutte le fiches sono virtuali… |
| `{0} 仍能赢较弱成牌，但这次可被匹配的新增投入最多 {1}…` | …dell’investimento aggiuntivo si possono coprire al massimo {1}… | …la parte di puntata che può essere chiamata è al massimo {1}…        |
| `{0}的 {1} 击中了{2}的底牌，现在是{3}。`                | Il {1} del {0} migliora le carte di {2}, che ora ha {3}.         | {0}: {1} si collega alle carte coperte. Mano attuale ({2}): {3}.      |
| `剩下的 {0} 位对手都已全下…`                            | Tutti i {0} avversari rimasti…（N=1 时为 “Tutti i 1 avversari”） | Tutti gli avversari rimasti ({0}) sono all-in…                        |

## 保留未改与存疑

- `你` 被插入第三人称模板时，运行时会得到 “Tu”，意语动词无法同时对应 “tu hai / Alex ha”。本轮在能改的模板中改用标签或括号结构（如 “Mano attuale (Tu): …”“eliminazione (Tu)”），避免 “le carte di Tu”；根本解决需要代码区分主语，不在本任务范围。
- 拼接片段中残留的中文顿号 `、`（如多人跟注名单）来自代码，没有对应键可译，属于代码层问题。
- 计数为 1 时的复数（如 “1 giocatori”）：能确定可为 1 的计数已改为 “Avversari ancora in mano: N” 等标签式；多人底池语境中计数必然 ≥2 的句子保持复数写法。
- 情绪标签 `急于追回`、`连胜自信` 分别改为 Voglia di rifarsi、In fiducia；其余标签（Stabile、Più prudente、Contrattacco sotto pressione）未改。
- 牌型排序整句保留 “Punti dal più forte al più debole”，各牌型名称与 PR70 已核对的独立标签一致。
- locale 文件中另有 1,292 个已不在 `messages.json` 的旧键，运行时仍可能参与短语回退匹配；本轮按要求只审校当前 2,359 条，除上述 3 个人数标签外，没有清理或改写这些旧键。

## 源文疑点

- `均` 作为单字键只用于 `名单 + 均跟注 X` 的拼接，单独翻译容易误配；建议源码生成完整句式。
- 若干复盘模板（如 `{0}的下注线是{1}，{2}这次面对的是连续施压…`、`跟注全下输了{0}就会出局`）把 `你` 与对手名填入同一主语位置，所有屈折语言都无法同时写对人称。

## 验证

- `npm run i18n:check`：通过（2,359 条、11 种语言、占位符与研究事实未变）。
- `npm test`：1,883 / 1,883 通过。
- `npm run format:check`：通过。`npm run i18n:privacy` 重新生成了 `public/app-privacy.html`（意语隐私段落随新译文更新）。
- 语言 E2E（端口 4208，`i18n.spec.js`、`locale-layout.spec.js`、`pr70-language-fixes.spec.js`、`player-research-i18n.spec.js`）：首轮 113 通过、17 跳过、2 失败；失败为回放发牌帧 `#street-label` 期望短状态 “Distribuzione”，我曾改为 “Distribuzione delle carte…”，已恢复短标签，该用例双端复测通过。
- 为本轮有意改进的文案更新了固定字符串断言，只改 `it` 行并保留原测试意图：`tests/unit/pr70-locales-en-es-it-pt.test.js`（尺度说明、参数说明、重打说明）、`tests/unit/implied-cost-review-i18n.test.js`（4 条）、`tests/unit/pr70-player-count-locales.test.js` 及 `tests/fixtures/pr70-player-count-locales.js`（人数标签）。
- 浏览器 E2E 只验证 Web；没有在原生 App、模拟器或微信开发者工具中查看意语排版，也没有真人母语者复核。
