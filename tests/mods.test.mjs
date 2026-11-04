// Headless check for weapon mods and ADS: node tests/mods.test.mjs
import assert from 'node:assert';
import { createState, addPlayer, step, command, spawnZombie, gunSpread, getCont } from '../src/sim/sim.js';
import { ITEMS, gunStats, MOD_STASH_ITEMS } from '../src/data/items.js';
import { makeItem, invWeight, countItem } from '../src/sim/inventory.js';

const s = createState(12345, false);
const p = addPlayer(s, 'p1');
const idx = (id) => p.inv.findIndex((i) => i.id === id);
const give = (id, n = 1) => { const it = makeItem(id, n); p.inv.push(it); return it; };

// the test stash is stocked
const stash = getCont(s, s.world.fixtures.modstash);
assert.deepStrictEqual(stash.items.map((i) => i.id), MOD_STASH_ITEMS);

// stats: mods change this gun only, never the shared definition
const pistol = give('pistol'), plain = give('pistol'), wBefore = invWeight(p.inv);
give('silencer'); give('extmag'); const wWith = invWeight(p.inv);
command(s, 'p1', { t: 'attachMod', idx: idx('silencer'), gun: p.inv.indexOf(pistol) });
command(s, 'p1', { t: 'attachMod', idx: idx('extmag'), gun: p.inv.indexOf(pistol) });
assert.deepStrictEqual(pistol.mods, ['silencer', 'extmag']);
assert.strictEqual(idx('silencer'), -1, 'attaching uses up the mod');
assert.strictEqual(gunStats(pistol).mag, 18); assert.strictEqual(gunStats(pistol).noise, 7);
assert.strictEqual(gunStats(plain).mag, 12); assert.strictEqual(gunStats(plain).noise, 22);
assert.strictEqual(ITEMS.pistol.mag, 12);
assert.ok(invWeight(p.inv) > wBefore && Math.abs(invWeight(p.inv) - wWith) < 1e-9, 'attached mods still weigh the same');

// no doubles, and nothing on the crossbow
give('silencer');
command(s, 'p1', { t: 'attachMod', idx: idx('silencer'), gun: p.inv.indexOf(pistol) });
assert.strictEqual(pistol.mods.length, 2); assert.ok(idx('silencer') >= 0, 'a rejected mod is kept');
const bow = give('crossbow');
command(s, 'p1', { t: 'attachMod', idx: idx('silencer'), gun: p.inv.indexOf(bow) });
assert.strictEqual(bow.mods, undefined);

// E attaches to the equipped gun first
p.wpn = plain;
command(s, 'p1', { t: 'use', idx: idx('silencer') });
assert.deepStrictEqual(plain.mods, ['silencer']);
command(s, 'p1', { t: 'detachMod', idx: p.inv.indexOf(plain), mod: 'silencer' });
assert.deepStrictEqual(plain.mods, []); assert.ok(idx('silencer') >= 0);

// reload fills the bigger mag; removing the mag returns the extra rounds and keeps the rest
p.wpn = pistol; give('ammo9', 60);
step(s, { p1: { reload: true } }, 1 / 60);
for (let k = 0; k < 120; k++) step(s, { p1: {} }, 1 / 60);
assert.strictEqual(pistol.mag, 18);
const ammo = countItem(p.inv, 'ammo9');
command(s, 'p1', { t: 'detachMod', idx: p.inv.indexOf(pistol), mod: 'extmag' });
assert.strictEqual(pistol.mag, 12); assert.strictEqual(countItem(p.inv, 'ammo9'), ammo + 6);
assert.strictEqual(idx('extmag') >= 0, true);

// ADS: spread and the crosshair formula drop while held, only with a gun
const wd = ITEMS.pistol;
step(s, { p1: {} }, 1 / 60); const hip = gunSpread(p, wd);
step(s, { p1: { aim: true } }, 1 / 60); const ads = gunSpread(p, wd);
assert.ok(p.ads); assert.ok(Math.abs(ads / hip - 0.4) < 0.02, `ads ${ads} hip ${hip}`);
p.wpn = null; step(s, { p1: { aim: true } }, 1 / 60); assert.strictEqual(p.ads, false);

// awareness: count idle zombies, facing away, that react to one shot from a given gun
function reactions(mods, tiles) {
  const t = createState(777, false), q = addPlayer(t, 'p1');
  q.x = t.world.safeRect.x * 32 - 1600; q.y = t.world.safeRect.y * 32; q.hunger = q.thirst = 100; t.weather.rain = t.weather.target = 0;
  const gun = makeItem('pistol'); gun.mag = 12; gun.mods = mods; q.inv.push(gun); q.wpn = gun;
  const zs = [];
  for (let k = 0; k < 300; k++) { const a = (k / 300) * Math.PI * 2, z = spawnZombie(t, q.x + Math.cos(a) * tiles * 32, q.y + Math.sin(a) * tiles * 32, 'walker'); z.ang = a; z.think = 99; zs.push(z); }
  step(t, { p1: { mx: q.x + 100, my: q.y, attack: true } }, 1 / 60);
  return zs.filter((z) => z.state === 'investigate').length;
}
const loud = reactions([], 6), quiet = reactions(['silencer'], 6), far = reactions(['silencer'], 12), farLoud = reactions([], 12);
console.log('zombies reacting of 300 | plain 6 tiles', loud, '| silenced 6 tiles', quiet, '| plain 12 tiles', farLoud, '| silenced 12 tiles', far);
assert.ok(loud > 280, 'a plain shot alerts nearly everyone in earshot');
assert.ok(quiet > 60 && quiet < 190, 'a silenced shot alerts about 40%');
assert.ok(farLoud > 280); assert.strictEqual(far, 0, 'silenced shots are not heard at 12 tiles');

// rotating view: W follows the facing, and fixed movement is unchanged
{
  const t = createState(99, false), q = addPlayer(t, 'p1');
  const free = t.world.spawn; q.x = free.x; q.y = free.y;
  const walk = (inp) => { const x = q.x, y = q.y; step(t, { p1: { mx: q.x + 100, my: q.y, ...inp } }, 1 / 60); return [q.x - x, q.y - y]; };
  const [fx, fy] = walk({ up: true, relative: true }); assert.ok(fx > 1 && Math.abs(fy) < 0.01, `W walks where you face: ${fx},${fy}`);
  const [sx, sy] = walk({ right: true, relative: true }); assert.ok(sy > 1 && Math.abs(sx) < 0.01, `D strafes right: ${sx},${sy}`);
  const [ax, ay] = walk({ up: true }); assert.ok(ay < -1 && Math.abs(ax) < 0.01, `fixed view: W is up the screen: ${ax},${ay}`);
}

// peek: find a closed house door, stand at it, and check it's silent, doesn't open it, and shows the room
{
  const t = createState(4242, false), q = addPlayer(t, 'p1'), w = t.world;
  const { peekSees, los } = await import('../src/world/world.js');
  const i = +Object.keys(w.doors).find((k) => { const d = w.doors[k]; return !d.open && !d.locked && !d.bar && !d.broken && w.bld[k] >= 0 && !w.safe[k]; });
  const tx = i % w.w, ty = Math.floor(i / w.w), d = w.doors[i];
  const horiz = w.tiles[i - 1] === 4 || w.tiles[i + 1] === 4; // wall tiles either side: the door faces up and down
  const sign = w.bld[(horiz ? ty + 1 : ty) * w.w + (horiz ? tx : tx + 1)] >= 0 && w.tiles[(horiz ? ty + 1 : ty) * w.w + (horiz ? tx : tx + 1)] !== 4 ? 1 : -1; // which side the room is on
  const out = horiz ? { x: (tx + 0.5) * 32, y: (ty + 0.5 - sign * 1.1) * 32 } : { x: (tx + 0.5 - sign * 1.1) * 32, y: (ty + 0.5) * 32 };
  const inside = horiz ? { x: (tx + 0.5) * 32, y: (ty + 0.5 + sign * 3) * 32 } : { x: (tx + 0.5 + sign * 3) * 32, y: (ty + 0.5) * 32 };
  q.x = out.x; q.y = out.y; t.zombies.length = 0;
  assert.strictEqual(los(w, q.x, q.y, inside.x, inside.y), false, 'a shut door blocks the view');
  const events = [];
  const hold = (inp) => { step(t, { p1: { mx: (tx + 0.5) * 32, my: (ty + 0.5) * 32, ...inp } }, 1 / 60); events.push(...t.events); t.events.length = 0; };
  hold({ peek: true, peekStart: true }); hold({ peek: true });
  assert.ok(q.peek && q.peek.i === i, 'holding peek at a door cracks it');
  assert.strictEqual(d.open, false, 'the door stays shut');
  assert.ok(peekSees(w, q, q.peek, inside.x, inside.y), 'you can see the room through the gap');
  assert.ok(!events.some((e) => e.type === 'noise'), 'peeking makes no noise');
  const off = horiz ? { x: inside.x + 96, y: inside.y } : { x: inside.x, y: inside.y + 96 };
  assert.ok(!peekSees(w, q, q.peek, off.x, off.y), 'only a slit of it, not the whole room');
  hold({}); assert.strictEqual(q.peek, null, 'letting go ends it');
  d.locked = true; hold({ peek: true }); assert.ok(!q.peek, 'a locked door has no gap'); d.locked = false;
}

// save and load: mods, the hotbar reference and the emptied stash all survive
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
const { saveGame, loadGame } = await import('../src/save.js');
const { newPlayer } = await import('../src/sim/sim.js');
const sv = createState(4242, false), q = addPlayer(sv, 'p1');
const modded = makeItem('smg'); modded.mods = ['silencer', 'extmag']; modded.mag = 40; q.inv.push(modded); q.wpn = modded;
command(sv, 'p1', { t: 'hotbar', slot: 3, idx: q.inv.indexOf(modded) });
const st = getCont(sv, sv.world.fixtures.modstash); st.items.splice(0, 3);
assert.ok(saveGame(sv, null));
const back = loadGame(spawnZombie, newPlayer).state, q2 = back.players.p1;
assert.deepStrictEqual(q2.wpn.mods, ['silencer', 'extmag']); assert.strictEqual(q2.wpn.mag, 40); assert.strictEqual(gunStats(q2.wpn).mag, 45);
assert.strictEqual(q2.hotbar[3].ref, q2.wpn);
assert.strictEqual(getCont(back, back.world.fixtures.modstash).items.length, MOD_STASH_ITEMS.length - 3);

console.log('mods test passed');
