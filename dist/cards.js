import {rankText} from './poker.js';
// A single vector suit scales with the card's rank and frame.
const shapes=[
  'M10 0C7 5 0 8 0 14C0 19 7 21 10 16C13 21 20 19 20 14C20 8 13 5 10 0ZM9 16L6 22H14L11 16Z',
  'M10 22C7 18 0 12 0 6C0 -1 8 -2 10 4C12 -2 20 -1 20 6C20 12 13 18 10 22Z',
  'M10 0C3 0 3 8 6 10C-2 7 -2 19 5 19C7 19 9 18 10 15C11 18 13 19 15 19C22 19 22 7 14 10C17 8 17 0 10 0ZM9 15L6 22H14L11 15Z',
  'M10 0L20 11L10 22L0 11Z'
];
const suitIcon=(suit,x,y,size)=>`<svg class="card-suit-icon" x="${x-size/2}" y="${y-size*.55}" width="${size}" height="${size*1.1}" viewBox="0 0 20 22" aria-hidden="true"><path d="${shapes[suit]}" fill="currentColor"/></svg>`;
export function renderCard(c,{small=false,delay=0,animate=false,best=false}={}){
  const rank=rankText(c.rank);
  const corner=`<text x="10" y="19" text-anchor="middle" font-size="15" font-weight="700">${rank}</text>`;
  const art=small?`<svg class="card-art" viewBox="0 0 36 50" aria-hidden="true"><text x="5" y="18" font-size="16" font-weight="700">${rank}</text>${suitIcon(c.suit,20,33,17)}</svg>`:`<svg class="card-art" viewBox="0 0 64 92" aria-hidden="true"><rect x="2" y="2" width="60" height="88" rx="6" fill="none" stroke="#344d60" stroke-opacity=".10"/>${corner}${suitIcon(c.suit,32,46,29)}<g transform="rotate(180 32 46)">${corner}</g></svg>`;
  return `<div class="playing-card ${c.suit===1||c.suit===3?'red':'black'} ${small?'small':''} ${animate?'card-deal':''} ${best?'best-card':''}" style="--delay:${delay}ms" aria-label="${rank}${c.symbol}">${art}</div>`;
}
