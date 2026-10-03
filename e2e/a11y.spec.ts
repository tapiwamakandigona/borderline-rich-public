// Android reads the WebView through its accessibility tree: TalkBack, Switch Access, and the CI
// device smoke (uiautomator). uiautomator answers only once the page has been still for 1 s, and
// every text change in the DOM is an accessibility event. So a HUD with nothing happening must not
// rewrite itself several times a second. The minute clock did: a game minute passes every 1/6 s.
import { test, expect } from '@playwright/test';
import { freshStart, watchErrors } from './helpers';

test('an idle HUD holds still long enough for Android accessibility', async ({ page }) => {
  const errors = watchErrors(page);
  await freshStart(page, 'solenne');
  await page.evaluate(() => (window as unknown as { __BR: { quiet(): void } }).__BR.quiet());
  await page.waitForTimeout(1500); // start-up toasts and the first camera move
  const { t0, t1, stamps } = await page.evaluate(async () => {
    const stamps: number[] = [];
    const mo = new MutationObserver(() => stamps.push(performance.now()));
    mo.observe(document.body, { subtree: true, childList: true, characterData: true });
    const t0 = performance.now();
    await new Promise((r) => setTimeout(r, 12_000));
    mo.disconnect();
    return { t0, t1: performance.now(), stamps };
  });
  const pts = [t0, ...stamps, t1];
  let still = 0;
  for (let i = 1; i < pts.length; i++) still = Math.max(still, pts[i] - pts[i - 1]);
  console.log(`[a11y] ${stamps.length} DOM text/child changes in ${((t1 - t0) / 1000).toFixed(1)} s; longest still stretch ${(still / 1000).toFixed(2)} s`);
  expect(still).toBeGreaterThanOrEqual(2000);
  expect(errors).toEqual([]);
});
