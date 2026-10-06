import {deckOfCards,evaluate,compare,partitionPots} from './poker.js';

export const STREET_NAMES=['翻牌前','翻牌','转牌','河牌'];
const number=n=>Math.round(n).toLocaleString('en-US');
const percent=n=>Math.round(n*100)+'%';
const rangeText=(low,high)=>percent(low)===percent(high)?'约 '+percent(low):percent(low)+'–'+percent(high);
export function actionLabel(step,action=step.action,amount=step.amount){
  if(action==='raise')return (amount===step.legal.maxRaiseTo?'全下至 ':step.currentBet===0?'下注至 ':'加注至 ')+number(amount);
  if(action==='call')return (step.legal.callAmount===step.stack?'全下跟注 ':'跟注 ')+number(step.legal.callAmount);
  return action==='fold'?'弃牌':'过牌';
}
export function createReviewInput(g){
  if(g.phase!=='done')throw Error('牌局结束后才能复盘。');
  return JSON.parse(JSON.stringify({hand:g.hand,hole:g.players[0].hole,decisions:g.decisions||[],outcome:{profit:(g.payouts[0]||0)-g.players[0].total,paid:g.players[0].total,returned:g.payouts[0]||0,folded:g.players[0].folded,wonPot:g.winners.some(w=>w.id===0),board:g.board,pots:g.pots.map(p=>({label:p.label,amount:p.amount,eligible:p.eligible.map(id=>g.players[id].name),awards:p.awards.map(a=>({name:g.players[a.id].name,amount:a.amount,label:a.label}))})),result:g.result}}));
}
function seedRandom(seed){let value=seed>>>0;return ()=>{value+=0x6D2B79F5;let x=value;x=Math.imul(x^x>>>15,x|1);x^=x+Math.imul(x^x>>>7,x|61);return ((x^x>>>14)>>>0)/4294967296;};}
function snapshotSeed(s){let seed=2166136261;for(const c of JSON.stringify([s.hole,s.board,s.players,s.history,s.street,s.legal.callAmount]))seed=Math.imul(seed^c.charCodeAt(0),16777619);return seed>>>0;}
export function startingTier(hole){
  if(hole.length!==2)return 0;
  const high=Math.max(hole[0].rank,hole[1].rank),low=Math.min(hole[0].rank,hole[1].rank),suited=hole[0].suit===hole[1].suit,gap=high-low;
  if(high===low&&high>=11||high===14&&low===13)return 3;
  if(high===low&&high>=8||high===14&&low>=10||suited&&high>=12&&low>=10)return 2;
  if(high===low||suited&&high===14||high>=11&&low>=10||suited&&gap<=2&&low>=5||high===14&&low>=8)return 1;
  return 0;
}
export function drawInfo(hole,board){
  if(board.length===0||board.length===5)return {flush:false,straight:false};
  const cards=[...hole,...board],flush=[0,1,2,3].some(s=>cards.filter(c=>c.suit===s).length===4&&hole.some(c=>c.suit===s));
  const ranks=new Set(cards.map(c=>c.rank));if(ranks.has(14))ranks.add(1);
  const straight=Array.from({length:10},(_,i)=>i+1).some(low=>{const window=Array.from({length:5},(_,i)=>low+i);return window.filter(r=>ranks.has(r)).length===4&&hole.some(c=>window.includes(c.rank)||(c.rank===14&&window.includes(1)));});
  return {flush,straight};
}
// A call has different eligible opponents in each side pot. Exclude uncalled
// refunds and compare its extra cost with what folding would return already.
export function callPrice(s){
  const before={players:s.players.map(p=>({...p}))},after={players:s.players.map(p=>({...p,total:p.total+(p.id===0?s.legal.callAmount:0)}))};
  const original=partitionPots(before),projected=partitionPots(after);
  const refundBefore=original.refunds.filter(r=>r.id===0).reduce((n,r)=>n+r.amount,0),refundAfter=projected.refunds.filter(r=>r.id===0).reduce((n,r)=>n+r.amount,0);
  const pots=projected.pots.filter(p=>p.eligible.includes(0));
  const contestable=pots.reduce((n,p)=>n+p.amount,0),cost=Math.max(0,s.legal.callAmount-refundAfter+refundBefore);
  const otherPending=s.pending.some(id=>id!==0&&!s.players[id].folded&&!s.players[id].allin);
  const allInCovered=s.legal.callAmount===s.stack&&s.players.filter(p=>p.id!==0&&!p.folded).every(p=>p.allin||p.total>=s.total+s.legal.callAmount);
  return {pots,contestable,cost,refundBefore,refundAfter,required:contestable?cost/contestable:0,closing:s.street===3&&!otherPending||allInCovered};
}
function drawPair(pool,rng){const a=Math.floor(rng()*pool.length);let b=Math.floor(rng()*(pool.length-1));if(b>=a)b++;return [a,b];}
function rangeWeight(pair,s,opponent){
  const aggressive=s.history.some(a=>a.id===opponent.id&&a.action==='raise');
  if(!aggressive)return 1;
  if(s.street===0)return [1,2,4,6][startingTier(pair)];
  const score=evaluate([...pair,...s.board]).score[0],draw=drawInfo(pair,s.board);
  return score>=4?6:score>=2?5:score===1?3:draw.flush||draw.straight?2:1;
}
function sampleValue(s,price,trials,weighted){
  if(!price.contestable)return {equity:0,margin:0,ev:0};
  const rng=seedRandom(snapshotSeed(s)+(weighted?7919:0)),known=new Set([...s.hole,...s.board].map(c=>c.key)),available=deckOfCards().filter(c=>!known.has(c.key));
  const opponents=s.players.filter(p=>p.id!==0&&!p.folded);let sum=0,squares=0;
  for(let t=0;t<trials;t++){
    const pool=[...available],holes=new Map();
    for(const opponent of opponents){
      let indices=drawPair(pool,rng);
      if(weighted){for(let attempt=0;attempt<30;attempt++){indices=drawPair(pool,rng);if(rng()<rangeWeight(indices.map(i=>pool[i]),s,opponent)/6)break;}}
      holes.set(opponent.id,indices.map(i=>pool[i]));for(const i of indices.sort((a,b)=>b-a))pool.splice(i,1);
    }
    const board=[...s.board];while(board.length<5)board.push(pool.splice(Math.floor(rng()*pool.length),1)[0]);
    const hero=evaluate([...s.hole,...board]).score,scores=new Map(opponents.map(p=>[p.id,evaluate([...holes.get(p.id),...board]).score]));
    let returned=0;
    for(const pot of price.pots){let ties=1,lost=false;for(const id of pot.eligible){if(id===0)continue;const c=compare(scores.get(id),hero);if(c>0){lost=true;break;}if(c===0)ties++;}if(!lost)returned+=pot.amount/ties;}
    const fraction=price.contestable?returned/price.contestable:0;sum+=fraction;squares+=fraction*fraction;
  }
  const equity=sum/trials,margin=1.96*Math.sqrt(Math.max(0,squares/trials-equity*equity)/trials);
  return {equity,margin,ev:equity*price.contestable-price.cost};
}
export function analyzeDecision(s,{trials=360}={}){
  const price=callPrice(s),wide=sampleValue(s,price,trials,false),strong=sampleValue(s,price,trials,true);
  const low=Math.min(wide.equity,strong.equity),high=Math.max(wide.equity,strong.equity),uncertainty=Math.max(wide.margin,strong.margin);
  const tier=startingTier(s.hole),made=evaluate([...s.hole,...s.board]),draw=drawInfo(s.hole,s.board);
  const boardCounts=s.board.map(c=>s.board.filter(b=>b.rank===c.rank).length),danger=Math.max(0,...boardCounts)>=3||s.board.length>=4&&s.board.some(c=>s.board.filter(b=>b.suit===c.suit).length>=3);
  const strongMade=s.street>0&&made.score[0]>=3&&!danger&&(s.board.length<5||compare(made.score,evaluate(s.board).score)>0);
  let status='sound',title='这个选择有合理依据',reason='',lesson='',alternative={action:s.legal.canCheck?'check':'call',amount:s.legal.callAmount};
  const suggestRaise=()=>{alternative={action:'raise',amount:Math.min(s.legal.maxRaiseTo,Math.max(s.legal.minRaiseTo,s.currentBet===50&&s.street===0?150:s.currentBet+Math.max(s.minRaise,Math.round(s.pot*.5/25)*25)))};};
  if(s.action==='fold'&&s.legal.canCheck){
    status='attention';title='可以免费过牌，不必立即弃牌';reason='当时无需跟注。过牌能保留争夺底池的机会，后面遇到下注仍可再决定是否弃牌。';alternative={action:'check',amount:0};lesson='没有下注压力时，先检查能否免费过牌。';
  }else if(s.street===0&&tier===0&&(s.action==='call'||s.action==='raise')&&(s.currentBet>=150||['UTG','UTG+1','MP','LJ','HJ'].includes(s.position))){
    status='attention';title='起手牌与当前位置不太匹配';reason=`这组起手牌成牌潜力偏低。${['UTG','UTG+1','MP','LJ','HJ'].includes(s.position)?'你在较早位置，后面还有玩家可能加注。':'前面已有较大加注，弱牌跟进更容易被更好的牌压制。'}`;alternative={action:s.legal.canCheck?'check':'fold',amount:0};lesson='早位或面对加注时，收紧弱牌范围；不要只因为已经投入盲注就继续。';
  }else if(s.action==='raise'&&s.amount-s.bet>Math.max(500,s.pot*2.5)&&(s.street===0?tier<2:!strongMade&&!draw.flush&&!draw.straight)){
    status='attention';title='投入很大，需要更明确的下注目的';reason=`你这一行动额外投入 ${number(s.amount-s.bet)} 筹码，而当时底池是 ${number(s.pot)}。牌力和听牌潜力没有提供明显的价值下注依据；诈唬是否有效还取决于对手的弃牌率。`;alternative={action:s.legal.canCheck?'check':high+uncertainty<price.required?'fold':'call',amount:s.legal.callAmount};lesson='先分清价值下注与诈唬；没有明确目标时，优先控制底池。';
  }else if(s.action==='call'&&price.cost>0&&high+uncertainty+.035<price.required){
    status=price.closing?'attention':'consider';title=price.closing?'跟注价格偏贵':'这次跟注需要更强的理由';reason=`跟注的有效成本是 ${number(price.cost)}，可争夺底池为 ${number(price.contestable)}，需要约 ${percent(price.required)} 的底池权益。两种假设范围的估计为${rangeText(low,high)}，目前支持跟注的依据偏弱。`;alternative={action:'fold',amount:0};lesson=price.closing?'面对大额跟注，先算价格，再判断对手可能的牌与诈唬。':s.street===3?'其他玩家尚未完成行动，跟注后仍可能面对再加注。没有对手频繁诈唬的依据时，倾向弃牌。':'后续下注和潜在收益尚未计入；若没有明确听牌或对手偏好信息，倾向弃牌。';
  }else if(s.street===0&&tier===3&&s.action==='fold'){
    status='consider';title='强起手牌可能放弃得太早';reason='这组牌属于强起手牌。常规筹码局中，优先考虑继续参与，再结合加注规模和有效筹码决定跟注或再加注。';alternative={action:'call',amount:s.legal.callAmount};lesson='不要把上一手的输赢带入下一手的强牌判断。';
  }else if(s.street===0&&tier===3&&s.action==='call'&&s.legal.canRaise){
    status='consider';title='强起手牌可以考虑主动加注';reason='单纯跟注可能让更多对手便宜入池。强起手牌通常可以通过加注获得价值，并减少翻牌后的多家竞争。';suggestRaise();lesson='强牌入池时，考虑主动建立底池；具体尺度仍需看前面的加注和筹码。';
  }else if(s.action==='check'&&strongMade&&s.legal.canRaise){
    status='consider';title='这里可以考虑价值下注';reason=`当时你已形成${made.label}，且没有面对下注。过牌可以隐藏牌力，也可能错过让较弱牌付费的机会。`;suggestRaise();lesson='强牌过牌前，想清楚是要诱导下注，还是应直接从较弱牌获得价值。';
  }else if(s.action==='fold'){
    title='弃牌有合理依据';reason='弃牌限制了继续投入的成本。已投入的筹码属于过去的成本，不应成为继续跟注的唯一理由。';alternative={action:'fold',amount:0};lesson='即使后来公共牌对你有利，也不能据此否定当时的弃牌。';
  }else if(s.action==='call'){
    title='这次跟注未发现明显问题';reason=`跟注需要约 ${percent(price.required)} 的底池权益。假设范围下的估计为${rangeText(low,high)}；仍需结合对手的下注范围和后续压力判断。`;lesson='跟注前比较底池价格与牌力，牌面变化后重新判断。';
  }else if(s.action==='raise'){
    title='这次下注有可讨论的理由';reason='主动下注可以获得价值或争取对手弃牌。最终被跟注并输牌，并不能单独证明这次下注错误。';alternative={action:'raise',amount:s.amount};lesson='下注前确定目标：希望哪些较弱牌跟注，或哪些较强牌弃牌。';
  }else{
    title='过牌保留了后续选择';reason='过牌无需新增筹码，可以控制底池并观察后面的行动。弱牌、部分听牌和需要保护的过牌范围都可以这样处理。';lesson='免费过牌后，也要为后面可能的下注准备应对。';
  }
  if(alternative.action==='raise'&&!s.legal.canRaise)alternative={action:s.legal.canCheck?'check':'call',amount:s.legal.callAmount};
  return {index:s.index,status,title,reason,lesson,alternative,alternativeLabel:actionLabel(s,alternative.action,alternative.amount),metrics:{required:price.required,equityLow:low,equityHigh:high,uncertainty,callCost:price.cost,contestable:price.contestable,closing:price.closing,sidePots:price.pots.length>1,trials},draw};
}
export function summarizeReview(input,steps){
  const attention=steps.filter(s=>s.status==='attention'),consider=steps.filter(s=>s.status==='consider'),priority=[...steps].sort((a,b)=>({attention:2,consider:1,sound:0}[b.status]-{attention:2,consider:1,sound:0}[a.status]))[0];
  return {steps,priorityIndex:priority?.index||0,attention:attention.length,consider:consider.length,title:attention.length?'先看这 '+attention.length+' 个决策':consider.length?'有 '+consider.length+' 个选择值得讨论':'未发现明显决策失误',summary:attention.length?'重点回到当时的牌力、价格和位置，检查是否承担了不必要的风险。':consider.length?'部分选择还有其他处理方式；当前信息不足以把它们判定为明确错误。':input.outcome.folded?'这手的弃牌可以有合理依据。没有赢得底池，并不等于应该坚持到底。':'这手可能包含正常波动，或假设范围无法判断的细节。保持有依据的决策，不必因一次输牌全盘否定。'};
}
export function analyzeReview(input,options){return summarizeReview(input,input.decisions.map(s=>analyzeDecision(s,options)));}
