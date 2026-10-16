import { reviewCommentary } from '../review/matchups.js';

const esc = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

export function renderReviewParagraphs(paragraphs, matchups, street) {
  return reviewCommentary(paragraphs, matchups, street)
    .map((part) => {
      const presentation = part.matchups;
      if (!presentation)
        return part.text === '复盘分析总结'
          ? `<h4 class="review-analysis-heading">${esc(part.text)}</h4>`
          : `<p>${esc(part.text)}</p>`;
      return `<div class="review-matchups" role="group" aria-label="${esc(presentation.title)}"><p><strong>${esc(presentation.title)}</strong></p><p class="review-matchup-hand">${presentation.summaryParts.map((text) => `<span>${esc(text)}</span>`).join('；')}</p>${presentation.groups.map((group) => `<div data-matchup-direction="${group.direction}"><p><strong>${esc(group.label)}</strong></p>${group.examples.length ? '' : `<p class="review-matchup-note">${esc(group.empty)}</p>`}${group.examples.map((example) => `<p class="review-matchup-example" data-matchup-example="${esc(example.group)}"><span>${esc(example.text)}</span> <small>${esc(example.label)}</small></p>`).join('')}</div>`).join('')}${presentation.rangeNotes.map((text) => `<p class="review-range-note">${esc(text)}</p>`).join('')}${presentation.nutsNote ? `<p class="review-matchup-nuts">${esc(presentation.nutsNote)}</p>` : ''}</div>`;
    })
    .join('');
}
