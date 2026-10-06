import {newGame,startHand,act,advanceStreet,legalActions,potSize,botDecision,evaluate,rankText} from './poker.js';
const $ = s => document.querySelector(s);
let game=newGame(),timer=null,epoch=0,lastBoard=0,lastHand=0,bet=150,hints=true,sound=false,audio=null;
try {sound=localStorage.getItem('noir-sound')==='true';hints=localStorage.getItem('noir-hints')!=='false';}catch{}
const format=n=>n.toLocaleString('en-US'),streets=['翻牌前','翻牌','转牌','河牌'],profiles=['YOU','M','A','R','K','L'];
function card(c,{small=false,delay=0,animate=false,best=false}={}){
  return `<div class="playing-card ${c.suit===1||c.suit===3?'red':'black'} ${small?'small':''} ${animate?'card-deal':''} ${best?'best-card':''}" style="--delay:${delay}ms" aria-label="${rankText(c.rank)}${c.symbol}"><div class="card-corner">${rankText(c.rank)}<span>${c.symbol}</span></div><span class="card-pip">${c.symbol}</span><div class="card-corner bottom">${rankText(c.rank)}<span>${c.symbol}</span></div></div>`;
}
function position(id){if(id===game.dealer)return 'D';if(id===(game.dealer+1)%6)return 'SB';if(id===(game.dealer+2)%6)return 'BB';return ['UTG','HJ','CO'][((id-game.dealer+6)%6)-3]||'';}
function soundEffect(kind='chip'){
  if(!sound)return;try{audio ||= new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();const now=audio.currentTime;
    const notes=kind==='win'?[440,554,659]:kind==='deal'?[820,570]:[310];
    notes.forEach((hz,i)=>{const o=audio.createOscillator(),v=audio.createGain();o.type=kind==='deal'?'triangle':'sine';o.frequency.setValueAtTime(hz,now+i*.08);v.gain.setValueAtTime(.0001,now+i*.08);v.gain.exponentialRampToValueAtTime(.025,now+i*.08+.015);v.gain.exponentialRampToValueAtTime(.0001,now+i*.08+.16);o.connect(v);v.connect(audio.destination);o.start(now+i*.08);o.stop(now+i*.08+.2);});
  }catch{}
}
function flyChips(id){
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const source=id===0?$('.hero-name'):$(`.seat-${id} .seat-profile`),target=$('.pot');if(!source||!target)return;
  const a=source.getBoundingClientRect(),b=target.getBoundingClientRect();
  for(let i=0;i<3;i++){const chip=document.createElement('span');chip.className='flying-chip';document.body.append(chip);chip.style.left=(a.left+a.width/2+i*3)+'px';chip.style.top=(a.top+a.height/2-i*3)+'px';const anim=chip.animate([{transform:'translate(0,0) scale(1)',opacity:1},{transform:`translate(${b.left+b.width/2-a.left-a.width/2}px,${b.top+b.height/2-a.top-a.height/2}px) scale(.7)`,opacity:0}],{duration:520,delay:i*60,easing:'cubic-bezier(.2,.7,.3,1)'});anim.onfinish=()=>chip.remove();}
}
function render(){
  const hero=game.players[0],newHand=game.hand!==lastHand,boardChanged=game.board.length>lastBoard;
  const heroBest=game.showdown&&!hero.folded?new Set(evaluate([...hero.hole,...game.board]).cards.map(c=>c.key)):new Set();
  $('#hand-number').textContent=String(game.hand).padStart(2,'0');$('#street-label').textContent=game.phase==='done'?'本手结束':streets[game.street]||'准备发牌';
  $('#pot-value').textContent=format(game.phase==='done'?game.potAtShowdown:potSize(game));$('.pot').classList.toggle('pot-changed',boardChanged);
  $('#board').innerHTML=Array.from({length:5},(_,i)=>game.board[i]?card(game.board[i],{animate:i>=lastBoard&&boardChanged,delay:(i-lastBoard)*140,best:heroBest.has(game.board[i].key)}):`<div class="board-slot" aria-label="未发出的公共牌">${['♠','♣','♥','♦','♠'][i]}</div>`).join('');
  $('#seats').innerHTML=game.players.slice(1).map(p=>{
    const isWinner=game.winners.some(w=>w.id===p.id),reveal=game.showdown&&!p.folded;
    return `<div class="seat seat-${p.id} ${p.folded?'folded':''} ${game.actor===p.id?'thinking':''} ${isWinner?'winner':''}" data-player="${p.id}"><div class="mini-cards">${reveal?p.hole.map(c=>card(c,{small:true})).join(''):p.hole.map((c,i)=>`<span class="card-back ${newHand?'card-deal':''}" style="--delay:${p.id*65+i*140}ms" aria-label="对手底牌"></span>`).join('')}</div><div class="seat-profile"><span class="avatar avatar-${p.id-1}">${profiles[p.id]}</span><div><strong>${p.name}<span class="position-badge">${position(p.id)}</span></strong><span>${format(p.stack)}</span></div></div><div class="seat-action">${isWinner?'♛ '+evaluate([...p.hole,...game.board]).label:game.actor===p.id?'思考中<span class="thinking-dots">…</span>':p.action||'等待行动'}</div>${p.bet>0&&game.phase!=='done'?`<div class="seat-bet"><i class="bet-chip"></i>${format(p.bet)}</div>`:''}</div>`;
  }).join('');
  $('#hero-cards').innerHTML=hero.hole.map((c,i)=>card(c,{animate:newHand,delay:420+i*130,best:heroBest.has(c.key)})).join('');
  $('.hero-area').classList.toggle('hero-folded',hero.folded);$('.hero-name').classList.toggle('is-active',game.actor===0);
  $('#hero-stack').textContent=format(hero.stack);$('#hero-position').textContent=position(0);$('#hero-turn').textContent=game.actor===0?'你的回合':hero.folded?'已弃牌':hero.allin?'已全下':game.phase==='done'?'本手结束':'等待行动';
  $('#session-stack').innerHTML=`${format(hero.stack)}<span>CHIPS</span>`;const diff=hero.stack-game.stats.buyin;
  $('#session-change').textContent=game.stats.hands?`${diff>=0?'+':''}${format(diff)} 筹码 · 本次练习净变化`:'从这一手开始积累经验';$('#session-change').classList.toggle('negative',diff<0);
  $('#stat-hands').textContent=game.stats.hands;$('#stat-wins').textContent=game.stats.wins;$('#stat-winrate').textContent=game.stats.hands?Math.round(game.stats.wins/game.stats.hands*100)+'%':'—';
  $('#activity-list').innerHTML=game.logs.slice(0,12).map(l=>`<li class="log-${l.type} ${l.player===0?'log-hero':''}">${l.text}</li>`).join('');$('#activity-count').textContent=game.phase==='done'?'FINISHED':'LIVE';
  const done=game.phase==='done';$('#arena').classList.toggle('is-done',done);$('#result-banner').hidden=!done;$('#result-banner').classList.toggle('hero-win',game.winners.some(w=>w.id===0));
  if(done){const winner=game.winners.find(w=>w.id===0)||game.winners[0];$('#result-banner').innerHTML=`<span>${game.winners.some(w=>w.id===0)?'♛ 漂亮的一手':'本手结果'}</span><strong>${game.winners.length>1?'共享底池':winner.name+' 获得底池'}</strong><small>${winner.label} · ${format(winner.amount)} 筹码</small>`;}
  $('#board-caption').textContent=done&&game.showdown?(hero.folded?'摊牌 · 对手亮出底牌':'摊牌 · 亮起的牌组成你的最佳牌型'):game.street===0?'等待翻牌':game.street===1?'FLOP · 三张公共牌':game.street===2?'TURN · 第四张公共牌':'RIVER · 最后的决定';
  const legal=legalActions(game,0);$('.bet-controls').hidden=done;$('.action-buttons').hidden=done;$('#next-button').hidden=!done;
  $('#next-button').innerHTML=hero.stack===0?'补充筹码，继续练习 <span>♠</span>':'下一手 <span>♠</span>';
  for(const b of [$('#fold-button'),$('#call-button')])b.disabled=!legal.enabled;
  $('#raise-button').disabled=!legal.enabled||!legal.canRaise;$('#bet-slider').disabled=!legal.enabled||!legal.canRaise;
  document.querySelectorAll('[data-preset]').forEach(b=>b.disabled=!legal.enabled||!legal.canRaise);
  if(legal.enabled){
    const min=legal.minRaiseTo,max=legal.maxRaiseTo;bet=Math.min(max,Math.max(min,bet));const slider=$('#bet-slider');slider.min=min;slider.max=max;slider.step=1;slider.value=bet;
    $('#call-button').innerHTML=legal.canCheck?'<span>过牌</span><small>CHECK</small>':`<span>${legal.callAmount<legal.toCall?'全下跟注':'跟注'} ${format(legal.callAmount)}</span><small>CALL</small>`;
    $('#decision-text').textContent=legal.canCheck?'轮到你了，可以过牌或主动下注。':`轮到你了，跟注需要 ${format(legal.callAmount)} 筹码。`;
  }else if(done)$('#decision-text').textContent=game.result;
  else if(game.phase==='between')$('#decision-text').textContent='本轮下注结束，正在翻开公共牌…';
  else $('#decision-text').textContent=hero.folded?`${game.players[game.actor]?.name||'对手'} 正在行动，你可以观察这一手。`:`${game.players[game.actor]?.name||'对手'} 正在思考，请稍候。`;
  updateBet();$('#hand-strength').textContent=hero.hole.length?evaluate([...hero.hole,...game.board]).label:'';updateCoach();lastHand=game.hand;lastBoard=game.board.length;
}
function updateBet(){const legal=legalActions(game,0);$('#bet-value').textContent=format(bet);$('#raise-number')?.remove();const action=legal.enabled&&bet===legal.maxRaiseTo?'全下':game.currentBet===0?'下注':'加注';$('#raise-button').innerHTML=`<span>${action} <b>${format(bet)}</b></span><small>${action==='全下'?'ALL IN':action==='下注'?'BET':'RAISE'}</small>`;}
function updateCoach(){
  $('#coach-content').hidden=!hints;$('#hint-toggle').textContent=hints?'已开启':'已关闭';$('#hint-toggle').setAttribute('aria-pressed',String(hints));
  const p=game.players[0],e=evaluate([...p.hole,...game.board]);let tip='';
  if(game.phase==='done')tip=p.folded?'弃牌也是好决策的一部分。观察对手最后亮出的牌，回想本手的下注节奏。':game.showdown?`你的最佳牌型是${e.label}。复盘时注意：对手在哪一轮开始加注？公共牌是否改变了牌面强度？`:'让对手弃牌也能赢得底池。下一手，继续关注位置和下注尺度。';
  else if(game.street===0){const [a,b]=p.hole;
    if(a?.rank===b?.rank)tip='口袋对子有机会在翻牌形成三条。小对子面对大额加注时，也要考虑跟注成本。';
    else if(a?.rank>=11&&b?.rank>=11)tip='两张高牌拥有不错的起手潜力。主动加注能缩小对手范围，也要留意前面的大额加注。';
    else if(a?.suit===b?.suit)tip='同花底牌增加了成牌潜力，但不代表可以跟注任何价格。留意牌张距离和你的行动位置。';
    else tip='起手牌不必手手参与。越早行动，选牌越要谨慎；后位则能利用更多信息。';
  }else if(e.score[0]>=3)tip=`你已形成${e.label}。考虑通过下注获得价值，同时注意公共牌上可能出现的更强牌型。`;
  else if(e.score[0]>=1)tip=`目前是${e.label}。多位对手参与时，谨慎面对持续的大额加注；一对不总能赢到最后。`;
  else tip='目前尚未成对。别只看能否追到牌，也要考虑跟注价格，以及对手的下注强度。';
  const legal=legalActions(game,0);if(legal.enabled&&legal.toCall>0)tip+=` 这次跟注占跟注后底池约 ${Math.round(legal.callAmount/(potSize(game)+legal.callAmount)*100)}%。`;
  $('#coach-stage').textContent=game.phase==='done'?'本手复盘':streets[game.street]+'策略';$('#coach-tip').textContent=tip;
}
function schedule(){clearTimeout(timer);const ticket=epoch;if(game.phase==='done')return;
  if(game.phase==='between'){timer=setTimeout(()=>{if(ticket!==epoch)return;advanceStreet(game);soundEffect(game.phase==='done'?'win':'deal');render();schedule();},game.board.length===5?850:1000);}
  else if(game.actor!==0){timer=setTimeout(()=>{if(ticket!==epoch)return;const id=game.actor,d=botDecision(game);act(game,id,d.action,d.amount);if(d.action!=='fold'&&d.action!=='check'){flyChips(id);soundEffect();}if(game.phase==='done')soundEffect('win');render();schedule();},650+Math.random()*450);}
}
function heroAction(action,amount){if(!legalActions(game,0).enabled)return false;const legal=legalActions(game,0);act(game,0,action,amount);if(action==='raise'||(action==='call'&&legal.toCall>0)){flyChips(0);soundEffect();}if(game.phase==='done')soundEffect('win');render();schedule();return true;}
function nextHand(){clearTimeout(timer);epoch++;lastBoard=0;startHand(game);const legal=legalActions(game,0);bet=legal.enabled?Math.min(legal.maxRaiseTo,Math.max(legal.minRaiseTo,150)):150;render();soundEffect('deal');schedule();}
$('#fold-button').onclick=()=>heroAction('fold');$('#call-button').onclick=()=>heroAction('call');$('#raise-button').onclick=()=>heroAction('raise',bet);$('#next-button').onclick=nextHand;
$('#bet-slider').oninput=e=>{const legal=legalActions(game,0);let v=Number(e.target.value);bet=v===legal.maxRaiseTo?v:Math.max(legal.minRaiseTo,Math.round(v/25)*25);bet=Math.min(legal.maxRaiseTo,bet);updateBet();};
document.querySelectorAll('[data-preset]').forEach(button=>button.onclick=()=>{const legal=legalActions(game,0);if(!legal.canRaise)return;const value=button.dataset.preset;bet=value==='all'?legal.maxRaiseTo:value==='min'?legal.minRaiseTo:game.currentBet+Math.max(game.minRaise,Math.round(potSize(game)*(value==='half'?.5:1)/25)*25);bet=Math.min(legal.maxRaiseTo,Math.max(legal.minRaiseTo,bet));$('#bet-slider').value=bet;updateBet();});
$('#difficulty').onchange=e=>{game.difficulty=e.target.value;};
function updateSound(){const b=$('#sound-button');b.setAttribute('aria-label',sound?'关闭音效':'开启音效');b.setAttribute('aria-pressed',String(sound));b.title=sound?'音效已开启':'音效已关闭';b.innerHTML=sound?'<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8q6 4 0 8m3-11q9 7 0 14"/></svg>':'<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6m0-6-5 6"/></svg>';}
$('#sound-button').onclick=()=>{sound=!sound;try{localStorage.setItem('noir-sound',String(sound));}catch{}updateSound();if(sound)soundEffect('deal');};
$('#hint-toggle').onclick=()=>{hints=!hints;try{localStorage.setItem('noir-hints',String(hints));}catch{}updateCoach();};
$('#rules-button').onclick=()=>$('#rules-dialog').showModal();$('#reset-button').onclick=()=>$('#reset-dialog').showModal();
document.querySelectorAll('.close-dialog').forEach(b=>b.onclick=()=>b.closest('dialog').close());
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
$('#confirm-reset').onclick=()=>{const difficulty=game.difficulty;clearTimeout(timer);game=newGame();game.difficulty=difficulty;lastHand=0;$('#reset-dialog').close();nextHand();};
function publicState(){return {hand:game.hand,street:streets[game.street],phase:game.phase,actor:game.actor===0?'你':game.players[game.actor]?.name||null,pot:game.phase==='done'?game.potAtShowdown:potSize(game),board:game.board.map(c=>rankText(c.rank)+c.symbol),hole:game.players[0].hole.map(c=>rankText(c.rank)+c.symbol),stack:game.players[0].stack,legal:legalActions(game,0),players:game.players.map(p=>({name:p.name,stack:p.stack,folded:p.folded,allin:p.allin,bet:p.bet})),result:game.result||null};}
window.noir={getState:publicState};
function registerTools(){const context=document.modelContext;if(!context?.registerTool)return;const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});const register=tool=>{try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}};
  register({name:'read_poker_table',title:'读取当前牌桌',description:'Read the public poker table and your legal actions. Does not reveal opponents hidden cards.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:input=>{if(!input||typeof input!=='object'||Object.keys(input).length)throw Error('请传入空对象。');return publicState();}});
  register({name:'play_poker_action',title:'在牌桌行动',description:'Complete your turn by folding, checking, calling or raising to a total street amount. Only succeeds on your turn.',inputSchema:{type:'object',properties:{action:{type:'string',enum:['fold','check','call','raise']},amount:{type:'integer',minimum:0}},required:['action'],additionalProperties:false},annotations:{readOnlyHint:false},execute:input=>{if(!input||typeof input!=='object'||Object.keys(input).some(k=>!['action','amount'].includes(k))||!['fold','check','call','raise'].includes(input.action))throw Error('无效的行动。');if(!legalActions(game,0).enabled)throw Error('还没有轮到你。');if(input.action==='raise'&&!Number.isInteger(input.amount))throw Error('加注需要整数总额。');heroAction(input.action,input.amount);return publicState();}});
  register({name:'start_next_poker_hand',title:'开始下一手',description:'Deal the next hand after the current hand has ended. Refills any empty virtual chip stack.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false},execute:input=>{if(!input||typeof input!=='object'||Object.keys(input).length)throw Error('请传入空对象。');if(game.phase!=='done')throw Error('当前牌局尚未结束。');nextHand();return publicState();}});
}
updateSound();nextHand();registerTools();
