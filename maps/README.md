# PokeStonks — Village Map (`maps` branch)

One playable pixel-art village map built from the CraftPix
"Free Village Pixel Tileset for Top-Down Defense"
(see `assets/village-tileset/License.txt` — free for use in games).

Preview: `pnpm dev` → http://localhost:3000/maps

## Layout

```
maps/
  assets/village-tileset/   # canonical PNGs (tiles, tiles2, objects, animated) + License
  data/village-map.json     # generated: 40x30 grid, objects, 5 stock pins, spawn
  scripts/generate-map.mjs  # regenerates the JSON (seeded, deterministic)
  scripts/copy-map-assets.mjs # copies PNGs to public/maps/village (runs via predev/prebuild)
  components/VillageMap.tsx # canvas renderer + movement + collision + pins
```

`public/maps/village/` is generated output (gitignored) — never edit it directly.

## Controls

- Arrow keys — walk
- Click / tap ground, or drag — click-to-move
- Scroll — zoom (1x–3.5x)
- Tap a glowing pin — inspect the stock (battle hook: `selected` state in VillageMap)

## Regenerating the map

Edit placements in `scripts/generate-map.mjs`, then:

```
node maps/scripts/generate-map.mjs
```

Assets sync automatically on `pnpm dev` / `pnpm build` via the copy script.

## Merge-later story

Everything map-specific lives under `maps/` (+ generated `public/maps/`).
To merge into `main`: move `maps/components/VillageMap.tsx` into
`app/components/`, keep the JSON import path working, drop the `/maps`
preview route (or keep it as a debug view), and wire the map as the
"zone view" when a player zooms into a globe pin.

## Next steps

- Character sprites (the pack has none — player is a drawn token for now)
- 1v1 battle overlay on pin catch
- Animated doors (`assets/village-tileset/animated/`) attached to houses
- Second tileset layer / interiors
