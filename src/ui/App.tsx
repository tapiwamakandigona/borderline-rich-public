// Root overlay. The 3D canvas sits underneath; this layer only captures pointer events on widgets.
import { useSession } from './kit';
import { RegionSelect } from './RegionSelect';
import { Hud } from './Hud';
import { LotCard } from './LotCard';
import { EmpireSheet } from './sheets/Empire';
import { TradeSheet } from './sheets/Trade';
import { PoliticsSheet } from './sheets/Politics';
import { RivalsSheet } from './sheets/Rivals';
import { StoreSheet } from './sheets/Store';
import { EventModal, PurchaseConfirm, Pops, RankUp, SettingsSheet, Toasts, WelcomeBack } from './Modals';

export function App() {
  const s = useSession();
  const sheet = s.sheet.value;
  if (s.screen.value === 'select' || !s.state) {
    return (
      <div class="ui">
        <RegionSelect />
        <Toasts />
      </div>
    );
  }
  return (
    <div class="ui">
      <Hud />
      <Pops />
      {s.selected.value && !sheet && <LotCard />}
      {sheet && <div class="scrim" onClick={() => s.openSheet(null)} />}
      {sheet === 'empire' && <EmpireSheet />}
      {sheet === 'trade' && <TradeSheet />}
      {sheet === 'politics' && <PoliticsSheet />}
      {sheet === 'rivals' && <RivalsSheet />}
      {sheet === 'store' && <StoreSheet />}
      {sheet === 'settings' && <SettingsSheet />}
      <RankUp />
      <EventModal />
      <WelcomeBack />
      <PurchaseConfirm />
      <Toasts top={!!sheet} />
    </div>
  );
}
