// Region identity + difficulty report: runs the REAL sim with the balance bot in every region and
// prints (a) what the empire looks like after 20 min — the region's signature category should be a
// big share of it — and (b) 45-min net worth in purchasing-power terms (net worth / cost index),
// which the difficulty stars must predict. Usage: npx tsx scripts/region-report.ts [seeds=21,7,99]
import { newGame } from '../src/core/state';
import { REGIONS } from '../src/core/data/regions';
import { BIZ } from '../src/core/data/businesses';
import { derived, netWorth } from '../src/core/economy';
import { money } from '../src/core/format';
import { SIGNATURE_CATEGORY } from '../src/core/mechanics';
import { runBot } from '../tests/helpers/bot';

const seeds = (process.argv[2] ?? '21,7,99').split(',').map(Number);
const rows: { id: string; stars: number; pp: number[] }[] = [];
for (const R of REGIONS) {
  const sig = SIGNATURE_CATEGORY[R.id];
  const pp: number[] = [];
  const lines: string[] = [];
  for (const seed of seeds) {
    const s = newGame(R.id, seed);
    const log = runBot(s, 20 * 60, { tapsPerSec: 4 });
    const owned: Record<string, number> = {};
    for (const l of Object.values(s.regions[R.id].lots)) if (l.owner === 'player' && l.biz) owned[l.biz] = (owned[l.biz] ?? 0) + 1;
    const inc = derived(s, true).lots[R.id];
    let sigInc = 0, tot = 0;
    for (const [id, l] of Object.entries(s.regions[R.id].lots)) {
      if (l.owner !== 'player' || !l.biz) continue;
      const v = inc[id]?.gross ?? 0;
      tot += v;
      if (BIZ[l.biz].category === sig) sigInc += v;
    }
    const nw20 = netWorth(s);
    runBot(s, 25 * 60, { tapsPerSec: 4 }, log);
    const v = netWorth(s) / R.economy.costIndex;
    pp.push(v);
    const top = Object.entries(owned).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([b, n]) => `${n} ${b}`).join(', ');
    lines.push(`  s${String(seed).padEnd(3)} 20m nw ${money(nw20).padStart(7)} | ${sig} ${Math.round((100 * sigInc) / Math.max(1e-9, tot))}% of income | ${top}\n        45m pp ${money(v)}  first biz ${log.firstBizAt?.toFixed(0)}s`);
  }
  rows.push({ id: R.id, stars: R.difficulty, pp });
  console.log(`${R.id} (${'★'.repeat(R.difficulty)}) signature=${sig}\n${lines.join('\n')}`);
}
console.log('\nDifficulty check — median 45-min purchasing-power net worth:');
const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
for (const r of [...rows].sort((a, b) => med(b.pp) - med(a.pp))) console.log(`  ${'★'.repeat(r.stars).padEnd(4)} ${r.id.padEnd(10)} ${money(med(r.pp))}`);
