import { test, expect } from '@playwright/test';

// Compare two screenshots in the page: the tilted card's anti-aliased edges
// may differ by a few levels between composites, a changed rank glyph cannot.
async function pixelDifference(page, a, b) {
  return page.evaluate(
    async ([a, b]) => {
      const decode = async (data) => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const canvas = new OffscreenCanvas(image.width, image.height),
          context = canvas.getContext('2d');
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, image.width, image.height);
      };
      const [first, second] = await Promise.all([decode(a), decode(b)]);
      if (first.width !== second.width || first.height !== second.height)
        return { sized: false, changed: Infinity, largest: 255 };
      let changed = 0,
        largest = 0;
      for (let i = 0; i < first.data.length; i += 4) {
        let delta = 0;
        for (let k = 0; k < 3; k++)
          delta = Math.max(delta, Math.abs(first.data[i + k] - second.data[i + k]));
        if (delta) changed++;
        largest = Math.max(largest, delta);
      }
      return { sized: true, changed: changed / (first.width * first.height), largest };
    },
    [a.toString('base64'), b.toString('base64')],
  );
}

test('rank pixels remain stable after repeated scaled-table repaint and card reconstruction', async ({
  page,
}) => {
  await page.setViewportSize({ width: 412, height: 846 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  const scene = async () => {
    await page.evaluate(async () => {
      window.qa.stop();
      window.qa.scene('9s 8h', '3c Ad 9d', { count: 5 });
      window.dispatchEvent(new Event('resize'));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
  };
  await scene();
  const card = page.locator('#hero-cards > .playing-card').first();
  const before = await card.screenshot({ animations: 'disabled' });
  for (let i = 0; i < 6; i++) {
    await page.setViewportSize({ width: 390, height: 844 });
    await scene();
    await page.setViewportSize({ width: 412, height: 846 });
    await scene();
    const difference = await pixelDifference(
      page,
      before,
      await card.screenshot({ animations: 'disabled' }),
    );
    expect(difference.sized).toBe(true);
    expect(difference.largest).toBeLessThanOrEqual(12);
    expect(difference.changed).toBeLessThan(0.02);
  }
  await expect(page.locator('#hero-cards .card-rank')).toHaveCount(4);
  await expect(page.locator('#board .card-rank')).toHaveCount(6);
});

test('all rank outlines including 10 fit within full and small card faces', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  const result = await page.evaluate(async () => {
    const { renderCard } = await import('/src/ui/cards.js');
    const holder = document.createElement('div');
    holder.style.cssText =
      'position:fixed;inset:0;background:#0b1017;z-index:10000;display:flex;flex-wrap:wrap;align-content:flex-start;gap:4px';
    document.body.append(holder);
    const issues = [];
    for (let rank = 2; rank <= 14; rank++) {
      for (const small of [false, true]) {
        holder.innerHTML = renderCard({ rank, suit: 0, symbol: '♠' }, { small });
        const card = holder.firstElementChild;
        const frame = card.getBoundingClientRect();
        for (const path of card.querySelectorAll('.card-rank > path')) {
          const ink = path.getBoundingClientRect();
          if (
            ink.width <= 0 ||
            ink.height <= 0 ||
            ink.left < frame.left ||
            ink.top < frame.top ||
            ink.right > frame.right ||
            ink.bottom > frame.bottom
          )
            issues.push({ rank, small, ink: ink.toJSON(), frame: frame.toJSON() });
        }
      }
    }
    holder.remove();
    return issues;
  });
  expect(result).toEqual([]);
});
