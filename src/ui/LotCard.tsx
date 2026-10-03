// Bottom card for the building you tapped: buy it, build on it, upgrade it, staff it, sell it.
import { useState } from 'preact/hooks';
import { useSession, Btn, Stat, Bar } from './kit';
import { Icon } from './icons';
import { BIZ } from '../core/data/businesses';
import { REGION } from '../core/data/regions';
import { getCity } from '../core/city';
import {
  allowedBiz, derived, demandMult, fitMult, landPrice, maxAffordable, milestoneMult, nextMilestone,
  npcAsk, projectIncome, rivalAsk, sellPrice, tillCap, upgradeCostN,
} from '../core/economy';
import { permitWait } from '../core/mechanics';
import { xf } from '../core/pitch';
import { buyNpc, buyRivalLot, buyVacant, expeditePermit, hireManager, managerCost, sellLot, upgradeLot, vacantPrice } from '../core/actions';
import { rivalDef } from '../core/rivals';
import { money, perSec, duration } from '../core/format';
import { MAX_LEVEL } from '../core/constants';
import { JUICE } from './juice';
import type { GameState, RegionId } from '../core/types';

const FOOT = { small: 'Small lot', medium: 'Medium lot', large: 'Large lot', tower: 'Tower plot' } as const;

/** Fit label from demand × district fit; the ≈ $/s is the sim's own formula for YOU on this lot
 *  (tax, upkeep, overhead, competition, laws, mechanic), not a raw base number (critic #4). */
function fitLabel(s: GameState, rid: RegionId, lotId: string, district: string, bizId: string): { label: string; tone: string; est: number } {
  const b = BIZ[bizId];
  const m = demandMult(rid, b.category) * fitMult(rid, district, b.category);
  return { label: m >= 1.12 ? 'Great fit' : m >= 0.97 ? 'Good fit' : 'Poor fit', tone: m >= 1.12 ? 'mint' : m >= 0.97 ? 'muted' : 'red', est: projectIncome(s, rid, lotId, bizId) };
}

export function LotCard() {
  const s = useSession();
  const st = s.state!;
  const id = s.selected.value;
  const [confirmSell, setConfirmSell] = useState<string | null>(null);
  if (!id) return null;
  const rid = st.currentRegion;
  const def = getCity(rid).lotById[id];
  const ls = st.regions[rid].lots[id];
  if (!def || !ls) return null;
  const R = REGION[rid];
  const district = R.districts.find((x) => x.id === def.district)?.name ?? def.district;
  const near = s.canDeal(id);
  const dist = Math.round(s.world.distanceToLot(id));
  const inc = derived(st).lots[rid][id];
  const close = () => s.select(null);

  const header = (title: string, badge: { text: string; color?: string }) => (
    <header class="lot-head">
      <div>
        <div class="lot-meta">{district} · {FOOT[def.footprint]}</div>
        <h3>{title}</h3>
      </div>
      <span class="owner-badge" style={badge.color ? { '--c': badge.color } as Record<string, string> : undefined}>{badge.text}</span>
      <button class="icon-btn" aria-label="Close" onClick={close}><Icon name="close" /></button>
    </header>
  );

  const goBar = !near && (
    <div class="go-bar">
      <span><Icon name="pin" size={16} /> {dist} m away — deals are done in person.</span>
      <Btn small kind="mint" testid="go-there" onClick={() => s.goTo(id)}>Go there</Btn>
    </div>
  );

  let body;
  if (def.civic) {
    const hall = def.civic === 'cityhall';
    body = (
      <>
        {header(hall ? R.government.seat : 'Customs House', { text: hall ? R.government.name : 'Border control' })}
        <p class="lot-blurb">{hall ? R.government.actionBlurb : 'Tariffs, inspections and paperwork. Ship cargo to other regions from here.'}</p>
        <Btn kind="gold" onClick={() => s.openSheet(hall ? 'politics' : 'trade')}>{hall ? 'Open Politics' : 'Open Trade'}</Btn>
      </>
    );
  } else if (ls.owner === 'vacant') {
    const opts = allowedBiz(rid, def);
    const land = landPrice(st, rid, def);
    body = (
      <>
        {header('Empty lot', { text: 'For sale', color: '#f2c14e' })}
        <div class="lot-stats"><Stat label="Land" value={money(land)} tone="gold" /><Stat label="Max tier" value={String(Math.max(...opts.map((b) => b.tier)))} /></div>
        {goBar}
        <div class="biz-list" data-testid="biz-list">
          {opts.map((b) => {
            const price = vacantPrice(st, rid, id, b.id);
            const f = fitLabel(st, rid, id, def.district, b.id);
            const wait = rid === 'redmesa' ? permitWait(st, b.id) : 0;
            const lic = R.licences?.[b.id];
            const afford = st.cash >= price;
            return (
              <button key={b.id} class={`biz-opt${afford && near ? '' : ' dim'}`} data-testid={`build-${b.id}`} disabled={!near}
                onClick={() => s.run((g) => buyVacant(g, rid, id, b.id), { sfx: 'buy', lot: id, shake: JUICE.shake.buy, pulse: 'grow' })}>
                <span class="bo-name">{b.name}<em class={`fit ${f.tone}`}>{f.label}</em></span>
                <span class="bo-blurb">{b.blurb}</span>
                <span class="bo-row"><b class="gold">{money(price)}</b><span class="mint" data-testid={`est-${b.id}`}>≈ {perSec(f.est)}</span>
                  {wait > 0 && <span class="red">permit ~{duration(wait)}</span>}
                  {lic && <span class="red" data-testid={`licence-${b.id}`}>{lic.name} {xf(lic.mult)}</span>}</span>
              </button>
            );
          })}
        </div>
      </>
    );
  } else if (ls.owner === 'npc' || (ls.owner !== 'player' && ls.owner !== 'civic')) {
    const isRival = ls.owner !== 'npc';
    const rd = isRival ? rivalDef(ls.owner) : null;
    const price = isRival ? rivalAsk(st, rid, id) : npcAsk(st, rid, id);
    body = (
      <>
        {header(BIZ[ls.biz!].name, rd ? { text: rd.name, color: rd.color } : { text: 'Local owner' })}
        <p class="lot-blurb">{rd ? `${rd.ceo}: “${rd.quote}”` : BIZ[ls.biz!].blurb}</p>
        <div class="lot-stats">
          <Stat label="Level" value={String(ls.level)} />
          <Stat label="For you" value={`≈ ${perSec(projectIncome(st, rid, id, ls.biz!, ls.level))}`} tone="mint" />
          <Stat label="Asking" value={money(price)} tone="gold" />
        </div>
        {goBar}
        <Btn kind="gold" testid="buy-lot" disabled={!near} onClick={() => s.run((g) => (isRival ? buyRivalLot(g, rid, id) : buyNpc(g, rid, id)), { sfx: 'buy', lot: id, shake: JUICE.shake.buy })}>
          {isRival ? 'Buy out' : 'Buy business'} · {money(price)}
        </Btn>
      </>
    );
  } else {
    const b = BIZ[ls.biz!];
    const cap = tillCap(inc?.net ?? 0);
    const c1 = upgradeCostN(st, rid, b, ls.level, 1);
    const c10 = upgradeCostN(st, rid, b, ls.level, Math.min(10, MAX_LEVEL - ls.level));
    const nMax = maxAffordable(st, rid, b, ls.level, st.cash);
    const ms = nextMilestone(ls.level);
    const permit = ls.permitUntil > st.t;
    const mc = managerCost(st, rid, id);
    const up = (n: number | 'max') => s.run((g) => upgradeLot(g, rid, id, n), {
      sfx: 'upgrade', lot: id, coins: 8,
      shake: ms && (n === 'max' ? ls.level + nMax : ls.level + (n as number)) >= ms ? JUICE.shake.upgradeMilestone : 0,
    });
    body = (
      <>
        {header(b.name, { text: 'Yours', color: '#f2c14e' })}
        <div class="lot-stats">
          <Stat label="Level" value={`${ls.level}`} />
          <Stat label="Income" value={inc?.active ? perSec(inc.net) : inc?.reason ?? '—'} tone={inc?.active ? 'mint' : 'red'} />
          <Stat label="Next ×" value={ms ? `L${ms} ×${milestoneMult(ms) / milestoneMult(ls.level)}` : 'Max'} tone="gold" />
        </div>
        {permit && (
          <div class="permit">
            <span><Icon name="warning" size={16} /> Awaiting permit · {duration(ls.permitUntil - st.t)}</span>
            <Btn small kind="danger" onClick={() => s.run((g) => expeditePermit(g, id), { sfx: 'cash' })}>Expedite (bribe)</Btn>
          </div>
        )}
        {!ls.manager ? (
          <div class="till">
            <div class="till-row"><span>Till</span><b class="gold">{money(ls.till)}</b><span class="muted">/ {money(cap)}</span></div>
            <Bar value={ls.till} max={Math.max(1, cap)} color="#f2c14e" />
            <div class="till-btns">
              <Btn small kind="gold" testid="collect" disabled={ls.till < 0.01 || !near} onClick={() => s.collectLot(id)}>Collect</Btn>
              <Btn small kind="ghost" testid="hire-manager" disabled={!near} onClick={() => s.run((g) => hireManager(g, rid, id), { sfx: 'buy' })}>
                <Icon name="manager" size={16} /> Manager · {money(mc)}
              </Btn>
            </div>
          </div>
        ) : (
          <div class="managed"><Icon name="manager" size={16} /> Managed — income banks automatically.</div>
        )}
        {goBar}
        <div class="up-btns">
          <Btn kind="mint" testid="upgrade-1" disabled={ls.level >= MAX_LEVEL} onClick={() => up(1)}><Icon name="up" size={16} /> +1 · {money(c1)}</Btn>
          <Btn kind="mint" testid="upgrade-10" disabled={ls.level >= MAX_LEVEL} onClick={() => up(10)}>+10 · {money(c10)}</Btn>
          <Btn kind="mint" testid="upgrade-max" disabled={nMax <= 0} onClick={() => up('max')}>Max{nMax > 0 ? ` +${nMax}` : ''}</Btn>
        </div>
        <div class="sell-row">
          {confirmSell === id ? (
            <>
              <span class="muted">Sell for {money(sellPrice(st, rid, id))}?</span>
              <Btn small kind="danger" onClick={() => { s.run((g) => sellLot(g, rid, id), { sfx: 'cash' }); setConfirmSell(null); s.select(null); }}>Confirm sale</Btn>
              <Btn small kind="ghost" onClick={() => setConfirmSell(null)}>Keep</Btn>
            </>
          ) : (
            <Btn small kind="ghost" onClick={() => setConfirmSell(id)}><Icon name="sell" size={14} /> Sell · {money(sellPrice(st, rid, id))}</Btn>
          )}
        </div>
      </>
    );
  }

  return <div class="lot-card" data-testid="lot-card" data-owner={ls.owner} onPointerDown={(e) => e.stopPropagation()}>{body}</div>;
}
