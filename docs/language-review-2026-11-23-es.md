# 2026-11-23 西班牙语文案母语化审校

本轮按“会打扑克的西语母语玩家”的阅读习惯，逐条通读 `src/i18n/messages.json` 的全部 2,359 条源文及其西语有效译文（`src/i18n/locales/es.json` 叠加 `src/i18n/overrides.json` 的 `es` 块，覆盖值优先），替换生硬、直译、机翻腔或前后不一致的表达。

**这是 AI 辅助审校，不是真人西语母语者的签字验收。** 结论只代表文字层面的复核；实际排版、朗读（VoiceOver/TalkBack）和原生装机效果仍需另行验证。

## 范围与方法

- 只修改 `es`：`src/i18n/locales/es.json` 与 `src/i18n/overrides.json` 的 `es` 块。键在覆盖表中就改覆盖值，否则改 locale 文件。没有改动其他语言、`messages.json`、中文源文或任何代码。
- 覆盖设置、牌桌与动作、牌局日志、玩法指南、牌型、对局记录、复盘与教练段落、角色与玩家研究、错误提示、商店与隐私文案。
- 改写片段或 `{n}` 模板前，先在 `src/` 中查找其中文键的拼接位置（如 `src/review/coaching.js`、`src/review/tournament.js`、`src/review/check-reasoning.js`、`src/engine/poker.js`），确保拼出的整句通顺。所有 `{n}` 槽位保持不变，`npm run i18n:check` 验证无缺失、无占位符变化。
- 数字、金额、筹码单位、牌面、位置（BTN/SB/BB/UTG…）、人名、日期、出处与证据限定保持原意；没有增加源文没有的结论。短标签保持原长度或更短。
- `public/app-privacy.html` 由 `npm run i18n:privacy` 重新生成（仅西语段落变化），合并后协调者会再生成一次。

## 词汇表与语体决定

| 中文             | 西语用词                                            | 说明                                                                                         |
| ---------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 弃牌／过牌       | retirarse／pasar                                    | 按钮与正文一致；口语“tirar”只在个别复盘句中保留。                                            |
| 跟注／加注       | igualar（按钮）、pagar（正文）／subir               | 正文沿用西语牌手常说的 pagar；策略段落中的名词 call 保留为通用行话。                         |
| 再加注           | resubir（标签 `Resubir`）                           | 原 `Subir otra vez` 改为标准术语。                                                           |
| 全下             | all-in（ir all-in、estar all-in）                   | 去掉 `estar en all-in`。                                                                     |
| 边池             | bote secundario                                     | 统一替换残留的 `bote lateral` / `botes laterales`，沿用 PR70 约定。                          |
| 摊牌             | showdown                                            | 统一替换 `enfrentamiento`、`al mostrar las cartas` 等不一致说法。                            |
| 两对／葫芦       | doble pareja／full                                  | 与牌型标签 `Doble pareja`、`Full` 一致；不再用 `dobles parejas`（单数语境）与 `full house`。 |
| 四条             | póquer                                              | 与现有牌型标签 `Póquer` 一致。                                                               |
| 口袋对子／暗三条 | pareja de mano／set                                 | 不再混用 `pareja en mano`、`ligar un trío con la pareja de mano`。                           |
| 湿润面           | board húmedo／mesa húmeda                           | 与已有 `mesas húmedas` 一致，替换 `Mesa conectada`、`Board conectado`。                      |
| 电脑／机器人     | bot（rivales bot、los bots）                        | 替换仅西班牙使用的 `ordenador` 与拉美的 `computadora`，两地通用。                            |
| 平跟             | call plano (flat call)                              | 替换 `call simple` 等说法。                                                                  |
| 保本胜率         | equity de equilibrio                                | 替换 `Umbral para no perder`、`quedar a mano`。                                              |
| 底牌             | cartas propias（正文）、cartas de mano（结算/重打） | 去掉 `cartas privadas`。                                                                     |
| 本局（标题）     | sesión；按钮“重新开局/下一局”仍为 partida           | 见“保留与存疑”。                                                                             |

语体：全文统一用 tú；采用西班牙与拉美都自然的中性西语。去掉了四处 vosotros 变位（`quedáis`、`habéis/podéis`、`apostáis`、`conserváis`），改成不依赖复数第二人称的句式，例如“ya solo queda Mia contigo”。保留 `Pulsa`（两地通用）。

## 改动统计

相对基线 `b689575`，按 key 去重：

| 文件                                 | 修改的 key |
| ------------------------------------ | ---------: |
| `src/i18n/locales/es.json`           |        102 |
| `src/i18n/overrides.json` 的 `es` 块 |        122 |
| 合并后有效文案改变                   |        224 |

没有新增或删除 key，也没有改动其他语言的块。

| 类别                    | 合计 | locale | overrides |
| ----------------------- | ---: | -----: | --------: |
| 含义错误或信息缺失修正  |   31 |     12 |        19 |
| 语体（vosotros → 中性） |    4 |      1 |         3 |
| 术语统一（见词汇表）    |   93 |     43 |        50 |
| 生硬、直译或机翻腔改写  |   96 |     46 |        50 |

类别按每个 key 的主要问题归一类；同一句可能同时改了术语与语序。

## 修改示例

| 键（中文源文）                                             | 修改前                                                                  | 修改后                                                                                               | 原因                                       |
| ---------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `五张同一花色，不要求连续。`                               | Cinco cartas del mismo palo; no deben ser consecutivas.                 | Cinco cartas del mismo palo, no necesariamente consecutivas.                                         | 原译意为“不得连续”，与规则相反。           |
| `· 红色闪电：4 手内三次被同一对手加注弃牌后更多加注与诈唬` | …tras retirarse ante el mismo rival que sube en tres de cuatro manos…   | …tras retirarse tres veces en 4 manos ante subidas del mismo rival…                                  | 原译把“三次弃牌”误成“对手四手中加注三次”。 |
| `单机练习·虚拟筹码·禁止赌博`                               | … · Prohibido apostar                                                   | … · Sin dinero real                                                                                  | 扑克里 apostar 是正常动作，原译自相矛盾。  |
| `你和 Alex 都比 Mia 投得多。…`                             | Tú y Alex habéis puesto más que Mia… que solo podéis ganar tú y Alex.   | Has puesto más que Mia, igual que Alex. … un bote secundario que solo está en juego entre tú y Alex. | 去掉 vosotros，统一边池术语。              |
| `全下就是押上全部筹码，之后只等摊牌。`                     | All-in es poner todas tus fichas y esperar al enfrentamiento.           | Ir all-in es apostar todas tus fichas; después solo queda esperar al showdown.                       | 术语统一，语序更自然。                     |
| `弃牌权益是对手因下注而弃牌带来的收益。…`                  | …hace foldear al rival… En un bote multiway… no puede foldear después.  | …hace que el rival se retire… En un bote multijugador… no puede retirarse.                           | 去掉西英混杂的 foldear/multiway。          |
| `先看位置和底牌：牌不好就弃，好牌主动加注。`               | Mira primero posición y cartas: retira las malas y sube con las buenas. | Mira primero la posición y tus cartas: retírate con las malas y sube con las buenas.                 | retirar 不能直接带“牌”作宾语。             |
| `控制电脑在游戏输赢后是否改变策略倾向。…`                  | Controla si cambian las tendencias del ordenador…                       | Controla si los bots cambian sus tendencias estratégicas…                                            | 中性用词。                                 |
| `本手获得底池`                                             | Ganaste parte del bote                                                  | Ganaste un bote                                                                                      | 源文没有“部分”。                           |

## 保留与存疑

- **主语插值的动词一致**：`src/review/tournament.js` / `src/review/opponents.js` 的 `survivalNote`（“跟注全下输了${subject}就会出局”）以及 `src/review/check-reasoning.js`（“${subject}的两对…${subject}过牌”）把“你”作为 `{n}` 插入第三人称句子，西语会得到 `Tú` + 第三人称动词或 `de Tú`。词典层面已把前两条改为与主语无关的句式（`… queda fuera ({0})`），以及 `Último en responder esta ronda: {0}`；`check-reasoning` 的两对句仍可能出现 `la doble pareja de Tú`。根本解决需要代码为“你”提供独立整句，属于源码问题，本轮未改代码。
- **“本局”标题保留 sesión**：`本局练习` 在 `tests/unit/i18n.test.js` 中按“当前 session”锁定，各语言均为 session；因此 `本局信息`、`第 {0} 局`、`这一局还没有对局记录` 等标题也保留 `Sesión`。按钮 `重新开局`/`下一局`/`本局结束` 原本即为 `partida`，未改。西语玩家更习惯 `partida`，若要统一需全语言一起决定。
- **计算器与胜率表标签**（`胜率：`、`获胜手数`、`胜率` 等）按既有“用户否定六项”约定保持原值，未作修改。
- **牌局日志动作**（如 `{0} · Retirarse`）沿用 PR70 的 actor/动作拆分格式，未改成完整句子。
- **数量模板**：`再打 {0} 手后涨盲到 …` 保留 `Manos hasta la subida: {0}` 这类不依赖单复数的结构，避免 N=1 时出现 `1 manos`。`下一手涨盲到 {0} / {1}` 为节省横幅宽度仍不写出 ciegas（与英语一致）。
- **策略行话**：`call`、`folds`、`fold equity`、`pot odds`、`board`、`slowplay`、`float`、`squeeze` 在复盘段落中保留，属于西语扑克常用说法；基础指南优先使用 igualar/retirarse/mesa。
- `牌力表` 按钮仍为 `Manos`，较简短但含义偏泛；为牌桌按钮宽度未改长。
- 许多译文末尾有多余空格。运行时整句会被 trim，未单独清理；只在已改写的句子中顺带去掉。
- `es.json` 中有 1,294 个不在 `messages.json` 的旧 key，`overrides.json` 的 `es` 块中也有 127 个；它们不对应当前源文，本轮未审校。

## 源文问题

- 见上文“主语插值的动词一致”：多处以 `${subject}` 把“你/玩家名”拼进句中，除中文外的屈折语言都难以同时照顾“你”和第三人称。建议在代码中为“你”提供单独源句。
- `下一手涨盲到 {0} / {1}` 与 `再打 {0} 手后涨盲到 {1} / {2}` 在多数语言里需压缩成标签式结构，源文可考虑提供更短的标签版本。

## 验证

- `npm run i18n:check`：2,359 条消息、11 种语言，无缺失与占位符变化；研究文案数字、牌面与受保护术语保持。
- `npm test`：1,883/1,883 通过。
- `npm run format:check`：通过。
- 语言 E2E（`NOIR_E2E_PORT=4207`，`i18n`、`locale-layout`、`pr70-language-fixes`、`player-research-i18n`，desktop + mobile 共 132 项）：
  - 第一次运行发现 `正在发牌…` 改成 `Repartiendo…` 违反回放发牌帧的锁定值。该状态栏在 320 px 宽度下各语言都不带省略号，已恢复为 `Repartiendo`。
  - 修正后完整重跑：113 通过、17 跳过、2 失败。失败的是 zh-TW 与 ko 用例（本分支未改这两种语言），都是启动阶段 `data-app-ready` 在 5 秒内未就绪：页面仍在 `platform-import → locale-prepare → table` 过程中，不是文案断言失败。
  - 随后单独重跑时，es 与 ko 的同一研究用例也同样超时。把西语两个文件临时换回基线 `b689575` 后结果相同，说明是当时机器上启动变慢的环境问题，与本轮译文无关。此前两次完整运行中，所有西语用例均已通过。
- 锁定字符串调整：`tests/unit/implied-cost-review-i18n.test.js` 的西语 `improvements` 由 `ligar un trío con la pareja de mano` 改为 `ligar set`，测试意图（组合后保留范围与付费意愿条件）不变。没有修改其他测试。

以上均为 Web/单元层面的检查，不代表原生 App 或微信小程序的装机验证。
