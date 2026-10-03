const UNITS: [number, string][] = [[1e15, 'Q'], [1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];

/** $1.23K / $45.6M style money formatting. */
export function money(n: number, opts: { sign?: boolean } = {}): string {
  if (!Number.isFinite(n)) return '$—';
  const neg = n < 0;
  const a = Math.abs(n);
  let s: string;
  const unit = UNITS.find(([v]) => a >= v);
  if (unit) {
    const v = a / unit[0];
    s = (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)) + unit[1];
  } else s = a >= 100 || Number.isInteger(a) ? Math.floor(a).toString() : a.toFixed(1);
  return (neg ? '−' : opts.sign ? '+' : '') + '$' + s;
}
export const perSec = (n: number) => `${money(n)}/s`;
export const pct = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`;
export function duration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60 ? (s % 60) + 's' : ''}`.trim();
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h${m ? ` ${m}m` : ''}`;
}
