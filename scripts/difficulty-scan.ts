// Difficulty tuning: one region, many seeds → purchasing-power net worth (net worth / cost index)
// after N minutes, plus the geometric mean. Run all regions in parallel:
//   for r in amberfield verano solenne redmesa ironhold neonvale; do npx tsx scripts/difficulty-scan.ts $r 21,7,99,3,5,11,42,77 45 & done; wait
// tests/difficulty.test.ts enforces the star ordering (3 seeds, 30 min).
import { newGame } from '../src/core/state';
import { REGION } from '../src/core/data/regions';
import { netWorth } from '../src/core/economy';
import { runBot } from '../tests/helpers/bot';
import type { RegionId } from '../src/core/types';
const id = process.argv[2] as RegionId;
const seeds = (process.argv[3] ?? '21,7,99,3').split(',').map(Number);
const mins = Number(process.argv[4] ?? 45);
const out: number[] = [];
for (const seed of seeds) { const s = newGame(id, seed); runBot(s, mins * 60, { tapsPerSec: 4 }); out.push(netWorth(s) / REGION[id].economy.costIndex); }
const geo = Math.exp(out.reduce((a, v) => a + Math.log(v), 0) / out.length);
console.log(JSON.stringify({ id, stars: REGION[id].difficulty, geo: Math.round(geo), runs: out.map((v) => Math.round(v)) }));
