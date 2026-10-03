// F14: real touch input via CDP — joystick moves the player, drag orbits, pinch zooms, tap opens a card.
import { test, expect } from '@playwright/test';
import { freshStart, swipe, tapAt, touch, watchErrors, type BR } from './helpers';

const hook = 'window.__BR';

test('touch controls drive the player and camera', async ({ page }) => {
  const errors = watchErrors(page);
  await freshStart(page, 'solenne');
  await page.waitForTimeout(800);
  const cdp = await page.context().newCDPSession(page);

  // Joystick: thumb down on the left half, push up (= forward) and hold.
  const p0 = await page.evaluate(`${hook}.playerPos()`) as { x: number; z: number };
  await swipe(page, cdp, { x: 90, y: 560 }, { x: 90, y: 480 }, 8, 1500);
  const p1 = await page.evaluate(`${hook}.playerPos()`) as { x: number; z: number };
  expect(Math.hypot(p1.x - p0.x, p1.z - p0.z)).toBeGreaterThan(3);

  // Drag on the right half orbits the camera.
  const c0 = await page.evaluate(`${hook}.camera()`) as { azimuth: number; dist: number };
  await swipe(page, cdp, { x: 300, y: 420 }, { x: 210, y: 430 }, 10);
  const c1 = await page.evaluate(`${hook}.camera()`) as { azimuth: number; dist: number };
  expect(Math.abs(c1.azimuth - c0.azimuth)).toBeGreaterThan(0.2);

  // Pinch (two fingers spreading) zooms in.
  await touch(cdp, 'touchStart', [{ x: 240, y: 400 }, { x: 320, y: 400 }]);
  for (let i = 1; i <= 10; i++) {
    await touch(cdp, 'touchMove', [{ x: 240 - i * 6, y: 400 - i * 4 }, { x: 320 + i * 6, y: 400 + i * 4 }]);
    await page.waitForTimeout(16);
  }
  await touch(cdp, 'touchEnd', []);
  const c2 = await page.evaluate(`${hook}.camera()`) as { dist: number };
  expect(c2.dist).toBeLessThan(c1.dist * 0.85);

  // Tap a building: stand next to a local business and tap its centre on screen.
  const lot = await page.evaluate(`${hook}.findLot('npc')`) as string;
  await page.evaluate((id) => (window as unknown as { __BR: BR }).__BR.teleport(id), lot);
  await page.waitForTimeout(1500);
  const sp = await page.evaluate((id) => (window as unknown as { __BR: BR }).__BR.lotScreen(id), lot) as { x: number; y: number; on: boolean };
  expect(sp.on).toBe(true);
  await tapAt(page, cdp, sp);
  await expect(page.locator('[data-testid="lot-card"]')).toBeVisible();
  await page.screenshot({ path: 'e2e/__shots__/controls-lotcard.png' });
  expect(errors).toEqual([]);
});
