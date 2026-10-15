# NOIR Poker · 德州扑克单机练习

无需登录的无限注德州扑克练习网站。默认 5 人桌，可选择 5–9 人，与本地电脑策略对手练习。所有筹码都是虚拟筹码。

轮到你时，手牌背光和操作区顶部亮线同步亮起，随后保持清晰的行动状态；8 秒未操作再轻提醒一次，调节下注后取消补提醒。Web、App 与微信小程序共用提醒节奏和动画样式，保留现有震动，并支持系统的减少动态效果设置。

各端实测范围与限制见[行动提醒验证记录](docs/turn-attention-validation.md)。

工程目录：`/Users/zjz/code/noir-poker`。此目录是后续迭代的主项目，保留原项目的 Git 历史和 Sites 关联。原 Documents 目录中的项目保留为迁移前快照。

## 开始开发

需要 Node.js **22.12 或更新版本**。首次安装或从仓库重新检出时：

```sh
cd /Users/zjz/code/noir-poker
npm ci
npm run dev
```

访问 <http://127.0.0.1:4173/>。修改源码会自动更新页面。首次进入默认 5 人桌、标准难度、均衡对手；人数、难度、各座位风格、情绪模式、提示和声音选项保存在本地浏览器，下次打开自动恢复。牌桌状态在内存中，完整刷新会开启新的练习。

```sh
npm run check          # 规则、复盘等单元测试 + 生产构建
npm run test:e2e       # 桌面和移动端真实浏览器交互测试
npm run format        # 统一格式
npm run format:check  # 检查格式
npm run build         # 输出生产文件到 dist/
npm run preview       # 本地检查生产构建，先停止同端口开发服务
```

首次运行浏览器测试若提示缺少浏览器，执行 `npx playwright install chromium`。测试会自动在 **4175** 端口启动自己的服务，不占用日常开发的 4173，也不复用其他检出的服务。并行 worktree 可用 `NOIR_E2E_PORT=4189 npm run test:e2e` 指定独立端口；端口已占用时直接失败。

## 项目结构

```text
index.html                   页面骨架和对话框
public/                      静态资源
src/
  main.js                    入口与样式装配
  engine/poker.js            发牌、行动、牌型、主池/边池、结算、同手重打
  engine/bot-profiles.js     风格研究、训练参数、公开视角策略与情绪机制
  engine/public-action-context.js  实际待响应顺序、首次未行动席与公开全下线路
  engine/public-ranges.js    按位置与公开行动建立候选底牌权重
  engine/public-equity.js    有限范围抽牌、当前牌面胜负与分池权益估计
  review/
    context.js              起手牌、成牌、听牌、牌面、位置与下注上下文
    equity.js               跟注成本、分池资格、枚举/抽样权益
    preflop.js              开池、隔离、3-bet、4-bet 与位置上下文
    matchups.js             按公开范围排序的成牌候选与独立坚果检查
    routes.js               主线、备选与各自成立条件
    counterfactual.js       未知牌抽样与候选行动的完整牌局模拟
    opponents.js            机器人实际分支、价格、情绪与尺度解释
    analysis.js             决策评价、依据、候选行动与后续路线
    worker.js               后台复盘任务
  ui/
    table-controller.js     牌桌渲染、操作、对手调度、底牌查看
    opponents-controller.js 各座位风格分配、量化研究、偏好保存
    preferences.js          人数与难度的本地保存、校验和恢复
    cards.js                单个大花色图标的 SVG 牌面
    showdown.js             每位参与者最佳五张牌与赢家动画
    review-controller.js    我的决策与 Worker 生命周期
    opponent-review.js      对手决策时间线、筛选与实际依据
  styles/                   按牌桌、复盘、摊牌拆分的样式
tests/
  unit/                     德州规则、边池、同手重打、复盘边界
  e2e/                      浏览器操作与响应式布局
  fixtures/                 仅测试服务注入的可控牌局
scripts/measure-bots.mjs      固定牌序下的入池率、进攻率与翻牌人数测量
scripts/mobile.mjs           当前源码构建、原生同步、签名打包和资源校验
src/platform/                原生生命周期、设备设置与关于/隐私入口
ios/                         Xcode + Swift Package Manager 工程
android/                     Android Studio + Gradle 工程
mobile/                      原创图标、版本配置与 Xcode 构建入口
capacitor.config.json        两端共享的原生配置
.github/workflows/           两端原生编译与可下载测试包
docs/                       架构、规则、复盘依据与发布说明
.openai/hosting.json          原 Sites 项目关联与部署入口
```

采用浏览器原生 ES Modules + Vite，保留现有 JavaScript 实现。引擎和分析模块不依赖 DOM，可直接在 Node 中测试。Vite 负责开发服务、生产压缩、Worker 打包和资源版本标识。`npm run dev` 同时监听微信小程序共享源码，`npm run build` 在 Web 构建后自动生成最新小程序工程。

微信开发者工具的“编译”只读取生成目录；源码修改后需在同一工作目录运行 `npm run wechat:build` 或保持 `npm run wechat:watch`。另一个 worktree 的监听器不会刷新当前导入工程，详见 [小程序同步说明](docs/wechat.md#每次-web-迭代如何同步)。

## 已有功能

- 5–9 人桌，三档电脑策略难度，下注、跟注、加注、弃牌和全下。默认盲注 100/200、起始筹码 20000（100 BB）、筹码面额 100；实际金额与分池使用该牌局配置的整枚筹码。筹码与盲注金额统一使用 K/M 显示，保留每枚筹码的精度；年份、手数、百分比等保持原样。
- 顶部齿轮“设置”调整人数、起始盲注、声音、难度、情绪与座位风格；移动端以全屏弹窗展示。“牌桌与声音”中的小盲可点击编辑，只接受 25 的正整数倍且最多 50K；大盲自动为小盲两倍，起始筹码为 100BB，面额等于小盲。合法修改保存在本地，下一手应用时恢复所有人的起始筹码并清零统计，当前手和重打保持原尺度。编辑时输入完整数字，非法输入显示红色提示。完整刷新也会按已保存尺度开启新练习。当侧栏与牌桌并排时，牌桌提示常驻右侧卡片，开关就在卡片上；窄屏下开关进入设置，必要提示在盲注下方单行显示，长文自动循环滚动，也可手动横向滚动。提示至少保留 18 秒，长文按两轮完整阅读时间延长，随后收起。
- 手机使用正常手持的正向竖屏：iPhone/Android App 锁定竖屏；手机 Web 横屏时提示旋转，暂停电脑行动并阻止牌桌及弹窗操作，恢复竖屏后继续当前手。iPad、Android 平板及类似大屏设备（屏幕短边至少 600 CSS px / Android 600dp）允许横竖屏切换，桌面浏览器正常使用。微信小程序手机显式竖屏，平板通过大屏适配保留旋转；微信客户端的实际方向支持仍需设备验收。
- 设置中的“牌手介绍”展示16 位具名牌手启发的训练原型，包括新加入的 Phil Ivey、Daniel Negreanu、Phil Hellmuth、Patrik Antonius、Jason Koon、Stephen Chidwick、Fedor Holz、Isaac Haxton；介绍提供历史履历、打法样本、逐条出处、核对日期与本地策略改编。移动端点击牌手，以水波展开动画在选择区域原位覆盖详情，关闭后回到原选择与滚动位置；减少动态效果时直接展示。座位分配只保留姓名、头像、座位和风格选择，分配变动自动保存，下一手替换对应牌桌头像；当前手与重打保持原来的风格。底层仍记录本次电脑的 VPIP/PFR，设置座位卡不再显示这些统计及情绪触发文案。参数不代表真人长期表现；头像来源见 [来源清单](public/portraits/CREDITS.md)，人物说明与发行边界见 [具名训练原型说明](docs/persona-notice.md)。
- 独立的情绪模拟可关闭或调节强度：失利追回、收紧避险、连胜自信与连续受压反击；设置下一手生效，重打保留原手风格与开手状态。
- 多人全下的主池、多个边池、平分与零头筹码、未被跟注筹码退还。
- 其他人全部弃牌时，最后一位玩家直接获胜，无需自动亮牌；结算后仍可通过眼睛按钮查看。
- 摊牌立即展示未弃牌对手的底牌，各参与者分别展示自己的最佳五张牌；赢家使用对应牌型动画。
- 结算后保留每位玩家最近一次动作、金额及几 bet，并保留本手公共牌；全下跨轮发牌不会丢失原下注金额，下一手清空。
- 结算后点击每位对手位置标签右侧的眼睛按钮，在原底牌位置翻开该对手的牌；再次点击收起。已弃牌对手也可查看，下一手、重打或重新练习会恢复隐藏。
- 弃牌后的“立刻发完”加速完成对手行动及本手结算，然后可进入下一手。
- “重打这手牌”撤回原结算和统计，恢复原底牌、牌序、位置与起始筹码；电脑会根据新的行动重新决策。
- 单一复盘入口，直接查看逐步决策与具体建议；结合当时底牌、公共牌、筹码和公开行动解释选择，并单独还原操作后的实际回应。
- 当前成牌对比按公开位置与动作估计牌组可能性，领先／落后各最多 3 组，不显示概率数字；翻前只比较起手牌结构。机器人分别考虑身后首次行动人数、已行动但仍需响应的玩家，并按当前牌面权益、公开范围与价格决定继续。
- “玩法指南”先介绍获胜、牌型、下注轮次、动作与位置，再介绍复盘、重打、人数与对手设置；高级加注和分池细节可展开阅读，见 [规则与练习指南](docs/rules.md)。
- 手机和宽度不超过 1100px 的竖屏平板整桌与操作区适配首屏；公共牌优先五张单排，空间不足时改为居中的 3+2 两排，整手保留五个位置。少人桌放大玩家信息与手牌，顶部座位沿桌弧分布；行动提示紧贴玩家块。你的筹码在位置标签右侧，最近行动居中放在最下行。短屏缩放时牌桌仍铺开到可用宽度，平板放大牌面、玩家信息和底池。亮牌、牌型与查看按钮的空间从开局时预留，避免牌局进行中重新缩放。操作按钮的可用/禁用颜色不同，点击与悬停不改变位置；弃牌和结算的按钮缩为带内边距的单排，牌局过程中保持桌面稳定，结算后只缩短操作区，牌桌高度与位置保持不变。
- 移动端整桌与操作区适配首屏，牌桌不单独滚动；摊牌详情与本局动态在下方随页面滚动。PC 与移动端操作按钮均使用单行文案；重打说明靠近手数标题，PC 两列底部对齐，页脚紧跟内容。

## 从哪里迭代

- 改规则或筹码结算：先读 [规则与测试](docs/rules.md)，修改 `src/engine/poker.js`，增加能复现边界的测试。
- 改复盘：读 [复盘计算与限制](docs/review.md)，分别修改上下文、权益模型或决策分支，避免通过最终输赢反推决策。
- 标准与进阶的强牌埋牌、脏牌开池／再加注、donk 和 2–7 训练特性，见 [对手混合打法与回归](docs/opponent-deception.md)。
- 当前机器人的打法分支、全下防守和已修复边界，见 [机器人打法审计](docs/bot-logic-audit-2026-10-14.md)。
- 改体验：改 `src/ui/` 和 `src/styles/`，验证 320/390/768/1280 宽度及 6/9 人桌。

牌桌和操作区在桌面宽屏也按首屏可用高度排布，行动更新保留当前页面滚动位置。PC 根据可用高度限制椭圆宽度，并放大牌面与玩家块。各端最高玩家的完整占位贴近牌桌区上沿，回收顶部空白；手机同时压缩标题区。所有端主行动、弃牌后继续和结算按钮统一为 38px，结算只缩短操作区，牌桌不重新缩放。小程序导航为 48px，行动区预算为 134px。打开底池明细时锁定首页，滚动只作用于明细内容，关闭后恢复原位置。

App 与小程序设置中的“音效与振动”默认开启；关闭后同时停止音效与轮到你行动的振动，已保存的关闭选择继续保留。Web 的声音开关仍单独控制声音。

- 改机器人策略、情绪或研究依据：读 [机器人风格与情绪模拟](docs/bots.md)，调整 `src/engine/bot-profiles.js` / `src/engine/bot-style.js` 与 `src/data/player-research.json`，保持公开信息边界与重打回滚，逐条来源与测量见 [牌手研究记录](docs/player-research.md)。
- 理解行动到渲染的路径：读 [架构说明](docs/architecture.md)。
- 更新在线网站：读 [构建与 Sites 发布](docs/deployment.md)。
- 打包手机 App：读 [iOS / Android 工程](docs/mobile.md) 和 [买断制发行准备](docs/mobile-release.md)。

当前在线地址：<https://noir-poker-practice.daring-oak-8798.chatgpt.site/>。

复盘是透明、可修改的训练启发式与范围模型，尚不是 GTO 求解器，也没有联网调用大模型。电脑对手也是本地策略；提高难度会改变行动策略，不会使用玩家隐藏信息。

## 策略测量

`npm run measure:bots -- --hands=250 --players=6 --profile=balanced` 在固定牌序、每手 100 BB、无情绪条件下测量当前模拟策略的 VPIP/PFR、真实翻牌人数分布、三人以上翻牌比例及翻前再加注局数。可将 profile 改为 `viktor`、`jungleman`、`dwan` 等，或增加 `--seed=9182 --deck-seed=123` 切换可重现的随机样本。玩家使用当前均衡策略，因此结果是该完整模拟环境的表现，不能当作真人频率；策略及调整前后实测见 [机器人风格与情绪模拟](docs/bots.md)。

复盘在内部比较不同合法行动，抽样未知牌后由同一规则引擎完整结算。玩家界面解释具体操作依据；跟注或弃牌时可查看准确的底池赔率，暂不展示 EV。对手解释独立读取执行记录；不会将真实对手底牌或后来牌序用于评价你的决策。

## 手机 App

Web 与两个 App 共用当前源码，每次打包及两个 IDE 的构建入口都会重新构建并同步页面，无需复制维护另一套牌局代码。安装包支持离线练习；已安装 App 的更新通过新的商店版本分发。

```sh
npm run mobile:sync          # 生成并校验两端最新资源，无需原生 SDK
npm run mobile:ios:open      # 打开 Xcode 工程
npm run mobile:android:open  # 打开 Android Studio 工程
npm run mobile:android       # 调试 APK，需要 JDK 21 / SDK 36
npm run mobile:ios           # 模拟器 App，需要 macOS / Xcode 26
```

买断制发行需要开发者账号、签名、付费协议及商店资料。具体命令、版本管理、CI 产物、真机验证与商用人物素材处理见上述两份指南。

## 国际化与全球上架

Web、iOS 和 Android 准备简体中文、英文、繁体中文、日文、韩文、西班牙文、意大利文、葡萄牙文、德文、法文和俄文。语言在设置中切换并保存在本机；切换立即生效并保持设置页打开，当前对局、手牌、筹码与其他牌桌设置保留。新用户未保存语言时，先按设备当前 IANA 时区匹配地区默认语言（例如上海用简体中文、台北用繁体中文、东京用日文）；未匹配时区时按系统语言选择，仍不支持则回退英文。时区到地区的关联来自 [IANA 时区表](https://data.iana.org/time-zones/tzdb/zone.tab)，地区语言映射是应用的默认选择，用户可随时覆盖。语言资源和隐私政策随原生包离线提供。微信小程序仅使用简体中文，移除语言设置，构建包不包含国际化相关文件和代码。

运行 `npm run i18n:check` 核对资源与动态金额占位符；新增界面文案时先运行 `npm run i18n:extract`，补齐各语言资源和 `src/i18n/overrides.json`，再运行 `npm run i18n:privacy` 更新政策页面。新语言需要同步原生语言声明、发布清单及验收矩阵。工程译文仍需母语扑克审校，自动检查不证明翻译质量。

完整步骤、地区评级、签名测试、隐私申报及商店说明见 [全球上架指导报告](docs/global-store-report.md)。`npm run store:check` 检查 `mobile/store-readiness.json`；目前缺少公开 URL 与实际验收证据时预检会失败，不能视为已经完成全球上架。原生资源验证与实际发行编译按 [移动端操作](docs/mobile.md) 和 [发行准备](docs/mobile-release.md) 分别执行。

## 微信小程序与原生端到端验证

```sh
npm run wechat:build         # 可导入 .artifacts/wechat，AppID 后续配置
npm run wechat:verify        # 当前源码、全部头像、文件指纹与包大小
npm run wechat:check         # 官方开源 WXML/WXSS 编译器检查
# 已开启 DevTools 官方自动化时，单独检查复盘、黄色建议与牌手姓名筛选：
node tests/wechat/review-coaching.mjs ws://127.0.0.1:9461 .artifacts/wechat-review
# 单独检查新增混合打法的九种实际记录；自动化端口按本机实际值替换：
node tests/wechat/deception-review.mjs ws://127.0.0.1:9471 .artifacts/wechat-deception
npm run platforms:sync      # 同步微信、iOS、Android 最新源码资源
npm run mobile:test:setup -- ios  # 隔离安装 Appium 与平台驱动
npm run mobile:test:ios      # 安装实际模拟器 App 并交互验证
npm run mobile:test:setup -- android
npm run mobile:test:android  # 启动 Android 仿真器后安装 APK 并交互验证
node tests/native/system-bars.mjs .artifacts/native-e2e/android/local-launch-and-no-login.png
# 多任务使用独立测试设备和端口：
npm run mobile:test:ios -- --udid TEST_SIMULATOR_ID --port 4735 --driver-port 8135
```

微信端共用规则、策略、复盘和头像，在同仓库维护 WXML/WXSS 界面与生命周期适配。共享业务的每次改动自动进入小程序构建；新增 Web 界面功能时同步更新小程序适配。导入、AppID 和自动监听见 [微信工程](docs/wechat.md)。小程序界面文案目前为中文，不进入手机 App 的十一语言资源清单。字体、座位坐标和安全区的跨端约定见 [界面一致性](docs/interface-parity.md)。

原生 App 保留当前人物头像与已有说明，图片 SHA-256 校验覆盖同步副本以及真实 `.app`/APK/AAB。CI 增加安装运行级别的两端测试，验证启动、设置保存、头像、下注/弃牌、结算/重打/下一手与系统前后台，保留设备截图和报告；环境与覆盖边界见 [原生 E2E](docs/native-e2e.md)，本次两端安装后结果见 [2026-10-11 验收记录](docs/native-validation-2026-10-11.md)。编译、浏览器、模拟器与真机结果分别记录，不能相互替代。

CI 的独立质量检查、浏览器分组、失败证据与账户启动阻塞排查见 [CI 排错](docs/ci.md)。

Web/iOS/Android 的牌点使用固定 Manrope 700 矢量字形，避免 SVG 文字在牌桌缩放与重绘时改变大小。字体版权和许可保留在 `public/licenses/card-ranks-OFL.txt`。浏览器回归检查反复缩放与牌面重建后的像素稳定性；原生 E2E 另比较后台恢复、六次重绘前后的设备截图数字尺寸与墨色像素数。微信使用自己的 WXML 文字牌点，本次没有改动小程序牌面。

牌手介绍卡片顶部对齐，桌面采用较大头像与公共牌。设置中的混合阵容可再次点击取消：仅随机分配当前桌上均衡座位，手动分配会保留。玩法指南提供九种牌型的五张牌示例和完整位置缩写；Web/App 的说明覆盖全部支持语言，小程序使用共享中文指南。标准／进阶对手按价格与有效后手防守小尺度 3-bet；边界与模型限制见 [机器人策略](docs/bots.md)。

Web/App 和小程序的音效使用同一份 PCM 声音定义，弃牌与下注增大音量。轮到你行动时触发一次短震动：App 和小程序走原生接口，Web 依赖浏览器震动 API；Safari 网页不支持。

新牌局配置接口与后续涨盲扩展边界见 [筹码与盲注配置](docs/stakes.md)。应用图标由 `public/app-icon.png` 统一生成；更换原图后运行 `npm run mobile:assets`，再同步各端资源。

本次尺度与图标变更的编译、安装运行和微信验收边界见 [2026-10-14 验证记录](docs/stakes-validation-2026-10-14.md)。

设置中的盲注修改在下一手应用，当前手与重打保留原尺度；小盲只接受 25 的正整数倍且最多 50K，大盲为两倍、起始筹码为 100 BB。各端输入、金额显示和安装运行结果见 [待生效盲注验证](docs/pending-stakes-validation-2026-10-14.md)。

PR44 的策略修正与具体行动复盘随本次盲注改动一并提交；兼容动态尺度、K/M、重打与下一手重置的 Web 回归见 [整合验证记录](docs/pr44-integration-validation-2026-10-14.md)。此次整合只重验 Web，原生及微信运行证据仍属于合入前快照。

当前牌面权益、实际待行动人数与公开范围候选的实现及本轮 Web 验收见 [公开范围与成牌候选验证](docs/position-equity-validation-2026-10-14.md)。
