// Headless check: clutter breaks underfoot (not when sneaking), bottles make noise, tables flip into cover zombies must bash through, the dodge roll moves you and dodges hits.
import assert from 'node:assert/strict';
import { createState, addPlayer, step, spawnZombie, ROLL_DUR } from '../src/sim/sim.js';
import { tableRect } from '../src/sim/props.js';

const s = createState(4242, false);
const p = addPlayer(s, 'p1');
const w = s.world;
assert.ok(w.clutter.length > 200, `clutter scattered: ${w.clutter.length}`);
assert.ok(w.tables.length > 20, `tables: ${w.tables.length}`);
const tick = (inp = {}, n = 1) => { const out = []; for (let i = 0; i < n; i++) { step(s, { p1: inp }, 1 / 60); out.push(...s.events); s.events.length = 0; } return out; };

// walking over books breaks them; sneaking over them doesn't
const book = w.clutter.find((c) => c.kind === 'books');
p.x = book.x - 30; p.y = book.y;
p.sneak = true; tick({ right: true }, 40); assert.equal(book.broken, undefined, 'sneaking steps around clutter');
p.x = book.x - 30; p.sneak = false;
let ev = tick({ right: true }, 40);
assert.ok(book.broken && ev.some((e) => e.type === 'clutter' && e.kind === 'books'), 'walking tramples the books');

// a bottle breaking is heard
const bottle = w.clutter.find((c) => c.kind === 'bottle' && !c.broken);
p.x = bottle.x - 30; p.y = bottle.y;
ev = tick({ right: true }, 40);
assert.ok(bottle.broken && ev.some((e) => e.type === 'noise'), 'broken glass makes a noise');

// a shot tears through the papers it passes over
const paper = w.clutter.find((c) => c.kind === 'papers' && !c.broken);
p.x = paper.x - 60; p.y = paper.y; p.wpn = { id: 'pistol', n: 1, mag: 12 }; p.inv.push(p.wpn);
ev = tick({ attack: true, mx: paper.x + 200, my: paper.y }, 4);
assert.ok(paper.broken, 'bullet shreds the papers');
p.wpn = null;

// flip a table: it becomes a slab that blocks zombies, and they bash through it
const ti = w.tables[0], t = w.props[ti];
const cx = (t.x + t.w / 2) * 32, cy = (t.y + t.h / 2) * 32;
p.x = cx; p.y = t.y * 32 - 14; p.ang = Math.PI / 2; // standing just north, facing it
ev = tick({ interact: true, mx: cx, my: cy + 50 });
assert.equal(t.flip, 3, 'flipped away from the player (south)');
assert.ok(tableRect(t) && ev.some((e) => e.type === 'tflip'));
const z = spawnZombie(s, cx, (t.y + t.h) * 32 + 30, 'walker');
z.state = 'chase'; z.pid = 'p1'; z.lx = p.x; z.ly = p.y;
let broke = false;
for (let i = 0; i < 60 * 30 && !broke; i++) { tick({}); assert.ok(t.hp <= 0 || z.y > (t.y + t.h) * 32 - 9, 'the slab holds the zombie back'); if (!t.hp) broke = true; }
assert.ok(broke, 'zombies eventually bash the table apart');

// dodge roll: travels a couple of tiles and a hit during it is dodged
p.x = (w.spawn.x); p.y = w.spawn.y; p.stamina = 100; p.roll = null;
const x0 = p.x;
ev = tick({ right: true, roll: true });
assert.ok(p.roll && ev.some((e) => e.type === 'roll'), 'roll started');
assert.ok(p.stamina < 100, 'roll costs stamina');
const hp0 = p.hp, z2 = spawnZombie(s, p.x + 20, p.y, 'walker'); z2.state = 'chase'; z2.pid = 'p1'; z2.atk = 0.01; z2.atkCd = 5;
ev = tick({ right: true }, 3);
assert.equal(p.hp, hp0, 'hit during the roll is dodged');
z2.hp = 0;
tick({}, Math.ceil(ROLL_DUR * 60) + 2);
assert.equal(p.roll, null, 'roll ends');
assert.ok(Math.abs(p.x - x0) > 50, `roll moved ${Math.round(p.x - x0)}px`);
// blood trail: a heavily bleeding player leaves drops; a zombie that never saw them follows the smell
{
  const s2 = createState(99, false), q = addPlayer(s2, 'p1'), W = s2.world;
  // a long open stretch of road to walk down
  let sx = 0, sy = 0;
  for (let ty = 20; ty < W.h - 20 && !sx; ty++) for (let tx = 20; tx < W.w - 40 && !sx; tx++) { let ok = true; for (let k = -6; k < 24 && ok; k++) ok = W.tiles[ty * W.w + tx + k] === 1 && !W.safe[ty * W.w + tx + k]; if (ok) { sx = tx; sy = ty; } }
  assert.ok(sx, 'found a road');
  q.x = (sx + 0.5) * 32; q.y = (sy + 0.5) * 32; q.bleeding = true; q.bleedLv = 3; q.hp = 100; q.sneak = true; q.flashlight = false;
  const zz = spawnZombie(s2, q.x - 5 * 32, q.y, 'walker'); zz.ang = Math.PI; // looking the other way
  const go = (inp, n) => { for (let i = 0; i < n; i++) { step(s2, { p1: inp }, 1 / 60); q.hp = 100; s2.events.length = 0; } };
  go({ right: true, mx: q.x + 500, my: q.y }, 60 * 6);
  assert.ok(s2.blood.length > 15, `left a trail of ${s2.blood.length} drops`);
  const d0 = Math.hypot(zz.x - q.x, zz.y - q.y);
  go({}, 60 * 8);
  const d1 = Math.hypot(zz.x - q.x, zz.y - q.y);
  assert.ok(d1 < d0 - 64, `the zombie followed the blood (${Math.round(d0)} -> ${Math.round(d1)} px)`);
  // drops dry up after a minute
  zz.hp = 0; q.bleeding = false; go({}, 60 * 62);
  assert.equal(s2.blood.length, 0, 'the trail dried up');
}
console.log('props test passed', { clutter: w.clutter.length, tables: w.tables.length, rolled: Math.round(p.x - x0) });
