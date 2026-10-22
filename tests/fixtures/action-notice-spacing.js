// Run inside the Web page / installed WebView. Include the slider thumb's
// visible overhang when the desktop amount label is visually hidden.
export function readActionNoticeSpacing() {
  const dock = document.querySelector('.action-dock');
  const rect = (selector) => dock.querySelector(selector).getBoundingClientRect();
  const notice = rect('.decision-copy');
  const rankings = rect('#hand-rankings-button');
  const rail = rect('.turn-line');
  const label = rect('.bet-controls label');
  const slider = rect('#bet-slider');
  const contentTop = label.height > 1 ? label.top : slider.top - (15 - slider.height) / 2;
  return {
    topGap: Math.min(notice.top, rankings.top) - rail.bottom,
    controlGap: contentTop - Math.max(notice.bottom, rankings.bottom),
  };
}
