// F13: every region renders its own city within the headless budget; screenshots (day + night)
// land in e2e/__shots__/ for human review.
import { test, expect } from '@playwright/test';
import { REGIONS, freshStart, watchErrors, type BR } from './helpers';

test.use({ deviceScaleFactor: 2 });

test('region select shows a live 3D flyover', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  await expect(page.locator('.region-card')).toHaveCount(6);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'e2e/__shots__/select.png' });
  expect(errors).toEqual([]);
});

// Small phones (iPhone SE 375x667, 360-wide Androids): every card's Start button must be fully on screen
// without scrolling — toBeInViewport honours the rail's clipping. Playwright's click() auto-scrolls, so the
// visibility assertion comes first; then a start from the last card proves the flow works end to end.
test('region select fits small phones', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  const cards = page.locator('.region-card');
  await expect(cards).toHaveCount(6);
  const oneLine = await page.locator('.brand h1').evaluate((h) => h.getBoundingClientRect().height < 1.5 * parseFloat(getComputedStyle(h).fontSize));
  expect(oneLine).toBe(true);
  // Real touch drags (CDP touch events honour touch-action/overscroll): vertical scrolls the card, and a
  // horizontal swipe on a card must still chain to the rail and change region.
  const cdp = await page.context().newCDPSession(page);
  const drag = async (x: number, y: number, dx: number, dy: number) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 12; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * i) / 12, y: y + (dy * i) / 12 }] });
      await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const box = (await cards.first().boundingBox())!;
  const cx = Math.round(box.x + box.width / 2), cy = Math.round(box.y + box.height / 2);
  await drag(cx, cy + 60, 0, -180);
  await expect.poll(() => cards.first().evaluate((c) => c.scrollTop)).toBeGreaterThan(40);
  await drag(cx + 80, cy, -200, 0);
  await expect(page.locator('.region-card.on')).toHaveAttribute('data-region', 'redmesa');
  for (let i = 0; i < 6; i++) {
    await page.locator('.dots .dot').nth(i).click();
    await expect(cards.nth(i).locator('[data-testid^="start-"]')).toBeInViewport({ ratio: 1 });
  }
  await page.screenshot({ path: 'e2e/__shots__/select-small.png' });
  await cards.nth(5).locator('[data-testid^="start-"]').click();
  await page.locator('[data-testid="hustle"]').waitFor();
  expect(errors).toEqual([]);
});

for (const region of REGIONS) {
  test(`${region}: city renders within budget, day and night`, async ({ page }) => {
    const errors = watchErrors(page);
    await freshStart(page, region);
    await page.waitForTimeout(2500);
    const day = await page.evaluate(() => (window as unknown as { __BR: BR }).__BR.stats());
    console.log(`[stats] ${region}: day ${day.calls} calls / ${day.triangles} tris`);
    expect(day.calls).toBeGreaterThan(10);
    expect(day.calls).toBeLessThanOrEqual(220);
    expect(day.triangles).toBeLessThanOrEqual(500_000);
    await page.screenshot({ path: `e2e/__shots__/world-${region}-day.png` });
    // One lot changing must not rebuild the whole city (critic #5): exactly one chunk, far cheaper.
    const probe = await page.evaluate(() => (window as unknown as { __BR: BR }).__BR.rebuildProbe()) as { chunksRebuilt: number; ms: number; fullMs: number; chunks: number };
    console.log(`[rebuild] ${region}: 1 lot -> ${probe.chunksRebuilt}/${probe.chunks} chunks in ${probe.ms.toFixed(1)} ms (full city ${probe.fullMs.toFixed(1)} ms)`);
    expect(probe.chunks).toBeGreaterThanOrEqual(4);
    expect(probe.chunksRebuilt).toBe(1);
    expect(probe.ms).toBeLessThan(probe.fullMs * 0.6);
    // Zoomed-out establishing view
    await page.evaluate(() => { const r = (window as unknown as { __BR: BR }).__BR.session.world.rig; r.dist = 110; r.polar = 0.9; });
    await page.waitForTimeout(1200);
    const wide = await page.evaluate(() => (window as unknown as { __BR: BR }).__BR.stats());
    console.log(`[stats] ${region}: wide ${wide.calls} calls / ${wide.triangles} tris`);
    expect(wide.calls).toBeLessThanOrEqual(220);
    expect(wide.triangles).toBeLessThanOrEqual(500_000);
    await page.screenshot({ path: `e2e/__shots__/world-${region}-wide.png` });
    // Night: advance the sim past dusk (day length 240 s)
    await page.evaluate(() => (window as unknown as { __BR: BR }).__BR.advance(190));
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `e2e/__shots__/world-${region}-night.png` });
    expect(errors).toEqual([]);
  });
}
