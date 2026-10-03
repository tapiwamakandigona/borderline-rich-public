import type { Page, CDPSession } from '@playwright/test';

export const REGIONS = ['solenne', 'redmesa', 'neonvale', 'amberfield', 'verano', 'ironhold'] as const;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BR = any;

/** Collect page errors and console errors for the "no console errors" checks. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  return errors;
}

/** Fresh game in a region via the real region-select UI. */
export async function freshStart(page: Page, region: string): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as { __BR?: unknown }).__BR);
  const card = page.locator(`.region-card[data-region="${region}"]`);
  await card.scrollIntoViewIfNeeded();
  await page.locator(`[data-testid="start-${region}"]`).click();
  await page.locator('[data-testid="hustle"]').waitFor();
}

type Pt = { x: number; y: number };
/** Real touch input through the Chrome DevTools Protocol (generates touch + pointer events). */
export async function touch(cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', pts: Pt[]): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : pts.map((p, i) => ({ x: p.x, y: p.y, id: i + 1 })) });
}

export async function swipe(page: Page, cdp: CDPSession, from: Pt, to: Pt, steps = 10, holdMs = 0): Promise<void> {
  await touch(cdp, 'touchStart', [from]);
  for (let i = 1; i <= steps; i++) {
    await touch(cdp, 'touchMove', [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }]);
    await page.waitForTimeout(16);
  }
  if (holdMs) {
    const until = Date.now() + holdMs;
    while (Date.now() < until) { await touch(cdp, 'touchMove', [to]); await page.waitForTimeout(50); }
  }
  await touch(cdp, 'touchEnd', []);
}

export async function tapAt(page: Page, cdp: CDPSession, p: Pt): Promise<void> {
  await touch(cdp, 'touchStart', [p]);
  await page.waitForTimeout(40);
  await touch(cdp, 'touchEnd', []);
}
