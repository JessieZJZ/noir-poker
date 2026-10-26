import { themes, devices, screens } from './manifest.mjs';
import { glossary as glossaryContent, privacyHtml } from './content.mjs';
import { premiumSparks, confettiPieces, refillCountValues } from '/runtime/ui/effect-layouts.js';
const q = new URLSearchParams(location.search);
const theme = themes.find((t) => t.id === q.get('theme')) || themes[0];
const device = devices.find((d) => d.id === q.get('device')) || devices[0];
const screen = screens.find((s) => s.id === q.get('screen')) || screens[1];
const pageId = screen.id;
const root = document.documentElement;
root.dataset.theme = theme.id;
root.dataset.device = device.id;
root.dataset.screen = pageId;
root.style.setProperty('--top', device.top + 'px');
root.style.setProperty('--bottom', device.bottom + 'px');
root.style.setProperty('--accent', theme.accent);
root.style.setProperty('--bg', theme.bg);
root.style.setProperty('--panel', theme.panel);
root.style.setProperty('--felt', theme.felt);
root.style.setProperty('--radius', theme.radius + 'px');
root.style.setProperty('--motion', theme.duration + 'ms');
const isSmall = device.width < 600;
const asset = (p) => '/assets/' + p;
const icon = (name = 'spade') =>
  ({
    spade:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C8 7 3 9 3 14a5 5 0 0 0 8 4c0 2-1 3-3 4h8c-2-1-3-2-3-4a5 5 0 0 0 8-4c0-5-5-7-9-12Z"/></svg>',
    gear: '⚙',
    close: '×',
    back: '←',
  })[name] || '';
const btn = (text, cls = '', go = '') =>
  `<button class="${cls}" ${go ? `data-go="${go}"` : ''}>${text}</button>`;
const chip = (n = '100', cl = '') => `<span class="chip ${cl}"><i>${n}</i></span>`;
const card = (rank = 'A', suit = '♠', extra = '') =>
  `<span class="card ${suit === '♥' || suit === '♦' ? 'red' : ''} ${extra}"><b>${rank}</b><i>${suit}</i><em>${suit}</em><small>${rank}</small></span>`;
const back = () => '<span class="card back"><i>♠</i></span>';
const board = () =>
  `<div class="board">${card('A', '♠')}${card('J', '♥')}${card('7', '♣')}${card('4', '♦')}${card('2', '♠', 'last')}</div>`;
const brand = () =>
  `<div class="brand"><span class="brandmark">${icon()}</span><span>NOIR <small>POKER</small></span></div>`;
const platformChrome = () =>
  device.top
    ? `<div class="platform-bar"><b>9:41</b><span>▰ ▰ ▰</span>${device.id === 'ios' ? '<i class="island"></i>' : ''}${device.id === 'wechat' ? '<div class="capsule">••• │ ◉</div>' : ''}</div>`
    : '';
const header = () =>
  `<header>${brand()}<div class="header-middle"><span class="dot"></span> ${theme.en}<span class="sep"></span>本地练习 · 虚拟筹码</div><nav>${btn('玩法指南', 'quiet', 'guide')}${btn('对局记录', 'quiet', 'records')}${btn('⚙ <span>设置</span>', 'quiet', 'settings')}</nav></header>`;
const sectionHead = (eyebrow, title, desc = '') =>
  `<div class="section-head"><span class="eyebrow">${eyebrow}</span><h1>${title}</h1>${desc ? `<p>${desc}</p>` : ''}</div>`;
const field = (label, control, note = '') =>
  `<div class="field"><div><strong>${label}</strong>${note ? `<p>${note}</p>` : ''}</div>${control}</div>`;
const toggle = (on = true) =>
  `<button class="toggle ${on ? 'on' : ''}" aria-label="${on ? '已开启' : '已关闭'}" aria-pressed="${on}"><i></i></button>`;
const select = (text) => `<button class="select">${text}<span>⌄</span></button>`;
const tabs = (names, idx = 0) =>
  `<div class="tabs">${names.map((s, i) => btn(s, i === idx ? 'selected' : '')).join('')}</div>`;
const alert = (title, text, cl = '') =>
  `<div class="notice ${cl}"><strong>${title}</strong><p>${text}</p></div>`;
const footer = () => '<footer>NOIR POKER <span>本地练习 · 虚拟筹码</span></footer>';
const people = [
  ['Vale', '均衡', 'vale'],
  ['Knox', '大注强攻', 'knox'],
  ['Jett', '宽松取值', 'jett'],
  ['Owen', '范围纪律', 'owen'],
  ['Bram', '跟注诱导', 'bram'],
  ['Nico', '小注控池', 'nico'],
  ['Mira', '听牌施压', 'mira'],
  ['Finn', '后位争夺', 'finn'],
];
const avatar = (p = people[0]) =>
  p[1] === '均衡'
    ? '<span class="avatar balanced">V</span>'
    : `<img class="avatar" src="${asset('portraits/' + p[2] + '.jpg')}" alt="${p[0]} 原创角色">`;
function seats(n = 5, entry = false, emotions = false) {
  return Array.from({ length: n - 1 }, (_, i) => {
    const p = people[i];
    const positions = {
      5: ['SB', 'BB', 'UTG', 'CO'],
      6: ['SB', 'BB', 'UTG', 'HJ', 'CO'],
      7: ['SB', 'BB', 'UTG', 'MP', 'HJ', 'CO'],
      8: ['SB', 'BB', 'UTG', 'UTG+1', 'MP', 'HJ', 'CO'],
      9: ['SB', 'BB', 'UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO'],
    };
    const maps = {
      5: [
        [10, 45],
        [32, 10],
        [68, 10],
        [90, 45],
      ],
      6: [
        [10, 60],
        [15, 25],
        [50, 8],
        [85, 25],
        [90, 60],
      ],
      7: [
        [10, 66],
        [10, 34],
        [32, 9],
        [68, 9],
        [90, 34],
        [90, 66],
      ],
      8: [
        [10, 69],
        [10, 40],
        [24, 14],
        [50, 7],
        [76, 14],
        [90, 40],
        [90, 69],
      ],
      9: [
        [13, 72],
        [13, 45],
        [17, 20],
        [37, 7],
        [63, 7],
        [83, 20],
        [87, 45],
        [87, 72],
      ],
    };
    const [rawX, y] = maps[n][i];
    const x = Math.max(13, Math.min(87, rawX));
    return `<div class="seat seat-${i} " style="--x:${x}%;--y:${y}%"><div class="opponent-cards">${back()}${back()}</div><div class="player"><span class="avatar-wrap ${emotions ? ['mood-frustrated', 'mood-cautious', 'mood-confident', 'mood-reactive'][i % 4] : ''}">${avatar(p)}${emotions ? `<i class="mood-icon">${['♨', '◇', '★', 'ϟ'][i % 4]}</i>` : ''}</span><div class="identity"><strong>${p[0]} <small>${positions[n][i]}</small></strong><span class="style-label">${p[1]}</span><b>${entry ? '20,000' : pageId === 'champion' ? '0' : (19800 - i * 700).toLocaleString('en-US')}</b></div></div><span class="seat-action">${entry ? '等待入座' : i === 1 ? '下注 600' : i === 0 ? '过牌' : i === 2 ? '跟注 600' : '已弃牌'}</span></div>`;
  }).join('');
}
function table(n = 5, state = 'play') {
  const entry = state === 'entry',
    settled = ['showdown', 'champion', 'eliminated', 'history'].includes(state);
  const center = entry
    ? `<div class="entry-center"><span class="eyebrow">YOUR SEAT IS READY</span><h1>牌桌已就绪</h1><p>落座，专注这一手。</p>${btn('入座开练 <span>→</span>', 'primary', 'table5')}<small>无需登录 · 虚拟筹码</small></div>`
    : `<div class="center-board"><div class="pot"><span>底池</span><strong>${state === 'rebuy' ? '0' : state === 'strong-hand' ? '300' : settled ? '4,800' : '2,400'}</strong>${btn('明细 ↗', 'quiet', 'pot')}</div>${['strong-hand', 'rebuy'].includes(state) ? `<div class="board preflop-board">${Array.from({ length: 5 }, back).join('')}</div>` : board()}<div class="table-caption">${state === 'rebuy' ? '下一手将重新发牌' : state === 'strong-hand' ? '尚未发出公共牌' : settled ? '最佳五张牌 · A 一对' : '五张公共牌 · 一场好决策'}</div><div class="pot-chips">${chip('500')}${chip('100', 'second')}${chip('500')}</div></div>`;
  return `<div class="table-wrap"><div class="table-top"><span>${entry ? '等待入座' : '第 03 局 · 第 12 手'} <i>·</i> ${entry ? '准备发牌' : state === 'rebuy' ? '准备下一手' : state === 'strong-hand' ? '翻牌前' : settled ? '已结算' : '河牌'}</span><span>盲注 <b>100 / 200</b></span></div><div class="felt-area count-${n} state-${state}"><div class="ambient-orbit"></div><div class="rail"><div class="felt"><div class="felt-brand">${icon()}<span>NOIR POKER</span></div></div></div>${seats(n, entry, state === 'emotion')}${center}<div class="hero ${!entry && !settled ? 'your-turn' : ''}"><div class="hero-cards ${state === 'strong-hand' ? 'strong-start' : ''}">${entry || state === 'rebuy' ? back() + back() : card('A', '♥') + card('Q', '♠')}${
    state === 'strong-hand'
      ? `<div class="premium-sparks">${premiumSparks(12)
          .map((p) => `<i class="design-spark" style="${p.style}"></i>`)
          .join('')}</div>`
      : ''
  }</div><div class="hero-label"><span class="you">你</span><span class="position">BTN</span><b>${state === 'champion' ? '100,000' : state === 'eliminated' ? '0' : state === 'rebuy' || state === 'strong-hand' ? '20,000' : settled ? '22,400' : entry ? '20,000' : '18,800'}</b></div>${!entry ? `<span class="hero-rank">${state === 'strong-hand' ? '强起手牌提示' : state === 'rebuy' ? '准备发牌' : state === 'eliminated' ? '本局结束' : 'A 一对'}</span>` : ''}</div>${state === 'rebuy' ? '<span class="rebuy-cue">+20,000</span>' : ''}${state === 'champion' ? '<div class="result-overlay"><span class="laurel"><svg viewBox="0 0 80 50" aria-hidden="true"><path fill="currentColor" d="M7 9 25 23 40 2 55 23 73 9 65 42H15Z"/><path stroke="currentColor" stroke-width="5" d="M16 48h48"/></svg></span><h2>本局冠军</h2><p>每一次选择，都让你更进一步。</p><strong>第 1 名 · 100,000 筹码</strong></div>' : ''}${state === 'eliminated' ? '<div class="result-overlay subdued"><span class="eyebrow">SESSION COMPLETE</span><h2>本局结束</h2><p>这一局的经验，留给下一次决策。</p><strong>本局第 5 名</strong></div>' : ''}${
    state === 'champion'
      ? `<div class="design-confetti">${confettiPieces(18)
          .map((p) => `<i style="${p.style}"></i>`)
          .join('')}</div>`
      : ''
  }</div>${entry ? `<div class="entry-stats"><div><span>起始筹码</span><b>20,000</b></div><div><span>盲注</span><b>100 / 200</b></div><div><span>牌桌</span><b>${n} 人无限注</b></div></div>` : state === 'history' ? `<div class="history-lock"><span>◈ 只读历史 · 2026-10-26 20:38 · 不影响当前牌局</span><div>${btn('查看本手复盘', 'primary', 'review')}${btn('返回对局记录', 'secondary', 'records')}</div></div>` : state === 'rebuy' ? `<div class="settlement-actions">${btn('继续下一手 →', 'primary', 'table5')}</div>` : settled ? `<div class="settlement-actions">${btn('查看复盘', 'primary', 'review')}${!['champion', 'eliminated'].includes(state) ? btn('再练这一手', 'secondary', 'table5') : ''}${btn(['champion', 'eliminated'].includes(state) ? '下一局 →' : '下一手 →', 'secondary', ['champion', 'eliminated'].includes(state) ? 'entry' : 'table5')}</div>` : actions()}</div>`;
}
function actions() {
  return `<div class="action-area"><div class="turn-line"><span class="dot"></span><strong>轮到你行动</strong><span>需跟注 600</span>${btn('牌力表 ↗', 'quiet', 'rankings')}</div><div class="bet-control"><div class="bet-title"><span>加注至</span><strong>1,800</strong><span class="unit">筹码</span></div><input type="range" min="600" max="18800" value="1800" aria-label="加注至筹码"><div class="bet-presets">${['½ 底池', '⅔ 底池', '1 底池', '全下'].map((x) => btn(x, 'preset')).join('')}</div></div><div class="action-buttons">${btn('弃牌', 'fold')}${btn('跟注 <strong>600</strong>', 'call')}${btn('加注至 <strong>1,800</strong>', 'primary raise')}</div></div>`;
}
const practice = () =>
  `<section class="practice"><div class="block-title"><h2>本局练习</h2>${btn('重新开局', 'quiet', 'reset')}</div><div class="session-value"><span>当前筹码</span><strong>18,800 <small>CHIPS</small></strong><b>−1,200</b></div><div class="metrics"><div><b>12</b><span>已完成</span></div><div><b>5</b><span>获胜手数</span></div><div><b>42%</b><span>胜率</span></div></div></section>`;
const activity = () =>
  `<section class="activity"><div class="block-title"><h2>本手动态</h2><span class="live">LIVE</span></div>${[
    ['河牌', 'Knox 下注 600'],
    ['转牌', '你过牌'],
    ['转牌', 'Vale 跟注 400'],
    ['翻牌', '你下注 400'],
  ]
    .map(([s, t]) => `<div class="activity-row"><span>${s}</span><p>${t}</p></div>`)
    .join('')}<p class="note">根据行动时公开信息做判断。</p></section>`;
function playScreen() {
  const n = pageId.startsWith('table') ? Number(pageId.slice(5)) : 5;
  const state = pageId === 'entry' ? 'entry' : pageId;
  return `<div class="play-layout"><main class="table-main">${table(n, state)}${pageId === 'showdown' || pageId === 'history' ? showdown() : ''}${pageId === 'rebuy' ? rebuy() : ''}${pageId === 'strong-hand' ? alert('强起手牌提示', '只提示既有强牌分类，不代表当前必胜，也不改变机器人或复盘判断。') : ''}${
    pageId === 'emotion'
      ? `<div class="emotion-legend">${[
          ['♨', '急于追回', '橙色火焰'],
          ['◇', '收紧避险', '蓝色盾牌'],
          ['★', '连胜自信', '金色星星'],
          ['ϟ', '受压反击', '红色闪电'],
        ]
          .map(([i, t, d]) => `<div><b>${i} ${t}</b><span>${d}</span></div>`)
          .join('')}</div><p class="note">四种情绪并列用于美术对照；平稳状态不显示光环。</p>`
      : ''
  }${!['entry', 'history', 'champion', 'eliminated', 'rebuy', 'strong-hand'].includes(pageId) ? practice() : ''}</main><aside>${sectionHead('FOCUS ON THIS HAND', '留意行动线', '观察对手每一街做了什么，再决定这一手怎样继续。')}${activity()}<div class="aside-note">${icon()}<p>专注决策，<br>让经验自然累积。</p></div></aside></div>`;
}
function showdown() {
  return `<section class="content-card showdown"><div class="block-title"><h2>摊牌对比</h2><span>底池已分配</span></div><div class="matchup"><div>${avatar()}<strong>你 <small class="positive">+2,400</small></strong><span>A 一对 · Q 踢脚</span></div><div class="mini-board best-five">${card('A', '♥')}${card('A', '♠')}${card('Q', '♠')}${card('J', '♥')}${card('7', '♣')}</div><span class="winner">获胜</span></div><div class="matchup"><div>${avatar(people[1])}<strong>Knox</strong><span>J 一对 · A 踢脚</span></div><div class="mini-board best-five">${card('J', '♦')}${card('J', '♥')}${card('A', '♠')}${card('K', '♠')}${card('7', '♣')}</div><span>已摊牌</span></div></section>`;
}
function rebuy() {
  return `<section class="content-card">${sectionHead('BACK TO THE TABLE', '已补充虚拟筹码', '筹码补至本局起始筹码 20,000；练习继续。')}${btn('继续练习', 'primary', 'table5')}</section>`;
}
function panel(eyebrow, title, desc, content, wide = false) {
  return `<main class="panel-shell ${wide ? 'wide' : ''}"><div class="panel-navigation">${btn('← 回到牌桌', 'quiet', 'table5')}<span>NOIR / ${eyebrow}</span></div>${sectionHead(eyebrow, title, desc)}${content}${footer()}</main>`;
}
function settings() {
  return panel(
    'PREFERENCES',
    '让练习适合你',
    '体验偏好即时保存；牌局规则的变更将在下一手生效。',
    `<div class="settings-grid"><section class="content-card"><h2>声音与体验</h2>${device.id !== 'wechat' ? field('界面语言', select('简体中文'), 'Web 与 App 支持 11 种语言。') : ''}${field('操作音效', toggle(), '保留细腻的发牌与筹码触感。')}${field('背景音乐', toggle(), '与音效独立控制。')}${field('振动', toggle(false), '支持设备上的轻触反馈。')}${field('牌桌提示', toggle(), '显示当前行动与价格提示。')}<p class="note">${device.id === 'desktop' ? '桌面设备不提供触觉反馈。' : '振动能力以系统与设备支持为准。'}</p></section><section class="content-card"><h2>牌局与对手</h2>${field('牌桌人数', select('5 人'))}${field('起始盲注', '<div class="stakes-input"><label><input type="number" aria-label="小盲注" min="25" max="50000" step="25" value="100"></label><span> / 200</span></div>', '小盲为 25 的正倍数，最高 50,000。')}${alert('下一手生效', '更改人数或盲注后，下一手建立新局并重置筹码与统计。')}${field('对手难度', select('标准'), '立即生效；轻松 / 标准 / 进阶。')}${field('情绪模拟', select('轻微波动'), '下一手生效；关闭 / 轻微波动 / 明显波动。')}${btn('选择训练风格 →', 'secondary full', 'opponents')}</section></div>${btn('回到牌桌', 'primary', 'table5')}`,
  );
}
function opponents() {
  return panel(
    'TRAINING STYLES',
    '不同风格，不同思路',
    '原创角色承载训练风格；能力由难度控制。',
    `<div class="style-grid">${people.map((p, i) => `<button class="style-card ${i === 1 ? 'chosen' : ''}" data-go="persona">${avatar(p)}<span class="eyebrow">${p[0].toUpperCase()}</span><h2>${p[1]}</h2><p>${['平衡范围与位置', '以较大尺度持续施压', '让较弱牌继续付费', '严格筛选继续范围', '用被动线路诱导投入', '以小尺度控制底池', '用听牌保持主动性', '利用后位争夺底池'][i]}</p><span class="detail-link">查看风格 →</span></button>`).join('')}</div><section class="content-card"><div class="block-title"><h2>本桌座位</h2>${btn('混合风格', 'secondary')}</div><div class="roster">${people
      .slice(0, 4)
      .map(
        (p, i) =>
          `<div><span>座位 ${i + 2}</span>${avatar(p)}<strong>${p[1]}</strong>${select('更换')}</div>`,
      )
      .join(
        '',
      )}</div></section>${btn('应用到下一手', 'primary', 'table5')}${btn('关于训练风格', 'quiet', 'about')}`,
    true,
  );
}
function persona() {
  const p = people[1];
  return panel(
    'CHARACTER PROFILE',
    '认识 Knox',
    '大注强攻 · 原创训练角色',
    `<div class="persona-layout"><div class="portrait-card"><img src="${asset('portraits/knox.jpg')}" alt="Knox 原创角色插画"><span>KNOX</span></div><div><section class="content-card"><span class="eyebrow">THE PRESSURE LINE</span><h2>让每一次继续，都有代价。</h2><p class="body-copy">常用较大的下注尺度表达强度，也会用有权益的听牌施压。面对连续大注，先考虑范围、价格与有效筹码。</p><div class="traits"><span>大尺度</span><span>主动施压</span><span>条件续攻</span></div></section><section class="content-card"><h2>你可以练习什么</h2><ol class="read-list"><li>区分强价值牌与有权益的半诈唬。</li><li>结合位置和价格选择继续范围。</li><li>提前想好下一街面对压力的计划。</li></ol></section>${alert('模型边界', '风格是作者设定的训练模型，不代表真实职业牌手或求解器频率。')}${btn('选择此风格', 'primary', 'opponents')}</div></div>`,
    true,
  );
}
const scene = (opp = false) =>
  `<div class="review-scene"><div><span>${opp ? 'Knox 当时的底牌' : '你的底牌'}</span><div class="mini-board">${opp ? back() + back() : card('A', '♥') + card('Q', '♠')}</div></div><div><span>当时的公共牌</span><div class="mini-board">${card('A', '♠')}${card('J', '♥')}${card('7', '♣')}</div></div><div class="scene-meta"><span>位置 <b>${opp ? 'BB' : 'BTN'}</b></span><span>当时底池 <b>1,200</b></span><span>剩余筹码 <b>${opp ? '19,100' : '19,400'}</b></span></div></div>`;
function review() {
  const opp = pageId === 'opponent-review';
  const status =
    pageId.includes('loading') || pageId.includes('error') || pageId === 'review-empty';
  return panel(
    'HAND REVIEW',
    '本手决策复盘',
    '第 03 局 · 第 12 手 · 按当时公开信息判断',
    `<div class="review-result"><span>本手筹码变化</span><strong class="positive">+2,400</strong><small>单手输赢不直接决定操作好坏</small></div><div class="tabs">${btn('我的决策', !opp ? 'selected' : '', 'review')}${btn('对手为什么这样打', opp ? 'selected' : '', 'opponent-review')}</div>${status ? `<div class="status-card"><div class="status-icon">${pageId === 'review-loading' ? '<span class="spinner"></span>' : pageId === 'review-error' ? '↻' : '◇'}</div><h2>${pageId === 'review-loading' ? '正在整理本手决策' : pageId === 'review-error' ? '分析已中断' : '本手没有主动决策'}</h2><p>${pageId === 'review-loading' ? '你可以先回到牌桌，已完成的结果会在本机保留。' : pageId === 'review-error' ? '已完成的步骤仍保留，重试只补充缺失的分析。' : '盲注是强制投入，不会被归为操作失误。'}</p>${pageId === 'review-error' ? btn('重新分析', 'primary', 'review-loading') : ''}${btn('回到牌桌', 'secondary', 'table5')}</div>` : `<div class="review-grid"><nav class="timeline"><h3>${opp ? '对手行动' : '你的决策'}</h3>${['翻牌前 · 跟注 200', '翻牌 · 下注 400', '转牌 · 过牌', '河牌 · 跟注 600'].map((x, i) => btn(`<span>0${i + 1}</span>${x}`, i === 1 ? 'selected' : '')).join('')}</nav><section class="content-card review-content"><div class="block-title"><h2>${opp ? 'Knox · 翻牌下注' : '翻牌 · 下注 400'}</h2><span class="badge">${opp ? '范围估计' : '可以理解'}</span></div>${scene(opp)}<div class="coach"><span class="eyebrow">${opp ? 'WHY THIS LINE' : 'YOUR DECISION'}</span><h2>${opp ? '他的下注，可能在向哪些牌取值？' : '顶对有取值空间，小注让较弱牌继续。'}</h2><p>${opp ? '根据当时可见行动，Knox 的范围可能包含强成牌和部分顺子听牌或后门机会。下注本身不能证明他持有哪一类牌。' : '你持有 A 一对与 Q 踢脚。较弱的 A、J 对和部分听牌可能继续；下注能从这些范围取值，也让听牌为继续看牌付费。'}</p></div><div class="practice-focus"><strong>下次练习重点</strong><p>行动前先想清楚：希望哪些更弱的牌继续？下一街出现危险牌时，怎样调整？</p></div><h3>当时的关键信息</h3><ul class="read-list"><li>你在后位，能先观察对手的行动。</li><li>公共牌暂时没有成同花，后续仍可能改变范围。</li><li>这里只使用行动前信息，不用最终赢家评价决定。</li></ul></section></div>`}${alert('复盘范围', '权益与对手范围属于估计；结论依据当时信息，不是求解器证明。')}${btn('回到牌桌', 'primary', 'table5')}`,
    true,
  );
}
function records() {
  if (pageId === 'records-empty')
    return panel(
      'YOUR SESSIONS',
      '对局记录',
      '留住每一手的思考。',
      `<div class="status-card"><span class="status-icon">♤</span><h2>从第一手开始积累经验</h2><p>完成的对局会保存在本机。重打不会重复计入最终统计。</p>${btn('入座开练', 'primary', 'entry')}</div>`,
    );
  return panel(
    'YOUR SESSIONS',
    '对局记录',
    '最近的对局在最上方；查看历史不会改变正在进行的练习。',
    `<div class="record-summary"><div><b>03</b><span>练习局数</span></div><div><b>48</b><span>已完成手数</span></div><div><b>21</b><span>获胜手数</span></div></div>${[3, 2, 1].map((n, i) => `<section class="content-card record-group"><div class="block-title"><div><span class="eyebrow">SESSION 0${n} · 2026.10.26 20:${30 - i * 10}</span><h2>第 ${n} 局 <small>5 人 · 100 / 200</small></h2></div><span>${i === 0 ? '进行中' : '已结束'} · 胜率 42% · 净变 +2,400</span></div>${[12, 11, 10].map((h, j) => `<button class="record-row" data-go="history"><span class="hand-id">第 ${h} 手<small>河牌 · ${j === 1 ? '弃牌' : '摊牌'}</small></span><div class="tiny-cards">${card('A', '♥')}${card('Q', '♠')}</div><span class="record-outcome ${j === 1 ? 'negative' : 'positive'}">${j === 1 ? '−600' : '+2,400'}<small>${j === 1 ? '本手亏损' : '本手盈利'}</small></span><span>查看 ↗</span></button>`).join('')}</section>`).join('')}`,
    true,
  );
}
function guide() {
  return panel(
    'HOW TO PLAY',
    '先懂规则，再开始练习。',
    '不追逐单手输赢，练习在不确定中做更好的决定。',
    `<div class="guide-links">${[
      ['rankings', '牌型速查', '十种牌型，从高到低'],
      ['glossary', '术语词典', '35 项常见概念'],
      ['pot', '底池与边池', '读懂分配与资格'],
    ]
      .map(
        ([id, t, s]) => `<button data-go="${id}"><span>↗</span><h2>${t}</h2><p>${s}</p></button>`,
      )
      .join(
        '',
      )}</div><section class="content-card"><h2>一手牌，四轮决策。</h2><div class="streets">${['01 翻牌前', '02 翻牌', '03 转牌', '04 河牌'].map((s) => `<div>${s}</div>`).join('')}</div><ol class="read-list"><li>每人获得两张底牌，最多结合五张公共牌组成最佳五张牌。</li><li>每轮可进行过牌、跟注、下注、加注或弃牌；可用动作由规则引擎决定。</li><li>BTN 的下一顺时针座位是 SB，再下一位为 BB。</li><li>所有下注按本局筹码单位计算，未被跟注的部分会退还。</li><li>全下后只争夺自己有资格参与的底池。</li></ol></section>${alert('练习提示', '先确认价格、位置和有效筹码，再考虑对手范围。')}`,
  );
}
function rankings() {
  const ranks = [
    '皇家同花顺',
    '同花顺',
    '四条',
    '葫芦',
    '同花',
    '顺子',
    '三条',
    '两对',
    '一对',
    '高牌',
  ];
  const hands = [
    ['A', 'K', 'Q', 'J', '10'],
    ['9', '8', '7', '6', '5'],
    ['K', 'K', 'K', 'K', '2'],
    ['Q', 'Q', 'Q', '7', '7'],
    ['A', 'J', '8', '5', '2'],
    ['9', '8', '7', '6', '5'],
    ['Q', 'Q', 'Q', '8', '3'],
    ['J', 'J', '6', '6', '2'],
    ['A', 'A', 'Q', '8', '3'],
    ['A', 'J', '8', '5', '2'],
  ];
  return panel(
    'HAND RANKINGS',
    '十种牌型',
    '从强到弱，始终比较最佳五张牌。',
    `<div class="rank-list">${ranks.map((r, i) => `<div class="rank-row"><span class="rank-num">${String(i + 1).padStart(2, '0')}</span><div><strong>${r}</strong><small>${['A 至 10 同一花色', '连续五张，同一花色', '四张相同点数', '三条加一对', '五张同花色', '五张连续点数', '三张相同点数', '两个不同的对子', '两张相同点数', '无上述组合'][i]}</small></div><div class="tiny-cards">${hands[i].map((r, j) => card(r, i < 2 || i === 4 ? '♠' : ['♠', '♥', '♣', '♦', '♠'][j])).join('')}</div></div>`).join('')}</div>`,
  );
}
function glossary() {
  return panel(
    'POKER GLOSSARY',
    '35 项术语',
    '把术语变成可以理解的决策语言。',
    `<label class="search">⌕ <input placeholder="查找术语" aria-label="查找术语"></label><div class="glossary-list">${glossaryContent.map(({ term, description }, i) => `<details ${i < 3 ? 'open' : ''}><summary><span>${String(i + 1).padStart(2, '0')}</span>${term}<i>＋</i></summary><p>${description}</p></details>`).join('')}</div>`,
  );
}
function pot() {
  return panel(
    'POT DISTRIBUTION',
    '底池明细',
    '全下时，各底池分别计算参与资格。',
    `<div class="pot-total"><span>本手总投入</span><strong>6,000</strong><small>全部使用本局整筹码单位 100</small></div><section class="content-card"><div class="block-title"><h2>主池</h2><strong>3,000</strong></div><p class="body-copy">你、Knox、Vale 各投入 1,000。</p><div class="award">${avatar(people[0])}<span>Vale<span>主池获胜 · 顺子</span></span><b>+3,000</b></div></section><section class="content-card"><div class="block-title"><h2>边池 1</h2><strong>2,000</strong></div><p class="body-copy">你、Knox 各追加 1,000；Vale 不参与。</p><div class="award">${avatar()}<span>你<span>边池获胜 · A 一对</span></span><b>+2,000</b></div></section>${alert('未跟注部分已退还', 'Knox 多投入的 1,000 无人跟注，原路退还。主池 3,000 + 边池 2,000 + 退还 1,000 = 6,000。')}${btn('返回牌桌', 'primary', 'table5')}`,
  );
}
function reset() {
  return `<div class="backdrop">${table(5)}<main class="confirm-modal"><span class="eyebrow">START A NEW SESSION</span><h1>重新开局？</h1><p>当前牌局将结束，筹码和本局统计会重新开始。已保存的对局记录仍可查看。</p><div>${btn('继续当前练习', 'secondary', 'table5')}${btn('重新开始', 'primary', 'entry')}</div></main></div>`;
}
function information() {
  const data = {
    about: [
      'ABOUT THE STYLES',
      '关于训练风格',
      '原创角色，帮助你观察不同决策方式。',
      `<h2>角色与风格</h2><p>所有角色均为原创训练形象，不对应真实职业牌手。八种风格是作者设定的模型，难度控制策略能力，情绪模拟影响行为倾向。</p><h2>如何使用复盘</h2><p>复盘只依据行动前的公开信息，区分权益估计、策略启发与确定的规则事实。结果不等于求解器证明。</p>`,
    ],
    privacy: ['LOCAL BY DESIGN', '隐私说明', '沿用现行政策 · 生效日期 2026-10-19', privacyHtml],
    source: [
      'SOURCE REFERENCE',
      '暂时无法打开来源',
      '可能受到微信业务域名或网络限制。',
      `<div class="status-card"><span class="status-icon">↗</span><h2>复制链接，稍后查看</h2><p>保留原始链接与来源归属。此状态只用于现有来源跳转的失败反馈。</p><p class="url">https://github.com/JessieZJZ/noir-poker</p>${btn('复制来源链接', 'primary')}${btn('返回原页面', 'secondary', 'about')}</div>`,
    ],
  };
  const d = data[pageId];
  return panel(d[0], d[1], d[2], `<section class="content-card prose">${d[3]}</section>`);
}
function launch() {
  return `<main class="launch"><img src="${asset('launch-icon.png')}" alt="NOIR Poker 黑桃图标">${brand()}<span class="eyebrow">${theme.en}</span><div class="loading-line"></div><p>为下一次好决策，留一个位置。</p></main>`;
}
function orientation() {
  return `<main class="orientation"><div class="rotate-phone">↻</div><h1>请旋转至竖屏</h1><p>竖屏后可继续当前牌局。</p><small>声音与计时在方向阻塞时暂停</small></main>`;
}
const playIds = [
  'entry',
  'strong-hand',
  'emotion',
  'showdown',
  'champion',
  'eliminated',
  'rebuy',
  'history',
];
let body =
  pageId === 'launch'
    ? launch()
    : pageId === 'orientation'
      ? orientation()
      : playIds.includes(pageId) || pageId.startsWith('table')
        ? playScreen()
        : pageId === 'settings'
          ? settings()
          : pageId === 'opponents'
            ? opponents()
            : pageId === 'persona'
              ? persona()
              : pageId.startsWith('review') || pageId === 'opponent-review'
                ? review()
                : pageId.startsWith('records')
                  ? records()
                  : pageId === 'guide'
                    ? guide()
                    : pageId === 'rankings'
                      ? rankings()
                      : pageId === 'glossary'
                        ? glossary()
                        : pageId === 'pot'
                          ? pot()
                          : pageId === 'reset'
                            ? reset()
                            : information();
document.querySelector('#app').innerHTML =
  platformChrome() +
  `<div class="app-content">${['launch', 'orientation'].includes(pageId) ? '' : header()}${body}</div>` +
  (device.bottom ? '<div class="home-indicator"></div>' : '');
if (pageId === 'strong-hand') {
  document.querySelector('.turn-line').innerHTML =
    '<strong>发牌展示中</strong><span>完成后才开始行动</span>';
  document
    .querySelectorAll('.action-area button,.action-area input')
    .forEach((e) => (e.disabled = true));
}
document.querySelectorAll('[data-go]').forEach(
  (el) =>
    (el.onclick = () => {
      q.set('screen', el.dataset.go);
      location.search = q.toString();
    }),
);
document.querySelectorAll('.toggle').forEach(
  (el) =>
    (el.onclick = () => {
      el.classList.toggle('on');
      el.setAttribute('aria-pressed', el.classList.contains('on'));
    }),
);
document.querySelectorAll('.preset').forEach(
  (el) =>
    (el.onclick = () => {
      document.querySelectorAll('.preset').forEach((b) => b.classList.remove('selected'));
      el.classList.add('selected');
    }),
);
document
  .querySelectorAll('.select')
  .forEach((el) => (el.onclick = () => el.classList.toggle('selected')));
const search = document.querySelector('.search input');
if (search)
  search.oninput = () =>
    document.querySelectorAll('.glossary-list details').forEach((el) => {
      el.hidden = !el.textContent.includes(search.value);
    });
window.designReady = document.fonts.ready.then(() => {
  document.body.dataset.ready = 'true';
  return true;
});
// This is a visual candidate, not a duplicated game engine. Motion only decorates a fixed scene.
window.setDemoTime = (seconds) => {
  root.classList.add('demo');
  root.style.setProperty('--demo-time', seconds + 's');
  document.getAnimations().forEach((a) => {
    a.pause();
    a.currentTime = seconds * 1000;
  });
  const stage = document.querySelector('.turn-line');
  if (stage)
    stage.innerHTML =
      seconds < 2
        ? '<strong>发牌</strong><span>本地原版发牌声</span>'
        : seconds < 5
          ? '<strong>翻牌</strong><span>卡牌 3D 翻转</span>'
          : seconds < 8
            ? '<strong>轮到你行动</strong><span>静态外框，柔和显现</span>'
            : seconds < 11
              ? '<strong>加注至 1,800</strong><span>原版视频节奏筹码声</span>'
              : seconds < 14
                ? '<strong>过牌</strong><span>轻触牌桌</span>'
                : '<strong>本手结束</strong><span>克制的奖励反馈</span>';
};
