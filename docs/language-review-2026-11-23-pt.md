# 2026-11-23 葡萄牙语（pt）母语化文案审校记录

基线为 `claude/lang-review-pt-a65669` 分支起点 `b689575`（由 PR70 分支 `claude/tutorial-ui-optimization-a134c2` 切出）。本次只修改 `src/i18n/locales/pt.json` 与 `src/i18n/overrides.json` 的 `"pt"` 区块，没有改动其他语言、`messages.json`、简体中文源文或任何代码；发牌、合法动作、底池结算、机器人策略和复盘评级均未变化。

**这是 AI 辅助的语言审校，不是真人葡语母语者的签字认证。** 判断标准是“一位以巴西葡语为母语、熟悉扑克的玩家读起来是否自然、术语是否一致”；最终仍建议由真人母语者抽查。

## 范围

- 逐条核对全部 2,359 条 zh-CN 源消息的实际生效译文（locale 与 override 合并，override 优先）：设置、牌桌与动作、牌局日志、玩法指南、牌型、对局记录、复盘与教练段落、电脑角色与风格研究、错误提示、商店与隐私文案。
- 改动写在每个键实际生效的位置：键在 override 中就改 override，否则改 locale。若 override 键在 locale 中有与旧 override 完全相同的影子值，同步更新影子值，避免两处再次分叉。
- 复盘大量使用 `{n}` 模板和运行时拼接片段（`src/review/opponents.js`、`matchups.js`、`strategy-reasoning.js`、`narrative.js`、`src/ui/review-matchups.js` 等）。改写片段前先在 `src/` 中查找拼接方式，并用正式 `loadLocale()` / `localizeGameText()` 实测拼接结果；所有 `{n}` 槽位保留，个别按语法调整顺序。
- `pt.json` 中另有 1,294 个已不在 `messages.json` 中的旧键，运行时不会出现，本次未审校。

## 语体与术语决定

沿用现有文案的**巴西葡语**和 `você` 语体，清除混入的欧洲葡语用法。术语沿用 `docs/pr70-language-fixes-en-es-it-pt.md` 已核对的 PokerStars Brasil 用词。

| 概念                   | 统一用法                                                                               | 说明                                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 弃牌 / 过牌 / 跟注     | 按钮 `Desistir` / `Passar` / `Pagar`；叙述用 `desistir`、`dar check`、`pagar` / `call` | 按钮与教程中引用按钮的句子保留 `Passar`；复盘叙述用巴西玩家常说的 `check`。去掉 `foldar`、`largar` 等混用。 |
| 加注 / 再加注 / 全下   | `aumentar` / `reaumentar` / `all-in`；`shove` 仅在复盘里指全下尺度                     |                                                                                                             |
| 底池 / 边池            | `pote` / `pote paralelo`                                                               | 清除 `pote secundário`、`pote lateral`。                                                                    |
| 公共牌                 | `board`（解释性句子可用 `cartas comunitárias`）                                        | 清除错用的 `bordo` 和把 board 写成 `mesa` 的句子。                                                          |
| 补码                   | `recarga` / `recarregar`                                                               | 清除 `repor`、`reposição` 混用。                                                                            |
| 一局（多手组成的对局） | `partida`                                                                              | 原先 `jogo`、`sessão`、`partida` 三者混用；按钮“重新开局”改为 `Nova partida`。                              |
| 重打                   | 按钮 `Rejogar`；复盘句首统一 `Ao rejogar {0}, …`                                       | 原有 `Repita {0}`、`Jogue novamente a mão com {0}`、`Rejogue…`、`Ao repetir` 等五种写法。                   |
| 位置                   | `no BTN` / `no {1}`                                                                    | 原 `em BTN`、`em {1}` 不符合葡语习惯；位置名均为阳性，统一用 `no`。                                         |
| 权益 / 平跟 / 薄价值   | `equity` / `flat call` / `valor fino`                                                  | 清除 `equidade`、`call simples`、`thin value` 混用。                                                        |
| 湿润面 / 干燥面        | `board molhado` / `board seco`                                                         |                                                                                                             |
| 情绪强度               | `Leve` / `Intensa`                                                                     | 原 `Ligeira` / `Pronunciada` 偏书面。                                                                       |
| 对手                   | `adversário`                                                                           | 清除 `rival`、`oponente`。                                                                                  |

## 改动统计

相对基线逐键比较。**合并后有效文案共改变 439 键**，其中 373 键改动措辞，66 键只是去掉句首或句尾多余空格。

| 文件                    | 修改键数 | 其中改动措辞 | 其中只去空格 | 说明                                         |
| ----------------------- | -------: | -----------: | -----------: | -------------------------------------------- |
| `locales/pt.json`       |      233 |          180 |           37 | 另含 16 个被 override 遮蔽、与之同步的影子值 |
| `overrides.json` → `pt` |      222 |          193 |           29 |                                              |

没有新增或删除键。分类（键数为近似值，一键可能同属多类）：

- **术语统一**：约 70 键（`pote paralelo` 7、`recarga` 12、`partida` 23、`desistir` 12、`adversário` 7、`board` 5、`equity` 2，以及 `flat call`、`valor fino`、`board molhado` 等）。
- **位置介词 `em {n}` → `no {n}`**：44 键。
- **重打句式统一**：26 键。
- **明显错误修复**：约 15 键，见下方示例（乱码词、错误片段、欧洲葡语词、语义错位的标签）。
- **直译改自然表达**：其余约 200 键。主要是教学与复盘长句，例如 “não basta para ir all-in” 改为 “não atinge o critério de all-in”，“A chance de sair uma carta de melhora na próxima carta” 改为 “A chance de a próxima carta melhorar a mão”。
- **空白清理**：66 键。`localizeText()` 本就会裁掉顶层首尾空白，但模板插值时多余空格可能形成双空格。

## 修改前后示例

| 源文（节选）                                       | 修改前                                                                      | 修改后                                                                   |
| -------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `本手尚未结束，或缺少原始发牌记录。`               | `… ou o registro original de acordo está faltando.`（“acordo”是机翻错词）   | `A mão ainda não terminou ou falta o registro original da distribuição.` |
| `未被跟注的`（拼接片段）                           | `Não é chamado.`                                                            | `não pagas`                                                              |
| `均`（`Alex、Mia均跟注 200`）                      | 实际显示 `Alex、MiaE · Pagar 200`                                           | 实际显示 `Alex、Mia (cada um) · Pagar 200`                               |
| `控制底池／埋牌` 说明                              | `…se a mesa permitir uma possível cor…`（欧葡 `cor`、把 board 写成 `mesa`） | `…se o board trouxer risco de flush ou sequência…`                       |
| `刚开始可以在设置里把对手难度调到“轻松”。`         | `…nas Definições.`（欧葡）                                                  | `…em Configurações.`                                                     |
| `待分析`                                           | `A analisar`（欧葡结构）                                                    | `Aguardando análise`                                                     |
| `单机练习·虚拟筹码·禁止赌博`                       | `… · Proibido apostar`（扑克应用里会误读成“禁止下注”）                      | `… · Sem apostas reais`                                                  |
| `{0} 在 {1}，够全下的标准，弃牌放弃了抢盲的机会。` | `{0} em {1} basta para ir all-in; desistir abriu mão…`                      | `{0} no {1} atinge o critério de all-in; ao desistir, você abriu mão…`   |
| `重打 {0} 这手，{1}。{2}`                          | `Jogue novamente a mão com {0}. {1}. {2}`                                   | `Ao rejogar {0}: {1}. {2}`                                               |
| `Mia 的一对 A …边池 {1} Mia 没有资格争…`           | `…o pote secundário de {1}…`                                                | `…o pote paralelo de {1}…`                                               |

## 保留未改与存疑

- **用户已否定的六项**（CN-03a、CN-03c、CN-04a、CN-05、TW-02a、TW-02b）相关的“获胜手数／胜率”、翻前胜率表标题与计算器结果标签保持原值，没有改成权益表述。
- **check 按钮保留 `Passar`**。沿用现有按钮，巴西玩家也常用 `passar` 表示 check；本次没有联网重新核对官方客户端按钮。巴西口语的 `mesa` 没有采用，以免与 `mesa`（牌桌）冲突。教程中直接对应按钮的句子保留 `passar`，复盘叙述用 `check`。
- **日志格式**：`Alex · Pagar 200` 与 `Alex Aumentar para 600` 并存，是现有短语级拼接造成的，只改 locale 无法统一，需要另加日志模板。本次未改。
- **性别**：`{0} será eliminado` 等句在 `{0}` 为女性角色（如 Mia）时仍是阳性。葡语缺少不改结构的中性写法，按通行默认保留；冠军类句子已改为 `vence a partida`、`Você venceu a partida`，避开 `campeão`。
- **译法存疑**：情绪名 `急于追回` → `Ânsia de recuperar`、`收紧避险` → `Mais cauteloso`，以及标签 `宽松取值` → `Valor amplo`（后两者是原值，本次未改），都是意译的短标签，建议真人复核。
- **`正在发牌…` 保留 `Distribuindo`（不加省略号）**：与其他语言一致，牌桌阶段标签也由 E2E 锁定。
- **未在真实界面逐一核对长度**：短标签基本保持原长或更短。少数变长，如 `Próxima partida`、`Histórico de partidas`、`Pontos a melhorar`，由语言 E2E 的布局检查覆盖。

## 发现的源文或代码问题（未修改，仅记录）

- `src/review/narrative.js` 用 `names.join('、')` 拼接跟注者名单，非中文 locale 会直接显示中文顿号 `、`（例：`Alex、Mia (cada um) · Pagar 200`）。需要在代码侧按 locale 连接名单。
- “跟注者均跟注”靠单字 `均` 作为翻译片段，其他语言很难得到自然句子；建议改为完整模板，例如 `{0}均跟注 {1}`。
- 源文中的“胜率”有时指纯获胜概率，有时实际是计入平分份额的权益（如保本门槛句）。葡语按上下文分别译为 `chance de vitória` 或 `equity`，没有改动源文。

## 验证

2026-11-23/24 在本工作树实际运行：

- `npm run i18n:check`：通过（2,359 条消息、11 种语言无缺失或占位符变化；研究文案 64 + 9 条数字、牌面与保护词保持）。
- `npm test`：首轮 1,883 项中 4 项失败，均为锁定旧葡语字符串的断言；按下列方式只更新 `pt` 行后，这 4 项及相关 i18n 单元测试全部通过。
- `npm run format:check`：通过。
- 语言 E2E（`NOIR_E2E_PORT=4209`，`i18n`、`locale-layout`、`pr70-language-fixes`、`player-research-i18n`）：132 项中 110 通过、17 跳过、5 失败。5 项失败都是 `i18n.spec.js:45` 在 zh-CN、en、zh-TW、ja、ru 下等待 `data-app-ready` 超时 5 秒；同一流程的 pt 通过，失败语言的文案本次也未改动。单独重跑该测试（22 项）为 19 通过、3 失败，失败语言换成了桌面 ru、移动 zh-CN 和 zh-TW，仍是同一个就绪超时，pt 两轮都通过。zh-CN 不加载任何译文，因此判断为并行会话占满机器导致的就绪超时，与本次文案无关；但这不是“通过”，需要在空闲机器或 CI 上再确认。

更新的锁定断言（只改 `pt` 行，测试意图不变）：

- `tests/unit/i18n.test.js`、`tests/e2e/i18n.spec.js`：`本局练习` 由 `Prática desta sessão` 改为 `Treino desta partida`（统一“局”为 `partida`）。
- `tests/unit/implied-cost-review-i18n.test.js`：看完转牌与河牌的直接成牌模板改为新措辞，数量与概率槽位不变；“更高一对不全是必胜补牌”一句改为 `nem todas essas cartas são outs que garantem a vitória`，保留 outs 概念。

`正在发牌…` 曾改为带省略号的 `Distribuindo…`，因与其他语言及 `pr70-language-fixes.spec.js` 锁定的阶段标签不一致而恢复为 `Distribuindo`。

以上都是浏览器与单元检查，不代表原生 App 或微信小程序装机运行通过。
