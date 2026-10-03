// Inline SVG icon set (ART_BIBLE: no emoji icons). 24×24 grid, stroke = currentColor.
import type { JSX } from 'preact';

const P: Record<string, JSX.Element> = {
  empire: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18" /></>,
  trade: <><path d="M3 17h13l3-5H6z" /><path d="M8 12V7h6v5M11 7V4" /><path d="M2 21c2 0 2-1.5 4-1.5S8 21 10 21s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5" /></>,
  politics: <><path d="M3 9l9-5 9 5M5 9v9M9.5 9v9M14.5 9v9M19 9v9M3 21h18" /></>,
  rivals: <><path d="M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v3M8 21h8M9 17h6" /></>,
  store: <><path d="M5 8h14l-1.2 12H6.2z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  heat: <path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-8.5z" />,
  rep: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  gold: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v9M9.5 9.8c0-1.2 1.1-1.8 2.5-1.8s2.5.6 2.5 1.7c0 2.6-5 1.4-5 4.3 0 1.1 1.1 1.8 2.5 1.8s2.5-.7 2.5-1.9" /></>,
  up: <path d="M12 19V5M6 11l6-6 6 6" />,
  pin: <><path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="9" r="2.5" /></>,
  manager: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0M12 12l-1.5 4 1.5 1.5 1.5-1.5z" /></>,
  hand: <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11V4a1.5 1.5 0 0 1 3 0v7V5.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 7-6.5 7-3 0-4.5-1.6-6-4l-2-3.3a1.5 1.5 0 0 1 2.5-1.6z" />,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  plane: <path d="M10.5 21l1.5-6-7-3V9.5l7 1.5V5a1.5 1.5 0 0 1 3 0v6l7-1.5V12l-7 3 1.5 6-3-1.5z" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  cash: <><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.8" /><path d="M6 9.5v5M18 9.5v5" /></>,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  collect: <><path d="M12 3v11M7.5 9.5L12 14l4.5-4.5" /><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></>,
  warning: <><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18v.5" /></>,
  sell: <><path d="M3 12l9-9h8v8l-9 9z" /><circle cx="15.5" cy="8.5" r="1.5" /></>,
  car: <><path d="M3 16v-4l2.5-5h13l2.5 5v4z" /><circle cx="7.5" cy="16.5" r="2" /><circle cx="16.5" cy="16.5" r="2" /></>,
  sound: <><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /></>,
  bolt: <path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
};

export function Icon({ name, size = 20, class: cls }: { name: string; size?: number; class?: string }) {
  return (
    <svg class={cls} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      {P[name] ?? P.check}
    </svg>
  );
}

export function Stars({ n, of = 4 }: { n: number; of?: number }) {
  return (
    <span class="stars" aria-label={`Difficulty ${n} of ${of}`}>
      {Array.from({ length: of }, (_, i) => (
        <svg width="14" height="14" viewBox="0 0 24 24" class={i < n ? 'on' : ''} aria-hidden="true">
          <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" fill="currentColor" />
        </svg>
      ))}
    </span>
  );
}
