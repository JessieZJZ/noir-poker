# 法语文案母语化审校（2026-11-23）

本轮按“法语母语、熟悉扑克的玩家”的读法通读了法语目录，基线为 `claude/tutorial-ui-optimization-a134c2`（PR #70 分支）的 `b689575`，工作分支为 `claude/lang-review-fr-38d0ad`。

这是 **AI 辅助审校**，不是真人法语母语者的签字验收。结论只代表本轮逐句阅读与自动检查的结果，原有翻译来源记录及全目录语言认证状态保持不变。

## 范围

- 审读对象：`src/i18n/messages.json` 的全部 2,359 条简中源文，逐条对照实际生效的法语值。
  - 实际生效的法语值为 `src/i18n/locales/fr.json` 与 `src/i18n/overrides.json` 中 `"fr"` 区块合并后的结果，区块优先。
  - 每条修改都写在它实际生效的位置：键在区块中就改区块，否则改 locale 文件。
- 只修改法语。没有改动其他语言区块、`messages.json`、中文源文或任何代码。
- 两个目录中另有约 1,432 个不在 `messages.json` 里的键。
  - 其中一部分仍在运行时生效，例如 `{0} 加注至 {1}` 一类日志模板，另一部分已过时。
  - 本轮没有逐条审读这些键，也没有改动它们（见“未处理与存疑”）。
- 审读运行时拼接的片段前，先在 `src/` 中定位拼接代码，涉及 `poker.js` 日志、`public-story.js`、`narrative.js`、`opponents.js`、`analysis.js`、`tournament.js`、`hand-features.js` 等。
  - 随后用 `tests/fixtures/review-practice-focus.json` 的 37 个复盘场景实际渲染法语理由，检查整句读感。

## 术语与语体约定

| 中文                      | 法语                                                                                                   | 说明                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| 弃牌 / 过牌 / 跟注 / 加注 | se coucher / checker / suivre / relancer                                                               | 按钮保留不定式 `Se coucher`、`Checker`、`Suivre`、`Relancer`。教学正文中 `parole` 只用于“parler en dernier”等固定说法。        |
| 再加注 / 全下             | surrelancer、surrelance（可写 3-bet） / tapis、faire tapis、à tapis                                    |                                                                                                                                |
| 摊牌 / 边池 / 主池        | abattage / pot secondaire / pot principal                                                              | 统一取代残留的 `pot annexe`。                                                                                                  |
| 小盲 / 大盲               | petite blinde / grosse blinde                                                                          | 沿用 PokerStars FR 的 `blinde` 拼法，消除残留的 `blind`。                                                                      |
| 底牌 / 口袋对子 / 暗三条  | cartes privatives / paire servie / set                                                                 | `cartes privatives` 为既有回归钉住的说法。`paire en main`、`brelan avec paire en main`、`Cartes fermées` 均已统一。            |
| 两对（牌型名）            | Double paire                                                                                           | 与指南牌型排序一致；正文中“touche deux paires”等自然说法保留。                                                                 |
| 补码                      | recave / se recaver                                                                                    | 取代 `recharge`，这是法国扑克室对 rebuy 的通用说法。                                                                           |
| 电脑 / 电脑角色           | bots / personnage                                                                                      | 取代 `adversaires informatiques`、`l’ordinateur`。                                                                             |
| 本局 / 第 N 局            | partie / Partie N                                                                                      | 标题 `本局练习` 改为 `Partie en cours`，与 `本局结束` 的 `Partie terminée` 成对。                                              |
| 复盘                      | analyse                                                                                                | 按钮为 `Analyser cette main`，教学正文中的按钮引用同步修改。                                                                   |
| 湿润面 / 干燥面           | board humide / board sec                                                                               | 统一取代混用的 `dynamique`。                                                                                                   |
| 价值下注 / 薄价值         | mise de value / thin value                                                                             | 统一取代 `valeur fine`、`pour valeur`。展示价值（valeur à l’abattage）、筹码面额（valeur unitaire）等非术语用法保留 `valeur`。 |
| 牌面纹理标签              | pairé、bicolore、rainbow、bien connecté、dépareillé et peu connecté、à trois cartes de même couleur 等 | 改为可直接接在 `board` 后的形容词短语，消除“board board rainbow”“board Le board contient une paire”。                          |
| 情绪 / 模拟状态           | émotion(s) / Humeur simulée                                                                            |                                                                                                                                |

- **语体**：全目录沿用既有的 `vous`，祈使句也用 `vous` 形式（`Touchez`、`Comparez`），没有出现 `tu`。
- **移动端用词**：教学中的“点击”统一为 `Touchez`。
- **日志格式**：行动日志保持 `Nom · Action` 标签式，例如 `Alex · Relancer à 600`。
  - 英雄的名字渲染为 `Vous`，若改成第三人称动词句（`Vous se couche`）会出现变位错误。
  - 因此只统一了这一格式内部的不一致，例如未跟注退还写作 `{0} · {1} jetons non suivis rendus`，补码写作 `{0} · Recave de …`。
- **主语槽位**：部分模板的主语槽可能填入 `你`（渲染为 `Vous`）。
  - 这类模板尽量改成不依赖变位的写法，例如 `{7} : check pour contrôler le pot…`、`Plus qu’une élimination avant la table finale. {0} : sortie en cas de call de tapis perdu.`。
- **人数计数**：人数可能为 1 的高频句改成计数标签，例如 `adversaires encore en jeu : {n}`，避免出现 `1 adversaires`。
- **法语排版**：
  - 在 `; : ! ?` 前和 « » 内使用窄不换行空格（U+202F）。
  - 撇号统一为 `’`。
  - 去掉值首尾多余的空格；源文本身带首尾空格的拼接片段保留原样。
  - 比率 `{0}:1` 和 `%` 前不加空格，与全应用统一的数字格式保持一致。

## 修改统计

共修改 1,274 个生效法语键，其他语言区块和非 `messages.json` 键均为 0。

| 位置                         | 修改键数 |
| ---------------------------- | -------: |
| `src/i18n/locales/fr.json`   |      491 |
| `src/i18n/overrides.json` fr |      783 |

| 类别                                                                                              | 约数 |
| ------------------------------------------------------------------------------------------------- | ---: |
| 措辞与语义改写（不含纯排版）                                                                      |  828 |
| 仅排版（窄空格、撇号、首尾空格）                                                                  |  446 |
| 其中：损坏或机器腔明显的旧译重写                                                                  |  ≥12 |
| 其中：术语统一（recave、set、value、call、bots、Double paire、pot secondaire、blinde、humide 等） | ≈110 |
| 其中：去除首尾多余空格（含排版类）                                                                |   90 |

按内容大致分布：

- 复盘与教练段落约 60%，涵盖价格、范围、取值、诈唬与“重打”建议。
- 对手解释约 15%。
- 设置、牌桌状态、提示与日志约 15%。
- 新手引导、指南、术语表、隐私与商店文案约 10%。

## 修改示例

| 源文                                                                   | 修改前                                                                                                          | 修改后                                                                                                                                                 |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `均`（多人同额跟注的“都”）                                             | `É`                                                                                                             | ` (tous)`                                                                                                                                              |
| `本地德州扑克练习。所有筹码均为虚拟筹码，无现金兑换、奖金或真人赌注。` | `Tous les chips sont virtuels, sans réduction en espèces, prix ou paris en argent réel.`                        | `Entraînement au Texas Hold’em en local. Tous les jetons sont virtuels : pas d’échange contre de l’argent, pas de gains, pas de mises en argent réel.` |
| `牌桌提示已关闭`                                                       | `La table d’indication est fermée.`                                                                             | `Conseils de table désactivés`                                                                                                                         |
| `已自动保存；风格与情绪下一手生效。`                                   | `Épargné automatiquement. les styles et les humeurs s'appliquent à la main suivante.`                           | `Enregistré automatiquement ; les styles et les émotions s’appliquent à la main suivante.`                                                             |
| `这是无需登录的无限注德州扑克练习。…`                                  | `Pratiquez sans limite Texas Hold'em sans compte. … les critiques et les différents adversaires informatiques.` | `Entraînez-vous au Texas Hold’em sans limite, sans compte. … grâce à l’analyse et à des adversaires variés.`                                           |
| CL 说明中的补码                                                        | `vous pouvez recharger … Aucune recharge n’est possible à la table finale.`                                     | `vous pouvez vous recaver … Aucune recave n’est possible à la table finale.`                                                                           |
| `{0}拿 {1}，在 {2} 上是{3}，选择{4}`                                   | `{0} détient {1}, forme {3} sur {2} et choisit {4}`（渲染为 `choisit Suivre`）                                  | `{0} a {1} ({3} sur {2}) et choisit : {4}`                                                                                                             |
| 纹理标签 `公共牌有对子`                                                | `Le board contient une paire`（拼出 `board Le board contient une paire`）                                       | `pairé`（拼出 `board pairé / bien connecté`）                                                                                                          |
| `控制底池是避免主动扩大投入。…`                                        | `… peut d’abord faire parole si le tableau rend possible une couleur …`                                         | `… peut d’abord checker si le board permet une couleur …`                                                                                              |

## 钉住字符串的回归

以下修改都只改了 `fr` 断言行，测试意图不变：

- `tests/unit/pr70-locales-zh-fr-ru.test.js`
  - 尺度说明断言改为 `/ne faut pas cliquer sur «\sSuivre\s» d’abord/`，以兼容窄空格。
  - CL 说明断言改为 `Aucune recave`。
- `tests/unit/i18n.test.js` 与 `tests/e2e/i18n.spec.js`：`本局练习` 改为 `Partie en cours`。
- `tests/e2e/folded-status-prefix.spec.js`：`Couché · Double paire`。
- `tests/unit/implied-cost-review-i18n.test.js`：同步三条已改写的法语句（直接补牌概率说明、`avoir touché un set`、更高一对说明），另一条只因窄空格更新。

`正在发牌…` 保持 `Distribution`。该文案在 `pr70-language-fixes.spec.js` 中逐字钉住，并且要放进很窄的街道标签，因此不加省略号。

## 未处理与存疑

- **共享的中文残留（非法语问题）**：渲染 37 个复盘场景时，有 17 条理由仍夹带中文。
  - 例如 `Suivre 220K 后可争夺 830K Pot. 不计后续新增投入…`。
  - 基线 `b689575` 以及 en、de、es 均为同样的 17 条，原因在共享的模板匹配：以槽位开头的模板不会作为句中片段匹配。
  - 应由主任务在共享代码或源文中统一修复，本组没有为单一语言加专用键。
  - 详情见共享笔记 `fr-review-chinese-residue.md`。
- **源文问题**：
  - `analysis.js` 第 680 行把 `公共牌` 与纹理标签 `公共牌有对子` 拼接，源文本身成为“公共牌公共牌有对子”。
  - `留意 {0} 位尚可行动的玩家` 等句在人数为 0 时仍会输出（法语为 `Surveillez les 0 joueurs…`）。
  - 名字列表用中文顿号 `、` 拼接，非中日语言中会原样显示。
  - 主语槽填入 `你` 时会出现 `de Vous`、句中大写的 `Vous`。
  - 牌型标签（`Carte haute`、`Brelan`）在句中保持首字母大写。
- **不在 `messages.json` 中的约 1,432 个键**：其中仍生效的日志模板（如 `{0} 加注至 {1}` → `{0} · Relancer à {1}`）格式可接受，未改；其余多为旧版机器翻译，按任务范围未处理。其中仍生效的 `按当前范围估计，这次跟注还需要{0}后从较弱牌收取筹码。` 法语写作 `du range`（应为阴性 `de la range`），并被单元测试逐字钉住，留待主任务决定。
- **“胜率”的译法**：
  - 复盘语境统一用 `équité`。
  - 起手牌表用 `taux de victoire`，统计栏用 `% victoires`，计算器沿用 `Calculateur de probabilités`。
  - 是否进一步统一需要产品决定。
- **长度**：短标签基本与原长度相当或更短；`Suivre pour {0}` 缩为 `Suivre {0}`。
  - 本轮只跑了指定的语言 E2E，没有逐一核对原生 App 或微信小程序在法语下的换行和截断。

## 验证

- 不在 `messages.json` 中的键改动数为 0。
- 用 37 个复盘夹具渲染法语理由，复核纹理标签、人数标签与模板拼接。
- 没有运行原生 App、模拟器或微信开发者工具，以上浏览器与单元结果不代表原生运行验收。
