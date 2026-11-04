// Co-op state sync. The host owns the simulation and sends the partner only what changed, near the partner.
// Pure functions with no browser or socket code, so tests/coop.test.mjs can run both sides headless.

const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
export const FRAME_HZ = 30, WORLD_HZ = 10;
const SEE_RADIUS = 36 * 32, FORGET_RADIUS = 42 * 32, EVENT_RADIUS = 1500;

// ---------- players ----------
// sent every frame, as an array in this order, to keep messages small
const FAST = ['x', 'y', 'ang', 'hp', 'hunger', 'thirst', 'stamina', 'reload', 'swing', 'swingDur', 'muzzle', 'hurt', 'bloom', 'vis', 'infection', 'openCid', 'moving', 'sprinting', 'sneak', 'ads', 'flashlight', 'dead', 'bleeding', 'act', 'channel', 'search', 'peek', 'climb', 'pry'];
const fastRow = (p) => FAST.map((k) => { const v = p[k]; return typeof v === 'number' ? (k === 'x' || k === 'y' ? r1(v) : r2(v)) : v ?? null; });
const SKIP_FOR_SELF = new Set(['x', 'y', 'ang']); // the partner predicts their own position and aim
function applyFast(p, row, self) {
  FAST.forEach((k, i) => { if (self && SKIP_FOR_SELF.has(k)) return; p[k] = row[i]; });
  if (self) { p.hostX = row[0]; p.hostY = row[1]; }
}
// sent only when it changes
const slowOf = (p) => ({ inv: p.inv, wpn: p.inv.indexOf(p.wpn), bag: p.bag, gear: p.gear, hotbar: (p.hotbar || []).map((h) => (h ? [h.id, p.inv.indexOf(h.ref)] : null)), buffs: Object.fromEntries(Object.entries(p.buffs || {}).map(([k, v]) => [k, Math.ceil(v)])) }); // whole seconds: exact timers would resend everything every frame
function applySlow(p, o) {
  p.inv = o.inv; p.wpn = o.wpn >= 0 ? p.inv[o.wpn] : null; p.bag = o.bag; p.gear = o.gear; p.buffs = o.buffs;
  p.hotbar = o.hotbar.map((h) => (h ? { id: h[0], ref: h[1] >= 0 ? p.inv[h[1]] : null } : null));
}

// ---------- zombies ----------
const ZTYPES = ['walker', 'runner', 'brute', 'soldier'], ZSTATES = ['idle', 'investigate', 'chase'];
const zRow = (z) => [z.id, ZTYPES.indexOf(z.type), Math.round(z.x), Math.round(z.y), r1(z.ang), Math.round(z.hp), ZSTATES.indexOf(z.state), r2(z.atk), r2(z.hitT || 0), r2(z.flash || 0), r1(z.sus || 0), z.wounds || 0, z.hitAge === undefined || z.hitAge >= 3.5 ? -1 : r1(z.hitAge)]; // the hit timer counts forever, but only matters for the health bar's 3 s

// ---------- host: build messages ----------
export const newTracker = () => ({ pl: {}, z: new Map(), doors: new Map(), win: new Map(), cont: [], loose: '', meta: '', thrown: '' });

export function packFrame(s, t, guestId, ack, events) {
  const f = { k: 'f', t: r1(s.time), a: ack, r: r2(s.weather.rain), p: {} };
  for (const id in s.players) {
    const p = s.players[id]; f.p[id] = fastRow(p);
    const slow = JSON.stringify(slowOf(p));
    if (t.pl[id] !== slow) { t.pl[id] = slow; (f.sl = f.sl || {})[id] = JSON.parse(slow); }
  }
  // zombies near the partner, and only the ones that changed
  const g = s.players[guestId], zs = [], gone = [], seen = new Set();
  for (const z of s.zombies) {
    const d = g ? Math.hypot(z.x - g.x, z.y - g.y) : Infinity, known = t.z.has(z.id);
    if (z.hp <= 0 || d > (known ? FORGET_RADIUS : SEE_RADIUS)) continue;
    seen.add(z.id);
    const row = zRow(z), sig = row.join();
    if (t.z.get(z.id) !== sig) { t.z.set(z.id, sig); zs.push(row); }
  }
  for (const id of t.z.keys()) if (!seen.has(id)) { t.z.delete(id); gone.push(id); }
  if (zs.length) f.z = zs;
  if (gone.length) f.g = gone;
  // bullets fly in straight lines, so the partner flies them on between frames
  if (s.bullets.length) f.b = s.bullets.filter((b) => b.left > 0).map((b) => [Math.round(b.x), Math.round(b.y), Math.round(b.vx), Math.round(b.vy), Math.round(b.left), b.gun]);
  const thrown = JSON.stringify(s.thrown.map((o) => [o.id, Math.round(o.x), Math.round(o.y), r2(o.fly)]));
  if (thrown !== t.thrown) { t.thrown = thrown; f.th = JSON.parse(thrown); }
  const ev = filterEvents(events, g, guestId);
  if (ev.length) f.e = ev;
  return f;
}
const PRIVATE = new Set(['msg', 'close', 'ui']); // open and pdie stay: they make sounds the partner should hear
function filterEvents(events, g, guestId) {
  return events.filter((e) => {
    if (e.pid && e.pid !== guestId && PRIVATE.has(e.type)) return false;
    if (e.x === undefined || !g) return true;
    return Math.hypot(e.x - g.x, e.y - g.y) < EVENT_RADIUS;
  });
}

// World changes: doors, windows, containers and shared progress. Sends everything that differs from a fresh world the first time.
export function packWorld(s, t) {
  const w = s.world, o = { k: 'w' }; let any = false;
  const d = [], wi = [], c = [];
  for (const i in w.doors) { const q = w.doors[i], sig = `${q.open ? 1 : 0}${q.broken ? 1 : 0}${q.locked ? 1 : 0}${q.bar || 0}`; if (t.doors.get(i) !== sig) { t.doors.set(i, sig); d.push([+i, q.open ? 1 : 0, q.broken ? 1 : 0, q.locked ? 1 : 0, q.bar || 0]); } }
  for (const i in w.windows) { const q = w.windows[i], sig = `${q.open ? 1 : 0}${q.broken ? 1 : 0}`; if (t.win.get(i) !== sig) { t.win.set(i, sig); wi.push([+i, q.open ? 1 : 0, q.broken ? 1 : 0]); } }
  for (let i = 0; i < w.containers.length; i++) {
    const q = w.containers[i];
    const sig = !q ? (i < s.baseConts ? '' : 'x') : (q.items === null && !q.searched && !q.salt && i < s.baseConts ? '' : JSON.stringify(q)); // untouched: nothing to say
    if ((t.cont[i] ?? '') !== sig) { t.cont[i] = sig; c.push([i, q || null]); }
  }
  if (d.length) { o.d = d; any = true; }
  if (wi.length) { o.wi = wi; any = true; }
  if (c.length) { o.c = c; any = true; }
  const loose = JSON.stringify(s.loose); if (loose !== t.loose) { t.loose = loose; o.loose = s.loose; any = true; }
  const meta = JSON.stringify({ upgrades: s.upgrades, obj: s.obj, stats: s.stats, tradePoints: s.tradePoints, hordeDay: s.hordeDay, dawnIdx: s.dawnIdx });
  if (meta !== t.meta) { t.meta = meta; o.meta = JSON.parse(meta); any = true; }
  return any ? o : null;
}

// ---------- partner: apply messages ----------
export function applyFrame(s, f, localId, makeZombie, makePlayer) {
  s.time = f.t; s.weather.rain = f.r;
  for (const id in f.p) {
    const p = s.players[id] || makePlayer(s, id), self = id === localId;
    applyFast(p, f.p[id], self);
    if (!self) { p.nx = p.x; p.ny = p.y; p.na = p.ang; if (p.drawX === undefined) { p.drawX = p.x; p.drawY = p.y; p.drawA = p.ang; } p.x = p.drawX; p.y = p.drawY; p.ang = p.drawA; }
  }
  for (const id in s.players) if (!f.p[id]) delete s.players[id];
  if (f.sl) for (const id in f.sl) applySlow(s.players[id], f.sl[id]);
  if (f.z) {
    const byId = s.zById || (s.zById = new Map(s.zombies.map((z) => [z.id, z])));
    for (const [id, ty, x, y, ang, hp, st, atk, hitT, flash, sus, wounds, hitAge] of f.z) {
      let z = byId.get(id);
      if (!z) { z = makeZombie(s, x, y, ZTYPES[ty]); z.id = id; z.ang = ang; byId.set(id, z); }
      Object.assign(z, { nx: x, ny: y, na: ang, hp, state: ZSTATES[st], atk, hitT, flash, sus, wounds });
      if (hitAge >= 0) z.hitAge = hitAge; else delete z.hitAge;
    }
  }
  if (f.g) { const gone = new Set(f.g), byId = s.zById; s.zombies = s.zombies.filter((z) => { if (gone.has(z.id)) { byId && byId.delete(z.id); return false; } return true; }); }
  s.bullets = (f.b || []).map(([x, y, vx, vy, left, gun]) => ({ x, y, px: x, py: y, vx, vy, left, gun }));
  if (f.th) s.thrown = f.th.map(([id, x, y, fly]) => ({ id, x, y, fly }));
  if (f.e) s.events.push(...f.e);
  return !!f.sl;
}
export function applyWorld(s, o) {
  const w = s.world;
  if (o.d) for (const [i, open, broken, locked, bar] of o.d) if (w.doors[i]) Object.assign(w.doors[i], { open: !!open, broken: !!broken, locked: !!locked, bar });
  if (o.wi) for (const [i, open, broken] of o.wi) if (w.windows[i]) Object.assign(w.windows[i], { open: !!open, broken: !!broken });
  if (o.c) for (const [i, c] of o.c) {
    if (i < s.baseConts && w.containers[i] && c) { const q = w.containers[i]; q.items = c.items; q.searched = c.searched; q.salt = c.salt; }
    else if (i < s.baseConts && w.containers[i]) { w.containers[i].items = null; w.containers[i].searched = false; w.containers[i].salt = 0; } // back to untouched: it restocked
    else w.containers[i] = c;
  }
  if (o.loose) s.loose = o.loose;
  if (o.meta) Object.assign(s, o.meta);
}

// Between messages: glide everyone else to where the host last said they were, and fly bullets on.
export function smooth(s, dt, localId) {
  const k = Math.min(1, dt * 16);
  const glideAng = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * k; };
  for (const z of s.zombies) { if (z.nx === undefined) continue; z.x += (z.nx - z.x) * k; z.y += (z.ny - z.y) * k; z.ang = glideAng(z.ang, z.na); }
  for (const id in s.players) {
    if (id === localId) continue;
    const p = s.players[id]; if (p.nx === undefined) continue;
    p.x += (p.nx - p.x) * k; p.y += (p.ny - p.y) * k; p.ang = glideAng(p.ang, p.na); p.drawX = p.x; p.drawY = p.y; p.drawA = p.ang;
  }
  for (const b of s.bullets) { b.px = b.x; b.x += b.vx * dt; b.y += b.vy * dt; b.left -= Math.hypot(b.vx, b.vy) * dt; }
  s.bullets = s.bullets.filter((b) => b.left > 0);
}

// ---------- inputs ----------
// One-shot keys must survive even if a message is merged or a tick is skipped.
const EDGES = ['sneak', 'interact', 'reload', 'shove', 'flash', 'heal', 'throwN', 'throwB', 'barricade', 'peekStart'];
export function compactInput(inp) { const o = {}; for (const k in inp) { const v = inp[k]; if (v === false || v === undefined || v === -1) continue; o[k] = v; } return o; }
const expand = (i) => ({ sel: -1, hotEquip: -1, ...i });
// Takes the partner's next input for this tick. Falls back to holding the last one, without repeating one-shot keys.
export function nextInput(q, now) {
  if (!q.list.length) { if (now - q.at > 500) return {}; const held = { ...q.last }; for (const k of EDGES) delete held[k]; delete held.sel; delete held.hotEquip; delete held.seq; return expand(held); }
  while (q.list.length > 8) { // fell behind: skip ahead, keeping the keypresses
    const a = q.list.shift(), b = q.list[0];
    for (const k of EDGES) if (a[k]) b[k] = true;
    if (a.sel >= 0 && !(b.sel >= 0)) b.sel = a.sel;
    if (a.hotEquip >= 0 && !(b.hotEquip >= 0)) b.hotEquip = a.hotEquip;
  }
  q.last = q.list.shift(); q.at = now; q.ack = q.last.seq;
  return expand(q.last);
}
export const newInputQueue = () => ({ list: [], last: {}, at: 0, ack: 0 });
