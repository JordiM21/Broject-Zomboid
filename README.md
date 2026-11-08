# Last Haul

Top-down zombie survival meets extraction looting, running in the browser. Scavenge a persistent town, haul loot back to the fenced safehouse, build upgrades, and survive the nights.

## Play

```bash
npm install
npm run dev      # local dev server
npm run build    # single-file build in dist/index.html (open directly or host anywhere)
```

## Controls

Inventory: hover an item and press E use/eat/drink/equip · Q drop · T move · R take all · Shift+R put all · right-click for the item menu · drag out of the window to drop.

WASD move · Shift sprint · Mouse aim · Click attack · Hold right-click aim down sights · Space shove · E search/open · Tab inventory · 1–6 / wheel weapons · R reload · H quick heal · C sneak · F flashlight · G noise maker · X pipe bomb · M map · Esc pause

## World

- 240×240 tile town: ~80 houses, grocery, pharmacy and hardware stores, police stations, gas stations, parks, parking lots, forest camps.
- **Hospital**: reception, wards and a pharmacy. Medical Cabinets are full of bandages, antibiotics and first aid kits. Crowded with runners and brutes.
- **Military Zone** (far from the safehouse): fenced base with barracks, tents, trucks and watchtowers. Military Crates hold rifles, shotguns, ammo, vests, rucksacks and pipe bombs. Guarded by armored soldier zombies whose corpses carry ammo and rations.
- Street lamps (some broken or flickering), burning wrecks and fire barrels light the night; morning mist, rain haze, ambient birds, crickets and distant screams, gunfire and sirens.

## Weapons feel

- Guns fire real projectiles with travel time (rifle fastest, crossbow bolts visibly slowest), pierce, and shotgun damage falloff. Sustained fire blooms your spread (the crosshair widens), moving makes it worse, sneaking tightens it. Recoil kicks the camera; impacts spark and leave bullet holes, and bolts stick in walls.

## Ammo

Four types only: **Light** (Pistol, SMG), **Medium** (Carbine, Crossbow), **Heavy** (Hunting Rifle), **Shotgun** (Shotgun). Each gun's details panel shows its ammo type, and each ammo shows which guns use it. With the Armory Locker you can craft all four.

## Dropped items

- Dropping anything puts it in a backpack on the ground (marked on the map). It stays until you empty it.

## Map

- [M] opens the full map with named locations you have discovered. Hover any of them (or a house) for a description and danger level.

## Hotbar and equipment

- Six hotbar slots hold anything usable: weapons (press to equip, again to holster), meds, food, buffs and throwables. Drag items from the inventory onto a slot, drag slots to reorder, right-click or drag off to clear, or hover an item and press 1–6. The slot refills from another stack of the same item.
- Equipment slots: Head, Body, Legs, Feet and Back (bag). Head: motorcycle/military helmet, night vision goggles, headlamp. Legs: jeans, cargo pants (+5 kg), kevlar pants. Feet: soft sneakers (quiet steps), combat boots (glass-proof), running shoes (faster sprint). Protection from all pieces stacks.

## Gear, buffs and perks

- Weapons: Katana (silent one-cut kills on unaware zombies), Sledgehammer (stuns, huge knockback), Spear (longest reach), Crossbow (near-silent, pierces), SMG (full auto), plus the originals. Each has its own animation.
- Armor: Riot Gear (best protection, slower), Ghillie Suit (much harder to spot), Police Vest, Leather Jacket.
- Buffs: Adrenaline Shot (20 s speed, damage, no stamina drain), Energy Drink (90 s double stamina regen). Perk: Self-Revive Kit (carry it; revives you once and blasts zombies away).
- With `?testgear`, the Weapon Rack in the safehouse holds one of everything.

## Co-op

Two players share one world: same zombies, stash, upgrades, doors and loot, each with their own character and inventory.

1. On the main menu, choose **Play Together**, then **Host your world**. You get a 4-letter code, and an invite link is copied for you. **Copy Invite Link** in the pause menu copies it again.
2. Your partner opens the link (or chooses **Play Together** and types the code) and presses **Join**.

The game asks for a password once per browser. It's checked by the relay, which refuses every connection without a valid login, and locks out guessing after 5 wrong tries.

How you connect depends on the build:
- **Live site:** everything goes through the relay on Render (`wss://broject-zomboid.onrender.com/coop`, set in `src/net/relay.js`; `VITE_RELAY` overrides it). Render needs the start command `node server/relay.mjs` and the `RELAY_PASSWORD` environment variable; without it the relay won't start. Changing the password logs everyone out. The free server sleeps when idle: the game wakes it on load and keeps it awake while open, and every connection waits for it.
- **Development:** `npm run dev -- --host`, then open the Network address it prints. The relay runs inside the dev server, with no password unless you set `RELAY_PASSWORD`.

If a connection drops, both sides reconnect by themselves and keep the same code.

The host's browser runs the simulation and owns the save; it keeps running behind a pause menu or in a background tab. A partner who leaves keeps their character for next time. See `src/net/`: `sync.js` builds and applies the messages, `coop.js` handles connections and prediction, and `server/relay.mjs` only pairs players and passes messages along.

## Loot economy

`ECONOMY` in `src/data/items.js` sets how likely each weapon tier and mods are in each kind of place:

| Tier | Weapons | Where |
|---|---|---|
| 1 Common | Knife, Bat, Crowbar | Kitchens, toolboxes, cars, hardware stores |
| 2 Uncommon | Machete, Spear, Axe, Pistol | Police, camps, rarely houses and cars |
| 3 Rare | Sledgehammer, Crossbow, Shotgun, SMG | Military, police, rarely elsewhere |
| 4 Very rare | Katana, Carbine, Hunting Rifle | Mostly military |

Silencers and Extended Mags are found as items, mostly at military and police sites. At the Workbench you can craft the Crossbow, Spear, Silencer and Extended Mag. Basic materials are the most common loot and stack to 100.

**Cases** are rare, hidden and never restock, about 25 per world. A Weapon Case holds one weapon of any kind, a Mod Case one mod, and an Ammo Case some of all four ammo types. Look behind houses, along walls in bedrooms and living rooms, in the back offices of stores, at police stations, at forest camps, and in the barracks, which always has a Weapon Case and a Mod Case. Odds are `CASES` in `src/world/worldgen.js` and the `LOOT` tables in `src/data/items.js`.

Add `?testgear` to the URL before starting a new world to get the Weapon Rack and Mod Stash in the safehouse, with free gear for trying things out.

## View and peeking

- **View setting** (main menu or pause): Fixed, or Follows character. Following turns the world so you always face up the screen: W walks forward, A/D strafe, S backs up, and the mouse steers. It captures the mouse; Esc pauses and frees it.
- **Peek**: hold Q facing a closed door or window to crack it. It makes no noise and you see a narrow slit of the room, up to 8 tiles. The door stays shut to zombies. Locked or barricaded doors can't be peeked; you walk at half speed while peeking.

## Weapon mods

- `MODS` in `src/data/items.js` is the mod table. **Silencer**: shots are heard 70% less far, only 40% of zombies in earshot react, and there is no muzzle flash. **Extended Mag**: 50% more rounds. Neither fits the Crossbow.
- Mods belong to the individual gun, so two pistols can differ. The icon shows the parts and S/M tags; the details panel lists them and shows the changed stats.
- Attach: drag a mod onto a gun, press E on it, or right-click it. Remove: right-click the gun or use the details panel. Rounds that no longer fit go back to your inventory.
- With `?testgear`, the Mod Stash in the safehouse holds 4 of each.
- Hold right-click with a gun to aim down sights: spread drops to 40% and the crosshair tightens.
- Silenced guns sound different by ammo (`SUPPRESSED` in `src/audio.js`): Light is a soft "pft", Medium a sharp "tsst" with a crack, Heavy a deep "thoomp" with a crack, Shotgun a wide "fwump". Each gun adds its own action (`SILENCED_ACTION`), like the rifle's hand-worked bolt or the shotgun's pump.

## Doors, windows and interiors

- Rooms are furnished by type (kitchen, bedroom, bathroom, living room) with fridges, stoves, sinks, counters, wardrobes, dressers, nightstands, bookshelves, TV stands, desks and filing cabinets, each with its own loot. Searched furniture shows open doors and pulled drawers.
- Some doors are locked: pry with a crowbar (quiet-ish) or smash them with any melee weapon (loud). Windows can be opened quietly and climbed through, or smashed. Broken glass can cut you. Zombies smash windows and climb in.

## Stealth and sound

- Zombies build suspicion (yellow ?) before they chase. Light, flashlight, sneaking, standing still, bushes and rain change how visible you are (HUD: Hidden / Low profile / Exposed / Detected).
- Unaware zombies barely see behind them. Sneak up (C) and hit one from behind with a weapon for a silent kill.
- Your noises show as faint rings. Unseen zombie sounds show as arrows at the screen edge.
- Audio is spatial: stereo panning, distance falloff, muffling through walls, indoor/outdoor reverb, surface-specific footsteps for you and nearby zombies.

## Core loop

Where this is heading, and the design rules for it: [docs/GAMEPLAY.md](docs/GAMEPLAY.md).

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

Tests: `node tests/sim.test.mjs` (headless sim), `node tests/mods.test.mjs` (mods and ADS), `node tests/coop.test.mjs` (relay, sync, prediction, traffic and loot rates), `tests/ui_audit.js` (paste in the browser console: panel stability and overflow), `tests/smoke*.mjs` (Playwright, needs `npm run build`).
