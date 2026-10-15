// Viewport coordinates only, shared by DOM/WebView and native WXML tooltips.
export function nameTooltipPosition(anchor, size, viewport) {
  const inset = 12;
  const width = Math.min(size.width, Math.max(1, viewport.width - inset * 2));
  const left = Math.max(
    inset,
    Math.min(viewport.width - width - inset, anchor.left + anchor.width / 2 - width / 2),
  );
  const minimumTop = (viewport.top || 0) + inset;
  const maximumBottom = viewport.height - (viewport.bottom || 0) - inset;
  const above = anchor.top - size.height - 8;
  const placement = above >= minimumTop ? 'above' : 'below';
  const top = Math.max(
    minimumTop,
    Math.min(
      maximumBottom - size.height,
      placement === 'above' ? above : anchor.top + anchor.height + 8,
    ),
  );
  return {
    left,
    top,
    placement,
    arrow: Math.max(12, Math.min(width - 12, anchor.left + anchor.width / 2 - left)),
  };
}
