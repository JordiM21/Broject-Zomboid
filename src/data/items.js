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

  scrap: { name: 'Scrap Metal', cat: 'mat', w: 0.5, stack: 20, roll: [1, 3] },
  plank: { name: 'Wood Plank', cat: 'mat', w: 0.8, stack: 10, roll: [1, 2] },
  nails: { name: 'Nails', cat: 'mat', w: 0.05, stack: 40, roll: [3, 9] },
  cloth: { name: 'Cloth', cat: 'mat', w: 0.1, stack: 20, roll: [1, 3] },
  tape: { name: 'Duct Tape', cat: 'mat', w: 0.2, stack: 10 },
  electronics: { name: 'Electronics', cat: 'mat', w: 0.3, stack: 10 },

  knife: { name: 'Kitchen Knife', cat: 'melee', w: 0.3, dmg: 22, range: 34, arc: 1.3, cd: 0.3, stam: 4, dur: 45, knock: 40 },
  bat: { name: 'Baseball Bat', cat: 'melee', w: 1.2, dmg: 30, range: 50, arc: 2.0, cd: 0.6, stam: 9, dur: 60, knock: 150 },
  spikedbat: { name: 'Spiked Bat', cat: 'melee', w: 1.4, dmg: 44, range: 50, arc: 2.0, cd: 0.62, stam: 9, dur: 70, knock: 150 },
  crowbar: { name: 'Crowbar', cat: 'melee', w: 1.5, dmg: 34, range: 46, arc: 1.6, cd: 0.55, stam: 8, dur: 140, knock: 110 },
  machete: { name: 'Machete', cat: 'melee', w: 1, dmg: 46, range: 48, arc: 1.7, cd: 0.48, stam: 8, dur: 70, knock: 80 },
  axe: { name: 'Fire Axe', cat: 'melee', w: 2.2, dmg: 70, range: 50, arc: 1.5, cd: 0.85, stam: 13, dur: 90, knock: 130 },

  katana: { name: 'Katana', cat: 'melee', w: 1.2, dmg: 58, range: 56, arc: 1.9, cd: 0.36, stam: 6, dur: 140, knock: 70, silent: true },
  sledge: { name: 'Sledgehammer', cat: 'melee', w: 4, dmg: 85, range: 52, arc: 1.7, cd: 1.15, stam: 18, dur: 160, knock: 340, stun: 1.2 },
  spear: { name: 'Spear', cat: 'melee', w: 1.6, dmg: 40, range: 74, arc: 0.55, cd: 0.45, stam: 6, dur: 90, knock: 100 },
  crossbow: { name: 'Crossbow', cat: 'gun', w: 2.5, dmg: 100, ammo: 'bolt', mag: 1, cd: 0.5, reload: 1.3, spread: 0.008, noise: 3, range: 720, pellets: 1, pierce: 2 },
  smg: { name: 'SMG', cat: 'gun', w: 2.2, dmg: 22, ammo: 'ammo9', mag: 30, cd: 0.075, reload: 1.8, spread: 0.1, noise: 26, range: 480, pellets: 1, pierce: 1 },
  bolt: { name: 'Crossbow Bolts', cat: 'ammo', w: 0.05, stack: 20, roll: [2, 5] },
  pistol: { name: 'Pistol', cat: 'gun', w: 0.9, dmg: 40, ammo: 'ammo9', mag: 12, cd: 0.22, reload: 1.3, spread: 0.05, noise: 22, range: 560, pellets: 1, pierce: 1 },
  shotgun: { name: 'Shotgun', cat: 'gun', w: 3, dmg: 24, ammo: 'shells', mag: 5, cd: 0.85, reload: 2.4, spread: 0.24, noise: 28, range: 320, pellets: 7, pierce: 1 },
  rifle: { name: 'Hunting Rifle', cat: 'gun', w: 3.5, dmg: 120, ammo: 'ammo308', mag: 5, cd: 1.1, reload: 2.4, spread: 0.01, noise: 34, range: 900, pellets: 1, pierce: 3 },
  ammo9: { name: '9mm Rounds', cat: 'ammo', w: 0.02, stack: 60, roll: [4, 12] },
  shells: { name: 'Shotgun Shells', cat: 'ammo', w: 0.05, stack: 30, roll: [2, 6] },
  ammo308: { name: '.308 Rounds', cat: 'ammo', w: 0.05, stack: 30, roll: [2, 5] },

  schoolbag: { name: 'School Bag', cat: 'bag', w: 0.5, cap: 8 },
  hikingbag: { name: 'Hiking Pack', cat: 'bag', w: 1, cap: 16 },
  milbag: { name: 'Military Rucksack', cat: 'bag', w: 1.5, cap: 26 },
  jacket: { name: 'Leather Jacket', cat: 'armor', w: 1, armor: 0.25, biteProt: 0.4 },
  vest: { name: 'Police Vest', cat: 'armor', w: 2, armor: 0.45, biteProt: 0.6 },
  riotgear: { name: 'Riot Gear', cat: 'armor', w: 4, armor: 0.62, biteProt: 0.85, slow: 0.9 },
  ghillie: { name: 'Ghillie Suit', cat: 'armor', w: 1.5, armor: 0.1, biteProt: 0.2, stealth: 0.55 },
  adrenaline: { name: 'Adrenaline Shot', cat: 'buff', w: 0.1, stack: 3, buff: 'adrenaline', time: 20 },
  energy: { name: 'Energy Drink', cat: 'buff', w: 0.3, stack: 5, buff: 'energy', time: 90, thirst: 15 },
  reviver: { name: 'Self-Revive Kit', cat: 'perk', w: 0.8, stack: 1 },

  noisemaker: { name: 'Noise Maker', cat: 'throw', w: 0.4, stack: 5 },
  pipebomb: { name: 'Pipe Bomb', cat: 'throw', w: 0.6, stack: 3 },

  watch: { name: 'Gold Watch', cat: 'val', w: 0.1, stack: 10, val: 5 },
  jewelry: { name: 'Jewelry', cat: 'val', w: 0.1, stack: 10, val: 8 },
  cash: { name: 'Cash Bundle', cat: 'val', w: 0.05, stack: 20, val: 3, roll: [1, 3] },
};

export const CAT_COLOR = {
  food: '#e0a050', med: '#e05a5a', mat: '#9aa3ad', melee: '#c9c9c9', gun: '#6f8fb0',
  ammo: '#d9c26b', buff: '#5ad0c8', perk: '#ff6ab0', bag: '#8d6e4b', armor: '#5d7a5a', throw: '#c77ad6', val: '#f2d14a',
};

export const FISTS = { name: 'Fists', cat: 'melee', dmg: 9, range: 30, arc: 1.4, cd: 0.38, stam: 3, knock: 70 };

// Loot tables: rolls [min,max], entries [id, weight]
export const LOOT = {
  fridge: { rolls: [0, 3], t: [['beans', 2], ['water', 4], ['soda', 3], ['apple', 3], ['chips', 1]] },
  counter: { rolls: [0, 2], t: [['knife', 1.5], ['beans', 3], ['chips', 3], ['cloth', 2], ['tape', 1], ['rag', 2], ['water', 1]] },
  cabinet: { rolls: [0, 2], t: [['bandage', 4], ['rag', 3], ['painkillers', 3], ['antibiotics', 1], ['medkit', 0.4]] },
  wardrobe: { rolls: [0, 2], t: [['cloth', 5], ['schoolbag', 1.2], ['hikingbag', 0.35], ['jacket', 0.6], ['rag', 2]] },
  dresser: { rolls: [0, 2], t: [['katana', 0.04], ['watch', 1.2], ['jewelry', 1], ['cash', 2], ['cloth', 2], ['ammo9', 0.6], ['pistol', 0.12], ['painkillers', 1]] },
  shelf: { rolls: [0, 2], t: [['tape', 2], ['electronics', 2], ['nails', 2], ['plank', 0.8], ['chips', 1], ['noisemaker', 0.3], ['cash', 0.6]] },
  toolbox: { rolls: [1, 3], t: [['nails', 4], ['scrap', 3], ['tape', 2], ['plank', 2], ['crowbar', 0.6], ['axe', 0.25], ['electronics', 1]] },
  car: { rolls: [0, 2], t: [['scrap', 4], ['water', 2], ['tape', 1], ['electronics', 1.5], ['bat', 0.5], ['ammo9', 0.5], ['shells', 0.4], ['crowbar', 0.3], ['cash', 0.8]] },
  grocery: { rolls: [1, 3], t: [['energy', 1], ['beans', 4], ['chips', 4], ['water', 4], ['soda', 3], ['apple', 2], ['mre', 0.3]] },
  pharmacy: { rolls: [1, 3], t: [['bandage', 4], ['painkillers', 3], ['antibiotics', 2], ['medkit', 1], ['rag', 2]] },
  hardware: { rolls: [1, 3], t: [['sledge', 0.3], ['spear', 0.2], ['nails', 4], ['plank', 4], ['scrap', 3], ['tape', 3], ['electronics', 2], ['crowbar', 0.5], ['axe', 0.4], ['machete', 0.3]] },
  register: { rolls: [0, 2], t: [['cash', 5], ['watch', 0.6], ['jewelry', 0.4]] },
  locker: { rolls: [1, 2], t: [['riotgear', 0.25], ['smg', 0.2], ['ammo9', 4], ['shells', 3], ['pistol', 1.2], ['shotgun', 0.7], ['rifle', 0.3], ['ammo308', 1], ['vest', 0.6], ['bandage', 2]] },
  crate: { rolls: [1, 3], t: [['crossbow', 0.25], ['bolt', 0.8], ['ghillie', 0.2], ['spear', 0.4], ['energy', 0.6], ['mre', 2], ['water', 3], ['hikingbag', 0.6], ['milbag', 0.2], ['machete', 0.6], ['ammo308', 1], ['shells', 1], ['bandage', 2], ['rifle', 0.15]] },
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
  { id: 'medkit', out: ['medkit', 1], cost: { bandage: 3, painkillers: 1, tape: 1 } },
  { id: 'plank', out: ['plank', 1], cost: { scrap: 1, nails: 2 } },
];

export const TRADE_COST = 12; // valuable points per supply drop
export const TRADE_POOL = [['ammo9', 14], ['shells', 6], ['bandage', 3], ['antibiotics', 1], ['mre', 2], ['electronics', 2], ['tape', 2], ['medkit', 1]];

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
  katana: 'Fast, long and silent. Kills unaware zombies in one cut, even without sneaking.', sledge: 'Slow and exhausting, but stuns everything it hits and sends zombies flying.',
  spear: 'Longest reach of any melee weapon. Narrow thrust: keep zombies at a distance.', crossbow: 'Near-silent and pierces two zombies. One bolt per reload.',
  smg: 'Hold the trigger to empty 30 rounds fast. Inaccurate and very loud.', bolt: 'Ammo for the Crossbow.',
  riotgear: 'Best protection in the game, but heavy: 10% slower.', ghillie: 'Camouflage: zombies have a much harder time seeing you.',
  adrenaline: 'For 20 s: +30% speed, +25% damage, no stamina drain.', energy: 'For 90 s: stamina recovers twice as fast. Also quenches thirst.',
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
  pistol: 'Reliable, but every shot is heard 22 tiles away.', shotgun: 'Devastating up close. Very loud.',
  rifle: 'Pierces through lines of zombies. Extremely loud.', ammo9: 'Ammo for the Pistol.', shells: 'Ammo for the Shotgun.', ammo308: 'Ammo for the Hunting Rifle.',
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
    s.push(['Damage', d.pellets > 1 ? `${d.dmg}×${d.pellets}` : d.dmg], ['Magazine', `${it.mag ?? 0}/${d.mag}`], ['Ammo', ITEMS[d.ammo].name], ['Noise', `${d.noise} tiles`]);
    if (d.pierce > 1) s.push(['Pierce', d.pierce]);
  } else if (d.cat === 'food') {
    if (d.hunger) s.push(['Food', (d.hunger > 0 ? '+' : '') + d.hunger]);
    if (d.thirst) s.push(['Water', (d.thirst > 0 ? '+' : '') + d.thirst]);
  } else if (d.cat === 'med') {
    if (d.heal) s.push(['Heal', '+' + d.heal]);
    if (d.stopBleed) s.push(['Stops bleeding', d.stopBleed >= 1 ? 'Always' : Math.round(d.stopBleed * 100) + '%']);
    if (d.regen) s.push(['Heal over time', '+' + d.regen]);
    if (d.cure) s.push(['Cures', 'Infection']);
  } else if (d.cat === 'bag') s.push(['Carry', '+' + d.cap + ' kg']);
  else if (d.cat === 'armor') { s.push(['Damage taken', '-' + Math.round(d.armor * 100) + '%'], ['Bite protection', Math.round(d.biteProt * 100) + '%']); if (d.slow) s.push(['Speed', '-' + Math.round((1 - d.slow) * 100) + '%']); if (d.stealth) s.push(['Visibility', '-' + Math.round((1 - d.stealth) * 100) + '%']); }
  else if (d.cat === 'buff') s.push(['Duration', d.time + ' s']);
  else if (d.cat === 'perk') s.push(['Effect', 'Passive (carry it)']);
  if (d.silent) s.push(['Perk', 'Silent kills']);
  if (d.stun) s.push(['Stun', d.stun + ' s']);
  else if (d.cat === 'val') s.push(['Trade value', d.val]);
  s.push(['Weight', d.w + ' kg']);
  return s;
}

export const CAT_ORDER = ['gun', 'melee', 'ammo', 'perk', 'buff', 'med', 'food', 'throw', 'bag', 'armor', 'mat', 'val'];

LOOT.medcab = { rolls: [1, 3], t: [['adrenaline', 0.5], ['reviver', 0.08], ['bandage', 5], ['painkillers', 4], ['antibiotics', 3], ['medkit', 1.6], ['rag', 2], ['water', 1]] };
LOOT.milcrate = { rolls: [1, 3], t: [['smg', 0.5], ['riotgear', 0.3], ['crossbow', 0.3], ['bolt', 0.8], ['adrenaline', 0.5], ['reviver', 0.12], ['ammo9', 4], ['ammo308', 3], ['shells', 3], ['mre', 3], ['pistol', 1], ['shotgun', 0.8], ['rifle', 0.8], ['vest', 1], ['milbag', 0.6], ['pipebomb', 1], ['machete', 0.8], ['bandage', 1]] };
LOOT.zsoldier = { rolls: [1, 2], t: [['ammo9', 3], ['ammo308', 2], ['shells', 1], ['mre', 2], ['bandage', 2], ['pistol', 0.3], ['vest', 0.15], ['pipebomb', 0.3]] };
CONTAINER_LABEL.medcab = 'Medical Cabinet'; CONTAINER_LABEL.milcrate = 'Military Crate'; CONTAINER_LABEL.zsoldier = 'Soldier Corpse';
LOOT.stove = { rolls: [0, 2], t: [['beans', 3], ['chips', 1], ['knife', 1], ['rag', 1], ['mre', 0.2]] };
LOOT.sink = { rolls: [0, 2], t: [['rag', 3], ['cloth', 2], ['tape', 1], ['bandage', 0.6], ['water', 1]] };
LOOT.nightstand = { rolls: [0, 2], t: [['painkillers', 2], ['cash', 2], ['watch', 0.8], ['ammo9', 0.6], ['bandage', 1], ['pistol', 0.08]] };
LOOT.bookshelf = { rolls: [0, 1], t: [['tape', 1], ['cash', 1], ['electronics', 0.6], ['jewelry', 0.3]] };
LOOT.tvstand = { rolls: [0, 2], t: [['electronics', 4], ['tape', 1], ['noisemaker', 0.4]] };
LOOT.desk = { rolls: [0, 2], t: [['tape', 2], ['electronics', 2], ['cash', 1.5], ['nails', 1], ['painkillers', 0.6]] };
LOOT.filing = { rolls: [0, 2], t: [['cash', 1], ['tape', 1], ['electronics', 1], ['ammo9', 0.5], ['bandage', 0.5]] };
Object.assign(CONTAINER_LABEL, { rack: 'Weapon Rack (test)',  stove: 'Stove', sink: 'Sink Cabinet', nightstand: 'Nightstand', bookshelf: 'Bookshelf', tvstand: 'TV Stand', desk: 'Desk', filing: 'Filing Cabinet' });
LOOT.zombie = { rolls: [0, 2], t: [['cash', 3], ['rag', 3], ['cloth', 2], ['bandage', 1.5], ['ammo9', 1.2], ['chips', 1], ['water', 1], ['watch', 0.8], ['painkillers', 0.8], ['shells', 0.5], ['jewelry', 0.4], ['tape', 0.5]] };
CONTAINER_LABEL.zombie = 'Zombie Corpse';

export const RACK_ITEMS = [['katana',1],['sledge',1],['spear',1],['crossbow',1],['bolt',20],['smg',1],['ammo9',60],['ammo9',60],['pistol',1],['shotgun',1],['shells',30],['rifle',1],['ammo308',30],['axe',1],['machete',1],['spikedbat',1],['crowbar',1],['bat',1],['riotgear',1],['ghillie',1],['vest',1],['jacket',1],['milbag',1],['adrenaline',3],['energy',3],['reviver',1],['pipebomb',3],['noisemaker',3],['medkit',2]];
