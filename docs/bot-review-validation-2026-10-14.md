# 机器人与复盘定向验证（2026-10-14）

最终冻结源码通过 **35 项定向单元测试**，以及 **2 项 Web 测试**。Web 的 desktop/mobile 各一项测试，每项回放四个真实引擎场景。本轮遵照用户“不需要重新全面回归”的要求，没有重新运行完整单元/Web 套件。这些结果不代表远端 CI 或原生设备运行已经通过。

逻辑审计与证据限制见 [机器人决策与复盘逻辑审计](bot-logic-audit-2026-10-14.md)。以下产物保留在本地工作区 `.artifacts/`，不写入 Git；路径均以仓库根目录为基准。

## 冻结源码与指纹

- Source commit：`998b12d895c6504f6b41a27cf03eb718b458a757`。
- Shared app source digest：`067eedd9a58c68462d72d171172047cd20ff23d4b561deb5b88f40ded0ae9f02`。
- 定向源码、测试与字体输入 SHA-256：`1edab8ac9466a3a1b6252f249943ce7261a2c6fd5525841f67d49cdb7d61992b`。
- Web 测试前后两个指纹一致；此后的文档提交不改变已验证应用源码。
- 记录：`.artifacts/causal-review-2026-10-14/bot-audit-source-record.json`。
- 最终构建来源：`.artifacts/causal-review-2026-10-14/final-build-source.json`。

Shared digest 使用 `scripts/mobile-lib.mjs` 的 `sourceDigest()`，包含 `src/`、`public/`、`scripts/` 与所列构建配置。定向输入指纹还包含小程序界面和本次测试文件；具体路径清单保留在源码记录中。

## 最终定向单元验证

结果：**35 passed，0 failed**。显式筛选对应已确认问题及其正反边界，没有运行无关的完整多手或 12,000 次混合频率用例。

```sh
node --test \
  --test-name-pattern='real shove contexts|flop overpair|cold and re-raise|actual 4-bet|near-all-in 4-bet|20 BB shove|earlier short all-in|shared royal and private|guaranteed river return floors|all-in decisions ignore|real executed bot plans|large non-all-in continuation|actual all-in motives localize|strong made hands distinguish|combined straight and flush|draw continuation uses|high equity estimates|real top-pair value donk|near-all-in draw defense|slow-play requires|easy river slow-play|donk identification|all-in timing follows|guaranteed shared-royal defense|all-in pacing uses|post-flop bot fractions|style differences change entry|WeChat transports real all-in|real set plus redraw|real heads-up all-in draw|real high-card pot-control|closing draw folds|open-ended draw has|combined flush and straight draw|turn draws exclude' \
  tests/unit/bot-allin.test.js \
  tests/unit/bot-features.test.js \
  tests/unit/bot-deception.test.js \
  tests/unit/bot-timing.test.js \
  tests/unit/bot-profiles.test.js \
  tests/unit/wechat-deception.test.js \
  tests/unit/bot-review-boundaries.test.js \
  tests/unit/review-context.test.js
```

覆盖内容包括：

- 真实全下场景的已投入者与待回应者、冷全下与多次再加注、强牌合理防守及弱牌反例、4,000 非全下与 5,000 全下相邻边界。
- 短筹码可争夺底池、未跟注退款、旧短全下的原街范围与主池资格；真实行动及结算均保持 25 筹码单位和总额守恒。
- 共享皇家同花顺、私有河牌坚果的合理防守；逐池保守返还金额取整。`125/3 + 75/2` 只验证内部保证金额为 50，不强配虚假跟注成本或声称真实输钱牌局。
- 公共成牌与私有成牌、15 张组合听牌并集、仅剩 25 的有限听牌继续、普通价值下注与高牌/公共对子反例。
- donk 的前街进攻者是否仍可行动、合法强制跟注不称主动埋牌、真实开池者的后手、普通与简单难度的河牌诱导条件。
- 承诺价格与待回应风险的思考边界、确定保本情形、净跟注风险及实际拿出金额的后手规划。
- 实际暗三条加同花听牌的全下跟注、单挑全下听牌弃牌没有后续下注、高牌控池不误称中等成牌。
- 复盘私有听牌事实：Q8 两头顺 8 张、AK/QJ 组合去重 12 张、77 牌局只保留同花 9 张；公共顺子不算私有听牌，确实提高私有顺子/同花顺的补牌仍保留。
- 隐藏对手底牌、未来牌堆与赢家不改变同种子决策；实际复盘段落在所有 11 个 locale 中无残留汉字或变量，并保留名字与金额。

全下夹具通过真实 `act`/`advanceStreet` 和计划执行产生行动前记录。高牌控池使用固定权益的策略视角隔离该分类分支，不把此固定输入称为实测权益。微信控制器回归属于适配器/mock 验证，不是 DevTools 或设备验证。

日志：`.artifacts/causal-review-2026-10-14/bot-audit-consolidated-final-unit.log`。可机器读取的精确命令与筛选表达式：同目录 `bot-audit-validation-commands.json`。

## 最终 Web 验证

```sh
NOIR_E2E_PORT=4187 npm run test:e2e -- tests/e2e/bot-allin.spec.js
```

结果：**2 passed，0 failed**。端口为独占 `4187`，`reuseExistingServer: false`，保留配置的 2 workers。desktop 为 1280×900，mobile 为 390×844；两者都属于浏览器验证。

每项测试加载真实执行并结算的引擎快照，回放：

| 场景          | 实际行动与关键事实                                                       |
| ------------- | ------------------------------------------------------------------------ |
| `flop-qq`     | QQ 在 J♠7♥2♣ 面对全下，实际跟注 4,950；可争夺 10,150，其他三人尚待回应。 |
| `multi-qq`    | QQ 面对多次再加注且已有全额跟注者，实际弃牌；原本需补 4,850。            |
| `made-redraw` | 7♥7♦ 在 7♠J♥9♥10♥，暗三条加同花听牌，实际全下跟注 4,950；可争夺 10,000。 |
| `draw-fold`   | Q♠7♠ 在 10♠9♦2♠，实际放弃同花听牌，没有编造全下者的后续下注。            |

断言检查实际底牌、公开下注与金额、正确行动原因、成牌加听牌、关闭后的行动空间、无 EV/原始抽样/开发说明/数字模块，以及无横向溢出。夹具只供测试模式回放，不进入生产包。

最终日志：`.artifacts/causal-review-2026-10-14/bot-audit-web-final-boundaries.log`。

最终测试目录：同目录 `bot-audit-final-web-results/`。8 张截图：

```text
desktop-flop-qq.png       mobile-flop-qq.png
desktop-multi-qq.png      mobile-multi-qq.png
desktop-made-redraw.png   mobile-made-redraw.png
desktop-draw-fold.png     mobile-draw-fold.png
```

## 先前检查点与保留失败

较早检查点运行过以下 20 项相关 Web 用例：

```sh
NOIR_E2E_PORT=4187 npm run test:e2e -- \
  tests/e2e/bot-allin.spec.js tests/e2e/review-coaching.spec.js
```

当时 **18 项已有复盘用例通过，2 项新增用例失败**。失败原因是新测试的关闭按钮 selector 同时匹配“关闭复盘”和“回到牌桌”，不是正文产品断言失败；第一场景已通过正文断言，第二场景尚未执行。修正为按唯一按钮名称选择后，只重新运行受影响新增测试，保留原断言。

- 首轮日志：`bot-audit-web-final.log`。
- 首轮失败 trace、DOM 与截图：`bot-audit-first-web-results/`。
- 该 18 项通过属于先前源码检查点，**不表述为最终源码的 20/20**；最后结果是上节明确记录的 2 项新增测试。

更早的 368 项完整 Web 尝试因为后续文案修正主动中断：**127 passed、2 interrupted、239 did not run，exit 130**。这些数字不能算作完整套件通过，也不能算作本次最终源码通过。记录保留于：

- `web-full-interrupted-source-1.log`。
- `web-full-interrupted-source-1-results/`。
- `web-source-record-source-1.json`。

以上路径均在 `.artifacts/causal-review-2026-10-14/`。用户随后要求不重新全面回归，因此本轮使用上面的定向范围，没有补跑完整套件或将早期 `npm run check` 结果冒用为本轮最终全量结果。

## 多语言与静态构建

最终库存为 **1,457 messages / 11 locales**，无缺项或变量变化；人工逐段读审了实际成牌加听牌全下跟注、同花听牌弃牌、高牌控池等输出，并与定向多语言测试交叉核对。原始读审产物：`.artifacts/terminal-review-locale-audit.json`。这不等于独立母语德州专家审校认证。

| 检查                    | 结果                                            | 本地产物                        |
| ----------------------- | ----------------------------------------------- | ------------------------------- |
| `npm run build`         | Vite 生产构建及自动小程序生成通过               | `build-audit-final.log`         |
| `npm run i18n:check`    | 1,457 条、11 locale、变量与研究保护事实校验通过 | `i18n-audit-final.log`          |
| `npm run format:check`  | 全项目 Prettier 检查通过                        | `format-audit-final.log`        |
| `npm run wechat:verify` | 小程序共享源码与本地资源核对通过                | `wechat-verify-audit-final.log` |
| `npm run wechat:check`  | 官方 glass-easel 编译器 WXML/WXSS 9 文件通过    | `wechat-check-audit-final.log`  |
| 字体重新生成            | 最终文案对应字形子集生成通过                    | `fonts-audit-final.log`         |

日志均在 `.artifacts/causal-review-2026-10-14/`。小程序编译与源码/资源核对不代表 DevTools 或设备运行通过；Vite 生产构建也不代表 Xcode/Gradle 编译或已安装 App 验证通过。

## 原生 App 与微信定向运行验证

两端安装包从源码提交 `998b12d895c6504f6b41a27cf03eb718b458a757` 编译，实际 WebView 的 `sourceDigest` 均等于本文最终指纹。每端只运行启动、加注跟注弃牌与结算、决策复盘三个相关场景，没有重跑完整原生套件。

| 平台             | 编译/安装                                | 实际运行                                                                 | 报告                                                              |
| ---------------- | ---------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| iOS Simulator    | Xcode `BUILD SUCCEEDED`，安装本次 `.app` | `Noir Poker E2E`（`88083CEE-4B80-41F6-8B2E-276E81DA6CB2`），3/3 场景通过 | `ios/report.json`、`ios-runtime.log`、`ios-build.log`             |
| Android Emulator | Gradle `BUILD SUCCESSFUL`，安装本次 APK  | `Noir_Review_20261014`（`emulator-5582`），3/3 场景通过                  | `android/report.json`、`android-runtime.log`、`android-build.log` |
| WeChat DevTools  | 官方 IDE 打开本次生成工程的独立副本      | 复盘 13/13、混合打法理由 9/9 检查通过，两份报告均无运行异常              | `wechat-review/report.json`、`wechat-motives/report.json`         |

Appium 场景选择为 `NOIR_NATIVE_SCENARIOS=local-launch-and-no-login,raise-call-fold-and-settlement,settlement-decision-review`。iOS 使用端口 `4741`/驱动端口 `8107`；Android 使用 `4743`/`8307`。两份报告分别核对安装产物、实际运行 WebView 和当前源码，不能用早期安装包替代本次结果。

两端编译后执行 `npm run mobile:sync` 与 `npm run mobile:verify`，资源核对通过；安装包分别保留 17 张本地图片及 16 个牌手头像。APK SHA-256 为 `0a6c62f4ae2b71045ede810fd3bbf5d80426f9d2860e7dd0004979b73af8ffa2`；原生源码与产物记录为 `native-artifacts.json`。原始设备截图包含 `ios/settlement-decision-review-open.png`、`android/settlement-decision-review-open.png` 和各端对手复盘原图，已目视检查文字、牌面与画面完整性。

微信源码指纹为 `4725e44594a63c50a5423890410e884177802945d04435264efbfc8fffaa7da6`；生成工程复制到本次独立 `wechat-audit-project/`，官方自动化端口为 `9475`。实际执行入口是 `tests/wechat/review-coaching.mjs` 与 `tests/wechat/deception-review.mjs`。报告区分真实完成牌局与外部注入的公开决策快照；测试快照不进入生产包。报告及截图保留在本文共同产物目录，未关闭其他任务的 IDE 工程或模拟器。

未经最终来源验证的早期安装包、其他任务的模拟器、真实物理设备、商店发布和远端 CI 均不包含在上述通过结论中。
