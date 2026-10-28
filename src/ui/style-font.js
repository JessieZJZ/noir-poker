// Letter spacing stays fixed when font size changes, so it must not be scaled
// with the glyphs. The caller remeasures after fitting to account for font
// hinting and fractional grid tracks in the current browser.
export function styleFontSize(font, textWidth, available, spacing = 0) {
  if (!(font > 0) || !(textWidth > 0) || !(available > 0)) return font;
  if (textWidth <= available) return font;
  const scale = Math.max(0, available - spacing) / Math.max(1, textWidth - spacing);
  return Math.floor(font * Math.min(1, scale) * 100) / 100;
}
