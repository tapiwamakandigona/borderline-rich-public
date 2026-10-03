// Politics: who runs this region, what the laws cost you, how to tilt the next election, and the
// region's signature lever (permits, hype money, offshore shelter, the union, the co-op).
import { useSession, Sheet, Btn, Bar } from '../kit';
import { Icon } from '../icons';
import { REGION } from '../../core/data/regions';
import { BIZ } from '../../core/data/businesses';
import { laws, costIndex } from '../../core/laws';
import { winChances, politicalAction, buyGuildSeat, guildSeatCost } from '../../core/politics';
import {
  bonusCost, buyInsurance, expeditePermit, insuranceCost, payUnionBonus, raiseVC, signWageDeal, toggleOffshore, vcAmount, wageDealCost,
} from '../../core/actions';
import {
  coopActive, ownsBiz, permitWait, strikeActive, COOP_BONUS, favour, FRIEND_STANDING, ENEMY_STANDING, FRIEND_TAX, ENEMY_TAX, FRIEND_CUSTOMS, ENEMY_CUSTOMS,
} from '../../core/mechanics';
import { money, pct, duration } from '../../core/format';
import type { GameState } from '../../core/types';

function Signature({ st }: { st: GameState }) {
  const s = useSession();
  const rid = st.currentRegion;
  const R = REGION[rid];
  const v = st.regions[rid].vars;
  let body;
  switch (rid) {
    case 'redmesa': {
      const pending = Object.entries(st.regions.redmesa.lots).filter(([, l]) => l.owner === 'player' && l.permitUntil > st.t);
      body = (
        <>
          <p class="muted">New businesses wait ~{duration(permitWait(st))} for a permit (street stalls ~{duration(permitWait(st, 'cart'))}, Fuel Pumps none). Standing 50+ with the Governor's Circle halves it, −25 or worse makes it 1.5× longer; an envelope skips it (+8 heat).</p>
          <p>Fuel index <b class="gold">×{st.regions.redmesa.vars.fuelIndex.toFixed(2)}</b> — energy businesses ride it.</p>
          {pending.map(([id, l]) => (
            <div key={id} class="permit"><span>{BIZ[l.biz!].name} · {duration(l.permitUntil - st.t)}</span>
              <Btn small kind="danger" onClick={() => s.run((g) => expeditePermit(g, id), { sfx: 'cash' })}>Expedite</Btn></div>
          ))}
        </>
      );
      break;
    }
    case 'neonvale':
      body = (
        <>
          <p>Hype <b class="gold">×{v.hype.toFixed(2)}</b> — tech income swings with it. Antitrust watches big players.</p>
          {v.vcShare > 0
            ? <p class="muted">VCs take {pct(v.vcShare)} of Neon Vale income for {duration(Math.max(0, v.vcUntil - st.t))}.</p>
            : <Btn kind="gold" onClick={() => s.run(raiseVC, { sfx: 'cash' })}>Raise a VC round · +{money(vcAmount(st))}</Btn>}
        </>
      );
      break;
    case 'verano': {
      const hasOffice = ownsBiz(st, 'verano', 'offshore');
      body = (
        <>
          <p class="muted">Offshore shelter cuts income tax outside Verano by 55 % while it is on — and heat never cools.</p>
          <div class="btn-row">
            <Btn kind={v.offshore ? 'danger' : 'ghost'} small disabled={!hasOffice && !v.offshore} onClick={() => s.run((g) => toggleOffshore(g, !v.offshore))}>
              {v.offshore ? 'Turn shelter OFF' : hasOffice ? 'Turn shelter ON' : 'Needs an Offshore Office'}
            </Btn>
            <Btn kind="ghost" small onClick={() => s.run(buyInsurance, { sfx: 'buy' })}>
              {v.insuredUntil > st.t ? `Insured · ${duration(v.insuredUntil - st.t)}` : `Hurricane cover · ${money(insuranceCost(st))}`}
            </Btn>
          </div>
        </>
      );
      break;
    }
    case 'ironhold':
      body = (
        <>
          <div class="kv"><span>Union mood</span><b class={v.unionMood < 35 ? 'red' : 'mint'}>{Math.round(v.unionMood)}</b></div>
          <Bar value={v.unionMood} color={v.unionMood < 35 ? '#ff5a5f' : '#3ddc97'} />
          {strikeActive(st) && <p class="warn">STRIKE — industry and logistics earn nothing for {duration(v.strikeUntil - st.t)}.</p>}
          <div class="btn-row">
            <Btn kind="mint" small testid="wage-deal" onClick={() => s.run(signWageDeal, { sfx: 'buy' })}>Wage deal +10 % wages · {money(wageDealCost(st))}</Btn>
            <Btn kind="ghost" small onClick={() => s.run(payUnionBonus, { sfx: 'cash' })}>Pay a bonus · {money(bonusCost(st))}</Btn>
          </div>
        </>
      );
      break;
    case 'amberfield':
      body = <p>{coopActive(st) ? <>Co-op bonus <b class="mint">×{COOP_BONUS}</b> on your farms is active.</> : 'Own three or more farms here to join the growers\' co-op (+15 % farm income).'} Harvest pays ×1.6, winter ×0.5 — upgrade before the harvest.</p>;
      break;
    default:
      body = <p class="muted">Imports land tariff-free. Transship other regions' cargo through Solenne to pay 40 % of their import tariff — customs may call it origin fraud.</p>;
  }
  return (
    <div class="card sig">
      <div class="card-h"><Icon name="bolt" /> <b>{R.signature.name}</b></div>
      {body}
    </div>
  );
}

export function PoliticsSheet() {
  const s = useSession();
  const st = s.state!;
  const rid = st.currentRegion;
  const R = REGION[rid];
  const rs = st.regions[rid];
  const L = laws(st, rid);
  const odds = winChances(st, rid);
  const ruling = R.factions.find((f) => f.id === rs.ruling);
  const min = Math.round(100 * costIndex(rid));
  const council = R.government.kind === 'council';

  return (
    <Sheet id="politics" title={R.government.name} sub={`${R.name} · next ${council ? 'council session' : 'election'} in ${duration(Math.max(0, rs.nextElectionAt - st.t))}`}>
      <div class="laws">
        <div><span>Income tax</span><b>{pct(L.incomeTax)}</b></div>
        <div><span>Import tariff</span><b>{pct(L.importTariff)}</b></div>
        <div><span>Export tariff</span><b>{pct(L.exportTariff)}</b></div>
        <div><span>Regulation</span><b>{pct(L.regulation)}</b></div>
        <div><span>Enforcement</span><b>{pct(L.enforcement)}</b></div>
        <div><span>Min. wage</span><b>×{L.minWage.toFixed(2)}</b></div>
      </div>
      {ruling && <p class="ruling" style={{ '--c': ruling.color } as Record<string, string>}>In power: <b>{ruling.name}</b> — {ruling.leader}</p>}
      {ruling && (() => {
        const f = favour(st, rid);
        return (
          <p class={`favour ${f ?? 'neutral'}`} data-testid="favour">
            {f === 'friend' ? `You're a friend of the party in power: income tax ×${FRIEND_TAX}, customs checks ×${FRIEND_CUSTOMS} here.`
              : f === 'enemy' ? `The party in power has it in for you: income tax ×${ENEMY_TAX}, customs checks ×${ENEMY_CUSTOMS} here.`
              : `Standing ${FRIEND_STANDING}+ with the party in power: income tax ×${FRIEND_TAX} here. ${ENEMY_STANDING} or worse: ×${ENEMY_TAX}.`}
          </p>
        );
      })()}
      <Signature st={st} />
      <h4 class="sub-h">{council ? 'Council blocs' : 'Factions'}</h4>
      {R.factions.map((f) => {
        const fs = rs.factions[f.id];
        return (
          <div key={f.id} class="faction" style={{ '--c': f.color } as Record<string, string>}>
            <div class="f-head"><b>{f.name}</b><span class="muted">{f.leader}</span><span class="f-odds">{pct(odds[f.id] ?? 0)} to win</span></div>
            <p class="muted small">{f.blurb}</p>
            <Bar value={fs.popularity} max={1} color={f.color} label="Popularity" />
            <div class="f-foot">
              <span class="small">Standing {Math.round(fs.standing)}{council ? ` · ${fs.seats} seat${fs.seats === 1 ? '' : 's'}` : ` · given ${money(fs.donated)}`}</span>
              {council ? (
                <Btn small kind="gold" testid={`seat-${f.id}`} onClick={() => s.run((g) => buyGuildSeat(g, f.id), { sfx: 'buy' })}>Seat · {money(guildSeatCost(st))}</Btn>
              ) : (
                <div class="btn-row">
                  {[1, 10, 100].map((k) => (
                    <Btn key={k} small kind={k === 1 ? 'ghost' : 'gold'} testid={k === 1 ? `donate-${f.id}` : undefined} onClick={() => s.run((g) => politicalAction(g, rid, f.id, min * k), { sfx: 'cash' })}>
                      {money(min * k)}
                    </Btn>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
      <p class="muted small">{R.government.actionLabel}: {R.government.actionBlurb}{R.government.actionHeat > 0 ? ` Each gift adds ${R.government.actionHeat} heat.` : ''}</p>
    </Sheet>
  );
}
