# 牌手资料与本地打法对应表

核对日期：2026-10-11。现有 8 人与新增 8 位职业牌手均有逐条来源。这里记录可核对的历史事实、公开行动样本和本地改编；比赛成绩不用于推断现金桌频率。

新增：Phil Ivey、Daniel Negreanu、Phil Hellmuth、Patrik Antonius、Jason Koon、Stephen Chidwick、Fedor Holz、Isaac Haxton。稳定风格 ID 保留，旧座位设置继续有效。

## 资料范围与证据强度

- 44 条引用、34 个不同 URL。33 个页面读取了正文；HCL 官方视频仅核对观看入口，未完整观看，标为 `linked-video-only`，不把它当逐手分析证据。
- 主要采用 Triton、WSOP、PokerStars、PGT、Pokercode 的官方报道或原访谈，以及 Card Player 的本人访谈。Peter 的部分资料来自专业媒体，阿宝的两条为 Pokerati 牌局复述；分别标明限制，不把所有来源称为赛事官方。
- 保留报道日期和本次核对日期，历史冠军数和获利明确限定当时或单场。部分官方旧采访反映历史阶段，不能宣称等同于 2026 年完整打法。
- PokerStars 的直接请求在部分地区会跳转，Pokercode 也有访问限制；本次网页阅读结果可读取对应正文。没有从访问失败的页面推断新事实。
- 公开牌局通常是剪选样本，缺少可代表长期表现的完整手数。没有编造真人 VPIP、PFR、诈唬率、心理状态、净资产或未确认本名。

应用内逐条链接位于设置的牌手详情。中文资料正文明确标记“中文整理”；界面、简介与复盘标签使用现有 11 语言目录。完整结构化资料在 [player-research.json](../src/data/player-research.json)。

## 每位牌手的依据与改编

### tan · Tan Xuan；沿用谭老板称呼。

赛制：高额 NLHE 现金桌、短牌锦标赛。

- 履历：2024 济州 $50K 短牌主赛冠军，奖金 $922,000。 [Triton · 谭老板短牌冠军与原访谈](https://tritonpokerseries.com/en-US/news/headlines/tan-xuan-completes-short-deck-double-with-jeju-main-event-success)
- 公开观察：本人在短牌冠军采访中自述喜欢宽松与诈唬；普通现金桌报道另有弱牌 4-bet 和多街进攻。 [Triton · 谭老板短牌冠军与原访谈](https://tritonpokerseries.com/en-US/news/headlines/tan-xuan-completes-short-deck-double-with-jeju-main-event-success) [Triton · 黑山现金桌第 3 日](https://tritonpokerseries.com/en-US/news/headlines/st-wang-shows-million-dollar-class-as-cash-game-invitational-raises-stakes)
- 公开观察：2024 黑山现金桌有持续进攻被强牌抓住的样本，不能只采纳成功诈唬。 [Triton · Ivey、Cates 与 Wang 现金桌牌局](https://tritonpokerseries.com/en-US/news/headlines/ferdinand-takes-most-as-phil-ivey-and-dan-cates-land-big-cash-game-profits)

本地改编：后位范围较宽；在有阻断牌或延续进攻叙事时保留再加注。 转牌增加有权益的半诈唬；河牌大注需要强价值或可解释的阻断牌。

资料限制：短牌规则、straddle 和深筹码会改变策略；当前仅为普通 NLHE 的定性改编。

### st · ST Wang；不推断未确认本名。

赛制：Triton 高额 NLHE 现金桌。

- 履历：2024-08-09 官方记录单场净赢 $1,389,000，仅该场结果。 [Triton · 黑山现金桌第 3 日](https://tritonpokerseries.com/en-US/news/headlines/st-wang-shows-million-dollar-class-as-cash-game-invitational-raises-stakes)
- 公开观察：AA 在翻牌、转牌与河牌组合使用诱导和价值加注。 [Triton · Wang 的 AA 诱导](https://tritonpokerseries.com/en-US/news/headlines/more-brilliance-from-elton-tsang-as-cash-game-invitational-gets-serious)
- 公开观察：官方报道还记录大池失利后的河牌弃牌，不能等同于永远跟到底。 [Triton · Ivey、Cates 与 Wang 现金桌牌局](https://tritonpokerseries.com/en-US/news/headlines/ferdinand-takes-most-as-phil-ivey-and-dan-cates-land-big-cash-game-profits)

本地改编：收紧高成本再加注防守；干燥牌面强牌允许过牌诱导。 河牌面对已有下注时，强价值牌可采用较大加注。

资料限制：缺少可代表长期表现的完整样本；身份、收益总额与实际 VPIP 未确认。

### zang · Aaron Zang；中文沿用臧书奴。

赛制：高额锦标赛、Triton NLHE 现金桌。

- 履历：2019 伦敦 Triton Million 冠军，对手为 Bryn Kenney。 [Triton · 2019 Million 官方历史](https://tritonpokerseries.com/en-US/about/our-story)
- 公开观察：2024 济州一手牌，44 在河牌把 23k 加到 105k，被 AQ 跟住。 [Triton · 臧书奴河牌加注样本](https://tritonpokerseries.com/en-US/news/headlines/brilliant-rui-cao-and-steady-andy-ni-win-big-on-day-2-in-jeju)

本地改编：后位争夺较积极；河牌面对小注保留有边界的诈唬加注。 强牌与诈唬共用较大河牌尺度，但多人、重压力底池压低空气进攻。

资料限制：冠军成绩不证明现金桌频率；河牌单手样本也不证明长期盈利。

### peter · Peter，指 Hustler Casino Live 常客；不推断本名或职业资格。

赛制：HCL 高额 NLHE 现金桌。

- 履历：HCL 2024 Million Dollar Game 回顾记录该周约 $5M 盈利，仅该节目样本。 [HCL · Peter 与 Dwan 再战](https://hustlercasinolive.com/2024/06/12/the-rematch-we-didnt-know-we-needed/)
- 公开观察：暗三条在河牌采用满池再加注，获得大尺度价值。 [HCL · Peter 与 Dwan 再战](https://hustlercasinolive.com/2024/06/12/the-rematch-we-didnt-know-we-needed/)
- 公开观察：小口袋对子推入报道含 Stand-Up 附加激励。 [PokerNews · 小对子反击样本](https://www.pokernews.com/news/2025/01/poker-player-goes-all-in-for-thousands-47684.htm)

本地改编：保留宽松的低成本跟入，强价值牌偏向大尺度。 普通桌移除来源含附加规则的小对子特殊全下，不靠精彩片段强行增加搏杀。

资料限制：公开身份和统计有限；节目盈利不能当作生涯收益，附加规则不移植。

### abao · KPC 直播标签 A Bao；本名、国籍和职业身份未可靠确认。

赛制：KPC 高额 NLHE 现金桌。

- 公开观察：AJ 同花听牌使用约 31% 池翻牌下注，再在转牌以约 90% 池推入施压。 [Pokerati · A Bao 的 AJ 同花半诈唬](https://pokerati.com/2026/08/top-streamed-hands-of-the-week-winston-sets-the-perfect-trap-a-bao-bluffs-big/)
- 公开观察：另有同花听牌反击的媒体复述样本。 [Pokerati · A Bao 的同花听牌反击](https://pokerati.com/2026/08/top-streamed-hands-of-the-week-malinowski-and-dwan-take-on-the-kpc-high-rollers/)

本地改编：翻前进攻后的翻牌持续下注使用小尺度。 转牌半诈唬采用较大尺度；无听牌且多人时降低空气诈唬。

资料限制：两篇媒体复述不是完整官方统计，未独立逐帧重建整场，不编造履历或真实频率。

### viktor · Viktor Blom，线上别名 Isildur1。

赛制：线上高额 NLHE/PLO、单挑现金桌、线上锦标赛。

- 履历：2013 SCOOP $10,300 NLHE 主赛冠军，580 人，奖金 $1,096,200。 [PokerStars · 2013 SCOOP 主赛冠军](https://www.pokerstars.com/poker/learn/news/scoop-2013-viktor-isildur1-blom-bests-bo-137930/)
- 公开观察：PokerStars 原访谈与历史回顾记录其高额单挑背景和主动施压案例。 [PokerStars · Isildur1 原访谈](https://www.pokerstars.com/poker/learn/news/finding-isildur1-viktor-blom-cops-to-his-077269/) [PokerStars · 历史诈唬案例](https://www.pokerstars.com/poker/learn/news/the-best-and-worst-poker-bluffs-ever/)

本地改编：较宽的后位范围，更积极的听牌半诈唬和转河牌延续。 大尺度进攻仍受阻断牌、多人底池及有效筹码限制。

资料限制：单挑和 PLO 不直接提供多人 NLHE 频率；没有最新真人统计。

### jungleman · Daniel Cates，线上别名 Jungleman12。

赛制：高额单挑 NLHE、混合游戏、Triton 现金桌。

- 履历：早期参加与 Tom Dwan 的线上 $200/$400 NLHE 挑战。 [Card Player · Cates 计算与进攻访谈](https://www.cardplayer.com/cardplayer-poker-magazines/65799-poker-hall-of-fame-23-20/articles/19757-capture-the-flag-daniel-jungleman12-cates)
- 公开观察：本人访谈强调计算与观察行为，针对对手作调整。 [Card Player · Cates 计算与进攻访谈](https://www.cardplayer.com/cardplayer-poker-magazines/65799-poker-hall-of-fame-23-20/articles/19757-capture-the-flag-daniel-jungleman12-cates) [Card Player · 单挑对手调整访谈](https://www.cardplayer.com/cardplayer-poker-magazines/66315-jason-mercier-28-23/articles/22601-head-games-heads-up-cash-game-advice-from-the-best-in-the-world)
- 公开观察：2024 黑山用坚果牌让 Tan Xuan 多街继续进攻。 [Triton · Ivey、Cates 与 Wang 现金桌牌局](https://tritonpokerseries.com/en-US/news/headlines/ferdinand-takes-most-as-phil-ivey-and-dan-cates-land-big-cash-game-profits)

本地改编：保留合理价格的防守和强牌诱导。 当前手有足够公开行动后，对进攻或被动倾向做小幅调整。

资料限制：不模拟现场读人；当前手少量动作不等于稳定读牌，也不运行职业级求解器。

### dwan · Tom Dwan，线上别名 durrrr。

赛制：深筹码 NLHE/PLO 现金桌、直播高额现金桌。

- 履历：HCL 官方保留 2023 大底池原片入口，另有 2024 与 Peter 对战报道。 [HCL · Dwan 2023 大底池原片](https://www.youtube.com/watch?v=2UhdlMvQSvg) [HCL · Peter 与 Dwan 再战](https://hustlercasinolive.com/2024/06/12/the-rematch-we-didnt-know-we-needed/)
- 公开观察：原采访中的同行描述强调非常规路线和选择性的主动/被动切换。 [Card Player · Dwan 原采访与同行评价](https://www.cardplayer.com/cardplayer-poker-magazines/65739-tom-dwan-6-4/articles/18288-the-won-39-durrrr-39-ful-life-of-tom-dwan)
- 公开观察：官方历史回顾有多街诈唬案例，不能据此量化所有牌的诈唬频率。 [PokerStars · 历史诈唬案例](https://www.pokerstars.com/poker/learn/news/the-best-and-worst-poker-bluffs-ever/)

本地改编：后位主动争夺，转河牌保留多街施压和较大尺度。 干燥牌面也允许强牌控池，避免把其策略简化成无条件加注。

资料限制：原片本次仅核对入口；历史同行评价和精选牌局不是完整、实时策略。

### ivey · Phil Ivey；美国职业牌手。

赛制：高额 NLHE 现金桌、混合游戏、高额锦标赛。

- 履历：2017 入选 Poker Hall of Fame。 [WSOP · 2024 名人堂官方公告](https://www.wsop.com/news/patrik-antonius-announced-as-2024-poker-hall-of-fame-inductee/)
- 公开观察：2024 黑山强牌连续过牌后在河牌价值加注；另场有多种价值、抓诈路线。 [Triton · Ivey 慢打与河牌价值加注](https://tritonpokerseries.com/en-US/news/headlines/st-wang-shows-million-dollar-class-as-cash-game-invitational-raises-stakes) [Triton · Ivey、Cates 与 Wang 现金桌牌局](https://tritonpokerseries.com/en-US/news/headlines/ferdinand-takes-most-as-phil-ivey-and-dan-cates-land-big-cash-game-profits)

本地改编：中宽范围兼顾诱导与价值，危险牌面减少慢打。 公开行动足够时小幅调节防守，较强河牌价值可扩大尺度。

资料限制：依据是特定现金桌样本；模型无法还原其现场观察、经验或完整混合游戏策略。

### negreanu · Daniel Negreanu，常用别名 Kid Poker。

赛制：NLHE 锦标赛、混合游戏。

- 履历：1998 获首条 WSOP 手链；2004、2013 获 WSOP 年度牌手。 [WSOP · Daniel Negreanu 官方档案](https://www.wsop.com/players/653419452/daniel-negreanu/?awardType=Bracelet)
- 履历：2024 $50,000 Poker Players Championship 冠军。 [WSOP · Daniel Negreanu 官方档案](https://www.wsop.com/players/653419452/daniel-negreanu/?awardType=Bracelet)
- 公开观察：PokerStars 教学将历史 small-ball 与 Negreanu 联系，强调低成本进攻和控池。 [PokerStars · Small-ball 教学](https://www.pokerstars.com/pt-BR/poker/learn/strategies/como-jogar-small-ball/)

本地改编：未开池时采用较小开池；干燥牌面中等权益手牌更多控池。 较小翻后尺度搭配薄价值路线；高成本再加注收紧。

资料限制：明确选择历史 small-ball 训练版本，不声称复刻今天的 Negreanu；混合赛事成绩不作为现金桌频率。

### hellmuth · Phil Hellmuth，常用别名 Poker Brat。

赛制：大型 NLHE 锦标赛、混合游戏。

- 履历：1989 WSOP 主赛冠军；2007 入选 Poker Hall of Fame。 [WSOP · Phil Hellmuth 官方档案](https://www.wsop.com/players/690290266/phil-hellmuth/?awardType=Bracelet) [WSOP · 2024 名人堂官方公告](https://www.wsop.com/news/patrik-antonius-announced-as-2024-poker-hall-of-fame-inductee/)
- 履历：2023 WSOP $10,000 Super Turbo Bounty 冠军。 [WSOP · Phil Hellmuth 官方档案](https://www.wsop.com/players/690290266/phil-hellmuth/?awardType=Bracelet)
- 公开观察：原访谈讨论历史低风险、寻找机会与诱导，也反思过度冒险的牌局。 [Card Player · Hellmuth 低风险打法原访谈](https://www.cardplayer.com/cardplayer-poker-magazines/65767-joseph-cada-22-24/articles/18902-the-scoop-phil-hellmuth)

本地改编：收紧再加注范围和高成本继续；强牌在安全牌面保留诱导。 更少阻断牌诈唬与大尺度空气施压。

资料限制：沿用历史锦标赛风格的定性启发，现金桌没有 ICM；不把公开情绪形象写入真人策略。

### antonius · Patrik Antonius；芬兰职业牌手。

赛制：高额短桌现金局、NLHE/PLO、混合游戏。

- 履历：2024 入选 Poker Hall of Fame。 [WSOP · 2024 名人堂官方公告](https://www.wsop.com/news/patrik-antonius-announced-as-2024-poker-hall-of-fame-inductee/)
- 公开观察：本人高额现金桌采访自述较稳健，并偏好短桌。 [Card Player · Antonius 高额现金桌原访谈](https://www.cardplayer.com/cardplayer-poker-magazines/65699-patrik-antonius-21-5/articles/17380-big-game-hunter-patrik-antonius)
- 公开观察：策略访谈讨论顺子、同花或配对牌落下后，如何重新考虑价值、跟注与诈唬。 [Card Player · Antonius 牌面变化与多街策略](https://www.cardplayer.com/cardplayer-poker-magazines/65708-david-chiu-21-11/articles/17580-capture-the-flag-where-top-cash-game-pros-talk-strategy)

本地改编：短桌比满桌稍宽；听牌有权益时更积极。 转河牌改变后重新检查危险度，大尺度空气进攻需要阻断牌。

资料限制：早期混合游戏采访不是最新 NLHE 统计；本桌最少五人，不直接模拟单挑。

### koon · Jason Koon；美国职业牌手。

赛制：高额 NLHE 锦标赛、短牌、高额现金桌。

- 履历：2025 黑山站收官赛取得当时第 12 个 Triton 冠军。 [Triton · Koon 在黑山取得第 12 冠](https://tritonpokerseries.com/en-US/news/headlines/make-that-12-red-hot-jason-koon-hits-the-triton-dozen-in-montenegro-closer)
- 公开观察：本人采访强调理解范围、尺度与价值/诈唬组成，再按有依据的对手偏差调整。 [Card Player · Koon 范围与尺度原访谈](https://www.cardplayer.com/cardplayer-poker-magazines/66342-jason-koon-29-24/articles/22925-jason-koon-hard-work-pays-off)

本地改编：再加注优先强价值和同花 A 阻断候选；多人空气进攻更谨慎。 翻牌小尺度和转河牌较大尺度分开；公开动作足够后仅小幅调整。

资料限制：这些是人为设定的训练控制，没有求解器策略库；第 12 冠是当时记录。

### chidwick · Stephen Chidwick，线上别名 Stevie444。

赛制：高额 NLHE 锦标赛、混合游戏。

- 履历：2018 成为首位登顶 GPI 的英国牌手。 [PokerStars · Chidwick 登顶 GPI 访谈](https://www.pokerstars.com/poker/learn/news/how-stephen-chidwick-top-poker-world-172552/)
- 履历：2018 首届 U.S. Poker Open 系列总冠军，该系列两场夺冠。 [PGT · 首届 U.S. Poker Open 成绩回顾](https://www.pgt.com/news/u-s-poker-open-dates-added-cash-prize-revealed-for-next-leg-of-the-high-roller-triple-crown-in-2019)
- 公开观察：本人采访强调理论帮助识别对手失衡，研究的是策略逻辑而非只背图表。 [Card Player · Chidwick 理论与剥削原访谈](https://www.cardplayer.com/cardplayer-poker-magazines/66412-stephen-chidwick-the-player-s-choice-of-champion-30-year-old-high-roller-tops-british-money-list-with-23-million-in-winnings-32-13/articles/23709-stephen-chidwick-the-player-s-choice-of-champion)

本地改编：范围与再加注更有纪律，阻断牌辅助选择少量诈唬。 不同街次分开尺度；足够公开行动后小幅调整，危险牌面更少慢打。

资料限制：本地仍是启发式与权益抽样；锦标赛 ICM、职业读人与完整 GTO 未建模。

### holz · Fedor Holz，线上别名 CrownUpGuy。

赛制：高额 NLHE 锦标赛、线上现金桌。

- 履历：2014 WCOOP 主赛以 CrownUpGuy 账号夺冠。 [PokerStars · CrownUpGuy 2014 WCOOP 主赛](https://www.pokerstars.com/poker/learn/news/wcoop-2014-crownupguy-conquers-main-even-151217/)
- 履历：Pokercode 官方教学介绍其为共同创始人。 [Pokercode · Fedor 现金桌策略复盘](https://www.pokercode.com/blog/steffen-gives-fedor-a-poker-cash-game-strategy-review)
- 公开观察：本人团队现金桌复盘中，干燥 Q-3-7 牌面采用 40% 池下注，转牌过牌，河牌对少诈唬范围弃牌。 [Pokercode · Fedor 现金桌策略复盘](https://www.pokercode.com/blog/steffen-gives-fedor-a-poker-cash-game-strategy-review)

本地改编：干燥高牌翻牌，翻前进攻者可用小尺度持续下注。 中等牌力保留控池；河牌大注更强调强价值或阻断牌。

资料限制：复盘来自单挑、只是一手；本地范围优势是牌面代理指标，不是求解结果。

### haxton · Isaac Haxton，常用别名 Ike。

赛制：高额单挑 NLHE、高额锦标赛。

- 履历：2023 SHRB VIII 冠军，20 人，奖金 $2,760,000。 [PGT · Haxton 2023 SHRB VIII 冠军](https://www.pgt.com/news/isaac-haxton-wins-super-high-roller-bowl-viii-for-2760000)
- 公开观察：本人 Float 教学讨论干燥牌面先跟注，再在后续街寻找诈唬机会。 [Card Player TV · Haxton 讲解 Float](https://www.cardplayer.com/poker-news/24874-poker-video-spotlight-isaac-haxton-on-floating)
- 公开观察：逐手访谈讨论对手下注倾向和自身形象。 [Card Player · Haxton 逐手分析](https://www.cardplayer.com/cardplayer-poker-magazines/65753-sammy-george-6-8/articles/18579-final-table-takedown-isaac-haxton)

本地改编：有位置、干燥翻牌、低价格时，少量有后门潜力手牌可 Float。 对手下一街过牌后保留争夺；不在多人、全下或高压力场景复制。

资料限制：Float 条件是本地保守近似；旧教学与赛事 ICM 不代表今天的多人现金桌策略。

## 策略实现与可检查边界

| 公开特征 / 教学思路       | 本地实现                                                                                                          | 限制                                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 历史 small-ball、控制投入 | Negreanu 更小开池、较小翻后尺度、中等权益控池与河牌薄价值                                                         | random-opponents 权益不代表对手的跟注范围，不能证明薄价值正确                                            |
| 小尺度持续下注            | Holz、Koon、Chidwick 在有主动权、单挑、干燥高牌翻牌混合小注                                                       | 不是全牌面范围下注；没有调用求解器                                                                       |
| 多街进攻与半诈唬          | Tan、Blom、Dwan 分街尺度和转牌进攻；阿宝约 1/3 翻牌与 90% 池转牌听牌下注                                          | 附加规则、短牌与直播深筹码不照搬到普通桌                                                                 |
| 有边界的诈唬              | 再加注优先同花 A2–A5；河牌要求同花 A 或无三同花牌面的 A/K 阻断代理                                                | 尚未枚举对手组合，不证明这些牌一定适合诈唬                                                               |
| 强牌诱导与公开行为调整    | Ivey、Cates、ST、Hellmuth 保留安全牌面诱导；部分原型观察当前手公开动作                                            | 至少 3 个公开动作才修正，最多 2.5 个百分点，不读取心理或隐藏牌                                           |
| Float 与延迟进攻          | Haxton 在单挑、有位置、干燥翻牌、高张、15%–40% 自有随机权益、无直接听牌时混合低价跟注；下一街对手过牌后可增加进攻 | 跟注不超过 1/4 当前池与自身投入基数的 8%；全下、多人、无位置、高价格均排除；此前跟注只是代理，不证明读牌 |
| 不同赛制的安全移植        | Peter 原附加规则小对子特殊推入删除；Antonius 仅在短桌小幅放宽                                                     | 无 Stand-Up、straddle、ICM 或个人专属范围模型                                                            |

`poker.js → botDecision()` 仍构造白名单视角，只提供本人底牌、当前公共牌、公开动作、位置、价格和引擎合法动作。新 [bot-style.js](../src/engine/bot-style.js) 不接收完整游戏对象。下注仍经原有 `legalRaiseTo()`，不得绕过短全下不重开加注；所有金额保持整 25，结算、退款、边池与重打由原引擎负责。

每次策略记录包含实际候选、公开上下文、抽签与尺度，供结束后的复盘解释。新分支的名称和文案也进入多语言复盘。情绪机制与牌手资料分开，不能将合成情绪归因于本人。

Web 与原生使用相同人物、资料和本地头像；WeChat 原生详情也显示相同资料，点击来源复制已列出 URL。可选的历史原创展示转换继续保留策略控制，并移除具名资料。

## 本次实际模拟测量

下面数值由当前代码实际运行，**只描述本地机器人，不是对应真人统计，也不是拟合精度或胜率证明**。每个原型使用同样协议：6 人桌、每手 100 BB、5 个机器人均为该风格、玩家由均衡策略驱动，情绪关闭，100 手。策略种子 781，牌序种子 711。VPIP/PFR 的分母各为 500 个机器人手次；整体参与率还受桌况和对手阵容影响。

完整结果含原始计数、翻牌人数分布、策略控制与五轴快照：[player-simulation-2026-10-11.json](player-simulation-2026-10-11.json)。复现某一行：

```sh
npm run measure:bots -- --hands=100 --players=6 --profile=ivey --seed=781 --deck-seed=711
```

| 本地原型            |   VPIP |    PFR | 实际发出翻牌 / 100 手 | 翻牌平均人数 |
| ------------------- | -----: | -----: | --------------------: | -----------: |
| 均衡练习            | 55.60% | 15.00% |                    83 |        3.229 |
| 谭老板 · Tan Xuan   | 73.80% | 24.00% |                    86 |        3.570 |
| ST Wang             | 43.00% | 14.60% |                    88 |        2.807 |
| 臧书奴 · Aaron Zang | 63.20% | 21.40% |                    82 |        3.354 |
| Peter · HCL         | 78.20% | 23.80% |                    85 |        3.788 |
| 阿宝 · KPC A Bao    | 55.00% | 20.00% |                    83 |        3.036 |
| Viktor Blom         | 76.20% | 24.80% |                    85 |        3.776 |
| Daniel Cates        | 59.60% | 21.00% |                    83 |        3.253 |
| Tom Dwan            | 74.40% | 22.60% |                    85 |        3.918 |
| Phil Ivey           | 59.60% | 19.40% |                    85 |        3.224 |
| Daniel Negreanu     | 61.60% | 18.00% |                    93 |        3.355 |
| Phil Hellmuth       | 39.80% | 12.40% |                    87 |        2.770 |
| Patrik Antonius     | 60.20% | 19.80% |                    86 |        3.314 |
| Jason Koon          | 52.20% | 18.20% |                    84 |        3.048 |
| Stephen Chidwick    | 52.40% | 18.40% |                    84 |        3.024 |
| Fedor Holz          | 54.80% | 20.20% |                    84 |        3.083 |
| Isaac Haxton        | 59.80% | 20.80% |                    87 |        3.184 |

100 手是诊断样本，未给出真人相似度分数、置信区间或长期盈利结论。场景回归另外直接验证 Holz 小持续下注、阿宝转牌听牌尺度、Negreanu 控池频率差异、Haxton Float 边界、河牌阻断筛选与公开调整上限；全体原型还检查合法行动、25 筹码量化与筹码守恒。
