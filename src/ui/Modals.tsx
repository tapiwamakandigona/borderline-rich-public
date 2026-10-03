// Modal layer: events with consequence previews, welcome-back earnings, rank-up banner, the
// sandbox payment sheet, toasts and floating money pops.
import { useSession, Btn, Sheet } from './kit';
import { Icon } from './icons';
import { eventView, resolveEvent } from '../core/events';
import { money, duration } from '../core/format';
import { JUICE } from './juice';
import type { QualityName } from '../world/quality';

export function EventModal() {
  const s = useSession();
  const st = s.state;
  if (!st || !st.pendingEvent || s.screen.value !== 'game') return null;
  const ev = eventView(st);
  if (!ev) return null;
  const choose = (i: number) => {
    const r = resolveEvent(st, i);
    if (!r.ok) return;
    const bad = r.won === false;
    s.sfx.play(bad ? 'bad' : r.won ? 'rankup' : 'tap');
    if (bad) s.shake(JUICE.shake.bad);
    if (r.text) s.toast(r.text, bad ? 'bad' : r.won ? 'good' : 'info');
    s.syncWorld();
    s.tick.value++;
  };
  return (
    <div class="modal-wrap">
      <div class="modal event" role="dialog" aria-label={ev.title} data-testid="event-modal">
        <div class="ev-region">{ev.region}</div>
        <h2>{ev.title}</h2>
        <p>{ev.body}</p>
        <div class="choices">
          {ev.choices.map((c, i) => (
            <button key={i} class={`choice${c.risky ? ' risky' : ''}`} data-testid={`choice-${i}`} onClick={() => choose(i)}>
              <b>{c.label}</b>
              <span>{c.risky && <Icon name="warning" size={13} />} {c.preview}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function WelcomeBack() {
  const s = useSession();
  const w = s.welcome.value;
  if (!w || s.screen.value !== 'game') return null;
  return (
    <div class="modal-wrap">
      <div class="modal welcome" data-testid="welcome">
        <div class="ev-region">While you were away · {duration(w.seconds)}{w.capped ? ' (capped)' : ''}</div>
        <h2>Your empire kept working</h2>
        <div class="big-money">+{money(w.earned)}</div>
        <p class="muted">Managed businesses banked {Math.round(w.rate * 100)} % of their income and unmanaged tills filled up.{w.rate < 1 ? ' Night Shift raises this to 100 % for up to 24 h.' : ''}</p>
        <Btn kind="gold" testid="welcome-ok" onClick={() => { s.welcome.value = null; s.sfx.play('cash'); }}>Collect</Btn>
      </div>
    </div>
  );
}

export function RankUp() {
  const s = useSession();
  const r = s.rankUp.value;
  if (!r) return null;
  const [name, reward] = r.split('!');
  return (
    <div class="rankup" aria-live="polite">
      <small>Rank up</small>
      <b>{name}</b>
      {reward?.trim() && <span class="gold">{reward.trim()}</span>}
    </div>
  );
}

export function PurchaseConfirm() {
  const s = useSession();
  const p = s.pendingPurchase.value;
  if (!p) return null;
  return (
    <div class="modal-wrap">
      <div class="modal pay" data-testid="pay-sheet">
        <div class="ev-region">Sandbox payment</div>
        <h2>{p.product.title}</h2>
        <p>{p.product.blurb}</p>
        <div class="big-money">{s.store.priceLabel(p.product.id)}</div>
        <p class="warn small">TEST STORE: no real money will be charged. Real purchases need the App Store / Google Play build.</p>
        <div class="btn-row">
          <Btn kind="ghost" onClick={() => p.resolve(false)}>Cancel</Btn>
          <Btn kind="gold" testid="pay-confirm" onClick={() => p.resolve(true)}>Confirm purchase</Btn>
        </div>
      </div>
    </div>
  );
}

export function SettingsSheet() {
  const s = useSession();
  const st = s.settings.value;
  const qs: QualityName[] = ['low', 'medium', 'high'];
  return (
    <Sheet id="settings" title="Settings">
      <label class="toggle"><input type="checkbox" checked={st.sound} onChange={(e) => s.updateSettings({ sound: (e.target as HTMLInputElement).checked })} /><span><Icon name="sound" size={16} /> Sound</span></label>
      <label class="toggle"><input type="checkbox" checked={st.reducedMotion} onChange={(e) => s.updateSettings({ reducedMotion: (e.target as HTMLInputElement).checked })} /><span>Reduced motion (no shake or particles)</span></label>
      <h4 class="sub-h">Graphics</h4>
      <div class="chips">
        {qs.map((q) => <button key={q} class={`chip${st.quality === q ? ' on' : ''}`} onClick={() => st.quality !== q && s.updateSettings({ quality: q })}>{q[0].toUpperCase() + q.slice(1)}</button>)}
      </div>
      <p class="muted small">Changing graphics reloads the game (progress is saved). Frame rate {Math.round(s.world.stats().fps)} fps.</p>
      <h4 class="sub-h">Save</h4>
      <div class="btn-row">
        <Btn kind="ghost" small onClick={() => { s.save(); s.toast('Saved.', 'good'); }}>Save now</Btn>
        <Btn kind="danger" small onClick={() => { if (confirm('Start over? Your current empire will be deleted.')) s.newGame(); }}>New game</Btn>
      </div>
      <p class="muted small">Borderline Rich · v0.1 vertical slice</p>
    </Sheet>
  );
}

export function Toasts({ top = false }: { top?: boolean }) {
  const s = useSession();
  return (
    <div class={`toasts${top ? ' top' : ''}`} aria-live="polite">
      {s.toasts.value.map((t) => <div key={t.id} class={`toast ${t.kind}`}>{t.text}</div>)}
    </div>
  );
}

export function Pops() {
  const s = useSession();
  return (
    <div class="pops">
      {s.pops.value.map((p) => <span key={p.id} class={`pop ${p.kind}`} style={{ left: `${p.x}px`, top: `${p.y}px` }}>{p.text}</span>)}
    </div>
  );
}
