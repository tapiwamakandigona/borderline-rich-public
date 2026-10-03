// F14: real touch input via CDP — joystick moves the player, drag orbits, pinch zooms, tap opens a card.
// Also guards the HUD: a joystick drag must never move the UI (critic finding #1: the joystick div
// had become the Preact root, so every drag translated the whole HUD off-screen).
import { test, expect, type Page } from '@playwright/test';
import { freshStart, swipe, tapAt, touch, watchErrors, type BR } from './helpers';

const hook = 'window.__BR';
const VIEW = { w: 390, h: 844 };

async function box(page: Page, sel: string) {
  const b = await page.locator(sel).first().boundingBox({ timeout: 5000 });
  expect(b, `${sel} has a box`).not.toBeNull();
  return b!;
}
function inView(b: { x: number; y: number; width: number; height: number }, what: string) {
  expect(b.x, `${what} left edge on screen`).toBeGreaterThanOrEqual(0);
  expect(b.y, `${what} top edge on screen`).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width, `${what} right edge on screen`).toBeLessThanOrEqual(VIEW.w + 0.5);
  expect(b.y + b.height, `${what} bottom edge on screen`).toBeLessThanOrEqual(VIEW.h + 0.5);
}

test('touch controls drive the player and camera', async ({ page }) => {
  const errors = watchErrors(page);
  await freshStart(page, 'solenne');
  await page.evaluate(`${hook}.quiet()`);
  await page.waitForTimeout(800);
  const cdp = await page.context().newCDPSession(page);
  const cash0 = await box(page, '[data-testid="cash"]');
  const hustle0 = await box(page, '[data-testid="hustle"]');
  const nav0 = await box(page, '[data-testid="nav-empire"]');

  // Joystick: thumb down on the left half, push up (= forward) and hold.
  const p0 = await page.evaluate(`${hook}.playerPos()`) as { x: number; z: number };
  const thumb = { x: 90, y: 560 };
  await touch(cdp, 'touchStart', [thumb]);
  for (let i = 1; i <= 8; i++) { await touch(cdp, 'touchMove', [{ x: thumb.x, y: thumb.y - i * 10 }]); await page.waitForTimeout(16); }
  // While held, the joystick ring is drawn centred under the thumb...
  const ring = await box(page, '.joy-base.on');
  expect(Math.abs(ring.x + ring.width / 2 - thumb.x)).toBeLessThan(4);
  expect(Math.abs(ring.y + ring.height / 2 - thumb.y)).toBeLessThan(4);
  // ...and the HUD has not moved.
  expect(await box(page, '[data-testid="cash"]')).toEqual(cash0);
  const until = Date.now() + 1500;
  while (Date.now() < until) { await touch(cdp, 'touchMove', [{ x: thumb.x, y: thumb.y - 80 }]); await page.waitForTimeout(50); }
  await touch(cdp, 'touchEnd', []);
  const p1 = await page.evaluate(`${hook}.playerPos()`) as { x: number; z: number };
  expect(Math.hypot(p1.x - p0.x, p1.z - p0.z)).toBeGreaterThan(3);
  // After the drag every HUD widget is exactly where it was.
  expect(await box(page, '[data-testid="cash"]')).toEqual(cash0);
  expect(await box(page, '[data-testid="hustle"]')).toEqual(hustle0);
  expect(await box(page, '[data-testid="nav-empire"]')).toEqual(nav0);
  for (const sel of ['[data-testid="cash"]', '[data-testid="hustle"]', '[data-testid="nav-empire"]', '[data-testid="nav-store"]']) inView(await box(page, sel), sel);
  await page.screenshot({ path: 'e2e/__shots__/controls-after-joystick.png' });

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
  expect(await box(page, '[data-testid="cash"]')).toEqual(cash0);

  // Tap a building: stand next to a local business and tap its centre on screen.
  const lot = await page.evaluate(`${hook}.findLot('npc')`) as string;
  await page.evaluate((id) => (window as unknown as { __BR: BR }).__BR.teleport(id), lot);
  const screen = () => page.evaluate((id) => (window as unknown as { __BR: BR }).__BR.lotScreen(id), lot) as Promise<{ x: number; y: number; on: boolean }>;
  await expect.poll(async () => (await screen()).on, { timeout: 15_000 }).toBe(true);
  await page.waitForTimeout(300);
  // Simulate a janky device/CI runner: every frame blocks the main thread for 400 ms. A quick tap
  // must still count as a tap (gesture timing comes from event timestamps, not handler time).
  const target = await screen();
  await page.evaluate(() => {
    const w = window as unknown as { __jank?: boolean };
    w.__jank = true;
    const jank = () => { if (!w.__jank) return; const t = performance.now(); while (performance.now() - t < 400) { /* busy */ } requestAnimationFrame(jank); };
    requestAnimationFrame(jank);
  });
  await tapAt(page, cdp, target);
  await page.evaluate(() => { (window as unknown as { __jank?: boolean }).__jank = false; });
  await expect(page.locator('[data-testid="lot-card"]')).toBeVisible();
  inView(await box(page, '[data-testid="lot-card"]'), 'lot card');
  await page.screenshot({ path: 'e2e/__shots__/controls-lotcard.png' });
  expect(errors).toEqual([]);
});
