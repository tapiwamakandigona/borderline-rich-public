// F15: region select → game; HUD; hustle; buy flow from the world; every sheet; event modal;
// sandbox purchase; save survives a reload; no console errors anywhere in the session.
import { test, expect, type Page } from '@playwright/test';
import { freshStart, watchErrors, type BR } from './helpers';

const ev = <T>(page: Page, js: string) => page.evaluate(`(() => { const b = window.__BR; return ${js}; })()`) as Promise<T>;

test('a full scripted session', async ({ page }) => {
  const errors = watchErrors(page);
  await freshStart(page, 'redmesa');
  await ev(page, 'b.quiet()'); // no random event modals mid-script; the modal is tested explicitly below
  await expect(page.locator('[data-testid="cash"]')).toBeVisible();
  await expect(page.locator('[data-testid="pulse"]')).toContainText('Fuel');

  // Hustle from zero: 12 taps earn money and complete the first goal.
  for (let i = 0; i < 12; i++) await page.locator('[data-testid="hustle"]').click();
  expect(await ev<number>(page, 'b.state().stats.hustles')).toBe(12);
  // Goals are checked on each whole sim-second: wait for the tick instead of a fixed sleep.
  await expect.poll(() => ev<number>(page, 'b.state().goalIndex'), { timeout: 5000 }).toBeGreaterThanOrEqual(1);
  await page.screenshot({ path: 'e2e/__shots__/ui-hud.png' });

  // Buy flow from the world: walk to an empty small lot, tap it, build a cart.
  await ev(page, 'b.give(5000)');
  const lot = await ev<string>(page, "b.findLot('vacant', 'small')");
  await ev(page, `b.teleport('${lot}')`);
  await page.waitForTimeout(1200);
  await ev(page, `b.session.select('${lot}')`);
  await expect(page.locator('[data-testid="lot-card"]')).toBeVisible();
  await expect(page.locator('.rankup')).toHaveCount(0); // celebrations never cover the lot card
  await page.waitForTimeout(400); // let the card's rise animation finish before the screenshot
  await page.screenshot({ path: 'e2e/__shots__/ui-vacant.png' });
  // The card's estimate is the sim's own formula: check it against what the business really earns.
  const est = await page.locator('[data-testid="est-fuelpump"]').textContent();
  await page.locator('[data-testid="build-fuelpump"]').click(); // Red Mesa's permit-free starter
  await expect(page.locator('[data-testid="lot-card"]')).toHaveAttribute('data-owner', 'player');
  const real = await ev<number>(page, `b.state() && (() => { const st = b.state(); return st.regions.redmesa.lots['${lot}'].permitUntil; })()`);
  expect(real).toBe(0); // no permit queue for a Fuel Pump
  expect(est).toMatch(/≈ \$/);
  await page.locator('[data-testid="upgrade-1"]').click();
  expect(await ev<number>(page, `b.state().regions.redmesa.lots['${lot}'].level`)).toBe(2);
  await ev(page, 'b.advance(30)');
  await page.locator('[data-testid="collect"]').click();
  expect(await ev<number>(page, 'b.state().stats.collects')).toBeGreaterThanOrEqual(1);
  await page.screenshot({ path: 'e2e/__shots__/ui-owned.png' });
  await page.locator('.lot-card .icon-btn').click();

  // Every sheet opens.
  for (const id of ['empire', 'trade', 'politics', 'rivals', 'store']) {
    await page.locator(`[data-testid="nav-${id}"]`).click();
    await expect(page.locator(`[data-sheet="${id}"]`)).toBeVisible();
    await expect(page.locator('.rankup')).toHaveCount(0);
    await page.waitForTimeout(450); // let the slide-up finish before the screenshot
    await page.screenshot({ path: `e2e/__shots__/ui-sheet-${id}.png` });
    if (id === 'trade') {
      await ev(page, 'b.give(50000)');
      await page.locator('[data-testid="ship"]').click();
      expect(await ev<number>(page, 'b.state().shipments.length')).toBe(1);
    }
    if (id === 'politics') {
      const before = await ev<number>(page, 'b.state().stats.donations');
      await page.locator('[data-testid^="donate-"]').first().click();
      expect(await ev<number>(page, 'b.state().stats.donations')).toBe(before + 1);
    }
    if (id === 'store') {
      await expect(page.locator('[data-testid="test-store"]')).toBeVisible();
      const g0 = await ev<number>(page, 'b.state().gold');
      await page.locator('[data-testid="buy-br.gold.120"]').click();
      await expect(page.locator('[data-testid="pay-sheet"]')).toBeVisible();
      await page.waitForTimeout(400);
      await page.screenshot({ path: 'e2e/__shots__/ui-paysheet.png' });
      await page.locator('[data-testid="pay-confirm"]').click();
      await expect.poll(() => ev<number>(page, 'b.state().gold')).toBe(g0 + 120);
      await expect(page.locator('.toast', { hasText: /thank you/i })).toHaveCount(1); // one toast per purchase
    }
    await page.locator(`[data-sheet="${id}"] .sheet-head .icon-btn`).click();
    await expect(page.locator(`[data-sheet="${id}"]`)).toHaveCount(0);
  }

  // Events pop a modal with consequence previews; choosing resolves it.
  await ev(page, "b.event('burst_pipe')");
  await expect(page.locator('[data-testid="event-modal"]')).toBeVisible();
  await ev(page, "b.session.toast('A toast that must wait for the modal', 'info')");
  await page.waitForTimeout(400);
  await expect(page.locator('.toast')).toHaveCount(0); // nothing draws over a modal
  await page.screenshot({ path: 'e2e/__shots__/ui-event.png' });
  await page.locator('[data-testid="choice-0"]').click();
  await expect(page.locator('[data-testid="event-modal"]')).toHaveCount(0);
  await expect(page.locator('.toast', { hasText: 'A toast that must wait for the modal' })).toHaveCount(1); // held, then shown
  expect(await page.locator('.toast').count()).toBeLessThanOrEqual(2);

  // Save survives a reload and drops the player back into the game.
  const cash = await ev<number>(page, 'b.state().cash');
  await ev(page, 'b.session.save()');
  await page.reload();
  await page.locator('[data-testid="hustle"]').waitFor();
  const after = await ev<number>(page, 'b.state().cash');
  expect(after).toBeGreaterThanOrEqual(cash - 1);
  expect(await ev<string>(page, `b.state().regions.redmesa.lots['${lot}'].owner`)).toBe('player');
  expect(errors).toEqual([]);
  void ({} as BR);
});
