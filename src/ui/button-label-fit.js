// Fit fixed control rows to their translated text without clipping words or
// changing the table's dock height. Rich profile/review cards keep their own layout.
const controls =
  '.action-dock button, .header-actions button:not(#rules-button), .dialog-actions button, ' +
  '.win-rate-actions button, .win-rate-picker-actions button';

function textBounds(button) {
  const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT),
    rects = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const style = getComputedStyle(node.parentElement);
    if (
      !node.textContent.trim() ||
      style.visibility === 'hidden' ||
      parseFloat(style.fontSize) === 0
    )
      continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const rect of range.getClientRects())
      if (rect.width > 0 && rect.height > 0) rects.push(rect);
  }
  return rects;
}

function fits(button) {
  const box = button.getBoundingClientRect(),
    rects = textBounds(button),
    rows = [];
  for (const rect of rects.sort((a, b) => a.top - b.top)) {
    if (
      rect.left < box.left - 0.75 ||
      rect.right > box.right + 0.75 ||
      rect.top < box.top - 0.75 ||
      rect.bottom > box.bottom + 0.75
    )
      return false;
    const row = rows.find(
      (r) => Math.min(r.bottom, rect.bottom) - Math.max(r.top, rect.top) > rect.height * 0.3,
    );
    if (row) {
      row.top = Math.min(row.top, rect.top);
      row.bottom = Math.max(row.bottom, rect.bottom);
    } else rows.push({ top: rect.top, bottom: rect.bottom });
  }
  return (
    rows.length <= 2 &&
    button.scrollWidth <= button.clientWidth + 1 &&
    button.scrollHeight <= button.clientHeight + 1
  );
}

export function prepareButtonLabels(root = document) {
  let frame = 0;
  const fit = () => {
    frame = 0;
    for (const button of root.querySelectorAll(controls)) {
      if (!button.getClientRects().length) continue;
      delete button.dataset.labelFit;
      button.style.removeProperty('--button-label-font-size');
      if (fits(button)) continue;
      const style = getComputedStyle(button),
        base = parseFloat(
          button.classList.contains('has-mobile-label')
            ? getComputedStyle(button, '::after').fontSize
            : style.fontSize,
        );
      if (!Number.isFinite(base) || base <= 10) continue;
      button.dataset.labelFit = 'true';
      for (let size = base - 0.5; size >= 10; size -= 0.5) {
        button.style.setProperty('--button-label-font-size', `${size}px`);
        if (fits(button)) break;
      }
    }
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(fit);
  };
  const mutation = new MutationObserver(schedule),
    resize = new ResizeObserver(schedule),
    containers = root.querySelectorAll(
      '.action-dock, .header-actions, .dialog-actions, .win-rate-actions, .win-rate-picker-actions',
    );
  for (const container of containers) {
    mutation.observe(container, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['hidden', 'class'],
    });
    resize.observe(container);
  }
  root.addEventListener('noir:locale-changed', schedule);
  document.fonts?.addEventListener('loadingdone', schedule);
  window.addEventListener('resize', schedule);
  fit();
  return () => {
    if (frame) cancelAnimationFrame(frame);
    mutation.disconnect();
    resize.disconnect();
    root.removeEventListener('noir:locale-changed', schedule);
    document.fonts?.removeEventListener('loadingdone', schedule);
    window.removeEventListener('resize', schedule);
  };
}
