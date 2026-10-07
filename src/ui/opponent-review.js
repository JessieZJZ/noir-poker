import { explainOpponent, BOT_CHECK_NAMES } from '../review/opponents.js';
import { actionLabel, STREET_NAMES } from '../review/analysis.js';
const esc = (v) =>
  String(v)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
const n = (v) => Math.round(v).toLocaleString('en-US');
const pct = (v) => (v * 100).toFixed(1) + '%';
export function createOpponentReview({ card }) {
  const panel = document.querySelector('#review-opponents');
  let records = [],
    selected = 0,
    filter = 'all';
  const step = (r) => ({ ...r.trace.view, action: r.action, amount: r.amount });
  function render() {
    const visible = records.filter((r) => filter === 'all' || r.id === Number(filter));
    selected = Math.min(selected, Math.max(0, visible.length - 1));
    const record = visible[selected];
    const players = [...new Map(records.map((r) => [r.id, r.name])).entries()];
    panel.innerHTML = `<div class="review-opponent-heading"><p>逐步查看它当时如何判断。底牌在本手结束后才进入这个面板；你的决策评级仍只使用当时公开信息。</p><label>查看对手<select id="review-opponent-filter"><option value="all">全部对手</option>${players.map(([id, name]) => `<option value="${id}">${esc(name)}</option>`).join('')}</select></label></div><div class="review-layout"><nav aria-label="对手决策时间线"><div class="review-timeline-title"><strong>对手的实际行动</strong><span>${visible.length} 次</span></div><div class="review-timeline">${visible.map((r, i) => `<button class="review-step ${i === selected ? 'selected' : ''}" data-opponent-index="${i}" aria-current="${i === selected ? 'step' : 'false'}"><span class="review-step-number">${r.sequence}</span><span><small>${esc(r.name)} · ${STREET_NAMES[r.trace.view.street]}</small><strong>${actionLabel(step(r))}</strong></span><span class="review-status pending">${esc(r.trace.profileName)}</span></button>`).join('')}</div></nav><div id="review-opponent-detail">${record ? detail(record) : '<p class="review-empty">本手没有机器人决策记录。无法还原的行为不会编造理由；下一手会记录实际判断。</p>'}</div></div>`;
    const select = panel.querySelector('select');
    select.value = filter;
    select.onchange = () => {
      filter = select.value;
      selected = 0;
      render();
    };
  }
  function detail(r) {
    const v = r.trace.view,
      e = explainOpponent(r),
      t = r.trace;
    return `<div class="review-detail-header"><h3>${esc(r.name)} · ${STREET_NAMES[v.street]}</h3><span class="review-status ${t.exceptions.length ? 'consider' : 'sound'}">实际执行记录</span></div><div class="review-scene"><div class="review-card-rows"><div class="review-card-group"><span>${esc(r.name)} 当时的底牌</span><div class="review-cards">${v.hole.map((c) => card(c, { small: true })).join('')}</div></div><div class="review-card-group"><span>当时的公共牌</span><div class="review-cards">${v.board.length ? v.board.map((c) => card(c, { small: true })).join('') : '<span class="review-no-board">公共牌尚未发出</span>'}</div></div></div><div class="review-scene-meta"><div><span>位置</span><strong>${v.position}</strong></div><div><span>当时底池</span><strong>${n(v.pot)}</strong></div><div><span>剩余筹码</span><strong>${n(v.stack)}</strong></div></div></div><div class="review-choice suggested"><span>它当时选择 · ${esc(e.made)}</span><strong>${actionLabel(step(r))}</strong></div><div class="review-explanation opponent-reason"><h3>${esc(e.title)}</h3><p>${esc(e.detail)}</p></div><section class="review-evidence"><div class="review-evidence-heading"><h3>实际用到的依据</h3><span>${esc(t.profileName)}</span></div><ul>${e.reasons.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></section><p class="review-price-note opponent-warning">${esc(e.warning)}</p><details class="review-public-actions"><summary>查看实际随机分支（0–1 抽样）</summary><ul>${t.checks.length ? t.checks.map((c) => `<li><span>${esc(BOT_CHECK_NAMES[c.code] || c.code)}</span><span>${c.value.toFixed(3)} / 门槛 ${pct(c.threshold)} · ${c.selected ? '命中' : '未命中'}</span></li>`).join('') : '<li>这一步没有额外随机分支。</li>'}</ul></details><div class="review-step-nav"><button data-opponent-nav="-1" ${selected === 0 ? 'disabled' : ''}>上一步</button><span>第 ${r.sequence} 次公开行动</span><button data-opponent-nav="1" ${selected >= records.filter((x) => filter === 'all' || x.id === Number(filter)).length - 1 ? 'disabled' : ''}>下一步</button></div>`;
  }
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-opponent-index], [data-opponent-nav]');
    if (!b) return;
    selected =
      b.dataset.opponentIndex !== undefined
        ? Number(b.dataset.opponentIndex)
        : selected + Number(b.dataset.opponentNav);
    render();
  });
  return {
    update(input) {
      records = input.opponents || [];
      selected = 0;
      filter = 'all';
      render();
    },
  };
}
