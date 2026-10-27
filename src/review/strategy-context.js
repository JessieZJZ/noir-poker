import { assessPublicStrategy } from '../engine/public-strategy.js';
import { deckOfCards, evaluate, compare } from '../engine/poker.js';
import { handFeatures } from '../engine/hand-features.js';
import { strategyNotes } from './strategy-reasoning.js';

export function reviewStrategy(s, c, price) {
  return assessPublicStrategy(
    {
      ...s,
      id: 0,
      rivals: c.opponents,
      count: s.players.filter((p) => !p.out).length,
      inPosition: c.inPosition,
      features: c.features,
      botProfile: null,
      opponents: s.players.filter((p) => p.id !== 0 && !p.folded),
      callPots: price.pots,
      callPrice: { cost: price.cost, contestable: price.contestable, odds: price.required },
    },
    { deck: deckOfCards(), evaluate, compare, features: handFeatures, samples: 48 },
  );
}

// Keep one causal paragraph. Replace generic price/value filler only when a
// more specific size-dependent explanation is available; preserve card facts,
// actual action, and any proven rule/rollout verdict.
export function enrichStrategy(coaching, s, assessment, options) {
  const notes = strategyNotes(s, assessment, { ...options, includeAction: false });
  let parts = (coaching.paragraphParts || coaching.paragraphs.map((p) => [p])).map((p) => [...p]);
  const flat = parts.flat().join('');
  const accepted = notes
    .filter(
      (n) =>
        !(n.topic === 'range' && /整体范围|范围优势/.test(flat)) &&
        !(n.topic === 'bluff-catch' && /听牌仍可能转成诈唬|听牌可能转成诈唬/.test(flat)) &&
        !(n.topic === 'draw-plan' && s.action === 'fold' && /补成.*不保证|改善机会/.test(flat)) &&
        !(n.topic === 'draw-plan' && s.legal.callAmount >= s.stack && /全下跟注/.test(flat)) &&
        !(n.topic === 'implied-odds' && s.legal.callAmount >= s.stack && /全下跟注/.test(flat)) &&
        !(
          n.topic === 'implied-odds' &&
          assessment?.call?.equity >= assessment?.call?.price &&
          /下一街的投入还要另算/.test(flat)
        ) &&
        !(
          n.topic === 'implied-odds' &&
          /成强牌后的收益|击中暗三条后/.test(flat) &&
          /新的价格|另算成本/.test(flat)
        ),
    )
    .map((n) => {
      if (n.topic !== 'draw-plan') return n;
      let pieces = [...n.parts];
      if (
        !assessment?.draw?.nutFlushDraw &&
        /(?:当前有|主要依靠|带|保留)(?:同花听牌|顺子听牌|两头顺听牌|卡顺听牌)/.test(flat)
      )
        pieces = pieces.slice(1);
      if (
        /补中也未必|补中也不保证|补成也不保证|不等于.*获胜机会/.test(flat) &&
        !assessment?.draw?.pairedBoard &&
        /^(?:补成目标牌型后|补中时能争取最大同花)/.test(pieces.at(-1) || '')
      )
        pieces.pop();
      return { ...n, parts: pieces, text: pieces.join('') };
    });
  if (accepted.some((n) => n.topic === 'paying-range'))
    parts = parts.map((p) =>
      p.flatMap((text) =>
        text
          .split(/(?<=[。！？])/u)
          .filter(
            (t) =>
              !/^(?:当前|目前)已有成牌，下注的价值来自对手用更弱成牌跟注。$/.test(t) &&
              !/^河牌已经发完，价值来自较弱成牌愿意跟注。$/.test(t) &&
              (!/^取值也可能来自.*听牌.*跟注.*愿意支付这个尺度。$/.test(t) ||
                !accepted.some((n) => n.topic === 'paying-range' && /听牌/.test(n.text))),
          ),
      ),
    );
  if (accepted.some((n) => n.topic === 'draw-plan'))
    parts = parts.map((p) =>
      p.map((text) =>
        text
          .replace(/这次属于半诈唬，对手弃牌可直接拿池，被跟注后仍能补牌。/gu, '')
          .replace(
            /目前仍有 \d+ 张牌可能补成(?:同花或顺子|同花|顺子)，但这些是成牌补牌，不保证补中后领先对手。/gu,
            '',
          )
          .replace(/后面仍有玩家可以下注，过牌不保证本轮无需再付筹码。/gu, '')
          .replace(
            /再遇下注时，要结合金额、人数和此前行动判断，不能只凭当前牌型自动跟注或弃牌。/gu,
            '',
          )
          .replace(/当前主要依靠.*?改善，不能只靠高牌判断这笔跟注。/gu, '')
          .replace(
            /综合当前牌力、补牌机会和对手可能的诈唬，跟注有继续依据，不能只用补成听牌的概率判断。/gu,
            '',
          ),
      ),
    );
  const target = parts.findLastIndex((p) => p.some((t) => /[。！？]/u.test(t)));
  if (target < 0) return coaching;
  const beforeDrawPayment = parts[target].findIndex((text) => /^取值也可能来自/u.test(text));
  const paying = accepted.filter((n) => n.topic === 'paying-range').flatMap((n) => n.parts);
  if (beforeDrawPayment >= 0 && paying.length) {
    parts[target].splice(beforeDrawPayment, 0, ...paying);
    parts[target].push(
      ...accepted.filter((n) => n.topic !== 'paying-range').flatMap((n) => n.parts),
    );
  } else parts[target].push(...accepted.flatMap((n) => n.parts));
  const paragraphs = parts.map((p) => p.join('')).filter(Boolean);
  return {
    ...coaching,
    paragraphParts: parts,
    paragraphs,
    explanation: paragraphs.join(''),
    strategyTopics: accepted.map((n) => n.topic),
  };
}
