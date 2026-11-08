// Headless check of the 2.0 loop: board the bus, raid, get downed, get revived, extract, stash. Run: node tests/raid.test.mjs
import assert from 'node:assert';
import { createState, addPlayer, step, command, getInteract, startRaid } from '../src/sim/sim.js';
import { slotOf } from '../src/sim/inventory.js';
import { ITEMS } from '../src/data/items.js';
import { CITY_H, TILE } from '../src/config.js';
const tick = (s, inp = {}, n = 1) => { for (let i = 0; i < n; i++) { step(s, inp, 1 / 60); s.events.length = 0; } };

const s = createState(4242, false);
const a = addPlayer(s, 'p1'), b = addPlayer(s, 'p2');
assert(a.y > CITY_H * TILE, 'players start in the outpost');
assert.equal(s.zombies.length, 0, 'no zombies before a raid');
assert(slotOf(a.inv, 0) && ITEMS[slotOf(a.inv, 0).id].cat === 'melee', 'the knife sits on hotbar slot 1');

// boarding: the bus leaves only when both are on
a.boarded = true; tick(s);
assert(!s.raid, 'waits for the partner');
b.boarded = true; tick(s);
assert(s.raid && a.inRaid && b.inRaid, 'raid started');
assert(a.y < CITY_H * TILE && s.zombies.length > 300, 'dropped in a populated city');
const drop = s.world.containers[s.world.fixtures.drop];
a.x = (drop.x + 0.5) * TILE; a.y = (drop.y + 1.5) * TILE; a.ang = -Math.PI / 2;
const it = getInteract(s, a); assert(it && it.cid === drop.id, 'drop crate in reach: ' + JSON.stringify(it));
tick(s, { p1: { interact: true } }); tick(s, {}, 120);
assert(a.openCid === drop.id, 'drop crate opened');
const kit = drop.items.map((i) => ITEMS[i.id].cat);
assert.equal(kit.filter((c) => c === 'gun').length, 2, 'two guns'); assert.equal(kit.filter((c) => c === 'melee').length, 2, 'two melee');
assert(drop.items.filter((i) => ITEMS[i.id].cat === 'gun').every((g) => g.mag > 0), 'guns come loaded');
command(s, 'p1', { t: 'takeAll', cid: drop.id });
assert(a.inv.every((i, k, l) => i.slot >= 0 && i.slot < 36 && l.findIndex((j) => j.slot === i.slot) === k), 'unique slots');

// minecraft moves: swap two slots, split a stack
const s0 = slotOf(a.inv, 0), s1 = slotOf(a.inv, 1);
command(s, 'p1', { t: 'mv', a: { side: 'inv', i: 0 }, b: { side: 'inv', i: 1 } });
assert(slotOf(a.inv, 1) === s0 && slotOf(a.inv, 0) === s1, 'swap');
const ammo = a.inv.find((i) => ITEMS[i.id].cat === 'ammo' && i.n > 1), n0 = ammo.n;
command(s, 'p1', { t: 'mv', a: { side: 'inv', i: ammo.slot }, b: { side: 'inv', i: 35 }, n: 1 });
assert(ammo.n === n0 - 1 && slotOf(a.inv, 35).n === 1, 'split one off');

// a save mid-raid comes back in the same city
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
const { saveGame, loadGame } = await import('../src/save.js');
const { spawnZombie, newPlayer } = await import('../src/sim/sim.js');
assert(saveGame(s, null));
const back = loadGame(spawnZombie, newPlayer).state;
assert.equal(back.citySeed, s.citySeed); assert.equal(back.raid.id, s.raid.id);
assert.deepEqual(back.world.extract, s.world.extract, 'same extraction point');
assert(back.players.p1.inRaid === s.raid.id && back.players.p1.inv.length === a.inv.length, 'raider and gear restored');

// downed, revived by the partner
a.hp = -1; tick(s);
assert(a.downed && !a.dead, 'downed, not dead');
b.x = a.x + 20; b.y = a.y; b.ang = Math.PI;
tick(s, { p2: { interact: true, use: true } }); tick(s, { p2: { use: true } }, 250);
assert(!a.downed && a.hp > 0, 'revived');

// extraction
const e = s.world.extract;
for (const p of [a, b]) { p.x = e.x; p.y = e.y; }
s.zombies.length = 0; tick(s, {}, 60 * 5);
assert(!a.inRaid && !b.inRaid && !s.raid, 'both extracted, raid over');
assert(a.y > CITY_H * TILE, 'back in the outpost');

// stash it all, sorted by tab
const st = s.world.containers[s.world.fixtures.stash];
a.x = (st.x + 0.5) * TILE; a.y = (st.y + 1.5) * TILE; a.openCid = st.id;
command(s, 'p1', { t: 'putAll', cid: st.id });
assert(st.items.length > 4, 'stashed');

// both downed with nobody to help: the bleed-out clock ends the raid
a.boarded = b.boarded = true; tick(s);
a.hp = -1; b.hp = -1; tick(s);
assert(a.downed && b.downed);
tick(s, {}, 60 * 80);
assert(a.dead && b.dead && !s.raid, 'bled out');
// sealed rooms: keycard, twin levers, keypad. Each opens a door onto an armory with two loaded guns
{
  const t = createState(99, false), q = addPlayer(t, 'p1'); q.boarded = true; tick(t);
  const w = t.world, doors = Object.entries(w.doors).filter(([, d]) => d.vault).map(([i, d]) => [+i, d]);
  assert.equal(doors.length, 3, 'three sealed rooms');
  const at = (i) => { q.x = ((i % w.w) + 0.5) * TILE; q.y = (Math.floor(i / w.w) + 1.5) * TILE; q.ang = -Math.PI / 2; t.zombies.length = 0; };
  const [kv, dv] = doors.find(([, d]) => d.vault === 'vault');
  at(kv); tick(t, { p1: { interact: true } }); assert(dv.locked, 'no keycard, no entry');
  q.inv.push({ id: 'keycard', n: 1 }); at(kv); tick(t, { p1: { interact: true } }); assert(!dv.locked && dv.open, 'keycard opens the vault');
  assert(!q.inv.some((i) => i.id === 'keycard'), 'keycard used up');
  assert(w.containers.some((c) => c.bonus && c.bonus[0].id === 'keycard'), 'a keycard is hidden somewhere');
  const [, dl] = doors.find(([, d]) => d.vault === 'levers'), [l1, l2] = dl.levers.map((c) => w.containers[c]);
  const pull = (l) => { q.x = (l.x + 0.5) * TILE; q.y = (l.y + 1.5) * TILE; q.ang = -Math.PI / 2; tick(t, { p1: { interact: true } }); };
  pull(l1); t.time += 6; pull(l2); assert(dl.locked, 'six seconds apart: still shut');
  pull(l1); assert(!dl.locked, 'pulled together: open');
  const [kk, dk] = doors.find(([, d]) => d.vault === 'keypad');
  const notes = w.containers.filter((c) => c.bonus && c.bonus[0].id === 'note').map((c) => c.bonus[0].txt);
  assert.equal(notes.length, 4); const code = notes.map((n) => n.match(/is ([0-9])/)[1]).join('');
  at(kk); command(t, 'p1', { t: 'keypad', door: kk, code: '0000' === dk.code ? '1111' : '0000' }); assert(dk.locked, 'wrong code');
  command(t, 'p1', { t: 'keypad', door: kk, code }); assert(!dk.locked, 'the notes spell the code');
  const arm = w.containers.find((c) => c && c.type === 'armory');
  q.x = (arm.x + 0.5) * TILE; q.y = (arm.y + 1.5) * TILE; q.ang = -Math.PI / 2; tick(t, { p1: { interact: true } }); tick(t, {}, 120);
  const guns = arm.items.filter((i) => ITEMS[i.id].cat === 'gun');
  assert(guns.length >= 2 && guns.every((g) => g.mag > 0) && arm.items.some((i) => ITEMS[i.id].cat === 'ammo') && arm.items.some((i) => ITEMS[i.id].cat === 'mod'), 'armory: 2+ loaded guns, ammo and mods');
  // a partner rebuilding the world from the seeds lands in the same city
  const g = createState(t.seed, false, { citySeed: t.citySeed });
  assert.deepEqual(g.world.extract, w.extract); assert.equal(g.world.containers.length, t.baseConts);
}
// every raid is a different city: streets, buildings, bunkers, bus stop, extraction and loot
{
  const t = createState(5, false), q = addPlayer(t, 'p1'), sig = () => JSON.stringify([t.world.buildings.map((b) => [b.type, b.x, b.y]), t.world.extract, t.world.insert]);
  const seen = new Set(), surplus = new Set();
  for (let k = 0; k < 4; k++) {
    q.boarded = true; tick(t); assert(t.raid, 'raid ' + k);
    seen.add(sig()); surplus.add(t.raid.surplus);
    q.x = t.world.extract.x; q.y = t.world.extract.y; t.zombies.length = 0; tick(t, {}, 60 * 5); assert(!t.raid);
  }
  assert.equal(seen.size, 4, 'four raids, four different cities'); assert(surplus.size >= 2, 'the loot surplus changes');
}
console.log('raid test ok');
