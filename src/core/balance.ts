// Global balance knobs. Tune with `npx tsx scripts/balance-report.ts` (runs the real sim with the
// test bot) and keep tests/balance.test.ts green. Raw region/district numbers in data/ express
// *design intent*; these spreads compress them so stacked multipliers can't run away.
export const BAL = {
  /** effective demand = 1 + (raw - 1) * demandSpread */
  demandSpread: 0.35,
  /** effective district fit = 1 + (raw - 1) * fitSpread */
  fitSpread: 0.45,
  /** first upgrade costs upgradeK x the business price */
  upgradeK: 0.8,
  /** each further level costs this much more */
  upgradeGrowth: 1.18,
  /** income scales with costIndex^incomeElasticity: cheap regions earn less per sale too */
  incomeElasticity: 0.8,
  /** extra upkeep per player business beyond overheadFree, capped at overheadCap */
  overheadPerBiz: 0.004,
  overheadFree: 10,
  overheadCap: 0.25,
};
export const spread = (raw: number, s: number) => 1 + (raw - 1) * s;
