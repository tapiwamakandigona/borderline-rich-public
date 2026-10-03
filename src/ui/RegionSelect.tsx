// Region picker: swipeable cards over a live 3D flyover of each starting city.
import { useEffect, useRef } from 'preact/hooks';
import { REGIONS } from '../core/data/regions';
import { regionFacts } from '../core/pitch';
import { useSession, Btn } from './kit';
import { Icon, Stars } from './icons';

const DIFF = ['', 'Relaxed', 'Standard', 'Hard', 'Expert'];
// Keep a number on the same line as its unit ("90 s", "20 %") so narrow cards never orphan the unit.
const glue = (t: string) => t.replace(/(\d) (?=%|[smh]\b)/g, '$1\u00a0');

export function RegionSelect() {
  const s = useSession();
  const rail = useRef<HTMLDivElement>(null);
  const timer = useRef(0);
  const current = s.preview.value;

  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    const onScroll = () => {
      clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        const w = el.firstElementChild ? (el.firstElementChild as HTMLElement).offsetWidth + 14 : el.clientWidth;
        const i = Math.max(0, Math.min(REGIONS.length - 1, Math.round(el.scrollLeft / w)));
        if (REGIONS[i].id !== s.preview.value) { s.sfx.play('whoosh'); s.previewRegion(REGIONS[i].id); }
      }, 140);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const jump = (i: number) => {
    const el = rail.current;
    if (!el) return;
    const w = (el.firstElementChild as HTMLElement).offsetWidth + 14;
    el.scrollTo({ left: i * w, behavior: 'smooth' });
  };

  return (
    <div class="select-screen">
      <header class="brand">
        <h1>Borderline <em>Rich</em></h1>
        <p>Start broke. Cross borders. Get rich.</p>
      </header>
      <div class="pick-label">Choose where you start</div>
      <div class="rail" ref={rail} data-testid="region-rail">
        {REGIONS.map((r) => (
          <article key={r.id} class={`region-card${r.id === current ? ' on' : ''}`} data-region={r.id}>
            <div class="rc-top">
              <div>
                <div class="rc-title">{r.title}</div>
                <h2>{r.name}</h2>
              </div>
              <div class="rc-diff"><Stars n={r.difficulty} /><span>{DIFF[r.difficulty]}</span></div>
            </div>
            <p class="rc-tag">{r.tagline}</p>
            <div class="rc-gov"><Icon name="politics" size={16} /> {r.government.name}</div>
            <div class="rc-sig">
              <span class="sig-name">{r.signature.name}</span>
              <span>{r.signature.summary}</span>
              <dl class="rc-facts" data-testid={`facts-${r.id}`}>
                {regionFacts(r.id).map((f) => (
                  <div key={f.label} class={f.tone ?? ''}><dt>{f.label}</dt><dd>{glue(f.value)}</dd></div>
                ))}
              </dl>
            </div>
            <div class="rc-cols">
              <ul class="pros">{r.pros.map((p) => <li key={p}>{p}</li>)}</ul>
              <ul class="cons">{r.cons.map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
            <div class="rc-start"><Icon name="hand" size={16} /> First job: {r.hustle.label.toLowerCase()}</div>
            {/* Sticky footer: on short phones the card scrolls, but Start is always on screen. */}
            <div class="rc-cta">
              <Btn kind="gold" testid={`start-${r.id}`} onClick={() => s.start(r.id)}>Start in {r.city}</Btn>
            </div>
          </article>
        ))}
      </div>
      <div class="dots">
        {REGIONS.map((r, i) => (
          <button key={r.id} aria-label={r.name} class={r.id === current ? 'dot on' : 'dot'} onClick={() => jump(i)} />
        ))}
      </div>
    </div>
  );
}
