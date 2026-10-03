// Store: gold packs, the starter pack, permanent boosts and gold sinks. On the web build it runs a
// clearly-labelled sandbox (no real money); native builds plug in a real store adapter (M3).
import { useSession, Sheet, Btn } from '../kit';
import { Icon } from '../icons';
import { PRODUCTS } from '../../iap/catalog';
import { canPurchase } from '../../iap/fulfill';
import { GOLD_ITEMS, useGold } from '../../core/actions';

export function StoreSheet() {
  const s = useSession();
  const st = s.state!;
  const owned = (id: string) => (id === 'br.golden_ledger' && st.entitlements.doubleIncome) || (id === 'br.night_shift' && st.entitlements.nightShift) || (id === 'br.starter' && st.entitlements.starterPack);
  const featured = PRODUCTS.filter((p) => !p.id.startsWith('br.gold.'));
  const packs = PRODUCTS.filter((p) => p.id.startsWith('br.gold.'));

  return (
    <Sheet id="store" title="Store" sub={`${Math.floor(st.gold).toLocaleString('en-US')} gold`}>
      {s.store.isTestStore && <div class="test-banner" data-testid="test-store"><Icon name="warning" size={16} /> TEST STORE — purchases are simulated, no money is charged.</div>}
      <div class="featured">
        {featured.map((p) => {
          const have = owned(p.id);
          return (
            <div key={p.id} class={`product feat${p.highlight ? ' hl' : ''}`}>
              <b>{p.title}</b>
              <span class="muted small">{p.blurb}</span>
              <Btn kind={have ? 'ghost' : 'gold'} small disabled={have || !canPurchase(st, p.id)} testid={`buy-${p.id}`} onClick={() => void s.buyProduct(p.id)}>
                {have ? 'Owned' : s.store.priceLabel(p.id)}
              </Btn>
            </div>
          );
        })}
      </div>
      <h4 class="sub-h">Gold</h4>
      <div class="packs">
        {packs.map((p) => (
          <button key={p.id} class={`product pack${p.highlight ? ' hl' : ''}`} data-testid={`buy-${p.id}`} onClick={() => void s.buyProduct(p.id)}>
            <Icon name="gold" size={26} />
            <b>{p.gold!.toLocaleString('en-US')}</b>
            {p.bonus && <em>{p.bonus}</em>}
            <span>{s.store.priceLabel(p.id)}</span>
          </button>
        ))}
      </div>
      <h4 class="sub-h">Spend gold</h4>
      <ul class="list">
        {GOLD_ITEMS.map((g) => (
          <li key={g.id} class="row">
            <div class="row-main"><b>{g.name}</b><span class="muted">{g.blurb}</span></div>
            <Btn small kind="gold" testid={`gold-${g.id}`} onClick={() => s.run((x) => useGold(x, g.id), { sfx: 'rankup' })}><Icon name="gold" size={14} /> {g.gold}</Btn>
          </li>
        ))}
      </ul>
      <Btn kind="ghost" small onClick={() => void s.restorePurchases()}>Restore purchases</Btn>
    </Sheet>
  );
}
