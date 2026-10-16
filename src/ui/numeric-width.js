// Hosts measure the rendered font and pass its actual width. Only horizontal
// overflow is fitted; the displayed value and vertical type size stay intact.
export function numericWidthScale(width, available) {
  if (!Number.isFinite(width) || !Number.isFinite(available) || width <= 0 || available <= 0)
    return 1;
  return width > available ? available / width : 1;
}

export function numericColumnWidth({ profileWidth, padding, avatar, gap = 4, border = 1 }) {
  return Math.max(0, profileWidth - padding * 2 - border * 2 - avatar - gap - 0.25);
}
