# Web、App 与小程序的界面一致性

Web 和 Capacitor App 共享 DOM、CSS 和布局计算。浏览器模拟器的尺寸是内容视口；iOS/Android App 的同尺寸窗口还包含状态栏、刘海和底部手势区。比较时使用相同可用宽高、人数、语言、风格和牌局状态。例如 iPhone 窗口 393×852、顶部 59px 和底部 34px，对应浏览器的内容区域为 393×759；不能用两个不同的可用高度推断布局偏移。

所有平台使用包内 Manrope 与 Noto Sans SC；Web/App 另含韩文 Noto Sans KR，以及牌型视觉所需的 Barlow Condensed。字体来自 [Google Fonts 源仓库](https://github.com/google/fonts)，许可证随文件放在 `public/fonts/`。Web 不再请求 Google Fonts；原生构建也不删掉字体。日文使用同一 Noto CJK 子集，韩文使用本地韩文字体。系统文字自动放大固定为 100%，避免 WebView 调整已定义的字号。浏览器与 WebView 的像素栅格仍可能略有不同。

微信不能直接复用网页 DOM。其 WXML/WXSS 继续维护原生控件，但座位锚点共用 `src/ui/seat-geometry.js`，构建把相同中文字体文件转为内嵌 WXSS 数据，不请求网络。极短屏幕保留紧凑排布；微信原生胶囊按钮仍占用导航空间。小程序模板、mock 和官方编译器检查不能证明微信真机渲染一致。

底部安全区只保护贴近屏幕底部的操作区和页面末端。结算按钮收为一排后，其下方仍有可滚动摊牌内容，因此不再在按钮与摊牌之间插入手势区内边距；牌桌可用高度仍按行动期间的预算保留，避免结算跳动。品牌黑桃用矢量图形，避免 iOS 自动选成彩色 emoji。

字体子集覆盖仓库内现有 UI 和语言资源。更新 CJK 文案时重新生成，避免新增汉字回退到系统字体：

```sh
python3 -m venv .artifacts/font-tools
.artifacts/font-tools/bin/pip install fonttools brotli
# 下载 Google Fonts 的四个源文件至一个本地目录，命名如下：
# manrope.ttf: ofl/manrope/Manrope[wght].ttf
# noto-sc.ttf: ofl/notosanssc/NotoSansSC[wght].ttf
# noto-kr.ttf: ofl/notosanskr/NotoSansKR[wght].ttf
# barlow.ttf: ofl/barlowcondensed/BarlowCondensed-SemiBold.ttf
.artifacts/font-tools/bin/python scripts/subset-fonts.py /absolute/path/to/font-sources
npm run check
npm run test:e2e
npm run mobile:sync
npm run mobile:verify
npm run wechat:verify
npm run wechat:check
```

`tests/e2e/platform-parity.spec.js` 对比 Chromium 与 WebKit 在相同内容视口下的字体加载、座位位置和结算衔接。实际安装验证仍使用 `mobile:test:ios` 和 `mobile:test:android`，并保留设备截图；打包源码指纹必须与当前源文件一致。更新 Web 不会替换已有安装包，需重新构建并安装 App。

安装测试还通过 `tests/native/page-parity.mjs` 把 App 当时已渲染的 DOM、选择值和滚动位置复制到 Chromium，使用相同内容宽高、实际像素密度、CSS 布局缩放和本地 CSS。牌桌、设置、资料、指南、底池、重置、两种复盘视角、统计、关于及隐私页面保存成对截图，主要组件位置与尺寸允许 2px 的浏览器排版误差；字体、字重、文字颜色与可见状态必须相同，字号与行高仅容忍 0.01px 的浮点序列化误差。这是实际 App 截图和浏览器排版比较；测试不会把浏览器 fixture 注入安装包。尺寸检查之外仍需检查截图，例如下注滑块采用显式轨道与圆形手柄样式，避免 iOS 的系统白色手柄替换 Web 样式。

人数矩阵覆盖设置里的全部 5、6、7、8、9 人。安装测试与微信 DevTools 测试都通过设置和重新练习切换人数，分别保存设置、行动中牌桌、结算和复盘的 Web 对照图，检查不同座位数量、资料列表长度和公共牌区域。每端基础页面之外再保留 20 组人数对照；原生截图仍来自设备驱动，小程序截图来自 DevTools。

定位截图问题时可设置 `NOIR_NATIVE_SCENARIOS=every-player-count-matches-web,all-secondary-pages-match-web` 仅重跑这两个场景，并使用独立的 `--output`。这种筛选报告只证明所列场景，不代替完整安装测试。

小程序主界面、设置、资料、指南、底池、重置、结算、摊牌明细、两种复盘视角和统计都对照 Web 原生布局维护。指南正文从 `index.html` 的本地中文内容生成；小程序资料来源标题可点击进入网页；微信正式环境需要配置对应业务域名，无法打开时提供复制链接。胶囊区域为平台约束，指南与复盘弹窗保留系统安全区。DevTools 验证与浏览器参考图的运行方法见 [小程序文档](./wechat.md)。

小程序卡面沿用 Web 的矢量花色和 Manrope 点数；摊牌明细使用共享引擎的最佳五张牌与已结算奖励，仅展示实际摊牌参与者。单元回归逐一对照十种牌型的 Web 展示顺序、牌型说明和高亮，并确认不改动牌局状态。

牌桌几何由 `src/ui/rail-layout.js` 和 `src/ui/compact-table-layout.js` 共同计算，Web/App 与小程序使用相同的玩家占位、公共牌尺寸、桌边锚点和整体缩放。每个玩家的完整区域（底牌、头像/名称、筹码、行动与牌型）以桌边为中心；公共牌本身的中心始终对齐椭圆牌桌的几何中心，上方的筹码、明细和下方说明不参与居中计算，随牌区一起移动。两排时以两排公共牌的整体中心计算。优先五张单排，空间不足时采用居中的 3+2，保留玩家与公共牌的间距。名称标签固定在头像右侧 4 个逻辑像素处，最大宽度延伸到玩家块的右侧内边距，长名称单行省略，完整名称保留在文本与资料中。开局时顶部、牌桌和操作区填满首屏；顶部随滚动吸顶。弃牌或结算时仅缩短操作区，牌桌高度及位置保持稳定。小程序设置覆盖整个系统区域，牌手与座位网格对齐 Web，下拉选项紧邻触发控件；牌手详情保留圆形水波纹，公共牌保留翻牌动画。

小程序只提供简体中文，设置中没有语言控件，构建产物不包含国际化模块或语言目录。这个用户指定的平台差异在截图参考中明确保留，Web/App 仍支持全部语言。小程序选择列表使用深色页面控件，设置背景覆盖底部安全区；安全区间距放在弹层内部。首页可向下滚动到练习统计和本局动态。图标和卡面复用矢量路径，移除卡面内部浅色边框，获胜皇冠和亮牌高亮与 Web 同步。

验收同时比较所有玩家区域、头像、名称标签、公共模块、英雄区和桌面的实际位置与大小，不再只比较第一个玩家块。报告分别列出浏览器检查、安装后的 iOS/Android 运行和微信 DevTools 运行；配置或编译成功不能作为设备运行或视觉一致的证明。

静态截图等待最晚座位发牌与五张公共牌的错开动画结束，避免把透明或半翻开的中间帧当成最终界面。并排报告默认使用不透明原图，限制展示宽度并提供原图链接；模拟器缩放与截图像素密度单独记录，不通过放大或半透明叠图掩盖差异。发牌、亮牌和翻公共牌的过程另外检查。
