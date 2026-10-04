// Modal layer: events with consequence previews, welcome-back earnings, rank-up banner, the
// sandbox payment sheet, toasts and floating money pops.
import { useLayoutEffect, useState } from 'preact/hooks';
import { useSession, Btn, Sheet } from './kit';
import { Icon } from './icons';
import { eventView, resolveEvent } from '../core/events';
import { money, duration } from '../core/format';
import { JUICE } from './juice';
import type { QualityName } from '../world/quality';

/** Google Play requires the privacy policy to be reachable from inside the app too. Opens in the system browser on Android. */
export const PRIVACY_URL = 'https://tapiwamakandigona.github.io/emberdelve/store/borderline-rich-privacy.html';

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
    // The outcome text arrives as a core notice → exactly one toast once the modal has closed.
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
  if (!r || s.uiBusy()) return null; // never over a card, sheet or modal
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
      <p class="muted small">Borderline Rich · v0.1 vertical slice · <a class="link" href={PRIVACY_URL} target="_blank" rel="noopener">Privacy policy</a> (no data collected)</p>
    </Sheet>
  );
}

/**
 * Toasts never cover the money card or a lot card's header (T12b):
 * - free: below the HUD (no card, no sheet);
 * - card: docked just above the open lot card (measured), newest toast only;
 * - sheet: docked at the screen bottom, over the sheet's lower edge (never the cash card on top).
 */
export function Toasts({ mode = 'free' }: { mode?: 'free' | 'card' | 'sheet' }) {
  const s = useSession();
  const [bottom, setBottom] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (mode !== 'card') { setBottom(null); return; }
    let raf = 0;
    const measure = () => {
      const card = document.querySelector('.lot-card');
      if (card) setBottom(Math.max(0, window.innerHeight - card.getBoundingClientRect().top + 6));
      raf = requestAnimationFrame(measure); // follows the card's rise animation and content changes
    };
    measure();
    return () => cancelAnimationFrame(raf);
  }, [mode]);
  if (s.modalOpen()) return null;
  const list = mode === 'card' ? s.toasts.value.slice(-1) : s.toasts.value;
  const style = mode === 'card' && bottom !== null ? { top: 'auto', bottom: `${bottom}px` } : undefined;
  return (
    <div class={`toasts ${mode}`} aria-live="polite" style={style}>
      {list.map((t) => <div key={t.id} class={`toast ${t.kind}`}>{t.text}</div>)}
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
