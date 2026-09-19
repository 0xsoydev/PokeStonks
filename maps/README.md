# PokeStonks — Village Map (`maps` branch)

**Current: Pokémon-style Meadowbrook Village** (from `demo.html` reference engine + `meadowbrook.tmj`).

Preview: `pnpm dev` → http://localhost:3000/maps

## Controls

- Arrow keys — walk (grid-step, GBA style)
- Shift (hold) — run
- Step onto a poké ball — FireRed-style battle popup: FIGHT or LEAVE
- Z / Enter — confirm · arrows — menu cursor · Esc/X — back / leave
- P — switch your pokémon (Pikachu → Charmander → Bulbasaur → Squirtle → Eevee)
- Click ground — click-to-move
- C — collision debug overlay

## Battles

Step onto a poké ball → "A wild SNORLAX appeared! It guards the AAPL stock" —
choose FIGHT (2 moves per mon) or LEAVE. Turns alternate; HP bars + numbers
drain (green→yellow→red); hit flashes + screen shake. Opponent faints →
victory popup with the token (+drop/catch), ball despawns, respawns in 30s.
Player faints → ball stays. Static logic only (fixed 45–85 dmg, no types/crits).
Opponent roster: AAPL→Snorlax · TSLA→Electrode · NVDA→Alakazam · GME→Gengar · AMZN→Venusaur.

## How it works

```
maps/
  assets/meadowbrook/       # tileset.png + trainer.png (16px GBA tiles @ 3x zoom)
  assets/village-tileset/   # CraftPix pack (superseded, kept for later reuse)
  data/meadowbrook.tmj      # Tiled map: 32x24, layers ground/objects/above + warps + interactions
  data/pins.json            # generated: 5 stock-pin tiles (verified walkable + reachable)
  scripts/generate-pins.mjs # regenerates pins.json after editing the tmj
  scripts/copy-map-assets.mjs # syncs sprites + tmj to public/maps (runs via predev/prebuild)
  components/VillageMap.tsx # the engine: grid movement, collision from tmj tile props,
                            # 3-layer render (ground < objects < player < above), dialogue boxes,
                            # animated water, poké ball stock pins with 30s respawn
```

`public/maps/` is generated output (gitignored). Edit `meadowbrook.tmj` in the
[Tiled editor](https://www.mapeditor.org/), then restart `pnpm dev` (or rerun
`node maps/scripts/copy-map-assets.mjs`).

## Player pokémon (PokéAPI)

The player is an actual Pokémon: Gen-V **animated GIFs** from the PokéAPI
sprites CDN (`raw.githubusercontent.com/PokeAPI/sprites`), so they genuinely
move. Down = front gif, up = back gif, left/right = mirrored front. Fallback
chain: animated gif → Gen-III Emerald static → local trainer sheet (offline).
Switch with **P**; the active 'mon shows in the HUD.

## Game hooks (from the tmj)

- **Signs/mailboxes** — dialogue text lives in the tmj `interactions` objects
- **Warps** — house doors + north exit flash a "hook up your map here" dialogue (interiors later)
- **Stock pins** — `maps/data/pins.json`: symbol/drop per ball; catch → HUD bag + respawn timer
- **Spawn** — `spawn` object in the tmj

## CraftPix village (previous iteration)

`village-map.json` + `generate-map.mjs` + CraftPix assets remain in the repo,
unused by `/maps`. Kept as a candidate second map / warp destination.

## Merge-later story

Everything map-specific lives under `maps/` (+ generated `public/maps/`).
To merge into `main`: move `maps/components/VillageMap.tsx` into
`app/components/`, drop the `/maps` preview route (or keep it as a debug
view), and wire the map as the "zone view" when a player zooms into a globe pin.

## Next steps

- 1v1 battle overlay on ball catch
- Interior maps (house tmjs) wired to warps
- Trainer sprite: 4-frame walk sheets (current sheet is 3-frame, ported as-is)
- NPC sprites from poke-assets.png

