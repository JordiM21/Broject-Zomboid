# Last Haul

Top-down zombie survival meets extraction looting, running in the browser. Scavenge a persistent town, haul loot back to the fenced safehouse, build upgrades, and survive the nights.

## Play

```bash
npm install
npm run dev      # local dev server
npm run build    # single-file build in dist/index.html (open directly or host anywhere)
```

## Controls

WASD move · Shift sprint · Mouse aim · Click attack · Space shove · E search/open · Tab inventory · 1–6 / wheel weapons · R reload · H quick heal · C sneak · F flashlight · G noise maker · X pipe bomb · M map · Esc pause

## World

- 240×240 tile town: ~80 houses, grocery, pharmacy and hardware stores, police stations, gas stations, parks, parking lots, forest camps.
- **Hospital**: reception, wards and a pharmacy. Medical Cabinets are full of bandages, antibiotics and first aid kits. Crowded with runners and brutes.
- **Military Zone** (far from the safehouse): fenced base with barracks, tents, trucks and watchtowers. Military Crates hold rifles, shotguns, ammo, vests, rucksacks and pipe bombs. Guarded by armored soldier zombies whose corpses carry ammo and rations.
- Street lamps (some broken or flickering), burning wrecks and fire barrels light the night; morning mist, rain haze, ambient birds, crickets and distant screams, gunfire and sirens.

## Stealth and sound

- Zombies build suspicion (yellow ?) before they chase. Light, flashlight, sneaking, standing still, bushes and rain change how visible you are (HUD: Hidden / Low profile / Exposed / Detected).
- Unaware zombies barely see behind them. Sneak up (C) and hit one from behind with a weapon for a silent kill.
- Your noises show as faint rings. Unseen zombie sounds show as arrows at the screen edge.
- Audio is spatial: stereo panning, distance falloff, muffling through walls, indoor/outdoor reverb, surface-specific footsteps for you and nearby zombies.

## Core loop

1. Leave the safehouse, search houses, stores, cars, the police station and forest camps.
2. Noise (sprinting, gunshots, bashing) pulls zombies. Doors slow them. Nights are dark and hordes roam from Day 2.
3. Put loot in the Stash. Spend materials on base upgrades: stash shelving, workbench (crafting), bed (sleep through the night), rain collector and garden (daily supplies), armory locker (respawn kit), ham radio (trade valuables for supply drops).
4. Die and everything you carried stays on your body, marked on the map.

## Art

- Characters and zombies are frame-by-frame sprites generated from pose keyframes at load (`src/render/sprites.js`): player idle, walk, per-weapon attacks, reloads, healing and shove for every weapon/armor/bag combo; walker, runner, brute and soldier variants with walk, idle, attack, hit and death.
- Crates, sandbags, barrels, oil spills, the tank wreck and explosion/smoke animations come from Kenney's Top-down Tanks Redux (CC0) in `src/assets/kenney/`.

## Architecture

- `src/world/` procedural town generation (seeded) and tile queries (collision, line of sight, flow fields).
- `src/sim/` authoritative simulation: `step(state, inputsByPlayer, dt)` plus `command(state, playerId, cmd)` for UI actions. Rendering never mutates state, and every player is keyed by id, so the sim can move to a host/server for co-op later.
- `src/render/` Canvas 2D renderer with cached tile chunks, persistent blood decals, line-of-sight fog, night lighting and flashlight.
- `src/ui/` HUD (canvas) and DOM panels (inventory, base).
- `src/save.js` saves to localStorage as seed + deltas.

Tests: `node tests/sim.test.mjs` (headless sim), `tests/smoke*.mjs` (Playwright, needs `npm run build`).
