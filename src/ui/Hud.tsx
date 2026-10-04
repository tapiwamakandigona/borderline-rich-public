// In-game HUD: money, income, rank, heat/rep, clock + region pulse, goal, hustle and the nav bar.
import { useRef, useState } from 'preact/hooks';
import { useSession, CountUp } from './kit';
import { Icon } from './icons';
import { derived, netWorth } from '../core/economy';
import { money, perSec, duration } from '../core/format';
import { RANKS, goalsFor } from '../core/data/progression';
import { REGION } from '../core/data/regions';
import { DAY } from '../core/constants';
import { SEASONS, SEASON_MULT, seasonIndex, highSeason, TOURISM_HIGH, TOURISM_LOW, strikeActive, PORT_MAX_SHIPS, portMult, portShipments } from '../core/mechanics';
import { comboMult, hustlePerTap, collectAll } from '../core/actions';
import { JUICE } from './juice';
import type { GameState } from '../core/types';
import type { SheetId } from '../app/session';

/** The HUD clock moves in 15-minute steps (every 2.5 s). A game minute passes every 1/6 s, so a
 *  minute clock rewrote the HUD six times a second, and Android's accessibility tree (TalkBack,
 *  uiautomator) never saw the 1 s of stillness it waits for (e2e/a11y.spec.ts). */
const CLOCK_STEP_MINS = 15;
function clock(t: number): string {
  const tod = (t / DAY + 0.08) % 1;
  const mins = Math.floor(((6 * 60 + tod * 24 * 60) % (24 * 60)) / CLOCK_STEP_MINS) * CLOCK_STEP_MINS;
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

export function regionPulse(s: GameState): { label: string; tone: 'gold' | 'mint' | 'red' | 'muted' } {
  const rid = s.currentRegion;
  const v = s.regions;
  switch (rid) {
    case 'solenne': {
      const n = Math.min(PORT_MAX_SHIPS, portShipments(s));
      return { label: n ? `Free Port · ${n} ship${n > 1 ? 's' : ''} moving · logistics ×${portMult(s).toFixed(1)}` : 'Free Port · ship cargo to boost the docks', tone: n ? 'mint' : 'muted' };
    }
    case 'redmesa': {
      const f = v.redmesa.vars.fuelIndex;
      return { label: `Fuel index ×${f.toFixed(2)}`, tone: f >= 1.2 ? 'mint' : f <= 0.8 ? 'red' : 'muted' };
    }
    case 'neonvale': {
      const h = v.neonvale.vars.hype;
      return { label: `Hype ×${h.toFixed(2)}${v.neonvale.vars.vcShare > 0 ? ' · VC 25 %' : ''}`, tone: h >= 1.15 ? 'mint' : h <= 0.85 ? 'red' : 'muted' };
    }
    case 'amberfield': {
      const i = seasonIndex(s.t);
      return { label: `${SEASONS[i]} · farms ×${SEASON_MULT[i]}`, tone: SEASON_MULT[i] >= 1.2 ? 'mint' : SEASON_MULT[i] < 0.8 ? 'red' : 'muted' };
    }
    case 'verano': {
      const hi = highSeason(s.t);
      return { label: `${hi ? 'High' : 'Low'} season ×${hi ? TOURISM_HIGH : TOURISM_LOW}${v.verano.vars.offshore ? ' · offshore ON' : ''}`, tone: hi ? 'mint' : 'red' };
    }
    case 'ironhold': {
      if (strikeActive(s)) return { label: `STRIKE · ${duration(v.ironhold.vars.strikeUntil - s.t)}`, tone: 'red' };
      const m = v.ironhold.vars.unionMood;
      return { label: `Union mood ${Math.round(m)}`, tone: m < 35 ? 'red' : m > 65 ? 'mint' : 'muted' };
    }
  }
}

const NAV: { id: SheetId; label: string; icon: string }[] = [
  { id: 'empire', label: 'Empire', icon: 'empire' },
  { id: 'trade', label: 'Trade', icon: 'trade' },
  { id: 'politics', label: 'Politics', icon: 'politics' },
  { id: 'rivals', label: 'Rivals', icon: 'rivals' },
  { id: 'store', label: 'Store', icon: 'store' },
];

export function Hud() {
  const s = useSession();
  const st = s.state!;
  const d = derived(st);
  const nw = netWorth(st);
  const ri = st.stats.rankIndex;
  const rank = RANKS[ri], nextRank = RANKS[ri + 1];
  const rankPct = nextRank ? Math.max(0, Math.min(1, (nw - rank.min) / (nextRank.min - rank.min))) : 1;
  const goal = goalsFor(st.homeRegion)[st.goalIndex];
  const pulse = regionPulse(st);
  const R = REGION[st.currentRegion];
  const [goalOpen, setGoalOpen] = useState(false);
  const press = useRef<{ t: number; timer: number; long: boolean } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const tills = Object.values(st.regions).reduce((a, r) => a + Object.values(r.lots).reduce((b, l) => b + (l.owner === 'player' && !l.manager ? l.till : 0), 0), 0);

  const down = () => {
    press.current = { t: performance.now(), long: false, timer: window.setTimeout(() => {
      if (press.current) { press.current.long = true; s.openSheet('empire', 'hustle'); }
    }, JUICE.longPressMs) };
  };
  const up = () => {
    const p = press.current;
    press.current = null;
    if (!p) return;
    clearTimeout(p.timer);
    if (p.long) return;
    const r = btn.current!.getBoundingClientRect();
    s.hustle({ x: r.left + r.width / 2, y: r.top });
    btn.current!.classList.remove('bump');
    void btn.current!.offsetWidth;
    btn.current!.classList.add('bump');
  };

  return (
    <div class="hud">
      <div class="hud-top">
        <div class="money-card" data-testid="cash">
          <CountUp value={st.cash} class="cash" />
          <div class="income"><Icon name="up" size={13} /> {perSec(d.player)}</div>
        </div>
        <div class="hud-right">
          <button class="pill gold-pill" data-testid="gold" onClick={() => s.openSheet('store')}>
            <Icon name="gold" size={16} /> <span>{Math.floor(st.gold).toLocaleString('en-US')}</span>
          </button>
          <button class="icon-btn" aria-label="Settings" onClick={() => s.openSheet('settings')}><Icon name="settings" /></button>
        </div>
      </div>
      <div class="hud-row">
        <button class="rank-chip" onClick={() => s.openSheet('rivals', 'richlist')}>
          <span class="rank-name">{rank.name}</span>
          <span class="rank-bar"><span style={{ width: `${rankPct * 100}%` }} /></span>
          <span class="rank-next">{nextRank ? `${money(nw)} / ${money(nextRank.min)}` : money(nw)}</span>
        </button>
        <div class="meters">
          <span class={`meter heat${st.heat >= 60 ? ' hot' : ''}`} title="Heat"><Icon name="heat" size={14} />{String(Math.round(st.heat))}</span>
          <span class="meter rep" title="Reputation"><Icon name="rep" size={14} />{String(Math.round(st.rep))}</span>
          <span class="meter clock" title="Time"><Icon name="clock" size={14} />D{Math.floor(st.t / DAY) + 1} {clock(st.t)}</span>
        </div>
      </div>
      <div class="hud-row2">
        <span class="region-name">{R.city}</span>
        <span class={`pulse ${pulse.tone}`} data-testid="pulse">{pulse.label}</span>
      </div>
      {goal && (
        <button class={`goal${goalOpen ? ' open' : ''}`} data-testid="goal" onClick={() => setGoalOpen(!goalOpen)}>
          <span class="goal-k">Goal</span>
          <span class="goal-t">{goal.text}</span>
          {goalOpen && <span class="goal-h">{goal.hint}</span>}
        </button>
      )}
      <div class="hud-actions">
        {st.accountant && tills >= 1 && (
          <button class="collect-all" data-testid="collect-all" onClick={() => {
            const v = collectAll(st);
            if (v > 0) { s.sfx.play('cash'); s.toast(`Accountant collected ${money(v)}`, 'good'); s.syncWorld(); }
          }}>
            <Icon name="collect" size={18} /><span>{money(tills)}</span>
          </button>
        )}
        <button ref={btn} class="hustle" data-testid="hustle" aria-label="Hustle"
          onPointerDown={down} onPointerUp={up} onPointerLeave={() => { if (press.current) { clearTimeout(press.current.timer); press.current = null; } }}>
          <span class="h-ring" style={{ '--combo': `${Math.min(20, st.hustle.combo) / 20}` } as Record<string, string>} />
          <Icon name="hand" size={30} />
          <span class="h-label">HUSTLE</span>
          <span class="h-earn">+{money(hustlePerTap(st) * comboMult(st))}</span>
          {st.hustle.combo >= 3 && <span class="h-combo">×{comboMult(st).toFixed(2)}</span>}
        </button>
      </div>
      <nav class="navbar">
        {NAV.map((n) => (
          <button key={n.id} data-testid={`nav-${n.id}`} class={s.sheet.value === n.id ? 'on' : ''} onClick={() => s.openSheet(s.sheet.value === n.id ? null : n.id)}>
            <Icon name={n.icon} size={22} />
            <span>{n.label}</span>
            {n.id === 'politics' && st.regions[st.currentRegion].nextElectionAt - st.t < 60 && <i class="badge" />}
          </button>
        ))}
      </nav>
    </div>
  );
}
