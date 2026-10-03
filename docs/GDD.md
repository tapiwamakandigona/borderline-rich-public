# Borderline Rich — Game Design Document (M1)

*Start broke. Cross borders. Get rich.*  Numbers here are design intent; the tuned values live in
`src/core/data/*.ts` and are pinned by tests in `tests/`.

## 1. Pillars

1. **From zero, felt in your hands.** $0 at start, first business inside ~30 s, and your empire is
   visible in the world: your gold flags spread across the skyline and your buildings grow taller.
2. **Every region plays differently.** Different government, laws, tariffs, rivals, risks, demand and
   a *signature mechanic*. Picking a start is a real decision; expanding later refreshes the game.
3. **Risk is a choice, never forced.** Legal → grey → black paths for trade and politics. Heat and
   reputation are the price.
4. **The world pushes back.** Rivals buy lots and start price wars, elections flip laws, events
   force decisions, markets swing. No two sessions are the same.
5. **Respectful monetisation.** Gold accelerates and decorates; nothing is paywalled.

## 2. Core loops

- **Seconds:** hustle taps (combo meter), coin pickups, upgrade taps, event decisions.
- **Minutes:** explore → find a lot → open/buy a business → upgrade → hire managers → ship cargo
  → respond to rivals and events.
- **Hours:** climb ranks, expand to new regions, swing elections, buy out rival companies,
  climb the cross-continent Rich List.
- **Session hook:** welcome-back offline earnings → full tills to collect → an event waiting →
  a rival just bought the lot you wanted.

## 3. Time

1 sim second = 1 real second. A day is 240 s (full day/night cycle). Elections, seasons and
decrees are scheduled in days. The sim steps at a fixed 0.1 s.

## 4. Economy

- **Lots** belong to districts and have a footprint: small (tier ≤ 2), medium (≤ 3), large (≤ 4),
  tower (any). Land price = footprint base × region cost index × district land multiplier.
- **Businesses** (catalog in `data/businesses.ts`): street cart → kiosk → laundromat → café →
  boutique → gym → hotel → workshop → depot → factory → startup → resort → datacenter → bank →
  skyline tower, plus region-only types (farm stand, fishery, oil well, steel mill).
- **Level-up:** cost = base × costIndex × 0.55 × 1.11^(L−1). Income is linear in level with ×2
  milestones at L10, L25, L50 and ×3 at L100. Every 10 levels the building gains a floor.
- **Income/s** = base × L × milestones × regionDemand[cat] × districtFit[cat] × law mods ×
  competition × chain synergy × reputation × region-mechanic mods × buffs.
  - competition: 1 / (1 + 0.12 × other owners' same-category businesses in the district)
  - chain synergy: +5 % per own same-category business in the district (cap +25 %)
  - net = gross × (1 − income tax − upkeep), upkeep = 0.12 × wageIndex × minWage; floor 10 % of gross.
- **Tills:** without a manager, income fills a till capped at 120 s of income. Tap your building or
  walk past it to collect. Managers (2× base cost) bank income automatically.
- **Net worth** = cash + property values (land + 85 % of invested business cost) + cargo in transit.

## 5. Regions (the heart of M1)

| Region | City | Difficulty | Government | Signature mechanic |
|---|---|---|---|---|
| Port Solenne | Solenne | ★★ | Merchant Council — buy **permanent guild seats** | **Free Port**: 0 % import tariff; cheap transshipment hub; storms and dock strikes |
| Red Mesa Territory | Dustwater | ★★★ | Territorial Governor — **rigged elections** (incumbent ×2.5) | **Permits & Favours**: tier ≥ 2 businesses wait for permits unless you bribe; oil boom/bust index; bandits |
| Neon Vale | Neon Vale | ★★★★ | City Council democracy (3-day cycle) | **Hype Cycle**: tech/services income rides a city-wide hype wave; VC term sheets; antitrust probes |
| Amberfield County | Amberfield | ★ | County Assembly | **Seasons & Harvests**: 4-day crop cycle (×0.4 → ×2.0 agri); co-op bonus for 3+ farms |
| Isla Verano | Puerto Verano | ★★ | Island Assembly | **Tourist Seasons & Offshore**: high/low season swings; hurricanes; offshore shelter cuts tax everywhere at a heat cost |
| Ironhold | Ironhold | ★★★ | Workers' Diet | **Union Mood**: falls as you grow; low mood → strikes stop industry; wage deals; protectionist "Buy Local" |

Each region also differs in cost index, wage index, corruption, category demand, base laws,
starting hustle, produced/demanded goods, five named districts, 2–4 named rivals with
personalities, and ≥ 6 region-only events. Full data: `src/core/data/regions.ts`.

## 6. Trade & tariffs (risk layer)

Buy goods in your current region's market, ship to any region, sell on arrival at the price then.
Shipping methods:

| Method | Tariff paid | Extra cost/time | Risk if caught |
|---|---|---|---|
| Legal | export + import tariff | base | — |
| Transship via Solenne | 40 % of import tariff | +5 % fee, +40 s | origin-fraud ruling: full tariff + 25 % fine |
| Undervalue invoice | 50 % of tariffs | — | audit: 2× evaded tariff fine, +15 heat |
| Smuggle | none | — | seizure of cargo + 50 % fine, +30 heat, −10 rep |

Catch chance scales with destination enforcement, your heat, and is reduced by corruption when
you bribe. **Heat** (0–100) decays ~7.5/min; ≥ 60 triggers audits, ≥ 90 a raid event.

## 7. Politics

Factions have platforms (law overrides + category modifiers) and popularity. The ruling faction's
platform sets the laws. Government types: council vote with permanent guild seats (Solenne),
rigged governor elections + gifts that raise heat (Red Mesa), plain elections with donations that
reset after each vote (Neon Vale, Amberfield, Verano, Ironhold). Laws: income tax, import/export
tariffs, regulation, enforcement, minimum wage, category modifiers, small-business relief.

## 8. Rivals & Rich List

2–4 rivals per region, personalities: aggressive, expansionist, cautious, shady. Every ~10 s
they earn, buy lots, upgrade, donate to factions, start price wars (−35 % to your category in a
district for 2 min), make offers for your businesses, and (shady) sabotage. You can buy a rival's
property at their asking price (value × (1.4 + greed)) and **acquire a whole rival** for
1.3 × its net worth once your net worth is ≥ 1.5× theirs. The Rich List ranks you against
every rival on the continent.

## 9. Progression

Ranks: Flat Broke → Hustler ($500) → Street Vendor ($5K) → Shopkeeper ($50K) → Entrepreneur
($250K) → Big Shot ($1M) → Mogul ($10M) → Tycoon ($100M) → Magnate ($1B) → Borderline Rich
($10B) → Obscenely Rich ($100B). Goal chain (16 goals) teaches the game and pays cash/gold.
Vehicles (foot → bicycle → scooter → hatchback → sports car → helicopter) raise move speed.
Expanding to a second region unlocks at Entrepreneur.

## 10. Monetisation

Gold packs (120 / 650 / 1,400 / 7,500), Starter Pack (one-time), Golden Ledger (permanent 2×
income), Night Shift (offline earnings 100 % and 24 h cap). Gold sinks: Time Warp (1 h income),
Turbo (2× for 4 h), Express Freight, Legal Team (−60 heat), cosmetic vehicle paints. Small
amounts of gold come free from goals and rank-ups. Web builds use a clearly-labelled sandbox store.

## 11. Controls

Floating joystick (left half), drag to orbit (right half), pinch to zoom, tap a building for
its card, auto-walk to far buildings along the road grid. Desktop: WASD + mouse.
