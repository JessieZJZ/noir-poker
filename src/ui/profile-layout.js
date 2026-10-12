// A scrolled profile grid can start above or below the settings viewport.
// Recompute this relative offset in each renderer; font/border rounding from
// another renderer must not become a copied scroll-dependent position.
export function profileDetailBounds({ region, viewport, clientHeight }) {
  const height = Math.max(0, Math.min(region.height, clientHeight));
  const top = Math.max(viewport.top, Math.min(region.top, viewport.bottom - height));
  return { top: top - region.top, height };
}
