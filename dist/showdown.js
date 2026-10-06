import {evaluate,rankText} from './poker.js';
export const HAND_MOTIONS=['high','pair','two-pair','trips','straight','flush','full-house','quads','straight-flush'];
export function winningScenes(g){
  if(g.phase!=='done'||!g.showdown||g.board.length!==5)return [];
  return g.pots.flatMap(pot=>pot.awards.map(award=>{
    const p=g.players[award.id],rank=evaluate([...p.hole,...g.board]),category=rank.score[0],royal=category===8&&rank.score[1]===14;
    const counts=new Map();rank.cards.forEach(c=>counts.set(c.rank,(counts.get(c.rank)||0)+1));
    const cards=[...rank.cards].sort((a,b)=>category===4||category===8?(rank.score[1]===5&&a.rank===14?1:a.rank)-(rank.score[1]===5&&b.rank===14?1:b.rank):(counts.get(b.rank)-counts.get(a.rank)||b.rank-a.rank));
    const highlights=cards.map(c=>category===0?c.rank===rank.score[1]:[1,2,3,7].includes(category)?counts.get(c.rank)>1:true);
    const explanation=category===0?`${rankText(rank.score[1])} 高牌 · 踢脚依次比较`:category===1?`一对 ${rankText(rank.score[1])}`:category===2?`${rankText(rank.score[1])} 与 ${rankText(rank.score[2])} 两对`:category===3?`三张 ${rankText(rank.score[1])}`:category===4?`${rankText(rank.score[1])} 高顺子`:category===5?`${cards[0].symbol} 同花 · ${rankText(rank.score[1])} 高`:category===6?`三张 ${rankText(rank.score[1])} + 一对 ${rankText(rank.score[2])}`:category===7?`四张 ${rankText(rank.score[1])}`:royal?'同花色的 10 · J · Q · K · A':`${cards[0].symbol} 同花顺 · ${rankText(rank.score[1])} 高`;
    return {id:p.id,name:p.name,label:rank.label,motion:royal?'royal':HAND_MOTIONS[category],cards,highlights,explanation,pot:pot.label,amount:award.amount,split:pot.awards.length>1};
  }));
}
export function createShowdownController({card}){
  const $=s=>document.querySelector(s);let key=null,scenes=[],selected=0,timer=null;
  function cancel(){clearTimeout(timer);timer=null;}
  function show(index,autoplay=false){
    cancel();selected=index;const s=scenes[index];if(!s)return;
    $('#showdown-context').textContent=`${s.pot}${s.split?' · 平分底池':''} · ${s.name} +${s.amount.toLocaleString('en-US')}`;
    $('#showdown-scene').innerHTML=`<div class="winning-title"><strong>${s.label}</strong><span>${s.explanation}</span></div><div class="winning-cards motion-${s.motion}" data-motion="${s.motion}">${s.cards.map((c,i)=>`<div class="winning-card ${s.highlights[i]?'rank-match':'kicker'}" style="--i:${i}">${card(c)}</div>`).join('')}</div>`;
    $('#showdown-choices').innerHTML=scenes.length>1?scenes.map((s,i)=>`<button data-scene="${i}" aria-pressed="${i===index}">${s.pot} · ${s.name}${s.split?' · 平分':''}<span>${s.label}</span></button>`).join(''):'';
    if(autoplay&&index<scenes.length-1)timer=setTimeout(()=>show(index+1,true),2600);
  }
  $('#showdown-choices').onclick=e=>{const b=e.target.closest('[data-scene]');if(b)show(Number(b.dataset.scene));};
  $('#replay-showdown').onclick=()=>show(selected);
  return {update(g,epoch){const nextKey=epoch+':'+g.hand;if(g.phase!=='done'||!g.showdown){cancel();key=null;$('#showdown-stage').hidden=true;return;}if(key===nextKey)return;key=nextKey;scenes=winningScenes(g);$('#showdown-stage').hidden=!scenes.length;show(0,!matchMedia('(prefers-reduced-motion: reduce)').matches);},reset(){cancel();key=null;scenes=[];$('#showdown-stage').hidden=true;}};
}
