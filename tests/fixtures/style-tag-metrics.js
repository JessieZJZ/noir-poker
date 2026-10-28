// Report the actual overflowing glyph/box measurements, not just a boolean.
export function styleTagFailures({ selector = '#seats .seat-style-label', count = 8 } = {}) {
  const labels = [...document.querySelectorAll(selector)];
  const failures = [];
  if (labels.length !== count) failures.push(`Expected ${count} style tags, got ${labels.length}`);
  for (const label of labels) {
    const style = getComputedStyle(label);
    if (
      label.textContent !== label.dataset.fullName ||
      style.whiteSpace !== 'nowrap' ||
      style.textOverflow === 'ellipsis' ||
      label.scrollWidth > label.clientWidth + 1 ||
      label.scrollHeight > label.clientHeight + 1
    )
      failures.push(
        `${document.documentElement.lang}: ${label.textContent}; expected=${label.dataset.fullName}; ` +
          `width=${label.scrollWidth}/${label.clientWidth}; height=${label.scrollHeight}/${label.clientHeight}; ` +
          `font=${style.font}; spacing=${style.letterSpacing}; white-space=${style.whiteSpace}; overflow=${style.textOverflow}`,
      );
  }
  return failures;
}
