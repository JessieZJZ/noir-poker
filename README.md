# NOIR Poker · 德州扑克单机练习

无需登录的无限注德州扑克练习网站。默认 6 人桌，可选择 5–9 人，与本地电脑策略对手练习。所有筹码都是虚拟筹码。

工程目录：`/Users/zjz/code/noir-poker`。此目录是后续迭代的主项目，保留原项目的 Git 历史和 Sites 关联。原 Documents 目录中的项目保留为迁移前快照。

## 开始开发

需要 Node.js **22.12 或更新版本**。首次安装或从仓库重新检出时：

```sh
cd /Users/zjz/code/noir-poker
npm ci
npm run dev
```

访问 <http://127.0.0.1:4173/>。修改源码会自动更新页面。牌桌状态在内存中，完整刷新会开启新的练习；提示和声音偏好保存在本地浏览器。

```sh
npm run check          # 规则、复盘等单元测试 + 生产构建
npm run test:e2e       # 桌面和移动端真实浏览器交互测试
npm run format        # 统一格式
npm run format:check  # 检查格式
npm run build         # 输出生产文件到 dist/
npm run preview       # 本地检查生产构建，先停止同端口开发服务
```

首次运行浏览器测试若提示缺少浏览器，执行 `npx playwright install chromium`。测试会自动在 **4175** 端口启动自己的服务，不占用日常开发的 4173。

## 项目结构

```text
index.html                   页面骨架和对话框
public/                      静态资源
src/
  main.js                    入口与样式装配
  engine/poker.js            发牌、行动、牌型、主池/边池、结算、同手重打
  review/
    context.js              起手牌、成牌、听牌、牌面、位置与下注上下文
    equity.js               跟注成本、分池资格、枚举/抽样权益
    analysis.js             决策评价、依据、候选行动与后续路线
    worker.js               后台复盘任务
  ui/
    table-controller.js     牌桌渲染、操作、对手调度、底牌查看
    cards.js                单个大花色图标的 SVG 牌面
    showdown.js             每位参与者最佳五张牌与赢家动画
    review-controller.js    复盘对话框、时间线与 Worker 生命周期
  styles/                   按牌桌、复盘、摊牌拆分的样式
tests/
  unit/                     德州规则、边池、同手重打、复盘边界
  e2e/                      浏览器操作与响应式布局
  fixtures/                 仅测试服务注入的可控牌局
docs/                       架构、规则、复盘依据与发布说明
.openai/hosting.json          原 Sites 项目关联与部署入口
```

采用浏览器原生 ES Modules + Vite，保留现有 JavaScript 实现。引擎和分析模块不依赖 DOM，可直接在 Node 中测试。Vite 负责开发服务、生产压缩、Worker 打包和资源版本标识。

## 已有功能

- 5–9 人桌，三档电脑策略难度，下注、跟注、加注、弃牌和全下。
- 多人全下的主池、多个边池、平分与零头筹码、未被跟注筹码退还。
- 摊牌立即展示未弃牌对手的底牌，各参与者分别展示自己的最佳五张牌；赢家使用对应牌型动画。
- 结算后点击每位对手筹码旁的眼睛按钮，在原底牌位置翻开该对手的牌；再次点击收起。已弃牌对手也可查看，下一手、重打或重新练习会恢复隐藏。
- 弃牌后的“立刻发完”加速完成对手行动及本手结算，然后可进入下一手。
- “重打这手牌”撤回原结算和统计，恢复原底牌、牌序、位置与起始筹码；电脑会根据新的行动重新决策。
- 单一复盘入口。按每一步当时已知信息展示价格、牌力、牌面、人数、依据和后续路线，赢牌后也能复盘价值获取。
- 本局动态展示完整历史，内容自然撑开，随页面滚动。

## 从哪里迭代

- 改规则或筹码结算：先读 [规则与测试](docs/rules.md)，修改 `src/engine/poker.js`，增加能复现边界的测试。
- 改复盘：读 [复盘计算与限制](docs/review.md)，分别修改上下文、权益模型或决策分支，避免通过最终输赢反推决策。
- 改体验：改 `src/ui/` 和 `src/styles/`，验证 320/390/768/1280 宽度及 6/9 人桌。
- 理解行动到渲染的路径：读 [架构说明](docs/architecture.md)。
- 更新在线网站：读 [构建与 Sites 发布](docs/deployment.md)。

当前在线地址：<https://noir-poker-practice.daring-oak-8798.chatgpt.site/>。

复盘是透明、可修改的训练启发式与范围模型，尚不是 GTO 求解器，也没有联网调用大模型。电脑对手也是本地策略；提高难度会改变行动策略，不会使用玩家隐藏信息。
