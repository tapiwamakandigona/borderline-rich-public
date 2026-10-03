# Art bible — Borderline Rich

**Look:** "sunlit diorama". Stylised, chunky, readable low-poly with soft shadows, warm light,
atmospheric fog and a miniature-city feel. Model detail from primitives — never "a few generic
boxes": bevel the silhouette, add parapets, awnings, balconies, rooftop clutter, window grids.

## Region palettes

| Region | Ground | Walls | Accents | Sky (day) | Mood |
|---|---|---|---|---|---|
| Solenne | warm stone `#d9c7a5` | whitewash `#f3ede2`, terracotta `#c8553d` | sea teal `#1f8a8a`, lemon `#f2c14e` | `#9fd3e6` → `#f7e3c4` | Mediterranean golden hour |
| Red Mesa | sand `#e3b778` | adobe `#d49a6a`, sandstone `#c27c4e` | rust `#b5562e`, sage `#7a8f5b` | `#8fc7d9` → `#f6c38f` | dusty frontier haze |
| Neon Vale | slate `#3a4150` | glass `#5fa8c8`, concrete `#8a93a3` | neon magenta `#ff3e9a`, cyan `#3df2ff` | `#4b5d8c` → `#e58fb0` | rainy tech dusk |
| Amberfield | meadow `#8fb35a` | clapboard `#f1e6cf`, barn red `#a63a2b` | wheat `#e8c15a` | `#7ec3ef` → `#fbe7b5` | warm heartland afternoon |
| Isla Verano | sand `#f4e7c5` | pastels mint `#a8e6cf`, pink `#ffb3c1`, butter `#ffe29a` | coral `#ff7f66`, turquoise `#2ec4c9` | `#5ecbf0` → `#fff1d6` | bright tropical |
| Ironhold | snow `#e9eef2` | brick `#8e3b2e`, steel `#5c6770` | sodium orange `#ffb347` | `#9fb3c8` → `#dfe6ee` | cold industrial |

Player colour: gold `#f2c14e`. Rivals each own one saturated colour (see `data/regions.ts`).

## UI

"Ledger luxe": ink panels `#14161b`/`#1d2027` with warm paper text `#f4efe6`, money in gold
`#f2c14e`, income in mint `#3ddc97`, heat in signal red `#ff5a5f`. Display face **Unbounded**
(numbers, titles), text face **Bricolage Grotesque**. No Inter/Roboto/Space Grotesk, no emoji
icons (inline SVG only), no purple-on-white gradients. Rounded 18 px sheets, thumb-reach layout,
44 px minimum touch targets.

## Juice rules (ask for them by name)

Ease-out on every tween; count-up money; number pop on gain; coin-burst particles on collect/buy;
camera shake on big moments only (decays < 0.4 s, camera not UI); a sound for every action with
±8 % pitch variation; camera leads the player with a small dead zone; buildings "grow" with a
squash-and-stretch when upgraded. All tunables in `src/ui/juice.ts`; a reduced-motion switch
turns shake and particles off.
