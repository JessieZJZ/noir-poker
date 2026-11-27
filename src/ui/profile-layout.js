// A scrolled profile grid can start above or below the settings viewport.
// Recompute this relative offset in each renderer; font/border rounding from
// another renderer must not become a copied scroll-dependent position.
//
// The introduction covers the visible part of the choices. To fit on screen
// when it opens it may reach past their top or bottom; `opened` is that
// opening offset (the default). Once the settings scroll on past the choices,
// it goes with them instead of staying over the rest of the page.
export function profileDetailBounds({ region, viewport, clientHeight, opened }) {
  const height = Math.max(0, Math.min(region.height, clientHeight));
  const visible =
    Math.max(viewport.top, Math.min(region.top, viewport.bottom - height)) - region.top;
  const start = opened ?? visible;
  const top = Math.min(
    Math.max(visible, Math.min(0, start)),
    Math.max(region.height - height, start),
  );
  return { top, height };
}
