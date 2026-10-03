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

for (const region of REGIONS) {
  test(`${region}: city renders within budget, day and night`, async ({ page }) => {
    const errors = watchErrors(page);
    await freshStart(page, region);
    await page.waitForTimeout(2500);
    const day = await page.evaluate(() => (window as unknown as { __BR: BR }).__BR.stats());
    expect(day.calls).toBeGreaterThan(10);
    expect(day.calls).toBeLessThanOrEqual(220);
    expect(day.triangles).toBeLessThanOrEqual(500_000);
    await page.screenshot({ path: `e2e/__shots__/world-${region}-day.png` });
    // Zoomed-out establishing view
    await page.evaluate(() => { const r = (window as unknown as { __BR: BR }).__BR.session.world.rig; r.dist = 110; r.polar = 0.9; });
    await page.waitForTimeout(1200);
    const wide = await page.evaluate(() => (window as unknown as { __BR: BR }).__BR.stats());
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
