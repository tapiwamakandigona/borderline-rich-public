// Empire: every business you own, your hustle and staff upgrades, and the garage.
import { useSession, Sheet, Btn, Stat } from '../kit';
import { Icon } from '../icons';
import { BIZ } from '../../core/data/businesses';
import { REGION } from '../../core/data/regions';
import { VEHICLES, PAINTS, CARGO_CAP, CARGO_UPGRADE, SHIP_SLOT_COST, MAX_SHIP_SLOTS, HUSTLE_MAX, RANKS, RANK_BROKER, BROKER_COST } from '../../core/data/progression';
import { derived, empireOverhead, playerLots, tillCap } from '../../core/economy';
import {
  accountantCost, buyAccountant, buyBroker, applyPaint, buyShipSlot, buyVehicle, hustleCost, hustlePerTap, upgradeCargo, upgradeHustle,
} from '../../core/actions';
import { money, perSec, pct } from '../../core/format';

export function EmpireSheet() {
  const s = useSession();
  const st = s.state!;
  const tab = s.sheetTab.value ?? 'biz';
  const d = derived(st);
  const mine = playerLots(st);
  const setTab = (t: string) => { s.sheetTab.value = t; };

  return (
    <Sheet id="empire" title="Your Empire" sub={`${mine.length} businesses · ${perSec(d.player)}`}
      tabs={[{ id: 'biz', label: 'Businesses' }, { id: 'hustle', label: 'Upgrades' }, { id: 'garage', label: 'Garage' }]} tab={tab} onTab={setTab}>
      {tab === 'biz' && (
        <>
          <div class="lot-stats">
            <Stat label="Income" value={perSec(d.player)} tone="mint" />
            <Stat label="Overhead" value={pct(empireOverhead(mine.length), 1)} tone={mine.length > 10 ? 'red' : 'muted'} />
            <Stat label="Regions" value={String(Object.values(st.regions).filter((r) => r.unlocked).length)} />
          </div>
          {mine.length === 0 && <p class="empty">No businesses yet. Hustle for cash, then tap a lot with a gold <b>$</b> marker.</p>}
          <ul class="list">
            {mine.sort((a, b) => (d.lots[b.regionId][b.lotId]?.net ?? 0) - (d.lots[a.regionId][a.lotId]?.net ?? 0)).map(({ regionId, lotId, ls }) => {
              const inc = d.lots[regionId][lotId];
              const here = regionId === st.currentRegion;
              return (
                <li key={regionId + lotId} class="row" onClick={() => { if (here) s.select(lotId); else s.toast(`That one is in ${REGION[regionId].name}. Travel there from Rivals → World.`); }}>
                  <div class="row-main">
                    <b>{BIZ[ls.biz!].name}</b>
                    <span class="muted">{REGION[regionId].city} · L{ls.level}{ls.manager ? ' · managed' : ''}</span>
                  </div>
                  <div class="row-side">
                    <span class={inc?.active ? 'mint' : 'red'}>{inc?.active ? perSec(inc.net) : inc?.reason ?? '—'}</span>
                    {!ls.manager && <span class="gold small">{money(ls.till)} / {money(tillCap(inc?.net ?? 0))}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {tab === 'hustle' && (
        <div class="cards">
          <div class="card">
            <div class="card-h"><Icon name="hand" /> <b>Hustle · {REGION[st.currentRegion].hustle.upgradeName}</b></div>
            <p class="muted">Level {st.hustle.level}/{HUSTLE_MAX} · {money(hustlePerTap(st))} per tap. Tap fast to build a combo (up to ×2).</p>
            <Btn kind="gold" testid="upgrade-hustle" disabled={st.hustle.level >= HUSTLE_MAX} onClick={() => s.run(upgradeHustle, { sfx: 'upgrade' })}>
              {st.hustle.level >= HUSTLE_MAX ? 'Maxed' : `Upgrade · ${money(hustleCost(st))}`}
            </Btn>
          </div>
          <div class="card">
            <div class="card-h"><Icon name="collect" /> <b>Accountant</b></div>
            <p class="muted">Adds a Collect-All button: empty every till in every region with one tap.</p>
            <Btn kind="gold" disabled={st.accountant} onClick={() => s.run(buyAccountant, { sfx: 'buy' })}>{st.accountant ? 'Hired' : `Hire · ${money(accountantCost(st))}`}</Btn>
          </div>
          <div class="card">
            <div class="card-h"><Icon name="pin" /> <b>Property Broker</b></div>
            <p class="muted">Buy, build and upgrade anywhere in the city without walking there. Works for a {RANKS[RANK_BROKER].name} or above.</p>
            <Btn kind="gold" disabled={st.broker} onClick={() => s.run(buyBroker, { sfx: 'buy' })}>{st.broker ? 'Hired' : `Hire · ${money(BROKER_COST)}`}</Btn>
          </div>
          <div class="card">
            <div class="card-h"><Icon name="trade" /> <b>Freight fleet</b></div>
            <p class="muted">Carries {CARGO_CAP[st.cargoLevel].toLocaleString('en-US')} units per shipment · {st.shipSlots}/{MAX_SHIP_SLOTS} shipments at once.</p>
            <div class="btn-row">
              <Btn kind="mint" small disabled={CARGO_UPGRADE[st.cargoLevel] === undefined} onClick={() => s.run(upgradeCargo, { sfx: 'upgrade' })}>
                {CARGO_UPGRADE[st.cargoLevel] === undefined ? 'Fleet maxed' : `Bigger trucks · ${money(CARGO_UPGRADE[st.cargoLevel])}`}
              </Btn>
              <Btn kind="mint" small disabled={st.shipSlots >= MAX_SHIP_SLOTS} onClick={() => s.run(buyShipSlot, { sfx: 'upgrade' })}>
                {st.shipSlots >= MAX_SHIP_SLOTS ? 'Slots maxed' : `+1 slot · ${money(SHIP_SLOT_COST[st.shipSlots - 1])}`}
              </Btn>
            </div>
          </div>
        </div>
      )}
      {tab === 'garage' && (
        <>
          <ul class="list">
            {VEHICLES.map((v) => {
              const owned = st.vehiclesOwned.includes(v.id);
              const using = st.vehicle === v.id;
              return (
                <li key={v.id} class="row">
                  <div class="row-main"><b><Icon name={v.flies ? 'plane' : 'car'} size={16} /> {v.name}</b><span class="muted">{v.speed} m/s{v.flies ? ' · flies over the city' : ''}</span></div>
                  <Btn small kind={owned ? 'ghost' : 'gold'} testid={`vehicle-${v.id}`} disabled={using} onClick={() => s.run((g) => buyVehicle(g, v.id), { sfx: owned ? 'tap' : 'buy' })}>
                    {using ? 'Riding' : owned ? 'Use' : money(v.cost)}
                  </Btn>
                </li>
              );
            })}
          </ul>
          <h4 class="sub-h">Paint jobs</h4>
          <div class="paints">
            {PAINTS.map((p) => (
              <button key={p.id} class={`paint${st.paint === p.id ? ' on' : ''}`} style={{ '--c': p.color } as Record<string, string>}
                disabled={st.paint === p.id}
                onClick={() => (p.starterOnly && !st.entitlements.starterPack ? s.openSheet('store') : s.run((g) => applyPaint(g, p.id), { sfx: 'buy' }))}>
                <i />
                <span>{p.name}</span>
                <small>{p.starterOnly ? (st.entitlements.starterPack ? 'Owned' : 'Starter Pack') : `${p.gold} gold`}</small>
              </button>
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}
