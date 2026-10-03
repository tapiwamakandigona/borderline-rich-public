import { newGame } from '../src/core/state';
import { netWorth } from '../src/core/economy';
import { money } from '../src/core/format';
import { runBot } from '../tests/helpers/bot';
import { REGIONS } from '../src/core/data/regions';
for (const R of REGIONS) {
  const out: string[] = [];
  for (const seed of [21, 7, 99]) { const s = newGame(R.id, seed); runBot(s, 2700, { tapsPerSec: 4 }); out.push(money(netWorth(s)).padStart(8)); }
  console.log(R.id.padEnd(11), out.join(' '));
}
