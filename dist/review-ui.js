import {createReviewInput,actionLabel,STREET_NAMES,analyzeDecision,summarizeReview} from './review.js';
const $=selector=>document.querySelector(selector),format=n=>Math.round(n).toLocaleString('en-US'),pct=n=>Math.round(n*100)+'%';
const statusNames={attention:'重点改进',consider:'值得讨论',sound:'有合理依据'};

export function createReviewController({card}){
  let last=null,seen='',worker=null,job=0,selected=0;
  const dialog=$('#review-dialog');
  function renderCard(){
    $('#review-card').hidden=!last;if(!last)return;
    $('#review-card-hand').textContent='第 '+last.input.hand+' 手';
    $('#review-card-change').textContent=last.input.outcome.profit<0?format(last.input.outcome.profit)+' 筹码':'未获得底池';
    $('#review-card-summary').textContent=last.analysis?last.analysis.title:'回到当时的 '+last.input.decisions.length+' 次决策，找出可以改进的选择。';
  }
  function renderDialog(){
    if(!last)return;
    const input=last.input,steps=input.decisions,analysis=last.analysis,decision=steps[selected],result=analysis?.steps[selected];
    $('#review-dialog-title').textContent='第 '+input.hand+' 手 · 决策复盘';
    $('#review-result-change').textContent=input.outcome.profit<0?format(input.outcome.profit)+' 筹码':input.outcome.profit>0?'+'+format(input.outcome.profit)+' 筹码':'0 筹码';
    $('#review-result-context').textContent=input.outcome.folded?'本手已弃牌':input.outcome.wonPot?'获得部分底池，整手净亏损':'本手未获得底池';
    $('#review-analysis-state').textContent=last.status==='error'?'分析未完成，可以重试。':analysis?analysis.summary:last.status==='running'?'正在分析决策 '+last.progress+' / '+steps.length+'…':'正在准备这手的决策快照…';
    $('#review-summary-title').textContent=analysis?analysis.title:'输牌以后，先看决策';
    $('#review-retry').hidden=last.status!=='error';
    $('#review-priority').hidden=!analysis||!steps.length;
    if(analysis){$('#review-priority').dataset.reviewIndex=analysis.priorityIndex;$('#review-priority').textContent=analysis.attention||analysis.consider?'查看优先复盘的决策':'从第一步回看';}
    $('#review-timeline').innerHTML=steps.map((s,i)=>{const status=analysis?.steps[i]?.status;return `<button class="review-step ${selected===i?'selected':''}" data-review-index="${i}" aria-current="${selected===i?'step':'false'}"><span class="review-step-number">${i+1}</span><span><small>${STREET_NAMES[s.street]} · ${s.position}</small><strong>${actionLabel(s)}</strong></span><span class="review-status ${status||'pending'}">${status?statusNames[status]:'待分析'}</span></button>`;}).join('');
    $('#review-step-count').textContent=steps.length+' 次行动';
    $('#review-empty').hidden=!!decision;$('#review-detail').hidden=!decision;
    if(!decision)return;
    $('#review-detail-title').textContent='第 '+(selected+1)+' 步 · '+STREET_NAMES[decision.street];
    $('#review-selected-status').textContent=result?statusNames[result.status]:'分析中';$('#review-selected-status').className='review-status '+(result?.status||'pending');
    $('#review-hole').innerHTML=decision.hole.map(c=>card(c,{small:true})).join('');
    $('#review-board').innerHTML=decision.board.length?decision.board.map(c=>card(c,{small:true})).join(''):'<span class="review-no-board">公共牌尚未发出</span>';
    $('#review-position').textContent=decision.position;$('#review-pot').textContent=format(decision.pot);$('#review-stack').textContent=format(decision.stack);
    $('#review-your-action').textContent=actionLabel(decision);$('#review-suggestion').textContent=result?.alternativeLabel||'正在比较可选行动…';
    $('#review-decision-title').textContent=result?.title||'依据当时的信息分析';
    $('#review-reason').textContent=result?.reason||'使用当时的底牌、公共牌、公开行动和筹码情况，不读取对手隐藏底牌或后面发出的牌。';
    $('#review-lesson').textContent=result?.lesson||'结果与决策分开看，复盘完成后会给出具体的练习重点。';
    $('#review-price').textContent=decision.legal.callAmount?result?pct(result.metrics.required):'…':'无需跟注';
    $('#review-equity').textContent=result&&result.metrics.contestable?pct(result.metrics.equityLow)===pct(result.metrics.equityHigh)?'约 '+pct(result.metrics.equityLow):pct(result.metrics.equityLow)+'–'+pct(result.metrics.equityHigh):'—';
    $('#review-contestable').textContent=result?format(result.metrics.contestable):'…';
    $('#review-price-note').textContent=result?.metrics.sidePots?'按你有资格争夺的各池分别估计；超出全下额度的边池不计入。':result?.metrics.closing?'跟注价格按当前可争夺金额计算，已扣除未被跟注的退还。':'价格只作参考，后续下注、其他玩家继续行动和潜在收益尚未计入。';
    const publicActions=decision.history.filter(a=>a.street===decision.street).slice(-6);
    $('#review-public-actions').innerHTML=publicActions.length?publicActions.map(a=>`<li><span>${decision.players[a.id].name}</span><span>${a.action==='raise'?'下注 / 加注至 '+format(a.amount):a.action==='call'?'跟注 '+format(a.amount):a.action==='fold'?'弃牌':'过牌'}</span></li>`).join(''):'<li>本轮尚无其他主动行动。</li>';
    $('#review-step-prev').disabled=selected===0;$('#review-step-next').disabled=selected>=steps.length-1;
    $('#review-step-current').textContent=(selected+1)+' / '+steps.length;
  }
  function receive(message,id){
    if(id!==job||!last)return;
    if(message.type==='progress'){last.progress=message.done;$('#review-analysis-state').textContent='正在分析决策 '+message.done+' / '+message.total+'…';return;}
    if(message.type==='complete'){last.analysis=message.analysis;last.status='done';selected=message.analysis.priorityIndex;worker?.terminate();worker=null;}
    else{last.status='error';worker?.terminate();worker=null;}
    renderCard();renderDialog();
  }
  async function fallback(id,input){
    worker?.terminate();worker=null;
    try{const steps=[];for(const s of input.decisions){await new Promise(resolve=>setTimeout(resolve,0));if(id!==job)return;steps.push(analyzeDecision(s,{trials:180}));receive({type:'progress',done:steps.length,total:input.decisions.length},id);}receive({type:'complete',analysis:summarizeReview(input,steps)},id);}catch{receive({type:'error'},id);}
  }
  async function analyze(){
    if(!last||last.status==='running'||last.analysis)return;
    const id=++job,input=last.input;last.status='running';last.progress=0;renderDialog();
    if(typeof Worker==='undefined'){await fallback(id,input);return;}
    try{worker=new Worker(new URL('./review-worker.js',import.meta.url),{type:'module'});worker.onmessage=e=>receive(e.data,id);worker.onerror=e=>{e.preventDefault();if(id===job)fallback(id,input);};worker.postMessage({id,input});}catch{await fallback(id,input);}
  }
  function open(){if(!last)return;renderDialog();if(!dialog.open)dialog.showModal();analyze();}
  $('#review-open').onclick=open;$('#review-hand-button').onclick=open;$('#review-retry').onclick=analyze;
  dialog.addEventListener('click',e=>{const button=e.target.closest('[data-review-index]');if(!button||!last)return;const index=Number(button.dataset.reviewIndex);if(!Number.isInteger(index)||index<0||index>=last.input.decisions.length)return;selected=index;renderDialog();});
  $('#review-step-prev').onclick=()=>{if(selected>0){selected--;renderDialog();}};
  $('#review-step-next').onclick=()=>{if(last&&selected<last.input.decisions.length-1){selected++;renderDialog();}};
  return {
    update(g,token){
      const key=token+':'+g.hand;
      if(g.phase==='done'&&key!==seen){
        seen=key;const input=createReviewInput(g);
        if(input.outcome.profit<0||!input.outcome.wonPot){worker?.terminate();worker=null;job++;last={key,input,status:'idle',progress:0,analysis:null};selected=0;renderCard();if(dialog.open){renderDialog();analyze();}}
      }
      $('#review-hand-button').hidden=!(g.phase==='done'&&last?.key===key);
    },
    rollback(g,token){
      const key=token+':'+g.hand;
      if(last?.key===key){worker?.terminate();worker=null;job++;last=null;selected=0;$('#review-card').hidden=true;}
      if(seen===key)seen='';dialog.close();$('#review-hand-button').hidden=true;
    },
    reset(){worker?.terminate();worker=null;job++;last=null;seen='';selected=0;dialog.close();$('#review-card').hidden=true;$('#review-hand-button').hidden=true;},
  };
}
