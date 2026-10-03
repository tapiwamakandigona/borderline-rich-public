// Trade: buy local goods, ship them across borders, and decide how honest the paperwork is.
import { useState } from 'preact/hooks';
import { FREE_PORT_CERT } from '../../core/mechanics';
import { useSession, Sheet, Btn, Bar } from '../kit';
import { Icon } from '../icons';
import { GOODS, GOOD } from '../../core/data/businesses';
import { REGION, REGION_IDS } from '../../core/data/regions';
import { CARGO_CAP } from '../../core/data/progression';
import { METHODS, bestRoute, methodsFor, quote, ship } from '../../core/trade';
import { laws } from '../../core/laws';
import { money, pct, duration } from '../../core/format';
import type { GoodId, RegionId, ShipMethod } from '../../core/types';

export function TradeSheet() {
  const s = useSession();
  const st = s.state!;
  const from = st.currentRegion;
  const tab = s.sheetTab.value ?? 'ship';
  const best = bestRoute(st);
  const [good, setGood] = useState<GoodId>(best?.good ?? REGION[from].produces[0]);
  const [to, setTo] = useState<RegionId>(best?.to ?? REGION_IDS.find((r) => r !== from)!);
  const cap = CARGO_CAP[st.cargoLevel];
  const [qty, setQty] = useState(Math.min(cap, 10));
  const [picked, setMethod] = useState<ShipMethod>('legal');
  const methods = methodsFor(from, to);
  // A method that doesn't apply to this route (transship from/to Solenne) falls back to legal.
  const method: ShipMethod = methods.some((m) => m.id === picked) ? picked : 'legal';
  const [bribe, setBribe] = useState(false);
  const q = quote(st, good, Math.min(qty, cap), to, method, bribe);
  const profit = q.expectedRevenue - q.upfront;
  const L = laws(st, from);

  return (
    <Sheet id="trade" title="Trade & Tariffs" sub={`From ${REGION[from].name} · import ${pct(L.importTariff)} · export ${pct(L.exportTariff)}`}
      tabs={[{ id: 'ship', label: 'Ship cargo' }, { id: 'market', label: 'Markets' }, { id: 'transit', label: `In transit (${st.shipments.length})` }]}
      tab={tab} onTab={(t) => { s.sheetTab.value = t; }}>
      {tab === 'ship' && (
        <>
          {best && best.margin > 0 && (
            <button class="hint" onClick={() => { setGood(best.good); setTo(best.to); }}>
              <Icon name="bolt" size={16} /> Hot route: {GOOD[best.good].name} → {REGION[best.to].city} · {pct(best.margin)} margin (legal)
            </button>
          )}
          <h4 class="sub-h">Goods</h4>
          <div class="chips">
            {GOODS.map((g) => (
              <button key={g.id} class={`chip${g.id === good ? ' on' : ''}`} onClick={() => setGood(g.id)}>
                {g.name}<small>{money(st.regions[from].market[g.id])}</small>
              </button>
            ))}
          </div>
          <h4 class="sub-h">Destination</h4>
          <div class="chips">
            {REGION_IDS.filter((r) => r !== from).map((r) => (
              <button key={r} class={`chip${r === to ? ' on' : ''}`} onClick={() => setTo(r)}>
                {REGION[r].city}<small>{money(st.regions[r].market[good])}</small>
              </button>
            ))}
          </div>
          <h4 class="sub-h">Quantity · {Math.min(qty, cap)} / {cap}</h4>
          <input class="slider" type="range" min={1} max={cap} value={Math.min(qty, cap)} onInput={(e) => setQty(Number((e.target as HTMLInputElement).value))} />
          <h4 class="sub-h">Paperwork</h4>
          <div class="methods">
            {methods.map((m) => (
              <button key={m.id} data-testid={`method-${m.id}`} class={`method${m.id === method ? ' on' : ''}${m.id === 'smuggle' || m.id === 'undervalue' ? ' shady' : ''}`} onClick={() => setMethod(m.id)}>
                <b>{m.name}</b><span>{m.blurb}</span>
              </button>
            ))}
          </div>
          {method !== 'legal' && (
            <label class="toggle">
              <input type="checkbox" checked={bribe} onChange={(e) => setBribe((e.target as HTMLInputElement).checked)} />
              <span>Grease the inspector (6 % of cargo value, cuts risk in corrupt ports)</span>
            </label>
          )}
          <div class="quote" data-testid="quote">
            <div><span>Goods</span><b>{money(q.value)}</b></div>
            <div><span>Export tariff</span><b>{money(q.exportTariff)}</b></div>
            <div><span>Import tariff{from === 'solenne' && method === 'legal' ? ` (free-port certificate ×${FREE_PORT_CERT})` : ''}</span><b>{money(q.importTariff)}</b></div>
            <div><span>Freight</span><b>{money(q.fee)}</b></div>
            {q.bribe > 0 && <div><span>Bribe</span><b>{money(q.bribe)}</b></div>}
            <div class="total"><span>Pay now</span><b class="gold">{money(q.upfront)}</b></div>
            <div><span>Sells for</span><b class="mint">{money(q.expectedRevenue)}</b></div>
            <div class="total"><span>Profit if clean</span><b class={profit >= 0 ? 'mint' : 'red'}>{money(profit, { sign: true })}</b></div>
            <div><span>Arrives in</span><b>{duration(q.seconds)}</b></div>
            <div><span>Customs risk</span><b class={q.risk > 0.3 ? 'red' : q.risk > 0.1 ? 'gold' : 'mint'}>{pct(q.risk)}</b></div>
          </div>
          {!q.ok && <p class="warn">{q.msg}</p>}
          <Btn kind="gold" testid="ship" disabled={!q.ok} onClick={() => s.run((g) => ship(g, good, Math.min(qty, cap), to, method, bribe), { sfx: 'cash' })}>
            Ship {Math.min(qty, cap)} {GOOD[good].name} → {REGION[to].city}
          </Btn>
        </>
      )}
      {tab === 'market' && (
        <table class="market">
          <thead><tr><th>Good</th>{REGION_IDS.map((r) => <th key={r} class={r === from ? 'here' : ''}>{REGION[r].city.split(' ').pop()}</th>)}</tr></thead>
          <tbody>
            {GOODS.map((g) => {
              const prices = REGION_IDS.map((r) => st.regions[r].market[g.id]);
              const lo = Math.min(...prices), hi = Math.max(...prices);
              return (
                <tr key={g.id}>
                  <td>{g.name}</td>
                  {REGION_IDS.map((r, i) => <td key={r} class={`${r === from ? 'here ' : ''}${prices[i] === lo ? 'mint' : prices[i] === hi ? 'gold' : ''}`}>{money(prices[i])}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {tab === 'transit' && (
        <ul class="list">
          {st.shipments.length === 0 && <p class="empty">Nothing on the road. Ship cargo to move money across borders.</p>}
          {st.shipments.map((sh) => (
            <li key={sh.id} class="row col">
              <div class="row-main"><b>{sh.qty} {GOOD[sh.good].name} → {REGION[sh.to].city}</b><span class="muted">{METHODS.find((m) => m.id === sh.method)!.name} · risk {pct(sh.risk)} · {duration(Math.max(0, sh.arriveAt - st.t))}</span></div>
              <Bar value={st.t - sh.departAt} max={Math.max(1, sh.arriveAt - sh.departAt)} color="#3ddc97" />
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
