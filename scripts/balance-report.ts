// Pacing report: runs the REAL sim with the test bot in every region and prints net worth at
// checkpoints. Usage: npx tsx scripts/balance-report.ts [minutes=45] [seed=21]
import { newGame } from '../src/core/state';
import { REGIONS } from '../src/core/data/regions';
import { netWorth } from '../src/core/economy';
import { money } from '../src/core/format';
import { RANKS } from '../src/core/data/progression';
import { runBot } from '../tests/helpers/bot';

const minutes = Number(process.argv[2] ?? 45);
const seed = Number(process.argv[3] ?? 21);
const marks = [1, 5, 15, 30, 45, 60, 90, 120].filter((m) => m <= minutes);
console.log('region'.padEnd(11) + marks.map((m) => `${m}m`.padStart(9)).join('') + '   biz  rank');
for (const R of REGIONS) {
  const s = newGame(R.id, seed);
  let prev = 0;
  const cells: string[] = [];
  for (const m of marks) {
    runBot(s, (m - prev) * 60, { tapsPerSec: 4 });
    prev = m;
    cells.push(money(netWorth(s)).padStart(9));
  }
  console.log(R.id.padEnd(11) + cells.join('') + `   ${String(s.stats.bizBought).padStart(3)}  ${RANKS[s.stats.rankIndex].name}`);
}
