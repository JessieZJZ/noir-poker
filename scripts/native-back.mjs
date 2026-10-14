export function nativeBackPage(value = 'game') {
  if (value !== 'game' && value !== 'privacy')
    throw new RangeError('Native Back expectedPage must be game or privacy');
  return value;
}

// This function is serialized into the installed WebView. Keep it independent
// of module bindings so the driver checks the actual destination document.
export function nativePageReady(expectedPage = 'game') {
  if (expectedPage === 'game') return Boolean(window.noir?.getState());
  if (expectedPage !== 'privacy')
    throw new RangeError('Native Back expectedPage must be game or privacy');
  const heading = document.querySelector('article:not([hidden]) h1'),
    link = document.querySelector('article:not([hidden]) a[href="./"]'),
    title = heading?.textContent.trim();
  return Boolean(
    document.readyState !== 'loading' &&
    window.location.pathname.endsWith('/app-privacy.html') &&
    title &&
    document.title.trim() === title &&
    document.querySelector('#policy-language') &&
    heading.getClientRects().length &&
    link?.textContent.trim() &&
    link.getAttribute('href') === './' &&
    link.getClientRects().length,
  );
}
