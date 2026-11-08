// Headless co-op and loot checks: node tests/coop.test.mjs
import assert from 'node:assert';
import { createServer } from 'node:http';
import { WebSocket } from 'ws';
import { attachRelay, makeToken, tokenOK } from '../server/relay.mjs';
import { createState, addPlayer, joinPlayer, parkPlayer, step, command, spawnZombie, predictMove, getCont } from '../src/sim/sim.js';
import { newTracker, packFrame, packWorld, applyFrame, applyWorld, smooth, compactInput, nextInput, newInputQueue } from '../src/net/sync.js';
import { rollLoot, makeItem } from '../src/sim/inventory.js';
import { SOLID } from '../src/world/worldgen.js';
import { ITEMS, LOOT, RECIPES, WEAPON_TIERS } from '../src/data/items.js';

// ---------- relay ----------
{
  const http = createServer(); const relay = attachRelay(http); await new Promise((r) => http.listen(0, r));
  const url = `ws://localhost:${http.address().port}/coop`;
  const open = (q) => { const ws = new WebSocket(`${url}?${q}`); ws.got = []; ws.on('message', (m) => ws.got.push(JSON.parse(m))); return new Promise((r) => ws.on('open', () => r(ws))); };
  const until = async (fn) => { for (let k = 0; k < 200; k++) { const v = fn(); if (v) return v; await new Promise((r) => setTimeout(r, 5)); } throw new Error('timed out: ' + fn); };
  const a = await open('role=host');
  const { code } = await until(() => a.got.find((m) => m.relay === 'room'));
  assert.match(code, /^[A-Z]{4}$/);
  const bad = await open('room=ZZZZ'); await until(() => bad.got.find((m) => m.relay === 'error'));
  const b = await open(`room=${code.toLowerCase()}`);
  await until(() => a.got.find((m) => m.relay === 'peer-joined'));
  a.send(JSON.stringify({ k: 'x', n: 1 })); await until(() => b.got.find((m) => m.k === 'x'));
  b.send(JSON.stringify({ k: 'y', n: 2 })); await until(() => a.got.find((m) => m.k === 'y'));
  const third = await open(`room=${code}`); await until(() => third.got.find((m) => m.relay === 'error'));
  b.close(); await until(() => a.got.find((m) => m.relay === 'peer-left'));
  const c = await open(`room=${code}`); await until(() => a.got.filter((m) => m.relay === 'peer-joined').length === 2);
  a.close(); await until(() => c.got.find((m) => m.relay === 'host-left'));
  await until(() => relay.rooms.size === 0);
  relay.close(); http.close();
  console.log('relay: rooms, codes, forwarding, full room and leaving all work');
}
// ---------- relay password ----------
{
  const http = createServer(); const relay = attachRelay(http, { password: 'hunter2' }); await new Promise((r) => http.listen(0, r));
  const url = `ws://localhost:${http.address().port}/coop`;
  const first = (q, send) => new Promise((r) => { const ws = new WebSocket(`${url}?${q}`); ws.on('open', () => { if (send) ws.send(JSON.stringify(send)); }); ws.on('message', (m) => { r(JSON.parse(m)); ws.close(); }); });
  assert.equal((await first('role=check')).relay, 'auth', 'no token, no entry');
  assert.equal((await first('role=host')).relay, 'auth');
  assert.equal((await first('role=check&token=9999999999999.forged')).relay, 'auth');
  assert.equal((await first('role=login', { password: 'nope' })).why, 'Wrong password.');
  const { token } = await first('role=login', { password: 'hunter2' });
  assert.ok(token);
  assert.equal((await first(`role=check&token=${token}`)).relay, 'ok');
  assert.ok(!tokenOK('hunter2', makeToken('hunter2', Date.now() - 61 * 864e5)), 'old tokens expire');
  assert.ok(!tokenOK('changed', token), 'a new password logs everyone out');
  const room = await first(`role=host&code=ABCD&token=${token}`);
  assert.equal(room.code, 'ABCD', 'a reconnecting host gets its code back');
  for (let k = 0; k < 4; k++) await first('role=login', { password: 'nope' });
  assert.match((await first('role=login', { password: 'hunter2' })).why, /Too many/, 'guessing locks the door, even for the right password');
  relay.close(); http.close();
  console.log('relay password: tokens, forgery, expiry, lockout and code reclaim all work');
}

// ---------- two players in one world, through the real messages ----------
const JSONify = (o) => JSON.parse(JSON.stringify(o)); // exactly what the wire does
const hs = createState(4242, true), h1 = addPlayer(hs, 'p1'), h2 = joinPlayer(hs, 'p2');
const gs = createState(4242, false); addPlayer(gs, 'p2');
const t = newTracker();
const wire = { bytes: 0, frames: 0 };
const send = (o) => { const text = JSON.stringify(o); wire.bytes += text.length; wire.frames++; return JSON.parse(text); };
const sync = (ack = 0) => {
  const w = packWorld(hs, t); if (w) applyWorld(gs, send(w));
  applyFrame(gs, send(packFrame(hs, t, 'p2', ack, hs.events.splice(0))), 'p2', spawnZombie, addPlayer);
};
sync();
const g2 = gs.players.p2, g1 = gs.players.p1;
assert.ok(g1, 'the partner sees the host');
assert.strictEqual(Object.keys(gs.players).length, 2);
g2.x = h2.x; g2.y = h2.y;

// world changes reach the partner
const doorI = +Object.keys(hs.world.doors).find((k) => !hs.world.doors[k].locked && !hs.world.doors[k].open);
hs.world.doors[doorI].open = true; sync();
assert.strictEqual(gs.world.doors[doorI].open, true, 'door opened by the host');

// shared stash: both see the same items, and the same upgrades
const stash = hs.world.fixtures.stash;
hs.world.containers[stash].items = [makeItem('scrap', 40)]; hs.world.containers[stash].searched = true; sync();
assert.strictEqual(getCont(gs, stash).items[0].n, 40, 'the stash is shared');
hs.upgrades.bench = 1; sync();
assert.strictEqual(gs.upgrades.bench, 1, 'upgrades are shared');
h2.x = (hs.world.containers[stash].x + 0.5) * 32; h2.y = (hs.world.containers[stash].y + 2) * 32; h2.openCid = stash;
command(hs, 'p2', { t: 'take', cid: stash, idx: 0 }); sync();
assert.strictEqual(getCont(gs, stash).items.length, 0, "the partner's take empties it for everyone");
assert.ok(gs.players.p2.inv.some((i) => i.id === 'scrap' && i.n === 40), "and it's in the partner's inventory");
assert.ok(!hs.players.p1.inv.some((i) => i.id === 'scrap'), "and not the host's");

// a partner's gun and mods show up on the other side
const gun = makeItem('pistol'); gun.mods = ['silencer']; gun.mag = 12; h1.inv.push(gun); h1.wpn = gun; sync();
assert.deepStrictEqual(g1.wpn.mods, ['silencer'], 'partner sees the host weapon and mods');

// corpses and blood: a kill on the host appears for the partner
hs.zombies.length = 0; h1.x = hs.world.spawn.x; h1.y = hs.world.spawn.y;
{
  // outside the safe zone, next to the partner so it's in range
  let spot = null; for (const c of hs.world.containers) if (c && c.type === 'car') { spot = c; break; }
  h2.x = (spot.x + 0.5) * 32; h2.y = (spot.y - 3) * 32; g2.x = h2.x; g2.y = h2.y;
  const z = spawnZombie(hs, h2.x + 40, h2.y, 'walker'); z.think = 99; sync();
  assert.ok(gs.zombies.some((q) => q.id === z.id), 'zombie near the partner is sent');
  z.hp = 1; h2.inv.push(makeItem('knife')); h2.wpn = h2.inv[h2.inv.length - 1];
  step(hs, { p1: {}, p2: { mx: z.x, my: z.y, attack: true } }, 1 / 60); sync();
  assert.ok(!gs.zombies.some((q) => q.id === z.id), 'dead zombie disappears');
  assert.ok(gs.loose.some((id) => gs.world.containers[id] && gs.world.containers[id].type === 'zombie'), 'and leaves a corpse the partner can loot');
}

// far zombies aren't sent
{
  const far = spawnZombie(hs, h2.x + 3000, h2.y, 'walker'); far.think = 99; sync();
  assert.ok(!gs.zombies.some((q) => q.id === far.id), 'far zombies are not sent');
}

// ---------- prediction matches the host ----------
{
  const a = createState(99, false), pa = addPlayer(a, 'p2'), b = createState(99, false), pb = addPlayer(b, 'p2');
  const moves = [{ up: true }, { up: true, right: true }, { right: true, sprint: true }, { down: true }, { left: true, sprint: true }, {}];
  for (let k = 0; k < 600; k++) {
    const inp = { ...moves[Math.floor(k / 60) % moves.length], ang: k * 0.01 };
    step(a, { p2: inp }, 1 / 60); predictMove(b, pb, inp, 1 / 60); pb.stamina = pa.stamina; a.events.length = 0;
  }
  const miss = Math.hypot(pa.x - pb.x, pa.y - pb.y);
  console.log('prediction drift after 10 s:', miss.toFixed(2), 'px');
  assert.ok(miss < 1, `prediction drifted ${miss}`);
}

// ---------- inputs ----------
{
  const q = newInputQueue();
  q.list.push(compactInput({ seq: 1, up: true, interact: true, sel: -1, attack: false }));
  assert.deepStrictEqual(Object.keys(q.list[0]).sort(), ['interact', 'seq', 'up'], 'empty fields are not sent');
  const first = nextInput(q, 0); assert.ok(first.interact && first.up); assert.strictEqual(q.ack, 1);
  const held = nextInput(q, 100); assert.ok(held.up && !held.interact, 'held keys carry over, one-shot keys do not');
  assert.deepStrictEqual(nextInput(q, 900), {}, 'silence stops the character');
  for (let k = 2; k < 20; k++) q.list.push({ seq: k, reload: k === 3 });
  const merged = nextInput(q, 1000); assert.ok(merged.reload, 'a keypress survives catching up');
}

// ---------- leaving and coming back ----------
{
  const s2 = createState(5, false), a = addPlayer(s2, 'p1'), b = joinPlayer(s2, 'p2'); b.inv.push(makeItem('rifle'));
  parkPlayer(s2, 'p2'); assert.ok(!s2.players.p2);
  step(s2, { p1: {} }, 1 / 60);
  const back = joinPlayer(s2, 'p2'); assert.strictEqual(back, b, 'the same character returns'); assert.ok(back.inv.some((i) => i.id === 'rifle'));
  assert.ok(a);
}

// ---------- bugs found in the co-op audit ----------
{
  // a partner's menu actions are marked as theirs, shared news is not
  const a = createState(11, false), h = addPlayer(a, 'p1'), b = joinPlayer(a, 'p2');
  b.inv.push(makeItem('water')); a.events.length = 0;
  command(a, 'p2', { t: 'use', idx: b.inv.findIndex((i) => i.id === 'water') });
  assert.ok(a.events.some((e) => e.type === 'drink' && e.pid === 'p2'), 'a drink belongs to whoever drank');
  a.events.length = 0; step(a, { p1: { flash: true }, p2: {} }, 1 / 60);
  assert.ok(a.events.some((e) => e.type === 'click' && e.pid === 'p1'), 'so does a flashlight click');
  a.upgrades.bed = 1; a.time = (21 - 8) / 24 * 600; a.events.length = 0;

  // sleeping skips the night for everyone, so everyone has to be home
  const t0 = a.time; b.x = 40; b.y = 40; b.x = a.world.safeRect.x * 32 - 800; b.y = a.world.safeRect.y * 32;
  a.zombies.length = 0; command(a, 'p1', { t: 'sleep' }); assert.strictEqual(a.time, t0, 'no sleeping while your partner is outside');
  b.x = h.x + 20; b.y = h.y; const hurt = b.hp = 50; command(a, 'p1', { t: 'sleep' });
  assert.ok(a.time > t0, 'both home: the night passes'); assert.ok(b.hp > hurt, 'and both rest');

  // zombies: one player safe inside must not hide the other from a zombie outside
  const c = createState(12, false), inside = addPlayer(c, 'p1'), out = joinPlayer(c, 'p2'), r = c.world.safeRect;
  c.zombies.length = 0; inside.x = c.world.spawn.x; inside.y = c.world.spawn.y;
  out.x = (r.x - 12) * 32; out.y = (r.y + r.h / 2) * 32; out.vis = 1;
  for (let k = 0; k < 200 && (c.world.tiles[Math.floor(out.y / 32) * c.world.w + Math.floor(out.x / 32)] !== 0 && c.world.tiles[Math.floor(out.y / 32) * c.world.w + Math.floor(out.x / 32)] !== 1); k++) out.x -= 32;
  const z = spawnZombie(c, out.x - 60, out.y, 'walker'); z.ang = 0; z.think = 0; // closer to neither wall nor roof: open ground
  const nearerInside = Math.hypot(z.x - inside.x, z.y - inside.y) > Math.hypot(z.x - out.x, z.y - out.y);
  assert.ok(nearerInside);
  for (let k = 0; k < 120; k++) { step(c, { p1: {}, p2: {} }, 1 / 60); c.events.length = 0; out.hp = 100; }
  assert.strictEqual(z.state, 'chase', 'a zombie spots the player outside'); assert.strictEqual(z.pid, 'p2');
  // ...even when the player inside is the closer one
  const c2 = createState(12, false), in2 = addPlayer(c2, 'p1'), out2 = joinPlayer(c2, 'p2'); c2.zombies.length = 0;
  in2.x = (r.x + 1.5) * 32; in2.y = (r.y + r.h / 2 + 3) * 32; out2.x = (r.x - 5.5) * 32; out2.y = in2.y;
  const z2 = spawnZombie(c2, (r.x - 1.5) * 32, in2.y, 'walker'); z2.ang = Math.PI; z2.think = 0;
  assert.ok(Math.hypot(z2.x - in2.x, z2.y - in2.y) < Math.hypot(z2.x - out2.x, z2.y - out2.y), 'the safe player is closer');
  for (let k = 0; k < 240 && z2.state !== 'chase'; k++) { step(c2, { p1: {}, p2: {} }, 1 / 60); c2.events.length = 0; }
  assert.strictEqual(z2.pid, 'p2', 'the zombie still goes for the one it can reach');
  // a chaser turns on someone much closer in plain sight
  const c3 = createState(13, false), far3 = addPlayer(c3, 'p1'), near3 = joinPlayer(c3, 'p2'); c3.zombies.length = 0;
  const anchor = createState(13, true).zombies.find((q) => c3.world.tiles[Math.floor(q.y / 32) * c3.world.w + Math.floor(q.x / 32)] === 1) || { x: 1000, y: 1000 };
  far3.x = anchor.x + 400; far3.y = anchor.y; near3.x = anchor.x + 60; near3.y = anchor.y;
  const z3 = spawnZombie(c3, anchor.x, anchor.y, 'walker'); Object.assign(z3, { state: 'chase', pid: 'p1', think: 0, lost: 0 });
  if (!c3.world.safe[Math.floor(anchor.y / 32) * c3.world.w + Math.floor(anchor.x / 32)]) { step(c3, { p1: {}, p2: {} }, 1 / 60); assert.strictEqual(z3.pid, 'p2', 'the closer player becomes the target'); }

  // the hit timer and buff timers must not resend idle zombies or whole inventories
  const d = createState(14, false), p1 = addPlayer(d, 'p1'), p2 = joinPlayer(d, 'p2'), tr = newTracker();
  const q = spawnZombie(d, p2.x + 200, p2.y, 'walker'); q.hitAge = 50; q.wanderT = 1e9; q.wx = q.wy = 0; q.think = 1e9;
  const first = packFrame(d, tr, 'p2', 0, []); assert.ok(first.z && first.sl);
  q.hitAge = 51; const second = packFrame(d, tr, 'p2', 0, []); assert.ok(!second.z, 'an old hit timer does not resend a zombie');
  p2.buffs = { energy: 40.5 }; packFrame(d, tr, 'p2', 0, []); p2.buffs = { energy: 40.4 };
  assert.ok(!packFrame(d, tr, 'p2', 0, []).sl, 'a ticking buff does not resend the inventory');
  assert.ok(p1);

  // a save made mid-session doesn't leave the partner standing in the host's solo world
  const store = new Map(); globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  const { saveGame, loadGame } = await import('../src/save.js');
  const { newPlayer } = await import('../src/sim/sim.js');
  const e = createState(15, false); addPlayer(e, 'p1'); const pe = joinPlayer(e, 'p2'); pe.inv.push(makeItem('rifle'));
  assert.ok(saveGame(e, null));
  const back = loadGame(spawnZombie, newPlayer).state;
  assert.deepStrictEqual(Object.keys(back.players), ['p1'], 'only the host is in the world after loading');
  assert.ok(back.parked.p2.inv.some((i) => i.id === 'rifle'), 'the partner and their gear wait');
  back.parked.p2.openCid = 5; const again = joinPlayer(back, 'p2'); assert.ok(again.inv.some((i) => i.id === 'rifle'));
  console.log('audit fixes: events, sleep, zombie targeting, traffic and saves all hold');
}

// ---------- traffic ----------
{
  const s3 = createState(777, true), a = addPlayer(s3, 'p1'), b = joinPlayer(s3, 'p2'), tr = newTracker();
  const anchor = s3.zombies[0]; b.x = anchor.x; b.y = anchor.y; a.x = anchor.x + 200; a.y = anchor.y;
  let n = 0; for (const z of s3.zombies) if (Math.hypot(z.x - b.x, z.y - b.y) < 36 * 32) n++;
  for (let k = 0; k < 25; k++) spawnZombie(s3, b.x + (k - 12) * 24, b.y + 150, 'walker').state = 'chase';
  const opening = JSON.stringify(packWorld(s3, tr)).length;
  let bytes = 0, frames = 0, worldMs = 0, frameMs = 0, peak = 0;
  for (let k = 0; k < 600; k++) { // 10 s at 60 ticks a second
    a.hp = b.hp = 100;
    step(s3, { p1: { attack: k % 12 === 0, mx: a.x + 50, my: a.y }, p2: { right: k % 240 < 120, left: k % 240 >= 120, mx: b.x + 50, my: b.y } }, 1 / 60);
    if (k % 2 === 0) { const t0 = performance.now(); const f = JSON.stringify(packFrame(s3, tr, 'p2', k, s3.events.splice(0))); frameMs += performance.now() - t0; bytes += f.length; frames++; peak = Math.max(peak, f.length); }
    if (k % 6 === 0) { const t0 = performance.now(); const w = packWorld(s3, tr); worldMs += performance.now() - t0; if (w) bytes += JSON.stringify(w).length; }
  }
  const kbs = bytes / 10 / 1024;
  console.log(`traffic: ${kbs.toFixed(1)} KB/s host to partner with ~${n + 25} zombies nearby, largest frame ${peak} bytes, joining sends ${(opening / 1024).toFixed(0)} KB`);
  console.log(`host cost: ${(frameMs / frames).toFixed(2)} ms per frame, ${(worldMs / 100).toFixed(2)} ms per world check`);
  assert.ok(kbs < 200, `too much traffic: ${kbs} KB/s`);
  assert.ok(frameMs / frames < 5 && worldMs / 100 < 5, 'host cost stays well under a frame');
}

// ---------- loot economy ----------
{
  const world = createState(1234, false).world, seen = {}, typeCount = {};
  for (const c of world.containers) if (c && LOOT[c.type]) typeCount[c.type] = (typeCount[c.type] || 0) + 1;
  const rate = (type, ids, rolls = 4000) => { let n = 0; for (let k = 0; k < rolls; k++) for (const it of rollLoot(type, k * 7 + 1, k, 3)) if (ids.includes(it.id)) n++; return n / rolls; };
  // low tiers are more common than high tiers everywhere
  const tierRates = {};
  for (const place of ['locker', 'dresser', 'car', 'crate']) tierRates[place] = WEAPON_TIERS.map((ids) => rate(place, ids));
  tierRates.milcrate = WEAPON_TIERS.map((ids) => rate('milcrate', ids));
  console.log('weapons per search, tiers 1-4:'); for (const p in tierRates) console.log(`  ${p.padEnd(9)} ${tierRates[p].map((v) => (v * 100).toFixed(1).padStart(5) + '%').join(' ')}`);
  assert.ok(tierRates.locker[1] > tierRates.locker[3] * 3, 'police: pistols far more than carbines');
  assert.ok(rate('car', WEAPON_TIERS.flat()) < rate('locker', WEAPON_TIERS.flat()) * 0.4, 'cars are poorer than police');
  assert.ok(rate('dresser', WEAPON_TIERS.flat()) < rate('locker', WEAPON_TIERS.flat()) * 0.2, 'houses are poorer than police');
  const sniper = ['rifle']; assert.ok(rate('milcrate', sniper) > rate('locker', sniper) * 1.2, 'military beats police for snipers');
  assert.ok(rate('dresser', sniper) < 0.002, 'a sniper in a house is very rare');
  const hw = rate('hardware', ['pistol', 'shotgun', 'smg', 'carbine', 'rifle', 'katana', 'crossbow'], 2000);
  assert.strictEqual(hw, 0, 'hardware stores sell tools, not guns');
  // mods turn up, in the right places
  const modRate = (place) => rate(place, ['silencer', 'extmag']);
  console.log(`mods per search: military ${(modRate('milcrate') * 100).toFixed(1)}%, police ${(modRate('locker') * 100).toFixed(1)}%, camp ${(modRate('crate') * 100).toFixed(1)}%, car ${(modRate('car') * 100).toFixed(2)}%`);
  assert.ok(modRate('milcrate') > modRate('car') * 4);
  // basic materials are the most common loot
  const mats = Object.keys(ITEMS).filter((id) => ITEMS[id].cat === 'mat');
  assert.ok(rate('toolbox', mats) > rate('toolbox', WEAPON_TIERS.flat()) * 5, 'materials beat weapons');
  for (const id of mats) assert.strictEqual(ITEMS[id].stack, 100, `${id} stacks to 100`);
  // every real item can be found or crafted, and recipes only use real items
  const found = new Set(Object.values(LOOT).flatMap((t) => t.t.map(([id]) => id)));
  const crafted = new Set(RECIPES.map((r) => r.out[0]));
  const orphans = Object.keys(ITEMS).filter((id) => !found.has(id) && !crafted.has(id) && id !== 'bolt');
  assert.deepStrictEqual(orphans, [], 'every item is obtainable');
  for (const r of RECIPES) for (const id of Object.keys(r.cost)) assert.ok(ITEMS[id], `recipe ${r.id} needs unknown ${id}`);
  for (const id of ['crossbow', 'silencer', 'extmag']) assert.ok(crafted.has(id), `${id} can be crafted`);
  // and each location type actually exists in the world
  for (const place of ['locker', 'milcrate', 'car', 'dresser', 'crate']) assert.ok(typeCount[place] > 0, `${place} exists in the world`);
  assert.ok(seen);
  // crafting a crossbow works end to end
  const s4 = createState(8, false), p4 = addPlayer(s4, 'p1'); s4.upgrades.bench = 1;
  const safe = s4.world.spawn; p4.x = safe.x; p4.y = safe.y; p4.inv.push(makeItem('plank', 3), makeItem('scrap', 2), makeItem('cloth', 3), makeItem('tape', 2));
  command(s4, 'p1', { t: 'craft', id: 'crossbow' }); assert.ok(p4.inv.some((i) => i.id === 'crossbow') || getCont(s4, s4.world.fixtures.stash).items?.some((i) => i.id === 'crossbow'), 'crossbow crafted');
  // test gear is off by default and changes nothing for a normal game
  assert.strictEqual(s4.world.fixtures.rack, undefined, 'no free gear in a normal world');
  assert.ok(createState(8, false, { testGear: true }).world.fixtures.rack !== undefined, '?testgear adds it');
}
// ---------- cases ----------
{
  const KINDS = ['weaponcase', 'ammocase', 'modcase'], rolls = 6000;
  // contents: every weapon can drop, one at a time; ammo cases hold all four types; mod cases hold one mod
  const weapons = Object.keys(ITEMS).filter((id) => ['melee', 'gun'].includes(ITEMS[id].cat)), drops = {};
  for (let k = 0; k < rolls; k++) { const got = rollLoot('weaponcase', k * 7 + 1, k); assert.strictEqual(got.length, 1, 'a weapon case holds one weapon'); assert.ok(weapons.includes(got[0].id)); drops[got[0].id] = (drops[got[0].id] || 0) + 1; }
  for (const id of weapons) assert.ok(drops[id] > 0, `${id} can drop from a weapon case`);
  assert.ok(drops.pistol > drops.rifle, 'lower tiers are still more common');
  const mods = new Set();
  for (let k = 0; k < 200; k++) {
    const m = rollLoot('modcase', k * 7 + 1, k); assert.strictEqual(m.length, 1, 'a mod case holds one mod'); assert.strictEqual(ITEMS[m[0].id].cat, 'mod'); mods.add(m[0].id);
    const a = rollLoot('ammocase', k * 7 + 1, k); assert.deepStrictEqual(a.map((i) => i.id).sort(), ['ammo308', 'ammo9', 'ammomed', 'shells']);
    for (const i of a) assert.ok(i.n >= 2 * ITEMS[i.id].roll[0] && i.n <= ITEMS[i.id].stack);
  }
  assert.strictEqual(mods.size, 2, 'both mods can drop');
  // placement: scarce, placed where intended, always reachable, across several worlds
  const reach = (w, c) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const i = (c.y + dy) * w.w + c.x + dx; return !SOLID[w.tiles[i]]; });
  for (const seed of [1234, 5, 77, 900, 31337]) {
    const w = createState(seed, false).world, all = w.containers.filter((c) => c && LOOT[c.type]), cases = all.filter((c) => KINDS.includes(c.type));
    const where = {}; for (const c of cases) { const i = c.y * w.w + c.x, b = w.bld[i] >= 0 ? w.buildings[w.bld[i]].type : 'outside'; where[b] = (where[b] || 0) + 1; assert.ok(reach(w, c), `${c.type} at ${c.x},${c.y} can be reached`); assert.strictEqual(w.safe[i], 0, 'none in the safehouse'); }
    console.log(`seed ${seed}: ${cases.length} cases of ${all.length} containers (${KINDS.map((k) => cases.filter((c) => c.type === k).length).join('/')} weapon/ammo/mod)`, JSON.stringify(where));
    assert.ok(cases.length >= 12 && cases.length <= 60 && cases.length / all.length < 0.05, 'cases are scarce');
    for (const k of KINDS) assert.ok(cases.some((c) => c.type === k), `${k} exists`);
    for (const place of ['house', 'outside', 'police', 'military']) assert.ok(where[place] > 0, `cases turn up at ${place}`);
    assert.ok(w.buildings.some((b) => ['grocery', 'pharmacy', 'hardware'].includes(b.type)) && cases.some((c) => ['grocery', 'pharmacy', 'hardware'].includes(w.buildings[w.bld[c.y * w.w + c.x]]?.type)), 'and in store offices');
  }
  // a looted case stays empty: it never restocks at dawn
  const s = createState(1234, false), q = addPlayer(s, 'p1'), far = (k) => Math.hypot(k.x * 32 - q.x, k.y * 32 - q.y) > 30 * 32;
  const c = s.world.containers.find((k) => k && k.type === 'weaponcase' && far(k)), shelf = s.world.containers.filter((k) => k && k.type === 'grocery' && far(k));
  c.searched = true; c.items = []; for (const k of shelf) { k.searched = true; k.items = []; }
  for (let k = 0; k < 40; k++) { s.time += 600; step(s, { p1: {} }, 1 / 60); }
  assert.ok(c.searched && !c.items.length && !c.salt, 'cases do not restock');
  assert.ok(shelf.some((k) => k.salt), 'ordinary shelves still do');
}
assert.ok(JSONify && smooth && g2);
console.log('co-op test passed');
process.exit(0);
