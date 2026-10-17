// Serializable in both browser and installed native WebViews.
export function readReviewTagGeometry(selector) {
  return [...document.querySelectorAll(`${selector} .review-status`)].map((tag) => {
    const style = getComputedStyle(tag);
    const range = document.createRange();
    range.selectNodeContents(tag);
    const lines = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)));
    const paddingTop = parseFloat(style.paddingTop);
    const paddingBottom = parseFloat(style.paddingBottom);
    return {
      text: tag.textContent,
      status: tag.className,
      height: tag.offsetHeight,
      naturalHeight: lines.size * parseFloat(style.lineHeight) + paddingTop + paddingBottom,
      lines: lines.size,
      paddingTop,
      paddingBottom,
    };
  });
}
