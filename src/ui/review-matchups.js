import { reviewCommentary } from '../review/matchups.js';
import { getLocale, localizeText } from '../i18n/index.js';

const esc = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

// Keep fact fragments separate for translation, then supply the spacing that
// Chinese sentence boundaries did not need in the original inline markup.
function inlineParts(parts, separator = '') {
  let previous = '';
  return parts
    .map((source, index) => {
      const text = localizeText(source);
      const boundary =
        separator && index
          ? separator
          : !getLocale().startsWith('zh') &&
              getLocale() !== 'ja' &&
              /[.!?]$/.test(previous) &&
              /^[\p{L}\p{N}]/u.test(text)
            ? ' '
            : '';
      if (text) previous = text;
      return boundary + `<span>${esc(text)}</span>`;
    })
    .join('');
}

export function renderReviewParagraphs(paragraphs, matchups, street, paragraphParts) {
  return reviewCommentary(paragraphs, matchups, street, paragraphParts)
    .map((part) => {
      const presentation = part.matchups;
      if (!presentation)
        return part.text === '复盘分析总结'
          ? `<h4 class="review-analysis-heading">${esc(part.text)}</h4>`
          : `<p>${part.parts ? inlineParts(part.parts) : esc(part.text)}</p>`;
      const separator = getLocale().startsWith('zh') ? '，' : getLocale() === 'ja' ? '、' : ', ';
      return `<div class="review-matchups" role="group" aria-label="${esc(presentation.title)}"><p><strong>${esc(presentation.title)}</strong></p><p class="review-board-summary">${inlineParts(presentation.boardParts, separator)}</p><p><strong>${esc(presentation.strengthTitle)}</strong></p><p class="review-matchup-hand">${inlineParts(presentation.strengthParts, separator)}</p>${presentation.groups.map((group) => `<div data-matchup-direction="${group.direction}"><p><strong>${esc(group.label)}</strong></p>${group.examples.length ? `<div class="review-matchup-examples">${group.examples.map((example) => `<p class="review-matchup-example" data-matchup-example="${esc(example.group)}"><span>${esc(example.text)}</span> <small>${esc(example.label)}</small></p>`).join('')}</div>` : `<p class="review-matchup-note">${esc(group.empty)}</p>`}</div>`).join('')}${presentation.rangeNotes.map((text) => `<p class="review-range-note">${esc(text)}</p>`).join('')}${presentation.nutsNote ? `<p class="review-matchup-nuts">${esc(presentation.nutsNote)}</p>` : ''}</div>`;
    })
    .join('');
}
