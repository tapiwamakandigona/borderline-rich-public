# In-app purchases — how they work now and what shipping them needs

## Today (web / playtest build)
- `src/iap/catalog.ts` is the single product list. Ids are the store ids you must create:
  `br.gold.120` (consumable, $0.99), `br.gold.650` ($4.99), `br.gold.1400` ($9.99), `br.gold.7500` ($49.99),
  `br.starter` (consumable, one-time per account, $2.99: 400 gold + 2× income 24 h + Gilded paint),
  `br.golden_ledger` (non-consumable, $7.99: permanent 2× income), `br.night_shift` (non-consumable, $3.99: offline 100 % for 24 h).
- `src/iap/store.ts` → `SandboxStore` shows a **TEST STORE** payment sheet; nothing is charged. `NativeStoreUnavailable`
  is the native placeholder and always fails — it never fakes a successful payment.
- `src/iap/fulfill.ts` grants purchases **idempotently** by transaction id (duplicate callbacks are ignored) and
  `restoreEntitlements()` re-grants non-consumables. Covered by `tests/iap.test.ts`.
- Gold sinks (Time Warp, Turbo, Express Freight, Legal Team) are core actions (`useGold`) — gold is soft currency,
  never required to progress. No loot boxes / random paid rewards (keeps us clear of loot-box disclosure rules).

## Shipping real purchases (milestone M3) — owner actions first
1. **Accounts (cost money — owner decision):** Apple Developer Program ($99/yr), Google Play Console ($25 once).
2. Create the 7 products above with the same ids in App Store Connect and Play Console; set prices per territory.
3. Pick a billing layer:
   - **RevenueCat** (`@revenuecat/purchases-capacitor`): fastest, server-side receipt validation included, free tier.
   - or **cordova-plugin-purchase** v13 + your own validation endpoint.
4. Implement `NativeStore implements Store` (same interface as `SandboxStore`): `products()` from the store,
   `priceLabel()` = the store's **localized** price string, `purchase()` → on success call `fulfill()` with the
   platform transaction id, then **finish/acknowledge** the transaction (Google refunds unacknowledged purchases after 3 days).
5. Validate receipts server-side before granting non-consumables in production.
6. Swap the store in `src/app/session.ts` when `Capacitor.isNativePlatform()`.
7. Test with Apple sandbox testers / Google license testers; verify Restore Purchases (required by Apple review).

## Store-review checklist
- Restore Purchases button: present (Store sheet).
- Prices shown are the store's localized strings (not the hard-coded USD placeholders) in native builds.
- Parental controls: rely on platform purchase approval; no external payment links.
- Privacy: no analytics/ads SDKs in M1. Add a consent flow before adding any in M3.
