export function nativePoint(target, viewport, frame) {
  const values = [
    target.x,
    target.y,
    viewport.width,
    viewport.height,
    frame.x,
    frame.y,
    frame.width,
    frame.height,
  ];
  if (
    !values.every(Number.isFinite) ||
    viewport.width <= 0 ||
    viewport.height <= 0 ||
    frame.width <= 0 ||
    frame.height <= 0
  )
    throw Error('Native touch requires finite nonempty viewport bounds');
  if (target.x < 0 || target.y < 0 || target.x >= viewport.width || target.y >= viewport.height)
    throw Error('Native touch target is outside the visible WebView');
  const scale = frame.width / viewport.width;
  if (Math.abs(frame.height / viewport.height - scale) > scale * 0.02)
    throw Error('Native WebView and content viewport do not share the same aspect ratio');
  return { x: Math.round(frame.x + target.x * scale), y: Math.round(frame.y + target.y * scale) };
}
