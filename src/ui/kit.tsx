// Shared UI kit: session access, count-up money, bottom sheet, buttons, bars.
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { Session, SheetId } from '../app/session';
import { money } from '../core/format';
import { JUICE } from './juice';
import { Icon } from './icons';

let current: Session | null = null;
export function setSession(s: Session): void { current = s; }
/** The running session. Components that call this also subscribe to the 10 Hz UI tick. */
export function useSession(): Session {
  const s = current!;
  void s.tick.value;
  return s;
}

/** Money that eases toward its target instead of jumping (juice: count-up). */
export function CountUp({ value, format = money, class: cls }: { value: number; format?: (n: number) => string; class?: string }) {
  const el = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  const target = useRef(value);
  target.current = value;
  useEffect(() => {
    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const t = target.current, cur = shown.current;
      const gap = t - cur;
      shown.current = Math.abs(gap) < Math.max(0.01, Math.abs(t) * 1e-4) ? t : cur + gap * (1 - Math.exp(-JUICE.countUpRate * dt));
      if (el.current) el.current.textContent = format(shown.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [format]);
  return <span ref={el} class={cls}>{format(shown.current)}</span>;
}

export function Sheet({ id, title, sub, children, tabs, tab, onTab }: {
  id: SheetId; title: string; sub?: string; children: ComponentChildren;
  tabs?: { id: string; label: string }[]; tab?: string; onTab?: (t: string) => void;
}) {
  const s = useSession();
  return (
    <div class="sheet" data-sheet={id} role="dialog" aria-label={title}>
      <div class="sheet-grip" />
      <header class="sheet-head">
        <div>
          <h2>{title}</h2>
          {sub && <p class="muted">{sub}</p>}
        </div>
        <button class="icon-btn" aria-label="Close" onClick={() => s.openSheet(null)}><Icon name="close" /></button>
      </header>
      {tabs && (
        <nav class="tabs">
          {tabs.map((t) => (
            <button key={t.id} class={t.id === tab ? 'tab on' : 'tab'} onClick={() => { s.sfx.play('tap'); onTab?.(t.id); }}>{t.label}</button>
          ))}
        </nav>
      )}
      <div class="sheet-body">{children}</div>
    </div>
  );
}

export function Btn({ children, onClick, kind = 'primary', disabled, small, testid, title }: {
  children: ComponentChildren; onClick: () => void; kind?: 'primary' | 'ghost' | 'danger' | 'gold' | 'mint';
  disabled?: boolean; small?: boolean; testid?: string; title?: string;
}) {
  return (
    <button class={`btn ${kind}${small ? ' small' : ''}`} disabled={disabled} data-testid={testid} title={title}
      onClick={(e) => { e.stopPropagation(); onClick(); }}>
      {children}
    </button>
  );
}

export function Bar({ value, max = 100, color, label }: { value: number; max?: number; color: string; label?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div class="bar" aria-label={label}>
      <div class="bar-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function Stat({ label, value, tone }: { label: string; value: ComponentChildren; tone?: 'gold' | 'mint' | 'red' | 'muted' }) {
  return (
    <div class="stat">
      <span class="stat-label">{label}</span>
      <span class={`stat-value ${tone ?? ''}`}>{value}</span>
    </div>
  );
}
