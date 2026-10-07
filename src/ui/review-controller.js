import {
  createReviewInput,
  actionLabel,
  STREET_NAMES,
  analyzeDecision,
  summarizeReview,
} from '../review/analysis.js';
import { createOpponentReview } from './opponent-review.js';
const $ = (selector) => document.querySelector(selector),
  format = (n) => Math.round(n).toLocaleString('en-US'),
  pct = (n) => Math.round(n * 100) + '%';
const statusNames = { attention: '重点改进', consider: '值得讨论', sound: '有合理依据' };

export function createReviewController({ card }) {
  let last = null,
    seen = '',
    worker = null,
    job = 0,
    selected = 0;
  const dialog = $('#review-dialog');
  const opponents = createOpponentReview({ card });
  function perspective(opponent) {
    $('#review-hero-tab').setAttribute('aria-selected', String(!opponent));
    $('#review-opponents-tab').setAttribute('aria-selected', String(opponent));
    $('#review-hero-panel').hidden = opponent;
    $('#review-opponents').hidden = !opponent;
  }
  $('#review-hero-tab').onclick = () => perspective(false);
  $('#review-opponents-tab').onclick = () => perspective(true);
  dialog.querySelector('.review-tabs').addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const opponent =
      e.key === 'End' ||
      (e.key !== 'Home' && $('#review-hero-tab').getAttribute('aria-selected') === 'true');
    perspective(opponent);
    $(opponent ? '#review-opponents-tab' : '#review-hero-tab').focus();
  });
  const esc = (v) =>
    String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  function renderDialog() {
    if (!last) return;
    const input = last.input,
      steps = input.decisions,
      analysis = last.analysis,
      decision = steps[selected],
      result = analysis?.steps[selected];
    $('#review-dialog-title').textContent = '第 ' + input.hand + ' 手 · 决策复盘';
    $('#review-result-change').textContent =
      input.outcome.profit < 0
        ? format(input.outcome.profit) + ' 筹码'
        : input.outcome.profit > 0
          ? '+' + format(input.outcome.profit) + ' 筹码'
          : '0 筹码';
    $('#review-result-context').textContent = input.outcome.folded
      ? '本手已弃牌'
      : input.outcome.wonPot
        ? input.outcome.profit < 0
          ? '获得部分底池，整手净亏损'
          : '本手获得底池'
        : '本手未获得底池';
    $('#review-analysis-state').textContent =
      last.status === 'error'
        ? '分析未完成，可以重试。'
        : analysis
          ? analysis.summary
          : last.status === 'running'
            ? '正在分析决策 ' + last.progress + ' / ' + steps.length + '…'
            : '正在准备这手的决策快照…';
    $('#review-summary-title').textContent = analysis ? analysis.title : '回到当时的决策';
    $('#review-retry').hidden = last.status !== 'error';
    $('#review-priority').hidden = !analysis || !steps.length;
    if (analysis) {
      $('#review-priority').dataset.reviewIndex = analysis.priorityIndex;
      $('#review-priority').textContent =
        analysis.attention || analysis.consider ? '查看优先复盘的决策' : '从第一步回看';
    }
    $('#review-timeline').innerHTML = steps
      .map((s, i) => {
        const status = analysis?.steps[i]?.status;
        return `<button class="review-step ${selected === i ? 'selected' : ''}" data-review-index="${i}" aria-current="${selected === i ? 'step' : 'false'}"><span class="review-step-number">${i + 1}</span><span><small>${STREET_NAMES[s.street]} · ${s.position}</small><strong>${actionLabel(s)}</strong></span><span class="review-status ${status || 'pending'}">${status ? statusNames[status] : '待分析'}</span></button>`;
      })
      .join('');
    $('#review-step-count').textContent = steps.length + ' 次行动';
    $('#review-empty').hidden = !!decision;
    $('#review-detail').hidden = !decision;
    if (!decision) return;
    $('#review-detail-title').textContent =
      '第 ' + (selected + 1) + ' 步 · ' + STREET_NAMES[decision.street];
    $('#review-selected-status').textContent = result ? statusNames[result.status] : '分析中';
    $('#review-selected-status').className = 'review-status ' + (result?.status || 'pending');
    $('#review-hole').innerHTML = decision.hole.map((c) => card(c, { small: true })).join('');
    $('#review-board').innerHTML = decision.board.length
      ? decision.board.map((c) => card(c, { small: true })).join('')
      : '<span class="review-no-board">公共牌尚未发出</span>';
    $('#review-position').textContent = decision.position;
    $('#review-pot').textContent = format(decision.pot);
    $('#review-stack').textContent = format(decision.stack);
    $('#review-your-action').textContent = actionLabel(decision);
    $('#review-suggestion').textContent = result?.recommendation || '正在比较可选行动…';
    $('#review-routes').innerHTML = result
      ? [result.routes.primary, result.routes.secondary]
          .filter(Boolean)
          .map(
            (route, i) =>
              `<article class="review-route"><span>${i ? '有条件的备选' : '主线成立的条件'}</span><h4>${esc(route.label)}</h4><p>${esc(route.condition)}</p><small>${esc(route.tradeoff)}</small></article>`,
          )
          .join('')
      : '';
    const sim = result?.simulation;
    const signed = (v) => (v > 0 ? '+' : '') + format(v);
    $('#review-simulation').innerHTML = sim
      ? `<h3>候选行动模拟</h3><p>${sim.stable ? '本轮抽样中，一条路线在两种范围下都明显领先；仍依赖后续策略假设。' : '范围或抽样误差可能改变排序，暂未证明有唯一最佳行动。'}</p><table><caption>每个行动、每种范围模拟 ${sim.trials} 手 · 从当前决策起的筹码净变化</caption><thead><tr><th scope="col">行动</th><th scope="col">随机范围</th><th scope="col">行动加权</th></tr></thead><tbody>${sim.rows.map((row) => `<tr><th scope="row">${actionLabel(decision, row.action.action, row.action.amount)}</th>${row.scenarios.map((v) => `<td>${signed(v.ev)}<small>约 ±${format(v.margin)}</small></td>`).join('')}</tr>`).join('')}</tbody></table><details><summary>模拟如何处理后续行动</summary><p>${esc(sim.note)}</p><p>收益包含立即弃牌、被跟注、后续加注和摊牌；真实的隐藏底牌、后续牌序与最终赢家均未使用。两种范围结果不是最优收益区间。</p></details>`
      : result
        ? '<p class="review-price-note">这个旧快照缺少完整行动状态，无法进行后续行动模拟；保留公开信息的范围与价格分析。</p>'
        : '<p class="review-price-note">正在模拟各个合法行动与后续牌局…</p>';
    $('#review-decision-title').textContent = result?.title || '依据当时的信息分析';
    $('#review-reason').textContent =
      result?.reason ||
      '使用当时的底牌、公共牌、公开行动和筹码情况，不读取对手隐藏底牌或后面发出的牌。';
    $('#review-evidence').innerHTML = result
      ? result.evidence.map((fact) => `<li>${fact}</li>`).join('')
      : '';
    $('#review-confidence').textContent = result?.confidence || '等待分析';
    $('#review-plan').textContent = result?.plan || '分析完成后展示后续处理路线。';
    $('#review-model-note').textContent = result
      ? (result.metrics.method === 'enumeration'
          ? `河牌单挑：完整枚举 ${result.metrics.trials} 种合法对手底牌组合；组合层面没有抽样误差，真实范围仍未知。`
          : `每种范围抽样 ${result.metrics.trials} 次，保守抽样误差保护带约 ±${Math.ceil(result.metrics.uncertainty * 100)} 个百分点；不等同于真实对手范围误差。`) +
        ` 随机 / 行动加权权益：${pct(result.metrics.randomEquity)} / ${pct(result.metrics.weightedEquity)}。两种范围的结果差异不是置信区间。`
      : '';
    $('#review-lesson').textContent =
      result?.lesson || '结果与决策分开看，复盘完成后会给出具体的练习重点。';
    $('#review-price').textContent = decision.legal.callAmount
      ? result
        ? pct(result.metrics.required)
        : '…'
      : '无需跟注';
    $('#review-equity').textContent =
      result && result.metrics.contestable
        ? pct(result.metrics.equityLow) === pct(result.metrics.equityHigh)
          ? '约 ' + pct(result.metrics.equityLow)
          : pct(result.metrics.equityLow) + '–' + pct(result.metrics.equityHigh)
        : '—';
    $('#review-contestable').textContent = result ? format(result.metrics.contestable) : '…';
    $('#review-price-note').textContent = result?.metrics.sidePots
      ? '按你有资格争夺的各池分别估计；超出全下额度的边池不计入。'
      : result?.metrics.closing
        ? '跟注价格按当前可争夺金额计算，已扣除未被跟注的退还。'
        : '价格只作参考，后续下注、其他玩家继续行动和潜在收益尚未计入。';
    const publicActions = decision.history.filter((a) => a.street === decision.street).slice(-6);
    $('#review-public-actions').innerHTML = publicActions.length
      ? publicActions
          .map(
            (a) =>
              `<li><span>${decision.players[a.id].name}</span><span>${a.action === 'raise' ? '下注 / 加注至 ' + format(a.amount) : a.action === 'call' ? '跟注 ' + format(a.amount) : a.action === 'fold' ? '弃牌' : '过牌'}</span></li>`,
          )
          .join('')
      : '<li>本轮尚无其他主动行动。</li>';
    $('#review-step-prev').disabled = selected === 0;
    $('#review-step-next').disabled = selected >= steps.length - 1;
    $('#review-step-current').textContent = selected + 1 + ' / ' + steps.length;
  }
  function receive(message, id) {
    if (id !== job || !last) return;
    if (message.type === 'progress') {
      last.progress = message.done;
      $('#review-analysis-state').textContent =
        '正在分析决策 ' + message.done + ' / ' + message.total + '…';
      return;
    }
    if (message.type === 'complete') {
      last.analysis = message.analysis;
      last.status = 'done';
      selected = message.analysis.priorityIndex;
      worker?.terminate();
      worker = null;
    } else {
      last.status = 'error';
      worker?.terminate();
      worker = null;
    }
    renderDialog();
  }
  async function fallback(id, input) {
    worker?.terminate();
    worker = null;
    try {
      const steps = [];
      for (const s of input.decisions) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (id !== job) return;
        steps.push(analyzeDecision(s, { trials: 180 }));
        receive({ type: 'progress', done: steps.length, total: input.decisions.length }, id);
      }
      receive({ type: 'complete', analysis: summarizeReview(input, steps) }, id);
    } catch {
      receive({ type: 'error' }, id);
    }
  }
  async function analyze() {
    if (!last || last.status === 'running' || last.analysis) return;
    const id = ++job,
      input = last.input;
    last.status = 'running';
    last.progress = 0;
    renderDialog();
    if (typeof Worker === 'undefined') {
      await fallback(id, input);
      return;
    }
    try {
      worker = new Worker(new URL('../review/worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => receive(e.data, id);
      worker.onerror = (e) => {
        e.preventDefault();
        if (id === job) fallback(id, input);
      };
      // Opponent private traces belong to their own explanation panel only.
      worker.postMessage({
        id,
        input: { hand: input.hand, decisions: input.decisions, outcome: input.outcome },
      });
    } catch {
      await fallback(id, input);
    }
  }
  function open() {
    if (!last) return;
    opponents.update(last.input);
    renderDialog();
    if (!dialog.open) dialog.showModal();
    analyze();
  }
  $('#review-hand-button').onclick = open;
  $('#review-retry').onclick = analyze;
  dialog.addEventListener('click', (e) => {
    const button = e.target.closest('[data-review-index]');
    if (!button || !last) return;
    const index = Number(button.dataset.reviewIndex);
    if (!Number.isInteger(index) || index < 0 || index >= last.input.decisions.length) return;
    selected = index;
    renderDialog();
  });
  $('#review-step-prev').onclick = () => {
    if (selected > 0) {
      selected--;
      renderDialog();
    }
  };
  $('#review-step-next').onclick = () => {
    if (last && selected < last.input.decisions.length - 1) {
      selected++;
      renderDialog();
    }
  };
  return {
    update(g, token) {
      const key = token + ':' + g.hand;
      if (g.phase === 'done' && key !== seen) {
        seen = key;
        const input = createReviewInput(g);
        {
          worker?.terminate();
          worker = null;
          job++;
          last = { key, input, status: 'idle', progress: 0, analysis: null };
          selected = 0;
          perspective(false);
          opponents.update(input);
          if (dialog.open) {
            renderDialog();
            analyze();
          }
        }
      }
      $('#review-hand-button').hidden = !(g.phase === 'done' && last?.key === key);
    },
    rollback(g, token) {
      const key = token + ':' + g.hand;
      if (last?.key === key) {
        worker?.terminate();
        worker = null;
        job++;
        last = null;
        selected = 0;
      }
      if (seen === key) seen = '';
      dialog.close();
      $('#review-hand-button').hidden = true;
    },
    reset() {
      worker?.terminate();
      worker = null;
      job++;
      last = null;
      seen = '';
      selected = 0;
      perspective(false);
      dialog.close();
      $('#review-hand-button').hidden = true;
    },
  };
}
