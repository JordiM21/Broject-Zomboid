// Item definitions. cat: food, med, mat, melee, gun, ammo, bag, armor, throw, val
export const ITEMS = {
  beans: { name: 'Canned Beans', cat: 'food', w: 0.6, stack: 5, hunger: 35 },
  chips: { name: 'Chips', cat: 'food', w: 0.2, stack: 5, hunger: 15, thirst: -5 },
  apple: { name: 'Apple', cat: 'food', w: 0.2, stack: 6, hunger: 12, thirst: 6 },
  mre: { name: 'MRE', cat: 'food', w: 0.5, stack: 3, hunger: 60, thirst: 5 },
  water: { name: 'Water Bottle', cat: 'food', w: 0.5, stack: 5, thirst: 40 },
  soda: { name: 'Soda', cat: 'food', w: 0.4, stack: 5, thirst: 25, hunger: 5 },

  rag: { name: 'Rag', cat: 'med', w: 0.1, stack: 10, heal: 3, stopBleed: 0.6 },
  bandage: { name: 'Bandage', cat: 'med', w: 0.1, stack: 10, heal: 10, stopBleed: 1 },
  painkillers: { name: 'Painkillers', cat: 'med', w: 0.1, stack: 5, regen: 30 },
  antibiotics: { name: 'Antibiotics', cat: 'med', w: 0.1, stack: 5, cure: 1 },
  medkit: { name: 'First Aid Kit', cat: 'med', w: 0.8, stack: 2, heal: 45, stopBleed: 1 },

  scrap: { name: 'Scrap Metal', cat: 'mat', w: 0.5, stack: 100, roll: [2, 5] },
  plank: { name: 'Wood Plank', cat: 'mat', w: 0.8, stack: 100, roll: [1, 3] },
  nails: { name: 'Nails', cat: 'mat', w: 0.05, stack: 100, roll: [4, 12] },
  cloth: { name: 'Cloth', cat: 'mat', w: 0.1, stack: 100, roll: [2, 4] },
  tape: { name: 'Duct Tape', cat: 'mat', w: 0.2, stack: 100, roll: [1, 2] },
  electronics: { name: 'Electronics', cat: 'mat', w: 0.3, stack: 100, roll: [1, 2] },

  knife: { name: 'Kitchen Knife', cat: 'melee', w: 0.3, dmg: 22, range: 34, arc: 1.3, cd: 0.3, stam: 4, dur: 45, knock: 40 },
  bat: { name: 'Baseball Bat', cat: 'melee', w: 1.2, dmg: 30, range: 50, arc: 2.0, cd: 0.6, stam: 9, dur: 60, knock: 150 },
  spikedbat: { name: 'Spiked Bat', cat: 'melee', w: 1.4, dmg: 44, range: 50, arc: 2.0, cd: 0.62, stam: 9, dur: 70, knock: 150 },
  crowbar: { name: 'Crowbar', cat: 'melee', w: 1.5, dmg: 34, range: 46, arc: 1.6, cd: 0.55, stam: 8, dur: 140, knock: 110 },
  machete: { name: 'Machete', cat: 'melee', w: 1, dmg: 46, range: 48, arc: 1.7, cd: 0.48, stam: 8, dur: 70, knock: 80 },
  axe: { name: 'Fire Axe', cat: 'melee', w: 2.2, dmg: 70, range: 50, arc: 1.5, cd: 0.85, stam: 13, dur: 90, knock: 130 },

  katana: { name: 'Katana', cat: 'melee', w: 1.2, dmg: 58, range: 56, arc: 1.9, cd: 0.36, stam: 6, dur: 140, knock: 70, silent: true },
  sledge: { name: 'Sledgehammer', cat: 'melee', w: 4, dmg: 85, range: 52, arc: 1.7, cd: 1.15, stam: 18, dur: 160, knock: 340, stun: 1.2 },
  spear: { name: 'Spear', cat: 'melee', w: 1.6, dmg: 40, range: 74, arc: 0.55, cd: 0.45, stam: 6, dur: 90, knock: 100 },
  carbine: { name: 'Carbine', cat: 'gun', w: 3, dmg: 34, ammo: 'ammomed', mag: 24, cd: 0.13, reload: 2.0, spread: 0.035, noise: 28, range: 640, pellets: 1, pierce: 1 },
  crossbow: { name: 'Crossbow', cat: 'gun', w: 2.5, dmg: 100, ammo: 'ammomed', mag: 1, cd: 0.5, reload: 1.3, spread: 0.008, noise: 3, range: 720, pellets: 1, pierce: 2 },
  smg: { name: 'SMG', cat: 'gun', w: 2.2, dmg: 22, ammo: 'ammo9', mag: 30, cd: 0.075, reload: 1.8, spread: 0.1, noise: 26, range: 480, pellets: 1, pierce: 1 },
  bolt: { name: 'Crossbow Bolts', cat: 'ammo', w: 0.05, stack: 20, roll: [2, 5] },
  pistol: { name: 'Pistol', cat: 'gun', w: 0.9, dmg: 40, ammo: 'ammo9', mag: 12, cd: 0.22, reload: 1.3, spread: 0.05, noise: 22, range: 560, pellets: 1, pierce: 1 },
  shotgun: { name: 'Shotgun', cat: 'gun', w: 3, dmg: 24, ammo: 'shells', mag: 5, cd: 0.85, reload: 2.4, spread: 0.24, noise: 28, range: 320, pellets: 7, pierce: 1 },
  rifle: { name: 'Hunting Rifle', cat: 'gun', w: 3.5, dmg: 120, ammo: 'ammo308', mag: 5, cd: 1.1, reload: 2.4, spread: 0.01, noise: 34, range: 900, pellets: 1, pierce: 3 },
  ammo9: { name: 'Light Ammo', cat: 'ammo', w: 0.02, stack: 60, roll: [5, 14] },
  ammomed: { name: 'Medium Ammo', cat: 'ammo', w: 0.03, stack: 50, roll: [4, 10] },
  shells: { name: 'Shotgun Ammo', cat: 'ammo', w: 0.05, stack: 30, roll: [2, 6] },
  ammo308: { name: 'Heavy Ammo', cat: 'ammo', w: 0.05, stack: 30, roll: [2, 5] },

  schoolbag: { name: 'School Bag', cat: 'bag', w: 0.5, cap: 8 },
  hikingbag: { name: 'Hiking Pack', cat: 'bag', w: 1, cap: 16 },
  milbag: { name: 'Military Rucksack', cat: 'bag', w: 1.5, cap: 26 },
  jacket: { name: 'Leather Jacket', cat: 'armor', slot: 'body', w: 1, armor: 0.25, biteProt: 0.4 },
  vest: { name: 'Police Vest', cat: 'armor', slot: 'body', w: 2, armor: 0.45, biteProt: 0.6 },
  riotgear: { name: 'Riot Gear', cat: 'armor', slot: 'body', w: 4, armor: 0.62, biteProt: 0.85, slow: 0.9 },
  ghillie: { name: 'Ghillie Suit', cat: 'armor', slot: 'body', w: 1.5, armor: 0.1, biteProt: 0.2, stealth: 0.55 },
  helmet: { name: 'Motorcycle Helmet', cat: 'armor', slot: 'head', w: 1.2, armor: 0.12, biteProt: 0.25 },
  milhelmet: { name: 'Military Helmet', cat: 'armor', slot: 'head', w: 1.4, armor: 0.18, biteProt: 0.35 },
  nvg: { name: 'Night Vision Goggles', cat: 'armor', slot: 'head', w: 0.8, perk: 'nvg' },
  headlamp: { name: 'Headlamp', cat: 'armor', slot: 'head', w: 0.3, perk: 'headlamp' },
  jeans: { name: 'Thick Jeans', cat: 'armor', slot: 'legs', w: 0.8, armor: 0.04, biteProt: 0.12 },
  cargo: { name: 'Cargo Pants', cat: 'armor', slot: 'legs', w: 0.9, carry: 5 },
  kevlarpants: { name: 'Kevlar Pants', cat: 'armor', slot: 'legs', w: 2, armor: 0.15, biteProt: 0.3, slow: 0.97 },
  sneakers: { name: 'Soft Sneakers', cat: 'armor', slot: 'feet', w: 0.5, perk: 'quiet' },
  boots: { name: 'Combat Boots', cat: 'armor', slot: 'feet', w: 1.2, armor: 0.05, biteProt: 0.1, perk: 'glassproof' },
  runners: { name: 'Running Shoes', cat: 'armor', slot: 'feet', w: 0.4, perk: 'sprinter' },
  adrenaline: { name: 'Adrenaline Shot', cat: 'buff', w: 0.1, stack: 3, buff: 'adrenaline', time: 20 },
  energy: { name: 'Energy Drink', cat: 'buff', w: 0.3, stack: 5, buff: 'energy', time: 90, thirst: 15 },
  reviver: { name: 'Self-Revive Kit', cat: 'perk', w: 0.8, stack: 1 },

  silencer: { name: 'Silencer', cat: 'mod', w: 0.3 },
  extmag: { name: 'Extended Mag', cat: 'mod', w: 0.2 },

  noisemaker: { name: 'Noise Maker', cat: 'throw', w: 0.4, stack: 5 },
  pipebomb: { name: 'Pipe Bomb', cat: 'throw', w: 0.6, stack: 3 },

  watch: { name: 'Gold Watch', cat: 'val', w: 0.1, stack: 10, val: 5 },
  jewelry: { name: 'Jewelry', cat: 'val', w: 0.1, stack: 10, val: 8 },
  cash: { name: 'Cash Bundle', cat: 'val', w: 0.05, stack: 20, val: 3, roll: [1, 3] },
};

// Weapon mods. A gun carries at most one of each, listed in its `mods` array.
// noise: multiplies how far a shot is heard. alert: chance a zombie in earshot reacts. mag: multiplies magazine size.
export const MODS = {
  silencer: { short: 'S', color: '#5ad0c8', noise: 0.3, alert: 0.4, not: ['crossbow'] },
  extmag: { short: 'M', color: '#f0a040', mag: 1.5, not: ['crossbow'] },
};
export const modFits = (gunId, modId) => ITEMS[gunId].cat === 'gun' && !MODS[modId].not.includes(gunId);
// A gun's stats with its mods applied. Use this instead of ITEMS for anything mods can change.
export function gunStats(it) {
  const g = { ...ITEMS[it.id], alert: 1 };
  for (const id of it.mods || []) {
    const m = MODS[id];
    if (m.noise) g.noise = Math.round(g.noise * m.noise);
    if (m.alert) g.alert = m.alert;
    if (m.mag) g.mag = Math.round(g.mag * m.mag);
  }
  return g;
}
export const itemWeight = (it) => ITEMS[it.id].w + (it.mods || []).reduce((w, id) => w + ITEMS[id].w, 0);
export const MOD_STASH_ITEMS = ['silencer', 'silencer', 'silencer', 'silencer', 'extmag', 'extmag', 'extmag', 'extmag'];

export const CAT_COLOR = {
  food: '#e0a050', med: '#e05a5a', mat: '#9aa3ad', melee: '#c9c9c9', gun: '#6f8fb0', mod: '#5ad0c8',
  ammo: '#d9c26b', buff: '#5ad0c8', perk: '#ff6ab0', bag: '#8d6e4b', armor: '#5d7a5a', throw: '#c77ad6', val: '#f2d14a',
};

export const FISTS = { name: 'Fists', cat: 'melee', dmg: 9, range: 30, arc: 1.4, cd: 0.38, stam: 3, knock: 70 };

// Loot tables: rolls [min,max], entries [id, weight]
export const LOOT = {
  fridge: { rolls: [0, 3], t: [['beans', 2], ['water', 4], ['soda', 3], ['apple', 3], ['chips', 1]] },
  counter: { rolls: [0, 2], t: [['knife', 1.5], ['beans', 3], ['chips', 3], ['cloth', 2], ['tape', 1], ['rag', 2], ['water', 1]] },
  cabinet: { rolls: [0, 2], t: [['bandage', 4], ['rag', 3], ['painkillers', 3], ['antibiotics', 1], ['medkit', 0.4]] },
  wardrobe: { rolls: [0, 2], t: [['jeans', 1], ['cargo', 0.5], ['sneakers', 0.6], ['runners', 0.4], ['boots', 0.3], ['helmet', 0.15], ['cloth', 5], ['schoolbag', 1.2], ['hikingbag', 0.35], ['jacket', 0.6], ['rag', 2]] },
  dresser: { rolls: [0, 2], t: [['katana', 0.04], ['watch', 1.2], ['jewelry', 1], ['cash', 2], ['cloth', 2], ['ammo9', 0.6], ['pistol', 0.12], ['painkillers', 1]] },
  shelf: { rolls: [0, 2], t: [['tape', 2], ['electronics', 2], ['nails', 2], ['plank', 0.8], ['chips', 1], ['noisemaker', 0.3], ['cash', 0.6]] },
  toolbox: { rolls: [1, 3], t: [['headlamp', 0.3], ['nails', 4], ['scrap', 3], ['tape', 2], ['plank', 2], ['crowbar', 0.6], ['axe', 0.25], ['electronics', 1]] },
  car: { rolls: [0, 2], t: [['scrap', 4], ['water', 2], ['tape', 1], ['electronics', 1.5], ['bat', 0.5], ['ammo9', 0.5], ['shells', 0.4], ['crowbar', 0.3], ['cash', 0.8]] },
  grocery: { rolls: [1, 3], t: [['energy', 1], ['beans', 4], ['chips', 4], ['water', 4], ['soda', 3], ['apple', 2], ['mre', 0.3]] },
  pharmacy: { rolls: [1, 3], t: [['bandage', 4], ['painkillers', 3], ['antibiotics', 2], ['medkit', 1], ['rag', 2]] },
  hardware: { rolls: [1, 3], t: [['sledge', 0.3], ['spear', 0.2], ['nails', 4], ['plank', 4], ['scrap', 3], ['tape', 3], ['electronics', 2], ['crowbar', 0.5], ['axe', 0.4], ['machete', 0.3]] },
  register: { rolls: [0, 2], t: [['cash', 5], ['watch', 0.6], ['jewelry', 0.4]] },
  locker: { rolls: [1, 2], t: [['carbine', 0.25], ['ammomed', 1.5], ['helmet', 0.4], ['boots', 0.4], ['riotgear', 0.25], ['smg', 0.2], ['ammo9', 4], ['shells', 3], ['pistol', 1.2], ['shotgun', 0.7], ['rifle', 0.3], ['ammo308', 1], ['vest', 0.6], ['bandage', 2]] },
  crate: { rolls: [1, 3], t: [['crossbow', 0.25], ['ammomed', 1], ['ghillie', 0.2], ['spear', 0.4], ['energy', 0.6], ['mre', 2], ['water', 3], ['hikingbag', 0.6], ['milbag', 0.2], ['machete', 0.6], ['ammo308', 1], ['shells', 1], ['bandage', 2], ['rifle', 0.15]] },
};

export const CONTAINER_LABEL = {
  fridge: 'Fridge', counter: 'Counter', cabinet: 'Medicine Cabinet', wardrobe: 'Wardrobe', dresser: 'Dresser',
  shelf: 'Shelf', toolbox: 'Toolbox', car: 'Car', grocery: 'Store Shelf', pharmacy: 'Pharmacy Shelf',
  hardware: 'Hardware Rack', register: 'Cash Register', locker: 'Police Locker', crate: 'Supply Crate',
  stash: 'Stash', bench: 'Workbench', bed: 'Bed', body: 'Body Bag', pile: 'Dropped Items',
};

export const UPGRADES = [
  { id: 'stash', name: 'Stash Shelving', desc: 'More stash slots (24 → 40 → 64 → 96).', levels: [
    { plank: 3, nails: 8 }, { plank: 6, nails: 14, scrap: 4 }, { scrap: 10, tape: 4, plank: 6 }] },
  { id: 'bench', name: 'Workbench', desc: 'Unlocks crafting.', levels: [{ plank: 4, nails: 10, scrap: 2 }] },
  { id: 'bed', name: 'Proper Bed', desc: 'Sleep through the night and recover health.', levels: [{ plank: 3, cloth: 6 }] },
  { id: 'rain', name: 'Rain Collector', desc: '+2 Water Bottles in the stash every dawn.', levels: [{ scrap: 4, tape: 2, plank: 2 }] },
  { id: 'garden', name: 'Garden Bed', desc: '+3 Apples in the stash every dawn.', levels: [{ plank: 4, nails: 6, cloth: 2 }] },
  { id: 'locker', name: 'Armory Locker', desc: 'Respawn with a knife, bandages and water.', levels: [{ scrap: 6, nails: 8, plank: 2 }] },
  { id: 'radio', name: 'Ham Radio', desc: 'Trade valuables for supply drops.', levels: [{ electronics: 5, scrap: 3, tape: 2 }] },
];
export const STASH_CAP = [24, 40, 64, 96];

export const RECIPES = [
  { id: 'bandage', out: ['bandage', 1], cost: { cloth: 2 } },
  { id: 'spikedbat', out: ['spikedbat', 1], cost: { bat: 1, nails: 6 } },
  { id: 'noisemaker', out: ['noisemaker', 1], cost: { electronics: 1, tape: 1 } },
  { id: 'pipebomb', out: ['pipebomb', 1], cost: { scrap: 2, electronics: 1, tape: 1 } },
  { id: 'ammo9', out: ['ammo9', 8], cost: { scrap: 2 }, needs: 'locker' },
  { id: 'shells', out: ['shells', 4], cost: { scrap: 2, cloth: 1 }, needs: 'locker' },
  { id: 'ammomed', out: ['ammomed', 6], cost: { scrap: 3 }, needs: 'locker' },
  { id: 'ammo308', out: ['ammo308', 3], cost: { scrap: 3, electronics: 1 }, needs: 'locker' },
  { id: 'medkit', out: ['medkit', 1], cost: { bandage: 3, painkillers: 1, tape: 1 } },
  { id: 'plank', out: ['plank', 1], cost: { scrap: 1, nails: 2 } },
  { id: 'spear', out: ['spear', 1], cost: { plank: 2, knife: 1, tape: 1 } },
  { id: 'crossbow', out: ['crossbow', 1], cost: { plank: 3, scrap: 2, cloth: 3, tape: 2 } },
  { id: 'silencer', out: ['silencer', 1], cost: { scrap: 5, cloth: 4, tape: 3 } },
  { id: 'extmag', out: ['extmag', 1], cost: { scrap: 6, nails: 6, electronics: 1 } },
];

export const TRADE_COST = 12; // valuable points per supply drop
export const TRADE_POOL = [['ammo9', 14], ['ammomed', 10], ['ammo308', 5], ['shells', 6], ['bandage', 3], ['antibiotics', 1], ['mre', 2], ['electronics', 2], ['tape', 2], ['medkit', 1]];

export const OBJECTIVES = [
  { id: 'search', text: 'Search a container [E]' },
  { id: 'kill', text: 'Kill a zombie' },
  { id: 'deposit', text: 'Bring loot back and put it in the Stash' },
  { id: 'build', text: 'Build any upgrade at the Workbench' },
  { id: 'craft', text: 'Craft an item' },
  { id: 'night', text: 'Survive until dawn' },
  { id: 'all', text: 'Build every base upgrade' },
];

export const DESC_NEW = 1;
export const DESC = {
  silencer: 'Attach to a gun. Shots are heard much less far, and zombies in earshot often ignore them.', extmag: 'Attach to a gun. Holds 50% more rounds.',
  katana: 'Fast, long and silent. Kills unaware zombies in one cut, even without sneaking.', sledge: 'Slow and exhausting, but stuns everything it hits and sends zombies flying.',
  spear: 'Longest reach of any melee weapon. Narrow thrust: keep zombies at a distance.', crossbow: 'Near-silent and pierces two zombies. One shot per reload.', carbine: 'Accurate semi-auto rifle. The all-rounder for medium range.', ammomed: 'Medium ammo for carbines and crossbows.',
  smg: 'Hold the trigger to empty the magazine fast. Inaccurate.', bolt: 'Ammo for the Crossbow.',
  riotgear: 'Best protection in the game, but heavy: 10% slower.', ghillie: 'Camouflage: zombies have a much harder time seeing you.',
  adrenaline: 'For 20 s: +30% speed, +25% damage, no stamina drain.', energy: 'For 90 s: stamina recovers twice as fast. Also quenches thirst.',
  helmet: 'Protects your head from bites and blows.', milhelmet: 'Sturdy helmet. Solid bite protection.',
  nvg: 'See in the dark: night is much brighter while worn.', headlamp: 'Hands-free light: a wide glow around you at night. Zombies spot you a little easier.',
  jeans: 'Thick denim. A little bite protection.', cargo: 'Lots of pockets: +5 kg carry capacity.', kevlarpants: 'Bullet-proof weave on your legs. Slightly slower.',
  sneakers: 'Soft soles: your footsteps are much quieter.', boots: 'Tough soles: broken glass can no longer cut you.', runners: 'Run faster and tire less while sprinting.',
  reviver: 'Carry it. If you die, it brings you back once with half health and blasts nearby zombies away.',
  beans: 'Heavy but filling. Your main food source.', chips: 'Light snack. Makes you a little thirsty.', apple: 'Fresh fruit. A bit of food and water.',
  mre: 'Military ration. Fills you up for a long time.', water: 'Clean water. Thirst kills faster than hunger.', soda: 'Sugary drink. Decent for thirst.',
  rag: 'Improvised dressing. May fail to stop bleeding.', bandage: 'Always stops bleeding and heals a little. Craft from 2 Cloth.',
  painkillers: 'Heals slowly over time. Take before a fight.', antibiotics: 'Cures zombie infection. Carry one if you get bitten.',
  medkit: 'Stops bleeding and heals a lot. Slow to apply, so get clear first.',
  scrap: 'Base upgrades, ammo and pipe bombs.', plank: 'Base upgrades and door barricades.', nails: 'Upgrades, barricades and the Spiked Bat.',
  cloth: 'Craft Bandages. Also used for the bed and garden.', tape: 'Crafting staple for gadgets and repairs.', electronics: 'Noise Makers, Pipe Bombs and the Ham Radio.',
  knife: 'Fast and quiet. Short reach: shove first, then stab.', bat: 'Wide swing that knocks groups back. Good all-rounder.',
  spikedbat: 'A bat with nails. Hits much harder.', crowbar: 'Very durable. Lasts a long time.',
  machete: 'Fast, deadly blade with good reach.', axe: 'Huge damage but slow and tiring. Kills most zombies in one hit.',
  pistol: 'Reliable and light. Watch the Noise stat: shots draw zombies.', shotgun: 'Devastating up close, weak at range.',
  rifle: 'Pierces through lines of zombies. Slow to cycle.', ammo9: 'Light ammo for pistols and SMGs.', shells: 'Shotgun ammo.', ammo308: 'Heavy ammo for the hunting rifle.',
  schoolbag: 'Wear to carry more.', hikingbag: 'Wear to carry a lot more.', milbag: 'The best bag. Haul everything home.',
  jacket: 'Cuts damage and protects against bites.', vest: 'Heavy protection. Bites rarely get through.',
  noisemaker: 'Throw [G] to lure zombies away for 10 s.', pipebomb: 'Throw [X]. Explodes after 2 s. Lure a crowd first.',
  watch: 'Valuable. Trade over the Ham Radio.', jewelry: 'Valuable. Trade over the Ham Radio.', cash: 'Valuable. Trade over the Ham Radio.',
};

// Returns [label, value] pairs describing what an item does.
export function itemStats(it) {
  const d = ITEMS[it.id], s = [];
  if (d.cat === 'melee') {
    s.push(['Damage', d.dmg], ['Speed', (1 / d.cd).toFixed(1) + '/s'], ['Reach', d.range < 40 ? 'Short' : d.range < 49 ? 'Medium' : 'Long'], ['Knockback', d.knock >= 130 ? 'High' : d.knock >= 80 ? 'Medium' : 'Low']);
    if (it.dur !== undefined) s.push(['Durability', `${it.dur}/${d.dur}`]);
  } else if (d.cat === 'gun') {
    const g = gunStats(it);
    s.push(['Ammo type', ITEMS[d.ammo].name], ['Damage', d.pellets > 1 ? `${d.dmg}×${d.pellets}` : d.dmg], ['Magazine', `${it.mag ?? 0}/${g.mag}`], ['Noise', `${g.noise} tiles`]);
    if (g.alert < 1) s.push(['Zombies alerted', Math.round(g.alert * 100) + '%']);
    if (d.pierce > 1) s.push(['Pierce', d.pierce]);
    s.push(['Mods', (it.mods || []).map((id) => ITEMS[id].name).join(', ') || 'None']);
  } else if (d.cat === 'mod') {
    const m = MODS[it.id];
    if (m.noise) s.push(['Noise', '-' + Math.round((1 - m.noise) * 100) + '%']);
    if (m.alert) s.push(['Zombies alerted', Math.round(m.alert * 100) + '%']);
    if (m.mag) s.push(['Magazine', '+' + Math.round((m.mag - 1) * 100) + '%']);
    s.push(['Not for', m.not.map((id) => ITEMS[id].name).join(', ')]);
  } else if (d.cat === 'food') {
    if (d.hunger) s.push(['Food', (d.hunger > 0 ? '+' : '') + d.hunger]);
    if (d.thirst) s.push(['Water', (d.thirst > 0 ? '+' : '') + d.thirst]);
  } else if (d.cat === 'med') {
    if (d.heal) s.push(['Heal', '+' + d.heal]);
    if (d.stopBleed) s.push(['Stops bleeding', d.stopBleed >= 1 ? 'Always' : Math.round(d.stopBleed * 100) + '%']);
    if (d.regen) s.push(['Heal over time', '+' + d.regen]);
    if (d.cure) s.push(['Cures', 'Infection']);
  } else if (d.cat === 'bag') s.push(['Carry', '+' + d.cap + ' kg']);
  else if (d.cat === 'armor') { s.push(['Slot', { head: 'Head', body: 'Body', legs: 'Legs', feet: 'Feet' }[d.slot] || 'Body']); if (d.armor) s.push(['Damage taken', '-' + Math.round(d.armor * 100) + '%']); if (d.biteProt) s.push(['Bite protection', Math.round(d.biteProt * 100) + '%']); if (d.carry) s.push(['Carry', '+' + d.carry + ' kg']); if (d.perk) s.push(['Perk', PERK_NAME[d.perk]]); if (d.slow) s.push(['Speed', '-' + Math.round((1 - d.slow) * 100) + '%']); if (d.stealth) s.push(['Visibility', '-' + Math.round((1 - d.stealth) * 100) + '%']); }
  else if (d.cat === 'buff') s.push(['Duration', d.time + ' s']);
  else if (d.cat === 'perk') s.push(['Effect', 'Passive (carry it)']);
  if (d.silent) s.push(['Perk', 'Silent kills']);
  if (d.stun) s.push(['Stun', d.stun + ' s']);
  else if (d.cat === 'val') s.push(['Trade value', d.val]);
  else if (d.cat === 'ammo') s.push(['Used by', Object.values(ITEMS).filter((g) => g.ammo === it.id).map((g) => g.name).join(', ') || '—']);
  s.push(['Weight', +itemWeight(it).toFixed(2) + ' kg']);
  return s;
}

export const PERK_NAME = { nvg: 'Night vision', headlamp: 'Head light', quiet: 'Quiet steps', glassproof: 'Glass-proof', sprinter: 'Sprinter' };
export const CAT_ORDER = ['gun', 'melee', 'mod', 'ammo', 'perk', 'buff', 'med', 'food', 'throw', 'bag', 'armor', 'mat', 'val'];

LOOT.medcab = { rolls: [1, 3], t: [['adrenaline', 0.5], ['reviver', 0.08], ['bandage', 5], ['painkillers', 4], ['antibiotics', 3], ['medkit', 1.6], ['rag', 2], ['water', 1]] };
LOOT.milcrate = { rolls: [1, 3], t: [['carbine', 0.6], ['ammomed', 2], ['milhelmet', 0.6], ['nvg', 0.3], ['kevlarpants', 0.35], ['boots', 0.5], ['smg', 0.5], ['riotgear', 0.3], ['crossbow', 0.3], ['ammomed', 1], ['adrenaline', 0.5], ['reviver', 0.12], ['ammo9', 4], ['ammo308', 3], ['shells', 3], ['mre', 3], ['pistol', 1], ['shotgun', 0.8], ['rifle', 0.8], ['vest', 1], ['milbag', 0.6], ['pipebomb', 1], ['machete', 0.8], ['bandage', 1]] };
LOOT.zsoldier = { rolls: [1, 2], t: [['ammomed', 2], ['ammo9', 3], ['ammo308', 2], ['shells', 1], ['mre', 2], ['bandage', 2], ['pistol', 0.3], ['vest', 0.15], ['pipebomb', 0.3]] };
CONTAINER_LABEL.medcab = 'Medical Cabinet'; CONTAINER_LABEL.milcrate = 'Military Crate'; CONTAINER_LABEL.zsoldier = 'Soldier Corpse';
LOOT.stove = { rolls: [0, 2], t: [['beans', 3], ['chips', 1], ['knife', 1], ['rag', 1], ['mre', 0.2]] };
LOOT.sink = { rolls: [0, 2], t: [['rag', 3], ['cloth', 2], ['tape', 1], ['bandage', 0.6], ['water', 1]] };
LOOT.nightstand = { rolls: [0, 2], t: [['painkillers', 2], ['cash', 2], ['watch', 0.8], ['ammo9', 0.6], ['bandage', 1], ['pistol', 0.08]] };
LOOT.bookshelf = { rolls: [0, 1], t: [['tape', 1], ['cash', 1], ['electronics', 0.6], ['jewelry', 0.3]] };
LOOT.tvstand = { rolls: [0, 2], t: [['electronics', 4], ['tape', 1], ['noisemaker', 0.4]] };
LOOT.desk = { rolls: [0, 2], t: [['tape', 2], ['electronics', 2], ['cash', 1.5], ['nails', 1], ['painkillers', 0.6]] };
LOOT.filing = { rolls: [0, 2], t: [['cash', 1], ['tape', 1], ['electronics', 1], ['ammo9', 0.5], ['bandage', 0.5]] };
Object.assign(CONTAINER_LABEL, { rack: 'Weapon Rack (test)', modstash: 'Mod Stash (test)', stove: 'Stove', sink: 'Sink Cabinet', nightstand: 'Nightstand', bookshelf: 'Bookshelf', tvstand: 'TV Stand', desk: 'Desk', filing: 'Filing Cabinet' });
LOOT.zombie = { rolls: [0, 2], t: [['cash', 3], ['rag', 3], ['cloth', 2], ['bandage', 1.5], ['ammo9', 1.2], ['chips', 1], ['water', 1], ['watch', 0.8], ['painkillers', 0.8], ['shells', 0.5], ['jewelry', 0.4], ['tape', 0.5]] };
CONTAINER_LABEL.zombie = 'Zombie Corpse';

// ---------- loot economy ----------
// Weapons and mods are placed by location, not listed per table: each place says how likely each tier is there.
// Common tools turn up everywhere; the top tier is close to military-only. Tune the game's economy here.
export const WEAPON_TIERS = [
  ['knife', 'bat', 'crowbar'], // 1: common
  ['machete', 'spear', 'axe', 'pistol'], // 2: uncommon
  ['sledge', 'crossbow', 'shotgun', 'smg'], // 3: rare
  ['katana', 'carbine', 'rifle'], // 4: very rare
];
const MOD_IDS = Object.keys(MODS);
// tiers: total weight per tier. mods: total weight for mods. guns: false for places that only hold hand tools.
const ECONOMY = {
  milcrate: { tiers: [0.2, 1.2, 1.4, 0.5], mods: 0.8 }, // military outposts
  locker: { tiers: [0.8, 2, 0.8, 0.12], mods: 0.5 }, // police stations
  zsoldier: { tiers: [0, 0.3, 0.15, 0.04], mods: 0.08 },
  crate: { tiers: [0.5, 0.8, 0.3, 0.06], mods: 0.15 }, // forest camps
  hardware: { tiers: [1.2, 0.8, 0.3, 0], mods: 0.05, guns: false },
  toolbox: { tiers: [0.8, 0.25, 0.03, 0], mods: 0.04, guns: false },
  counter: { tiers: [0.8, 0, 0, 0], mods: 0, guns: false },
  stove: { tiers: [0.5, 0, 0, 0], mods: 0, guns: false },
  dresser: { tiers: [0.1, 0.12, 0.02, 0.005], mods: 0.01 }, // houses: rare
  nightstand: { tiers: [0.05, 0.12, 0.015, 0.003], mods: 0.01 },
  wardrobe: { tiers: [0.2, 0.05, 0.01, 0.002], mods: 0 },
  car: { tiers: [0.5, 0.15, 0.04, 0.008], mods: 0.03 },
};
const GUNS_OR_MODS = new Set([...WEAPON_TIERS.flat(), ...MOD_IDS]);
const isHandTool = (id) => ITEMS[id].cat !== 'gun' && id !== 'katana';
for (const tab of Object.values(LOOT)) tab.t = tab.t.filter(([id]) => !GUNS_OR_MODS.has(id)).map(([id, w]) => [id, ITEMS[id].cat === 'mat' ? w * 1.6 : w]); // basic materials turn up more
for (const [place, { tiers, mods, guns = true }] of Object.entries(ECONOMY)) {
  tiers.forEach((weight, tier) => {
    const ids = WEAPON_TIERS[tier].filter((id) => guns || isHandTool(id));
    if (weight > 0) for (const id of ids) LOOT[place].t.push([id, weight / ids.length]);
  });
  if (mods > 0) for (const id of MOD_IDS) LOOT[place].t.push([id, mods / MOD_IDS.length]);
}

// ---------- cases ----------
// Rare hidden finds. Weapon Case: one weapon, any in the game, better odds than the open world. Mod Case: one mod.
// Ammo Case: some of all four ammo types. Worldgen decides where they go; they never restock.
const CASE_TIERS = [22, 35, 30, 13];
LOOT.weaponcase = { rolls: [1, 1], t: [['spikedbat', 6], ...WEAPON_TIERS.flatMap((ids, tier) => ids.map((id) => [id, CASE_TIERS[tier] / ids.length]))] };
LOOT.modcase = { rolls: [1, 1], t: MOD_IDS.map((id) => [id, 1]) };
LOOT.ammocase = { all: true, t: ['ammo9', 'ammomed', 'shells', 'ammo308'].map((id) => [id, 1]) };
Object.assign(CONTAINER_LABEL, { weaponcase: 'Weapon Case', modcase: 'Mod Case', ammocase: 'Ammo Case' });

export const RACK_ITEMS = [['katana',1],['sledge',1],['spear',1],['crossbow',1],['ammomed',40],['carbine',1],['smg',1],['ammo9',60],['ammo9',60],['pistol',1],['shotgun',1],['shells',30],['rifle',1],['ammo308',30],['axe',1],['machete',1],['spikedbat',1],['crowbar',1],['bat',1],['riotgear',1],['ghillie',1],['vest',1],['jacket',1],['milbag',1],['adrenaline',3],['energy',3],['reviver',1],['pipebomb',3],['noisemaker',3],['medkit',2],['helmet',1],['milhelmet',1],['nvg',1],['headlamp',1],['jeans',1],['cargo',1],['kevlarpants',1],['sneakers',1],['boots',1],['runners',1],['hikingbag',1],['schoolbag',1]];
