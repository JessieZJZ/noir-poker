import {rankText} from './poker.js';
// Vector card faces use one coordinate system, so corners and pips scale together.
const shapes=[
  'M10 0C7 5 0 8 0 14C0 19 7 21 10 16C13 21 20 19 20 14C20 8 13 5 10 0ZM9 16L6 22H14L11 16Z',
  'M10 22C7 18 0 12 0 6C0 -1 8 -2 10 4C12 -2 20 -1 20 6C20 12 13 18 10 22Z',
  'M10 0C3 0 3 8 6 10C-2 7 -2 19 5 19C7 19 9 18 10 15C11 18 13 19 15 19C22 19 22 7 14 10C17 8 17 0 10 0ZM9 15L6 22H14L11 15Z',
  'M10 0L20 11L10 22L0 11Z'
];
const pip=(suit,x,y,w=8,h=w*1.1,flip=false)=>`<svg x="${x-w/2}" y="${y-h/2}" width="${w}" height="${h}" viewBox="0 0 20 22" aria-hidden="true"><path d="${shapes[suit]}" fill="currentColor"${flip?' transform="rotate(180 10 11)"':''}/></svg>`;
const patterns={2:[[32,32],[32,60]],3:[[32,32],[32,46],[32,60]],4:[[23,32],[41,32],[23,60],[41,60]],5:[[23,32],[41,32],[32,46],[23,60],[41,60]],6:[[23,31],[41,31],[23,46],[41,46],[23,61],[41,61]],7:[[23,31],[41,31],[23,46],[41,46],[23,61],[41,61],[32,38.5]],8:[[23,31],[41,31],[23,46],[41,46],[23,61],[41,61],[32,38.5],[32,53.5]],9:[[23,29],[41,29],[23,40],[41,40],[23,52],[41,52],[23,63],[41,63],[32,46]],10:[[23,29],[41,29],[23,40],[41,40],[23,52],[41,52],[23,63],[41,63],[32,35],[32,57]]};
export function renderCard(c,{small=false,delay=0,animate=false,best=false}={}){
  const rank=rankText(c.rank),corner=`<text x="10" y="19" text-anchor="middle" font-size="15" font-weight="700">${rank}</text>${pip(c.suit,10,25,7,7.7)}`;
  const center=c.rank===14?pip(c.suit,32,46,25):c.rank>10?`<rect x="18" y="31" width="28" height="30" rx="7" fill="none" stroke="currentColor" stroke-opacity=".16"/><text x="32" y="51" text-anchor="middle" font-size="22" font-weight="500">${rank}</text>${pip(c.suit,32,24,7)}${pip(c.suit,32,68,7,7.7,true)}`:patterns[c.rank].map(([x,y])=>pip(c.suit,x,y,c.rank>8?7:8,undefined,y>46)).join('');
  const art=small?`<svg class="card-art" viewBox="0 0 36 50" aria-hidden="true"><text x="5" y="18" font-size="16" font-weight="700">${rank}</text>${pip(c.suit,23,34,16)}</svg>`:`<svg class="card-art" viewBox="0 0 64 92" aria-hidden="true"><rect x="2" y="2" width="60" height="88" rx="6" fill="none" stroke="#344d60" stroke-opacity=".10"/>${corner}${center}<g transform="rotate(180 32 46)">${corner}</g></svg>`;
  return `<div class="playing-card ${c.suit===1||c.suit===3?'red':'black'} ${small?'small':''} ${animate?'card-deal':''} ${best?'best-card':''}" style="--delay:${delay}ms" aria-label="${rank}${c.symbol}">${art}</div>`;
}
