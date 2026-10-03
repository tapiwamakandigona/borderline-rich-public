// Rivals: the continent's Rich List, the companies fighting you in this region (and how to swallow
// them), and the world map for opening offices across the border.
import { useSession, Sheet, Btn } from '../kit';
import { Icon, Stars } from '../icons';
import { REGION, REGIONS } from '../../core/data/regions';
import { RANKS, RANK_EXPAND } from '../../core/data/progression';
import { richList, acquireCost, canAcquire, acquireRival } from '../../core/rivals';
import { rivalNetWorth } from '../../core/economy';
import { unlockRegion, travel } from '../../core/actions';
import { money, duration } from '../../core/format';

const PERSONA: Record<string, string> = { aggressive: 'Aggressive', expansionist: 'Expansionist', cautious: 'Cautious', shady: 'Shady' };

export function RivalsSheet() {
  const s = useSession();
  const st = s.state!;
  const tab = s.sheetTab.value ?? 'richlist';
  const list = richList(st);
  const R = REGION[st.currentRegion];

  return (
    <Sheet id="rivals" title="Rivals & Rich List" sub={`You are #${list.findIndex((e) => e.isPlayer) + 1} of ${list.length}`}
      tabs={[{ id: 'richlist', label: 'Rich List' }, { id: 'rivals', label: `${R.city} rivals` }, { id: 'world', label: 'World' }, { id: 'news', label: 'News' }]}
      tab={tab} onTab={(t) => { s.sheetTab.value = t; }}>
      {tab === 'richlist' && (
        <ol class="rich">
          {list.map((e, i) => (
            <li key={e.id} class={e.isPlayer ? 'me' : ''} style={{ '--c': e.color } as Record<string, string>}>
              <span class="pos">{i + 1}</span>
              <span class="who"><b>{e.isPlayer ? 'You' : e.name}</b><small>{e.isPlayer ? RANKS[st.stats.rankIndex].name : `${e.who} · ${REGION[e.regionId!].city}`}</small></span>
              <span class="nw">{money(e.netWorth)}</span>
            </li>
          ))}
        </ol>
      )}
      {tab === 'rivals' && (
        <div class="cards">
          {R.rivals.map((rd) => {
            const rs = st.rivals[rd.id];
            if (!rs) return null;
            const can = canAcquire(st, rd.id);
            const lots = Object.values(st.regions[rs.regionId].lots).filter((l) => l.owner === rd.id).length;
            return (
              <div key={rd.id} class="card rival" style={{ '--c': rd.color } as Record<string, string>}>
                <div class="card-h"><i class="flag" /> <b>{rd.name}</b><span class="muted">{PERSONA[rd.personality]}</span></div>
                <p class="muted small">{rd.ceo}: “{rd.quote}”</p>
                {rs.acquired ? <p class="mint">Acquired. Their properties fly your flag.</p> : (
                  <>
                    <div class="kv"><span>Net worth</span><b>{money(rivalNetWorth(st, rd.id))}</b></div>
                    <div class="kv"><span>Properties here</span><b>{lots}</b></div>
                    {rs.lastAction && <div class="kv"><span>Latest move</span><b class="small">{rs.lastAction}</b></div>}
                    <Btn kind={can.ok ? 'gold' : 'ghost'} disabled={!can.ok} testid={`acquire-${rd.id}`} onClick={() => s.run((g) => acquireRival(g, rd.id), { sfx: 'rankup', shake: 0.6 })}>
                      Hostile takeover · {money(acquireCost(st, rd.id))}
                    </Btn>
                    {!can.ok && <p class="muted small">{can.msg}</p>}
                  </>
                )}
              </div>
            );
          })}
          <p class="muted small">Tip: tap any building flying a rival flag to buy it out from under them.</p>
        </div>
      )}
      {tab === 'news' && (
        <ul class="list news">
          {st.notices.length === 0 && <p class="empty">Quiet day on the wires.</p>}
          {[...st.notices].reverse().map((n) => (
            <li key={n.id} class={`row news-${n.kind}`}>
              <div class="row-main"><span class="news-t">{n.text}</span></div>
              <span class="muted small">{duration(Math.max(0, st.t - n.t))} ago</span>
            </li>
          ))}
        </ul>
      )}
      {tab === 'world' && (
        <>
          {st.stats.rankIndex < RANK_EXPAND && <p class="hint static"><Icon name="lock" size={16} /> Offices abroad unlock at {RANKS[RANK_EXPAND].name} ({money(RANKS[RANK_EXPAND].min)} net worth).</p>}
          <ul class="list">
            {REGIONS.map((r) => {
              const rs = st.regions[r.id];
              const here = st.currentRegion === r.id;
              return (
                <li key={r.id} class="row">
                  <div class="row-main">
                    <b>{r.name} {r.id === st.homeRegion && <small class="tag">HOME</small>}</b>
                    <span class="muted"><Stars n={r.difficulty} /> {r.signature.name} · {r.government.name}</span>
                  </div>
                  {here ? <span class="tag on">You are here</span> : rs.unlocked ? (
                    <Btn small kind="mint" testid={`travel-${r.id}`} onClick={() => { if (s.run((g) => travel(g, r.id), { sfx: 'whoosh' })) s.openSheet(null); }}><Icon name="plane" size={14} /> Travel</Btn>
                  ) : (
                    <Btn small kind="gold" testid={`unlock-${r.id}`} onClick={() => s.run((g) => unlockRegion(g, r.id), { sfx: 'rankup' })}><Icon name="lock" size={14} /> {money(r.unlockCost)}</Btn>
                  )}
                </li>
              );
            })}
          </ul>
          <p class="muted small">Each region keeps its own laws, rivals and politics. Your businesses keep earning while you are away.</p>
        </>
      )}
    </Sheet>
  );
}

