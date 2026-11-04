// Authoritative simulation. Pure state + inputs -> state + events.
// Netcode-ready: every player action arrives as an input frame or a command object.
import { TILE, DAY_LENGTH, START_HOUR, PLAYER_R, BASE_CARRY } from '../config.js';
import { RACK_ITEMS, MOD_STASH_ITEMS, MODS, modFits, gunStats, CAT_ORDER, ITEMS, FISTS, UPGRADES, STASH_CAP, RECIPES, TRADE_COST, TRADE_POOL, OBJECTIVES, CONTAINER_LABEL } from '../data/items.js';
import { generateWorld, T, SOLID } from '../world/worldgen.js';
import { solidAt, collide, los, castRay, bulletBlock, isSafe, FlowField } from '../world/world.js';
import { makeItem, addItem, countItem, removeItem, invWeight, rollLoot } from './inventory.js';

export const ZT = {
  walker: { hp: 60, spd: 36, dmg: 8, sight: 7, r: 10 },
  runner: { hp: 45, spd: 80, dmg: 7, sight: 9, r: 9 },
  brute: { hp: 240, spd: 30, dmg: 20, sight: 6, r: 14 },
  soldier: { hp: 120, spd: 40, dmg: 11, sight: 8, r: 11 },
};
const SEARCH_TIME = { zombie: 0.7, zsoldier: 0.9, milcrate: 1.3, medcab: 1, car: 1.4, locker: 1.2, crate: 1.2, body: 0.6, pile: 0.3 };
const rnd = Math.random;
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return Math.abs(d); };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// ---------- time ----------
export const hoursTotal = (s) => START_HOUR + (s.time / DAY_LENGTH) * 24;
export const hourOf = (s) => hoursTotal(s) % 24;
export const dayOf = (s) => Math.floor(hoursTotal(s) / 24) + 1;
export function daylight(s) {
  const h = hourOf(s);
  if (h >= 7 && h < 18) return 1;
  if (h >= 18 && h < 21) return 1 - (h - 18) / 3;
  if (h >= 5 && h < 7) return (h - 5) / 2;
  return 0;
}
const dawnIndex = (s) => Math.floor((hoursTotal(s) - 6) / 24);

// ---------- state ----------
export function createState(seed, fresh = true, { testGear = false } = {}) {
  const world = generateWorld(seed, { testGear });
  const s = {
    seed, world, testGear, time: 0, dawnIdx: 0, players: {}, zombies: [], thrown: [], noises: [], events: [], nextId: 1,
    upgrades: Object.fromEntries(UPGRADES.map((u) => [u.id, 0])), spawnT: 0, hordeDay: 0, obj: 0,
    stats: { kills: 0, deaths: 0, hauled: 0, bestDay: 1 }, tradePoints: 0, loose: [],
    weather: { rain: 0, target: 0, t: 120 },
  };
  s.dawnIdx = dawnIndex(s);
  s.baseConts = world.containers.length;
  if (testGear) { // ?testgear in the URL: free gear in the safehouse for trying things out
    const rk = world.containers[world.fixtures.rack]; rk.items = []; rk.searched = true; for (const [id, n] of RACK_ITEMS) { const it = makeItem(id, n); if (ITEMS[id].cat === 'gun') it.mag = ITEMS[id].mag; rk.items.push(it); }
    const ms = world.containers[world.fixtures.modstash]; ms.searched = true; ms.items = MOD_STASH_ITEMS.map((id) => makeItem(id));
  }
  if (fresh) { for (let k = 0; k < 520; k++) spawnRandomZombie(s, 22, false); for (const zn of world.zones) spawnInZone(s, zn, zn.kind === 'military' ? 45 : 28); }
  initRuntime(s);
  return s;
}
export function initRuntime(s) {
  s.bullets = s.bullets || [];
  s.weather = s.weather || { rain: 0, target: 0, t: 120 };
  s.flows = {}; s.events = s.events || []; s.noises = [];
}

export function newPlayer(s, id, kit = 'start') {
  const sp = s.world.spawn;
  const p = {
    id, x: sp.x, y: sp.y, ang: -Math.PI / 2, hp: 100, hunger: 85, thirst: 85, stamina: 100, bleeding: false, infection: 0, regen: 0,
    inv: [], wpn: null, bag: null, gear: { head: null, body: null, legs: null, feet: null }, hotbar: [null, null, null, null, null, null], flashlight: true, sneak: false, atkCd: 0, swing: 0, reload: 0,
    channel: null, search: null, dead: false, invuln: 0, hurt: 0, moving: false, sprinting: false, openCid: -1, stepT: 0, muzzle: 0,
  };
  if (kit === 'start') {
    addItem(p.inv, makeItem('knife')); addItem(p.inv, makeItem('bandage', 2)); addItem(p.inv, makeItem('water')); addItem(p.inv, makeItem('beans'));
    p.wpn = p.inv[0];
  } else if (kit === 'locker') {
    addItem(p.inv, makeItem('knife')); addItem(p.inv, makeItem('bandage', 2)); addItem(p.inv, makeItem('water'));
    p.wpn = p.inv[0];
  } else addItem(p.inv, makeItem('rag', 2));
  for (const it of p.inv) autoHot(p, it, true);
  return p;
}
export function addPlayer(s, id) { s.players[id] = newPlayer(s, id); return s.players[id]; }
// co-op: a partner who leaves steps out of the world and gets their character back when they return
export function parkPlayer(s, id) { const p = s.players[id]; if (!p) return; (s.parked = s.parked || {})[id] = p; delete s.players[id]; }
export function joinPlayer(s, id) {
  if (s.parked && s.parked[id]) { s.players[id] = s.parked[id]; delete s.parked[id]; }
  if (s.players[id]) { const b = s.players[id]; Object.assign(b, { openCid: -1, search: null, channel: null, peek: null, climb: null, pry: null, reload: 0 }); return b; } // nothing left half-done from last time
  const p = addPlayer(s, id); p.x += 40; // next to the host's start, not on top of them
  return p;
}

const ev = (s, e) => s.events.push(e);
// Mark whose action an event came from, so a partner's menu sounds stay theirs. These belong to everyone.
const SHARED_EVENTS = new Set(['msg', 'objective', 'slept', 'horde', 'built']);
function stampEvents(s, from, pid) { for (let i = from; i < s.events.length; i++) { const e = s.events[i]; if (e.pid === undefined && !SHARED_EVENTS.has(e.type)) e.pid = pid; } }
const msg = (s, text, color = '#ddd', pid = null) => ev(s, { type: 'msg', text, color, pid });
export const getCont = (s, cid) => s.world.containers[cid];
export const stashCont = (s) => s.world.containers[s.world.fixtures.stash];
export const GEAR_SLOTS = ['head', 'body', 'legs', 'feet'];
// combined protection and perks from everything worn
export function gearStats(p) {
  const g = { armor: 0, bite: 0, slow: 1, stealth: 1, carry: 0, perks: new Set() };
  let a = 1, b = 1;
  for (const k of GEAR_SLOTS) {
    const it = p.gear && p.gear[k]; if (!it) continue; const d = ITEMS[it.id];
    a *= 1 - (d.armor || 0); b *= 1 - (d.biteProt || 0);
    if (d.slow) g.slow *= d.slow; if (d.stealth) g.stealth *= d.stealth; if (d.carry) g.carry += d.carry; if (d.perk) g.perks.add(d.perk);
  }
  g.armor = Math.min(0.8, 1 - a); g.bite = Math.min(0.95, 1 - b);
  return g;
}
export const hasPerk = (p, k) => GEAR_SLOTS.some((s) => p.gear && p.gear[s] && ITEMS[p.gear[s].id].perk === k);
// hotbar: slots remember an item id + reference; refill from another stack of the same item
export function resolveHot(p, k) {
  const h = p.hotbar && p.hotbar[k]; if (!h) return null;
  if (h.ref && p.inv.includes(h.ref)) return h.ref;
  h.ref = p.inv.find((i) => i.id === h.id) || null; return h.ref;
}
const HOTABLE = new Set(['melee', 'gun', 'food', 'med', 'buff', 'throw']);
export function autoHot(p, it, force = false) {
  if (!it || !p.hotbar) return; const cat = ITEMS[it.id].cat;
  if (!force && cat !== 'melee' && cat !== 'gun') return;
  if (!HOTABLE.has(cat) || p.hotbar.some((h) => h && (h.ref === it || h.id === it.id))) return;
  const k = p.hotbar.findIndex((h) => !h); if (k >= 0) p.hotbar[k] = { id: it.id, ref: it };
}
export const capacity = (p) => BASE_CARRY + (p.bag ? ITEMS[p.bag.id].cap : 0) + gearStats(p).carry;
export const carried = (p) => invWeight(p.inv) + GEAR_SLOTS.reduce((w, k) => w + (p.gear && p.gear[k] ? ITEMS[p.gear[k].id].w * 0.5 : 0), 0);
export const contCap = (s, c) => (c.type === 'stash' ? STASH_CAP[s.upgrades.stash] : c.type === 'pile' || c.type === 'body' || c.type === 'rack' || c.type === 'modstash' ? 999 : 20);
const contPos = (c) => (c.px !== undefined ? { x: c.px, y: c.py } : { x: (c.x + 0.5) * TILE, y: (c.y + 0.5) * TILE });
export const contLabel = (c) => c.label || CONTAINER_LABEL[c.type] || 'Container';

function completeObjective(s, id) {
  const o = OBJECTIVES[s.obj];
  if (o && o.id === id) { s.obj++; ev(s, { type: 'objective', text: o.text }); }
}

// ---------- step ----------
export function step(s, inputs, dt) {
  s.time += dt;
  const wx = s.weather; wx.t -= dt;
  if (wx.t <= 0) { wx.t = DAY_LENGTH * (0.08 + rnd() * 0.2); wx.target = rnd() < 0.35 ? 0.5 + rnd() * 0.5 : 0; if (wx.target && !wx.rain) msg(s, 'It starts to rain. The noise covers your steps.', '#9ab0ff'); }
  wx.rain += (wx.target - wx.rain) * Math.min(1, dt * 0.08);
  const di = dawnIndex(s);
  if (di > s.dawnIdx) { s.dawnIdx = di; onDawn(s); }
  const day = dayOf(s);
  if (day > s.stats.bestDay) s.stats.bestDay = day;
  const h = hourOf(s);
  if (h >= 22 && day >= 2 && s.hordeDay < day) { s.hordeDay = day; spawnHorde(s); }
  for (const id in s.players) { const n = s.events.length; updatePlayer(s, s.players[id], inputs[id] || {}, dt); stampEvents(s, n, id); }
  updateBullets(s, dt);
  updateThrown(s, dt);
  updateZombies(s, dt);
  s.spawnT -= dt;
  if (s.spawnT <= 0) {
    s.spawnT = 4;
    const night = daylight(s) < 0.3;
    const target = Math.min(900, 480 + day * 35) + (night ? 90 : 0);
    for (let k = 0; k < 5 && s.zombies.length < target; k++) spawnRandomZombie(s, 30, night);
    for (const zn of s.world.zones) { let n = 0; for (const z of s.zombies) if (Math.abs(z.x - zn.x) < zn.r && Math.abs(z.y - zn.y) < zn.r) n++; if (n < (zn.kind === 'military' ? 35 : 22)) spawnInZone(s, zn, 2, 30); }
  }
  for (const n of s.noises) if (n.pl && n.r >= 2 * TILE) ev(s, { type: 'noise', x: n.x, y: n.y, r: n.r });
  s.noises.length = 0;
  // looted corpses fade out after 15 s
  if ((s.cleanT = (s.cleanT || 0) - dt) <= 0) {
    s.cleanT = 1;
    s.loose = s.loose.filter((id) => { const c = s.world.containers[id]; if (c && c.type === 'pile' && c.items && !c.items.length) { s.world.containers[id] = null; return false; }
      if (c && c.emptyT && s.time - c.emptyT > 15 && (!c.items || !c.items.length)) { s.world.containers[id] = null; return false; } return !!c; });
  }
}

function onDawn(s) {
  const st = stashCont(s), cap = STASH_CAP[s.upgrades.stash];
  msg(s, `Day ${dayOf(s)} — dawn breaks.`, '#ffd27a');
  if (s.upgrades.rain) addItem(st.items, makeItem('water', 2), cap);
  if (s.upgrades.garden) addItem(st.items, makeItem('apple', 3), cap);
  if (s.upgrades.rain || s.upgrades.garden) msg(s, 'Base produced supplies overnight.', '#9fe09f');
  const ps = Object.values(s.players);
  let n = 0;
  for (const c of s.world.containers) {
    if (!c || !c.searched || ['stash', 'bench', 'bed', 'radio', 'body', 'pile', 'zombie', 'zsoldier'].includes(c.type)) continue;
    const pos = contPos(c);
    if (ps.some((p) => dist(p, pos) < 25 * TILE)) continue;
    if (rnd() < 0.12) { c.items = null; c.searched = false; c.salt = (c.salt || 0) + 1; n++; }
  }
  if (ps.some((p) => !p.dead)) completeObjective(s, 'night');
}

// ---------- players ----------
export function getInteract(s, p) {
  const w = s.world;
  const ax = p.x + Math.cos(p.ang) * 18, ay = p.y + Math.sin(p.ang) * 18;
  let best = null, bd = 1e9;
  const tx0 = Math.floor(p.x / TILE), ty0 = Math.floor(p.y / TILE);
  for (let ty = ty0 - 2; ty <= ty0 + 2; ty++) for (let tx = tx0 - 2; tx <= tx0 + 2; tx++) {
    if (tx < 0 || ty < 0 || tx >= w.w || ty >= w.h) continue;
    const i = ty * w.w + tx, t = w.tiles[i];
    const cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE;
    if (Math.hypot(cx - p.x, cy - p.y) > 50) continue;
    let cand = null;
    if (t === T.DOOR) { const d = w.doors[i]; cand = { kind: 'door', i, tx, ty, label: d.broken ? 'Broken Door' : d.open ? 'Close Door' : d.locked ? (countItem(p.inv, 'crowbar') ? 'Pry Open (Crowbar)' : 'Locked Door') : 'Open Door' }; }
    else if (t === T.WINDOW && w.windows[i]) { const wi = w.windows[i]; cand = { kind: 'window', i, tx, ty, label: wi.broken || wi.open ? (wi.broken ? 'Climb Through (glass!)' : 'Climb Through') : 'Open Window' }; }
    else if (w.contAt[i] >= 0) {
      const c = w.containers[w.contAt[i]];
      if (c.type === 'car') { const car = w.cars.find((k) => k.cid === c.id); if (!car) continue; }
      cand = { kind: 'cont', cid: c.id, label: contAction(s, c) };
    }
    if (!cand) continue;
    const d = Math.hypot(cx - ax, cy - ay);
    if (d < bd) { bd = d; best = cand; }
  }
  for (const cid of s.loose) {
    const c = w.containers[cid];
    if (!c || (c.searched && (!c.items || !c.items.length))) continue;
    const d = Math.hypot(c.px - ax, c.py - ay);
    if (Math.hypot(c.px - p.x, c.py - p.y) < 44 && d < bd) { bd = d; best = { kind: 'cont', cid, label: contAction(s, c) }; }
  }
  return best;
}
function contAction(s, c) {
  const name = contLabel(c);
  if (c.type === 'bench') return 'Use Workbench';
  if (c.type === 'radio') return s.upgrades.radio ? 'Use Ham Radio' : 'Ham Radio (not built)';
  if (c.type === 'bed') return s.upgrades.bed ? 'Sleep' : 'Bed (not built)';
  if (c.type === 'stash') return 'Open Stash';
  return (c.searched ? 'Open ' : 'Search ') + name + (c.searched && c.items && !c.items.length ? ' (empty)' : '');
}

// Hold to crack a closed door or window and look through it. Makes no noise, and the door stays shut to zombies.
function updatePeek(s, p, inp) {
  if (!inp.peek) { p.peek = null; return; }
  const w = s.world;
  const closed = (kind, i) => { if (kind === 'door') { const d = w.doors[i]; return !d.open && !d.broken && !d.locked && !d.bar; } const wi = w.windows[i]; return !wi.open && !wi.broken; };
  if (p.peek && (!closed(p.peek.kind, p.peek.i) || Math.hypot((p.peek.tx + 0.5) * TILE - p.x, (p.peek.ty + 0.5) * TILE - p.y) > 60)) p.peek = null;
  if (p.peek) return;
  const it = getInteract(s, p);
  if (!it || (it.kind !== 'door' && it.kind !== 'window')) return;
  if (closed(it.kind, it.i)) { p.peek = { kind: it.kind, i: it.i, tx: it.tx, ty: it.ty }; ev(s, { type: 'peek', x: (it.tx + 0.5) * TILE, y: (it.ty + 0.5) * TILE }); }
  else if (inp.peekStart && it.kind === 'door' && (w.doors[it.i].locked || w.doors[it.i].bar)) msg(s, "It won't budge. No gap to look through.", '#aaa', p.id);
}

function barricade(s, p) {
  const it = getInteract(s, p);
  if (!it || it.kind !== 'door') { msg(s, 'Face a door to barricade it.', '#aaa', p.id); return; }
  const d = s.world.doors[it.i];
  if (d.broken || d.open) { msg(s, d.broken ? 'The door is broken.' : 'Close the door first.', '#aaa', p.id); return; }
  if ((d.bar || 0) >= 3) { msg(s, 'Already fully barricaded.', '#aaa', p.id); return; }
  if (countItem(p.inv, 'plank') < 1 || countItem(p.inv, 'nails') < 3) { msg(s, 'Barricading needs 1 Wood Plank and 3 Nails.', '#ff8a6a', p.id); return; }
  removeItem(p.inv, 'plank', 1); removeItem(p.inv, 'nails', 3);
  d.bar = (d.bar || 0) + 1; d.hp += 70;
  ev(s, { type: 'built', x: p.x, y: p.y });
  s.noises.push({ pl: 1, x: p.x, y: p.y, r: 8 * TILE });
  msg(s, `Door barricaded (${d.bar}/3).`, '#9fe09f', p.id);
}

function doInteract(s, p) {
  const it = getInteract(s, p); if (!it) return;
  const w = s.world;
  if (it.kind === 'door') {
    const d = w.doors[it.i];
    if (d.broken) { msg(s, 'This door is broken.', '#aaa', p.id); return; }
    if (d.locked && !d.open) {
      if (countItem(p.inv, 'crowbar')) { p.pry = { i: it.i, t: 0, dur: 1.6, x: (it.tx + 0.5) * TILE, y: (it.ty + 0.5) * TILE }; ev(s, { type: 'pry', x: p.pry.x, y: p.pry.y }); }
      else { msg(s, 'Locked. Pry it with a Crowbar, smash it with a weapon, or use a window.', '#ffb070', p.id); ev(s, { type: 'locked', x: (it.tx + 0.5) * TILE, y: (it.ty + 0.5) * TILE }); }
      return;
    }
    if (d.open) { // don't close on someone
      const rx = it.tx * TILE, ry = it.ty * TILE;
      const blocked = [...Object.values(s.players), ...s.zombies].some((e) => !e.dead && e.x > rx - 10 && e.x < rx + TILE + 10 && e.y > ry - 10 && e.y < ry + TILE + 10);
      if (blocked) return;
    }
    d.open = !d.open;
    ev(s, { type: 'door', x: (it.tx + 0.5) * TILE, y: (it.ty + 0.5) * TILE, open: d.open });
    s.noises.push({ pl: 1, x: p.x, y: p.y, r: 2 * TILE });
    return;
  }
  if (it.kind === 'window') {
    const wi = w.windows[it.i], cx = (it.tx + 0.5) * TILE, cy = (it.ty + 0.5) * TILE;
    if (!wi.open && !wi.broken) { wi.open = true; ev(s, { type: 'winopen', x: cx, y: cy }); s.noises.push({ pl: 1, x: cx, y: cy, r: 2 * TILE }); return; }
    // climb: land on the opposite side of the window
    const horiz = solidAt(w, it.tx - 1, it.ty) || solidAt(w, it.tx + 1, it.ty);
    const dir = horiz ? Math.sign(cy - p.y) || 1 : Math.sign(cx - p.x) || 1;
    const tx2 = horiz ? cx : cx + dir * TILE, ty2 = horiz ? cy + dir * TILE : cy;
    if (solidAt(w, Math.floor(tx2 / TILE), Math.floor(ty2 / TILE))) { msg(s, 'Something blocks the other side.', '#aaa', p.id); return; }
    p.climb = { t: 0, dur: 0.6, x0: p.x, y0: p.y, x1: tx2, y1: ty2, glass: wi.broken };
    p.openCid = -1; ev(s, { type: 'climb', x: cx, y: cy, pid: p.id });
    s.noises.push({ pl: 1, x: cx, y: cy, r: 3 * TILE });
    return;
  }
  const c = getCont(s, it.cid);
  if (c.type === 'bench') { ev(s, { type: 'ui', pid: p.id, panel: 'base', tab: 'upgrades' }); return; }
  if (c.type === 'radio') { ev(s, { type: 'ui', pid: p.id, panel: 'base', tab: 'radio' }); return; }
  if (c.type === 'bed') { command(s, p.id, { t: 'sleep' }); return; }
  if (c.searched) openCont(s, p, c);
  else { p.search = { cid: c.id, t: 0, dur: SEARCH_TIME[c.type] || 0.8 }; const cp = contPos(c); ev(s, { type: 'searchStart', x: cp.x, y: cp.y, ctype: c.type, dur: p.search.dur, pid: p.id }); }
}
function openCont(s, p, c) {
  if (c.items === null) c.items = rollLoot(c.type, s.seed, c.id, c.salt || 0);
  const first = !c.searched;
  c.searched = true; p.openCid = c.id;
  if ((c.type === 'zombie' || c.type === 'zsoldier') && !c.items.length && !c.emptyT) c.emptyT = s.time;
  ev(s, { type: 'open', pid: p.id, cid: c.id, first, empty: !c.items.length, ctype: c.type, x: p.x, y: p.y });
  if (c.type !== 'stash') completeObjective(s, 'search');
}

// Movement is split out so a co-op partner can predict their own character with exactly the host's rules.
function moveIntent(p, inp) {
  let mx = (inp.right ? 1 : 0) - (inp.left ? 1 : 0), my = (inp.down ? 1 : 0) - (inp.up ? 1 : 0);
  const ml = Math.hypot(mx, my); if (ml > 0) { mx /= ml; my /= ml; }
  if (inp.relative && ml > 0) { // rotating view: W is wherever the character faces, A/D strafe
    const c = Math.cos(p.ang), n = Math.sin(p.ang), fwd = -my, side = mx;
    mx = fwd * c - side * n; my = fwd * n + side * c;
  }
  p.moving = ml > 0;
  p.sprinting = !!inp.sprint && p.moving && p.stamina > 3 && !p.channel && !p.sneak;
  return [mx, my];
}
function applyMove(s, p, mx, my, dt) {
  const w = s.world, over = carried(p) / capacity(p), slow = over > 1 ? Math.max(0.4, 1 - (over - 1) * 1.2) : 1;
  let speed = p.sneak ? 62 : p.sprinting ? (hasPerk(p, 'sprinter') ? 192 : 172) : 112;
  speed *= slow * gearStats(p).slow; if (p.buffs && p.buffs.adrenaline) speed *= 1.3; if (p.channel) speed *= 0.4; if (p.reload > 0) speed *= 0.8; if (p.peek) speed *= 0.5;
  if (w.tiles[Math.floor(p.y / TILE) * w.w + Math.floor(p.x / TILE)] === T.BUSH) speed *= 0.6;
  const bx = p.x, by = p.y;
  p.x += mx * speed * dt; p.y += my * speed * dt;
  collide(p, PLAYER_R, (tx, ty) => solidAt(w, tx, ty));
  // doorway assist: if blocked while moving along one axis, slide toward the open tile's center
  if (p.moving && Math.hypot(p.x - bx, p.y - by) < speed * dt * 0.3 && (Math.abs(mx) < 0.35 || Math.abs(my) < 0.35)) { // nearly axis-aligned, so it also works in the rotating view
    const ax = Math.abs(mx) < 0.35, cx = Math.floor(p.x / TILE), cy = Math.floor(p.y / TILE);
    const ntx = cx + Math.sign(mx), nty = cy + Math.sign(my);
    if (ax && !solidAt(w, cx, nty)) p.x += Math.sign((cx + 0.5) * TILE - p.x) * Math.min(Math.abs((cx + 0.5) * TILE - p.x), speed * dt);
    else if (!ax && !solidAt(w, ntx, cy)) p.y += Math.sign((cy + 0.5) * TILE - p.y) * Math.min(Math.abs((cy + 0.5) * TILE - p.y), speed * dt);
    collide(p, PLAYER_R, (tx, ty) => solidAt(w, tx, ty));
  }
}
export function predictMove(s, p, inp, dt) {
  if (inp.ang !== undefined) p.ang = inp.ang;
  const [mx, my] = moveIntent(p, inp);
  if (!p.climb) applyMove(s, p, mx, my, dt);
}

function updatePlayer(s, p, inp, dt) {
  if (p.dead) return;
  const w = s.world;
  p.atkCd -= dt; p.swing -= dt; p.invuln -= dt; p.hurt -= dt; p.muzzle -= dt;
  p.bloom = Math.max(0, (p.bloom || 0) - dt * 1.6);
  p.buffs = p.buffs || {}; for (const k in p.buffs) { p.buffs[k] -= dt; if (p.buffs[k] <= 0) { delete p.buffs[k]; msg(s, k === 'adrenaline' ? 'The adrenaline wears off.' : 'The energy boost fades.', '#aaa', p.id); } }
  if (inp.ang !== undefined) p.ang = inp.ang; else if (inp.mx !== undefined) p.ang = Math.atan2(inp.my - p.y, inp.mx - p.x);
  if (inp.sneak) { p.sneak = !p.sneak; msg(s, p.sneak ? 'Sneaking: quieter, harder to spot.' : 'Walking.', '#aaa', p.id); }
  if (inp.flash) { p.flashlight = !p.flashlight; ev(s, { type: 'click', x: p.x, y: p.y }); }
  if (inp.sel !== undefined && inp.sel >= 0) activateHot(s, p, inp.sel, inp);
  if (inp.hotEquip !== undefined && inp.hotEquip >= 0) { const it = resolveHot(p, inp.hotEquip); if (it && ['melee', 'gun'].includes(ITEMS[it.id].cat)) { p.wpn = it; p.reload = 0; ev(s, { type: 'equip', pid: p.id }); } }

  const [mx, my] = moveIntent(p, inp);
  updatePeek(s, p, inp);
  if (p.climb) {
    const c = p.climb; c.t += dt; const k = Math.min(1, c.t / c.dur);
    p.x = c.x0 + (c.x1 - c.x0) * k; p.y = c.y0 + (c.y1 - c.y0) * k; p.moving = true;
    if (k >= 1) { p.climb = null; if (c.glass && rnd() < 0.35 && !p.bleeding && !hasPerk(p, 'glassproof')) { p.bleeding = true; p.hp -= 5; msg(s, 'You cut yourself on the broken glass!', '#ff6a6a', p.id); ev(s, { type: 'phurt', x: p.x, y: p.y, pid: p.id, ang: 0 }); } }
    survival(s, p, dt); if (p.hp <= 0) killPlayer(s, p);
    return;
  }
  if (p.pry) {
    p.pry.t += dt;
    if (Math.hypot(p.pry.x - p.x, p.pry.y - p.y) > 60 || inp.attack) p.pry = null;
    else if (p.pry.t >= p.pry.dur) {
      const d = w.doors[p.pry.i]; d.locked = false; d.open = true; d.hp = Math.min(d.hp, 40);
      ev(s, { type: 'door', x: p.pry.x, y: p.pry.y, open: true }); ev(s, { type: 'pried', x: p.pry.x, y: p.pry.y });
      s.noises.push({ pl: 1, x: p.x, y: p.y, r: 5 * TILE });
      const cb = p.inv.find((i) => i.id === 'crowbar'); if (cb && cb.dur !== undefined) cb.dur = Math.max(1, cb.dur - 3);
      msg(s, 'Door pried open.', '#9fe09f', p.id); p.pry = null;
    }
  }
  applyMove(s, p, mx, my, dt);
  const gs = gearStats(p), tHere = w.tiles[Math.floor(p.y / TILE) * w.w + Math.floor(p.x / TILE)];
  const safeNow = isSafe(w, p.x, p.y);
  if (safeNow && p.wasSafe === false) {
    const n = p.inv.filter((i) => i !== p.wpn).length;
    msg(s, n ? `Back at the safehouse with ${n} item stack${n > 1 ? 's' : ''}. Put them in the Stash.` : 'Back at the safehouse.', '#9fe09f', p.id);
  }
  p.wasSafe = safeNow;
  if (p.moving) {
    p.stepT -= dt;
    if (p.stepT <= 0) {
      p.stepT = p.sprinting ? 0.3 : p.sneak ? 0.6 : 0.45;
      const r = (p.sprinting ? 6 : p.sneak ? 0 : 2.5) * (hasPerk(p, 'quiet') ? 0.5 : 1);
      if (r) s.noises.push({ pl: 1, x: p.x, y: p.y, r: r * TILE });
      ev(s, { type: 'step', x: p.x, y: p.y, pid: p.id, loud: p.sprinting, sneak: p.sneak, surf: tHere });
    }
  }

  // stealth: how visible the player is to zombies
  let vis = daylight(s) > 0.35 ? 1 : p.flashlight ? 1.15 : 0.5;
  if (p.sneak) vis *= 0.55;
  vis *= gs.stealth; if (hasPerk(p, 'headlamp') && daylight(s) <= 0.35) vis *= 1.25;
  if (!p.moving) vis *= 0.75; else if (p.sprinting) vis *= 1.3;
  if (tHere === T.BUSH) vis *= 0.4;
  if (s.weather.rain > 0.4) vis *= 0.85;
  p.vis = vis;
  // channel (applying meds)
  if (p.channel) {
    p.channel.t += dt;
    if (p.channel.t >= p.channel.dur) { const id = p.channel.id; p.channel = null; if (removeItem(p.inv, id, 1)) applyMed(s, p, id); }
  }
  // searching
  if (p.search) {
    const c = getCont(s, p.search.cid);
    if (!c || dist(p, contPos(c)) > 60 || inp.attack) p.search = null;
    else { p.search.t += dt; if (p.search.t >= p.search.dur) { p.search = null; openCont(s, p, c); } }
  }
  if (p.openCid >= 0) {
    const c = getCont(s, p.openCid);
    if (!c || dist(p, contPos(c)) > 72) { p.openCid = -1; ev(s, { type: 'close', pid: p.id }); }
  }
  if (inp.interact) doInteract(s, p);
  if (inp.barricade) barricade(s, p);
  if (inp.reload) startReload(s, p);
  if (p.reload > 0) { p.reload -= dt; if (p.reload <= 0) finishReload(s, p); }
  if (inp.shove) shove(s, p);
  if (inp.heal) quickHeal(s, p);
  if (inp.throwN) throwItem(s, p, 'noisemaker', inp);
  if (inp.throwB) throwItem(s, p, 'pipebomb', inp);
  p.ads = !!inp.aim && !!p.wpn && ITEMS[p.wpn.id].cat === 'gun';
  if (inp.attack && p.atkCd <= 0 && p.reload <= 0 && !p.channel && !p.search) attack(s, p);

  survival(s, p, dt);
  if (p.hp <= 0) killPlayer(s, p);
}

function survival(s, p, dt) {
  p.hunger = Math.max(0, p.hunger - (dt * 100) / (DAY_LENGTH * 1.6));
  p.thirst = Math.max(0, p.thirst - ((dt * 100) / (DAY_LENGTH * 1.1)) * (p.sprinting ? 1.6 : 1));
  if (p.sprinting && !(p.buffs && p.buffs.adrenaline)) p.stamina = Math.max(0, p.stamina - (hasPerk(p, 'sprinter') ? 15 : 20) * dt);
  else if (p.atkCd < 0) p.stamina = Math.min(100, p.stamina + (p.hunger < 15 || p.thirst < 15 ? 7 : 15) * (p.buffs && p.buffs.energy ? 2 : 1) * dt);
  if (p.bleeding) p.hp -= 1.0 * dt;
  if (p.infection > 0) {
    p.infection = Math.min(100, p.infection + (dt * 100) / (DAY_LENGTH * 2));
    if (p.infection > 50) p.hp -= (p.infection >= 100 ? 3 : 0.5) * dt;
  }
  if (p.hunger <= 0) p.hp -= 0.4 * dt;
  if (p.thirst <= 0) p.hp -= 0.6 * dt;
  if (p.regen > 0) { const a = Math.min(p.regen, 3 * dt); p.hp += a; p.regen -= a; }
  if (p.hunger > 50 && p.thirst > 50 && !p.bleeding && p.infection < 50) p.hp += (isSafe(s.world, p.x, p.y) ? 0.5 : 0.15) * dt;
  p.hp = Math.min(100, p.hp);
}

function weaponList(p) { return [null, ...p.inv.filter((i) => { const c = ITEMS[i.id].cat; return c === 'melee' || c === 'gun'; }).slice(0, 5)]; }
export { weaponList };
function activateHot(s, p, k, inp) {
  const it = resolveHot(p, k);
  if (!it) { if (p.hotbar[k]) msg(s, `No ${ITEMS[p.hotbar[k].id].name} left.`, '#aaa', p.id); return; }
  const d = ITEMS[it.id];
  if (d.cat === 'melee' || d.cat === 'gun') { p.wpn = p.wpn === it ? null : it; p.reload = 0; ev(s, { type: 'equip', pid: p.id }); }
  else if (d.cat === 'throw') throwItem(s, p, it.id, inp);
  else command(s, p.id, { t: 'use', idx: p.inv.indexOf(it) });
}
function selectWeapon(s, p, n) {
  const l = weaponList(p); if (n >= l.length) return;
  p.wpn = l[n]; p.reload = 0;
  ev(s, { type: 'equip', pid: p.id });
}

function attack(s, p) {
  const wd = p.wpn ? ITEMS[p.wpn.id] : FISTS;
  if (wd.cat === 'gun') return fire(s, p, wd);
  p.atkCd = wd.cd; p.swing = p.swingDur = Math.max(0.22, Math.min(0.55, wd.cd * 0.9)); p.act = 'attack';
  p.x += Math.cos(p.ang) * 3; p.y += Math.sin(p.ang) * 3; collide(p, PLAYER_R, (tx, ty) => solidAt(s.world, tx, ty));
  let mult = 1;
  if (p.stamina < wd.stam) { mult = 0.5; p.atkCd *= 1.5; }
  p.stamina = Math.max(0, p.stamina - wd.stam);
  ev(s, { type: 'swing', x: p.x, y: p.y, ang: p.ang, pid: p.id, arc: wd.arc, range: wd.range });
  let hit = false, loud = false;
  for (const z of s.zombies) {
    if (z.hp <= 0) continue;
    const d = dist(p, z); const zr = ZT[z.type].r;
    if (d > wd.range + zr) continue;
    if (d > zr && angDiff(Math.atan2(z.y - p.y, z.x - p.x), p.ang) > wd.arc / 2) continue;
    if (!los(s.world, p.x, p.y, z.x, z.y)) continue;
    const a = Math.atan2(z.y - p.y, z.x - p.x);
    if ((p.sneak || wd.silent) && z.state !== 'chase' && angDiff(z.ang, a) < 1.3 && p.wpn) {
      // sneak attack from behind an unaware zombie: instant, silent kill
      damageZombie(s, z, z.hp + 1, Math.cos(a), Math.sin(a), 20, p, false, true, true);
      ev(s, { type: 'silentKill', x: z.x, y: z.y, pid: p.id });
      hit = true; continue;
    }
    const crit = rnd() < 0.12;
    const dmg = wd.dmg * mult * (crit ? 2 : 1) * (0.9 + rnd() * 0.2) * (p.buffs && p.buffs.adrenaline ? 1.25 : 1);
    damageZombie(s, z, dmg, Math.cos(a), Math.sin(a), wd.knock, p, crit, true);
    if (wd.stun) { z.stagger = Math.max(z.stagger, wd.stun * (z.type === 'brute' ? 0.5 : 1)); ev(s, { type: 'slam', x: z.x, y: z.y }); }
    hit = true; if (!wd.silent) loud = true;
  }
  if (!hit) { // smash a closed door or window in front
    const fx = Math.floor((p.x + Math.cos(p.ang) * 26) / TILE), fy = Math.floor((p.y + Math.sin(p.ang) * 26) / TILE);
    const fi = fy * s.world.w + fx, ft = s.world.tiles[fi], cx = (fx + 0.5) * TILE, cy = (fy + 0.5) * TILE;
    if (ft === T.WINDOW && s.world.windows[fi] && !s.world.windows[fi].broken) {
      Object.assign(s.world.windows[fi], { broken: true, open: true }); ev(s, { type: 'glass', x: cx, y: cy, ang: p.ang });
      s.noises.push({ pl: 1, x: cx, y: cy, r: 10 * TILE });
    } else if (ft === T.DOOR && !s.world.doors[fi].open && !s.world.doors[fi].broken) {
      const d = s.world.doors[fi]; d.hp -= wd.dmg * 0.6 * mult; ev(s, { type: 'bash', x: cx, y: cy });
      s.noises.push({ pl: 1, x: cx, y: cy, r: 8 * TILE });
      if (d.hp <= 0) { d.broken = true; d.open = true; d.locked = false; ev(s, { type: 'doorbreak', x: cx, y: cy }); }
    }
  }
  if (loud) s.noises.push({ pl: 1, x: p.x, y: p.y, r: 3 * TILE });
  if (hit) {
    if (p.wpn && p.wpn.dur !== undefined) {
      p.wpn.dur--;
      if (p.wpn.dur <= 0) { msg(s, `Your ${wd.name} broke!`, '#ff8a6a', p.id); const i = p.inv.indexOf(p.wpn); if (i >= 0) p.inv.splice(i, 1); p.wpn = null; ev(s, { type: 'break', x: p.x, y: p.y }); }
    }
  }
}

const ADS_SPREAD = 0.4;
// current cone half-angle: grows with sustained fire (bloom) and movement, shrinks when sneaking or aiming down sights
export const gunSpread = (p, wd) => wd.spread * (1 + (p.bloom || 0) * 2.2) * (p.sneak ? 0.6 : 1) * (p.moving ? 1.5 : 1) * (p.ads ? ADS_SPREAD : 1);

function fire(s, p, wd) {
  const w = s.world;
  if (p.wpn.mag <= 0) {
    p.atkCd = 0.3;
    if (countItem(p.inv, wd.ammo) > 0) startReload(s, p); else { ev(s, { type: 'empty', x: p.x, y: p.y }); msg(s, 'Out of ammo.', '#aaa', p.id); }
    return;
  }
  const g = gunStats(p.wpn), silenced = g.alert < 1;
  p.wpn.mag--; p.atkCd = wd.cd; p.muzzle = silenced ? 0 : 0.06; p.swing = p.swingDur = 0.18; p.act = 'attack';
  const spread = gunSpread(p, wd);
  p.bloom = Math.min(1, (p.bloom || 0) + (BLOOM[p.wpn.id] || 0.3));
  const ox = p.x + Math.cos(p.ang) * 18, oy = p.y + Math.sin(p.ang) * 18;
  const mult = p.buffs && p.buffs.adrenaline ? 1.25 : 1;
  for (let k = 0; k < wd.pellets; k++) {
    const a = p.ang + (rnd() - 0.5) * 2 * spread, v = (SPEED[p.wpn.id] || 1400) * (wd.pellets > 1 ? 0.85 + rnd() * 0.3 : 1);
    s.bullets.push({ x: ox, y: oy, px: ox, py: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, left: wd.range, dmg: wd.dmg * mult, pierce: wd.pierce, gun: p.wpn.id, pid: p.id, falloff: wd.pellets > 1, range: wd.range, hit: [] });
  }
  ev(s, { type: 'gunshot', gun: p.wpn.id, x: ox, y: oy, ang: p.ang, pid: p.id, silenced });
  s.noises.push({ pl: 1, x: p.x, y: p.y, r: g.noise * TILE, alert: g.alert });
}

const SPEED = { carbine: 1900, pistol: 1500, smg: 1400, shotgun: 1150, rifle: 2400, crossbow: 760 };
const BLOOM = { carbine: 0.15, pistol: 0.22, smg: 0.1, shotgun: 0.55, rifle: 0.7, crossbow: 0.25 };
// travelling projectiles: swept against walls and zombies each tick
function updateBullets(s, dt) {
  const w = s.world;
  for (const b of s.bullets) {
    const sp = Math.hypot(b.vx, b.vy), step = Math.min(sp * dt, b.left), a = Math.atan2(b.vy, b.vx), ca = b.vx / sp, sa = b.vy / sp;
    const wallD = castRay(w, b.x, b.y, a, step, bulletBlock);
    let end = wallD;
    const hits = [];
    for (const z of s.zombies) {
      if (z.hp <= 0 || b.hit.includes(z.id)) continue;
      const rx = z.x - b.x, ry = z.y - b.y, t = rx * ca + ry * sa;
      if (t < 0 || t > wallD) continue;
      if (Math.abs(rx * sa - ry * ca) < ZT[z.type].r + 2) hits.push({ z, t });
    }
    hits.sort((p1, p2) => p1.t - p2.t);
    const p = s.players[b.pid];
    for (const { z, t } of hits) {
      if (b.pierce <= 0) break;
      const travelled = b.range - b.left + t, fall = b.falloff ? Math.max(0.25, 1 - (travelled / b.range) * 0.75) : 1;
      damageZombie(s, z, b.dmg * fall * (0.9 + rnd() * 0.2), ca, sa, b.falloff ? 45 : b.gun === 'rifle' ? 110 : 70, p, false);
      ev(s, { type: 'bimpact', x: b.x + ca * t, y: b.y + sa * t, ang: a, flesh: true, gun: b.gun });
      b.hit.push(z.id); b.pierce--; b.dmg *= 0.7;
      if (b.pierce <= 0) { end = t; b.left = 0; }
    }
    b.px = b.x; b.py = b.y;
    b.x += ca * end; b.y += sa * end; b.left -= step;
    if (wallD < step && b.left > 0 && b.pierce > 0) { b.left = 0; ev(s, { type: 'bimpact', x: b.x, y: b.y, ang: a, wall: true, gun: b.gun }); }
  }
  s.bullets = s.bullets.filter((b) => b.left > 0 || (b.dead = (b.dead || 0) + 1) < 2);
}

function startReload(s, p) {
  if (!p.wpn || p.reload > 0) return;
  const wd = ITEMS[p.wpn.id]; if (wd.cat !== 'gun' || p.wpn.mag >= gunStats(p.wpn).mag) return;
  if (countItem(p.inv, wd.ammo) <= 0) { msg(s, `No ${ITEMS[wd.ammo].name}.`, '#aaa', p.id); return; }
  p.reload = wd.reload; ev(s, { type: 'reload', x: p.x, y: p.y });
}
function finishReload(s, p) {
  if (!p.wpn) return; const wd = ITEMS[p.wpn.id]; if (wd.cat !== 'gun') return;
  p.wpn.mag += removeItem(p.inv, wd.ammo, gunStats(p.wpn).mag - p.wpn.mag);
}

function shove(s, p) {
  if (p.stamina < 8 || p.atkCd > 0) return;
  p.stamina -= 12; p.atkCd = 0.45; p.swing = p.swingDur = 0.3; p.act = 'shove';
  ev(s, { type: 'shove', x: p.x, y: p.y, ang: p.ang });
  for (const z of s.zombies) {
    if (z.hp <= 0) continue;
    const d = dist(p, z); if (d > 48 + ZT[z.type].r) continue;
    const a = Math.atan2(z.y - p.y, z.x - p.x);
    if (d > 14 && angDiff(a, p.ang) > 1.2) continue;
    const res = z.type === 'brute' ? 0.3 : 1;
    z.vx += Math.cos(a) * 280 * res; z.vy += Math.sin(a) * 280 * res; z.stagger = Math.max(z.stagger, 1.1 * res); z.atk = 0;
    z.hitT = 0.28; z.hitDir = a; z.flash = 0.06;
  }
}

function damageZombie(s, z, dmg, kx, ky, knock, p, crit, melee = false, silent = false) {
  z.hp -= dmg; z.flash = 0.1; z.hitT = 0.28; z.hitDir = Math.atan2(ky, kx); z.hitAge = 0; z.wounds = Math.min(6, (z.wounds || 0) + 1);
  const res = z.type === 'brute' ? 0.35 : 1;
  z.vx += kx * knock * res; z.vy += ky * knock * res; z.stagger = Math.max(z.stagger, 0.3 * res); z.atk = 0;
  if (p) { z.state = 'chase'; z.pid = p.id; z.lx = p.x; z.ly = p.y; z.lost = 0; }
  ev(s, { type: 'zhit', silent, w: melee ? (p && p.wpn ? p.wpn.id : 'fists') : 'gun', x: z.x, y: z.y, kx, ky, crit, dmg: Math.round(dmg), melee, pid: p ? p.id : null });
  if (z.hp <= 0) {
    ev(s, { type: 'zdie', zid: z.id, face: z.ang, x: z.x, y: z.y, ztype: z.type, ang: Math.atan2(ky, kx) });
    s.stats.kills++; completeObjective(s, 'kill');
    const corpse = makeLoose(s, z.x, z.y, z.type === 'soldier' ? 'zsoldier' : 'zombie', null); corpse.searched = false; corpse.ang = z.ang; corpse.zt = z.type; corpse.zv = z.id;
    if (z.type === 'brute') corpse.salt = 7;
    const corpses = s.loose.filter((id) => s.world.containers[id] && (s.world.containers[id].type === 'zombie' || s.world.containers[id].type === 'zsoldier'));
    if (corpses.length > 120) { const old = corpses[0]; s.world.containers[old] = null; s.loose = s.loose.filter((id) => id !== old); }
  }
}

function quickHeal(s, p) {
  if (p.channel) return;
  const has = (id) => countItem(p.inv, id) > 0;
  let pick = null;
  if (p.infection > 0 && has('antibiotics')) pick = 'antibiotics';
  else if (p.bleeding) pick = ['bandage', 'rag', 'medkit'].find(has);
  else if (p.hp < 100) pick = (p.hp < 55 && has('medkit')) ? 'medkit' : ['bandage', 'painkillers', 'rag', 'medkit'].find(has);
  if (!pick) { msg(s, 'No useful medical items.', '#aaa', p.id); return; }
  p.channel = { id: pick, t: 0, dur: pick === 'medkit' ? 2.4 : 1.4 };
  ev(s, { type: 'medStart', x: p.x, y: p.y, id: p.channel.id, pid: p.id });
}
function applyMed(s, p, id) {
  const d = ITEMS[id];
  if (d.heal) p.hp = Math.min(100, p.hp + d.heal);
  if (d.stopBleed && p.bleeding && rnd() < d.stopBleed) { p.bleeding = false; msg(s, 'Bleeding stopped.', '#9fe09f', p.id); }
  else if (d.stopBleed && p.bleeding) msg(s, 'The rag did not stop the bleeding.', '#ffb070', p.id);
  if (d.regen) p.regen += d.regen;
  if (d.cure && p.infection > 0) { p.infection = 0; msg(s, 'The infection is gone.', '#9fe09f', p.id); }
  ev(s, { type: 'healed', x: p.x, y: p.y, pid: p.id, id });
}

function throwItem(s, p, id, inp) {
  if (countItem(p.inv, id) <= 0) { msg(s, `No ${ITEMS[id].name}.`, '#aaa', p.id); return; }
  removeItem(p.inv, id, 1);
  const tx = inp.mx ?? p.x + Math.cos(p.ang) * 200, ty = inp.my ?? p.y + Math.sin(p.ang) * 200;
  let d = Math.min(280, Math.hypot(tx - p.x, ty - p.y));
  const fl = 0.55;
  s.thrown.push({ id, x: p.x, y: p.y, vx: (Math.cos(p.ang) * d) / fl, vy: (Math.sin(p.ang) * d) / fl, fly: fl, life: id === 'noisemaker' ? 10 : 2, beep: 0 });
  ev(s, { type: 'throw', x: p.x, y: p.y });
}
function updateThrown(s, dt) {
  const w = s.world;
  for (const o of s.thrown) {
    if (o.fly > 0) {
      o.fly -= dt;
      const nx = o.x + o.vx * dt, ny = o.y + o.vy * dt;
      if (solidAt(w, Math.floor(nx / TILE), Math.floor(ny / TILE))) { o.vx *= -0.3; o.vy *= -0.3; }
      else { o.x = nx; o.y = ny; }
      continue;
    }
    o.life -= dt;
    if (o.id === 'noisemaker') {
      o.beep -= dt;
      if (o.beep <= 0) { o.beep = 0.8; s.noises.push({ x: o.x, y: o.y, r: 18 * TILE, lure: true }); ev(s, { type: 'beep', x: o.x, y: o.y }); }
    } else if (o.life <= 0) {
      ev(s, { type: 'explode', x: o.x, y: o.y });
      s.noises.push({ x: o.x, y: o.y, r: 32 * TILE });
      for (const z of s.zombies) {
        const d = dist(o, z); if (d > 110 || z.hp <= 0) continue;
        const a = Math.atan2(z.y - o.y, z.x - o.x);
        damageZombie(s, z, 200 * (1 - (d / 110) * 0.5), Math.cos(a), Math.sin(a), 300, null, false);
      }
      for (const p of Object.values(s.players)) {
        const d = dist(o, p); if (d < 100 && !p.dead) { p.hp -= 50 * (1 - d / 100); p.hurt = 0.5; }
      }
    }
  }
  s.thrown = s.thrown.filter((o) => o.life > 0);
}

function hurtPlayer(s, p, z) {
  if (p.invuln > 0 || p.dead) return;
  const zt = ZT[z.type];
  const gs = gearStats(p), arm = { biteProt: gs.bite };
  p.hp -= zt.dmg * (1 - gs.armor) * (0.85 + rnd() * 0.3);
  p.invuln = 0.25; p.hurt = 0.45; p.channel = null; p.search = null;
  const prot = arm ? arm.biteProt : 0;
  if (!p.bleeding && rnd() < 0.2 * (1 - prot)) { p.bleeding = true; msg(s, 'You are bleeding! [H] to bandage.', '#ff6a6a', p.id); }
  if (p.infection <= 0 && rnd() < 0.05 * (1 - prot)) { p.infection = 1; msg(s, 'You were bitten. Find Antibiotics.', '#c6ff6a', p.id); }
  ev(s, { type: 'phurt', x: p.x, y: p.y, pid: p.id, ang: Math.atan2(p.y - z.y, p.x - z.x) });
}

function killPlayer(s, p) {
  const kit = p.inv.findIndex((i) => i.id === 'reviver');
  if (kit >= 0) {
    p.inv.splice(kit, 1); p.hp = 50; p.bleeding = false; p.invuln = 2; p.stamina = 100;
    for (const z of s.zombies) { const d = dist(p, z); if (d < 150 && z.hp > 0) { const a = Math.atan2(z.y - p.y, z.x - p.x); z.vx += Math.cos(a) * 420; z.vy += Math.sin(a) * 420; z.stagger = 1.5; z.hp -= 30; } }
    msg(s, 'SELF-REVIVE! You got a second chance.', '#ff6ab0', p.id); ev(s, { type: 'revive', x: p.x, y: p.y, pid: p.id });
    return;
  }
  p.dead = true; p.hp = 0;
  const items = [...p.inv]; if (p.bag) items.push(p.bag); for (const k of GEAR_SLOTS) if (p.gear[k]) items.push(p.gear[k]);
  if (items.length) {
    const c = makeLoose(s, p.x, p.y, 'body', items);
    c.label = `Body (Day ${dayOf(s)})`;
  }
  p.inv = []; p.bag = null; p.gear = { head: null, body: null, legs: null, feet: null }; p.hotbar = p.hotbar.map(() => null); p.wpn = null; p.openCid = -1; p.channel = null; p.search = null;
  s.stats.deaths++;
  ev(s, { type: 'pdie', pid: p.id, x: p.x, y: p.y });
  if (Object.keys(s.players).length > 1) msg(s, 'A survivor is down! Their gear is on their body, marked on the map.', '#ff8a6a');
}
function makeLoose(s, x, y, type, items) {
  const id = s.world.containers.length;
  const c = { id, x: Math.floor(x / TILE), y: Math.floor(y / TILE), px: x, py: y, type, items, searched: true };
  s.world.containers.push(c); s.loose.push(id);
  return c;
}

// ---------- zombies ----------
function zombiePass(w) {
  return (tx, ty) => {
    if (tx < 0 || ty < 0 || tx >= w.w || ty >= w.h) return true;
    const i = ty * w.w + tx; if (w.safe[i]) return true;
    const t = w.tiles[i]; if (t === T.DOOR) return !w.doors[i].open;
    if (t === T.WINDOW && w.windows[i]) return !(w.windows[i].open || w.windows[i].broken);
    return SOLID[t] === 1;
  };
}
export function spawnZombie(s, x, y, type) {
  const zt = ZT[type];
  const z = { id: s.nextId++, x, y, type, hp: zt.hp, ang: rnd() * 6.28, state: 'idle', tx: x, ty: y, stagger: 0, atk: 0, atkCd: 0, lost: 0,
    vx: 0, vy: 0, wanderT: rnd() * 3, wx: 0, wy: 0, groan: 3 + rnd() * 10, bash: 0, think: rnd() * 0.25, pid: null, lx: 0, ly: 0, skin: (rnd() * 4) | 0, seen: false, stuck: 0 };
  s.zombies.push(z); return z;
}
function randomTile(s, minD, near = null, rad = 0) {
  const w = s.world, ps = Object.values(s.players);
  for (let k = 0; k < 40; k++) {
    let tx, ty;
    if (near) { const a = rnd() * 6.28; tx = Math.floor(near.x / TILE + Math.cos(a) * rad); ty = Math.floor(near.y / TILE + Math.sin(a) * rad); }
    else { tx = 3 + ((rnd() * (w.w - 6)) | 0); ty = 3 + ((rnd() * (w.h - 6)) | 0); }
    if (tx < 2 || ty < 2 || tx >= w.w - 2 || ty >= w.h - 2) continue;
    const i = ty * w.w + tx, t = w.tiles[i];
    if (SOLID[t] || t === T.DOOR || w.safe[i]) continue;
    const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
    if (ps.some((p) => Math.hypot(p.x - x, p.y - y) < minD * TILE)) continue;
    if (w.safeCenter && Math.hypot(w.safeCenter.x - x, w.safeCenter.y - y) < 16 * TILE) continue;
    return { x, y };
  }
  return null;
}
function spawnRandomZombie(s, minD, night) {
  const pos = randomTile(s, minD); if (!pos) return;
  const r = rnd();
  const type = r < (night ? 0.22 : 0.08) ? 'runner' : r > 0.95 ? 'brute' : 'walker';
  spawnZombie(s, pos.x, pos.y, type);
}
function spawnInZone(s, zn, n, minD = 0) {
  for (let k = 0; k < n; k++) {
    const pos = randomTile(s, minD, zn, (Math.random() * zn.r) / TILE); if (!pos) continue;
    const r = rnd();
    const type = zn.kind === 'military' ? (r < 0.55 ? 'soldier' : r < 0.65 ? 'brute' : 'walker') : (r < 0.2 ? 'runner' : r < 0.3 ? 'brute' : 'walker');
    spawnZombie(s, pos.x, pos.y, type);
  }
}
function spawnHorde(s) {
  const alive = Object.values(s.players).filter((q) => !q.dead); if (!alive.length) return;
  const p = alive[(rnd() * alive.length) | 0], n = 10 + dayOf(s) * 3;
  const center = randomTile(s, 26, p, 34); if (!center) return;
  for (let k = 0; k < n; k++) {
    const z = spawnZombie(s, center.x + (rnd() - 0.5) * 120, center.y + (rnd() - 0.5) * 120, rnd() < 0.25 ? 'runner' : rnd() < 0.08 ? 'brute' : 'walker');
    collide(z, 10, zombiePass(s.world));
    z.state = 'investigate'; z.tx = p.x; z.ty = p.y;
  }
  msg(s, 'A horde is moving through the area tonight...', '#ff7a7a');
  ev(s, { type: 'horde' });
}

function updateZombies(s, dt) {
  const w = s.world;
  const players = Object.values(s.players).filter((p) => !p.dead);
  const block = zombiePass(w);
  const dark = daylight(s) < 0.35;
  // flow fields per player
  for (const p of players) {
    const f = s.flows[p.id] || (s.flows[p.id] = new FlowField(w));
    f.t = (f.t || 0) - dt;
    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
    if (f.t <= 0 || tx !== f.cx || ty !== f.cy) {
      f.t = 0.4;
      f.build(tx, ty, 40, (nx, ny, ni) => { const t = w.tiles[ni]; if (w.safe[ni]) return false; return t === T.DOOR || t === T.WINDOW || !SOLID[t]; });
    }
  }
  // spatial hash
  const grid = new Map();
  for (const z of s.zombies) { const k = ((z.x / 64) | 0) + ((z.y / 64) | 0) * 4096; let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(z); }

  for (const z of s.zombies) {
    if (z.hp <= 0) continue;
    if (z.flash > 0) z.flash -= dt;
    if (z.hitT > 0) z.hitT -= dt;
    z.hitAge = (z.hitAge ?? 99) + dt;
    const zt = ZT[z.type];
    let p = null, d = 1e9, seek = null, seekD = 1e9; // nearest player, and nearest one outside the safehouse
    for (const q of players) { const dq = dist(z, q); if (dq < d) { d = dq; p = q; } if (dq < seekD && !isSafe(w, q.x, q.y)) { seekD = dq; seek = q; } }
    if (d > 55 * TILE) { // far: cheap wander
      z.wanderT -= dt;
      if (z.wanderT <= 0) { z.wanderT = 3 + rnd() * 5; const a = rnd() * 6.28; z.wx = Math.cos(a); z.wy = Math.sin(a); if (rnd() < 0.5) z.wx = z.wy = 0; }
      z.x += z.wx * 10 * dt; z.y += z.wy * 10 * dt; collide(z, zt.r, block);
      continue;
    }
    // knockback
    if (z.vx || z.vy) {
      z.x += z.vx * dt; z.y += z.vy * dt;
      const k = Math.max(0, 1 - dt * 9); z.vx *= k; z.vy *= k;
      if (Math.abs(z.vx) < 1 && Math.abs(z.vy) < 1) z.vx = z.vy = 0;
    }
    z.atkCd -= dt;
    if (z.stagger > 0) { z.stagger -= dt; collide(z, zt.r, block); continue; }

    // perception
    z.think -= dt;
    if (z.think <= 0 && p) {
      z.think = 0.2;
      // watch whoever it's chasing; otherwise the nearest player it could actually reach
      const chased = z.state === 'chase' ? s.players[z.pid] : null;
      const o = chased && !chased.dead ? chased : seek || p, od = dist(z, o);
      const pSafe = isSafe(w, o.x, o.y);
      let sight = zt.sight * TILE * (o.vis ?? 1);
      // peripheral vision: unaware zombies barely see behind them
      if (z.state !== 'chase' && angDiff(z.ang, Math.atan2(o.y - z.y, o.x - z.x)) > 1.4) sight *= 0.35;
      z.seen = !pSafe && od < sight && los(w, z.x, z.y, o.x, o.y);
      if (z.state !== 'chase') {
        // suspicion builds faster when the player is close; fades when out of sight
        if (z.seen) z.sus = (z.sus || 0) + 0.2 * (0.5 + 2.5 * (1 - od / sight)) * (z.type === 'runner' ? 1.4 : 1);
        else z.sus = Math.max(0, (z.sus || 0) - 0.05);
        if (od < 1.2 * TILE && !pSafe && !o.sneak) z.sus = 1;
        if (z.sus >= 1) { z.state = 'chase'; z.pid = o.id; z.lx = o.x; z.ly = o.y; z.lost = 0; ev(s, { type: 'alert', x: z.x, y: z.y }); }
        else if (z.seen && z.sus > 0.35 && z.state === 'idle') { z.state = 'investigate'; z.tx = o.x; z.ty = o.y; z.stuck = 0; }
      }
      if (z.state === 'chase') {
        const tp = s.players[z.pid];
        if (!tp || tp.dead || isSafe(w, tp.x, tp.y)) { z.state = 'investigate'; z.tx = z.lx; z.ty = z.ly; }
        else {
          if (tp === o && z.seen) { z.lx = o.x; z.ly = o.y; z.lost = 0; }
          // someone much closer and in plain sight takes over as the target
          if (seek && seek !== tp && seekD < 5 * TILE && seekD < dist(z, tp) * 0.6 && los(w, z.x, z.y, seek.x, seek.y)) { z.pid = seek.id; z.lx = seek.x; z.ly = seek.y; z.lost = 0; }
        }
      }
    }
    for (const n of s.noises) {
      if (z.state === 'chase' && !n.lure) continue;
      if (Math.hypot(n.x - z.x, n.y - z.y) < n.r * (1 - 0.35 * s.weather.rain) && (n.alert === undefined || rnd() < n.alert)) {
        z.state = 'investigate'; z.tx = n.x + (rnd() - 0.5) * 48; z.ty = n.y + (rnd() - 0.5) * 48; z.stuck = 0;
      }
    }

    let gx = z.x, gy = z.y, spd = zt.spd * (dark ? 1.2 : 1);
    if (z.state === 'chase') {
      const tp = s.players[z.pid] || p;
      z.lost += z.seen ? 0 : dt;
      if (z.lost > 7) { z.state = 'investigate'; z.tx = z.lx; z.ty = z.ly; z.sus = 0.5; }
      const dd = dist(z, tp);
      if (z.seen && dd < 8 * TILE) { gx = tp.x; gy = tp.y; }
      else {
        const f = s.flows[tp.id];
        const tx = Math.floor(z.x / TILE), ty = Math.floor(z.y / TILE);
        const v = f ? f.get(tx, ty) : -1;
        if (v > 0) {
          let best = null;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nv = f.get(tx + dx, ty + dy); if (nv >= 0 && nv < v) { best = [tx + dx, ty + dy]; break; } }
          if (best) { gx = (best[0] + 0.5) * TILE; gy = (best[1] + 0.5) * TILE; }
        } else { gx = z.lx; gy = z.ly; }
      }
      if (dd < zt.r + PLAYER_R + 10 && z.atkCd <= 0 && z.atk <= 0) { z.atk = 0.45; z.atkCd = 1.1; }
    } else if (z.state === 'investigate') {
      gx = z.tx; gy = z.ty; spd *= 0.75;
      if (Math.hypot(gx - z.x, gy - z.y) < 20 || z.stuck > 2.5) { z.state = 'idle'; z.wanderT = 2 + rnd() * 3; }
    } else {
      z.wanderT -= dt;
      if (z.wanderT <= 0) { z.wanderT = 2 + rnd() * 5; const a = rnd() * 6.28; z.wx = Math.cos(a); z.wy = Math.sin(a); if (rnd() < 0.4) z.wx = z.wy = 0; }
      gx = z.x + z.wx * 30; gy = z.y + z.wy * 30; spd *= 0.3;
    }
    if (z.atk > 0) {
      z.atk -= dt; spd = 0;
      if (z.atk <= 0) {
        const tp = s.players[z.pid];
        if (tp && !tp.dead && dist(z, tp) < zt.r + PLAYER_R + 18) hurtPlayer(s, tp, z);
        ev(s, { type: 'zattack', x: z.x, y: z.y });
      }
    }
    let dx = gx - z.x, dy = gy - z.y; const dl = Math.hypot(dx, dy);
    if (dl > 1 && spd > 0) {
      dx /= dl; dy /= dl;
      const ox = z.x, oy = z.y;
      if (w.tiles[Math.floor(z.y / TILE) * w.w + Math.floor(z.x / TILE)] === T.WINDOW) spd *= 0.3; // climbing through
      const step = Math.min(dl, spd * dt);
      z.x += dx * step; z.y += dy * step;
      const ta = Math.atan2(dy, dx); let da = ta - z.ang; while (da > Math.PI) da -= 6.283; while (da < -Math.PI) da += 6.283; z.ang += da * Math.min(1, dt * 8);
      // door bashing
      const ax = Math.floor((z.x + dx * (zt.r + 6)) / TILE), ay = Math.floor((z.y + dy * (zt.r + 6)) / TILE);
      const ai = ay * w.w + ax;
      const wi = w.tiles[ai] === T.WINDOW ? w.windows[ai] : null;
      if (wi && !wi.open && !wi.broken && z.state !== 'idle') {
        z.bash += dt;
        if (z.bash >= 1) { z.bash = 0; wi.hp -= z.type === 'brute' ? 20 : 8; ev(s, { type: 'bash', x: (ax + 0.5) * TILE, y: (ay + 0.5) * TILE, glassy: true }); if (wi.hp <= 0) { wi.broken = true; wi.open = true; ev(s, { type: 'glass', x: (ax + 0.5) * TILE, y: (ay + 0.5) * TILE, ang: z.ang }); s.noises.push({ x: z.x, y: z.y, r: 9 * TILE }); } }
      }
      if (w.tiles[ai] === T.DOOR && !w.doors[ai].open && z.state !== 'idle') {
        z.bash += dt;
        if (z.bash >= 1) {
          z.bash = 0; const door = w.doors[ai]; door.hp -= z.type === 'brute' ? 25 : 8;
          if (door.bar) door.bar = Math.min(door.bar, Math.ceil(Math.max(0, door.hp - 60) / 70));
          ev(s, { type: 'bash', x: (ax + 0.5) * TILE, y: (ay + 0.5) * TILE });
          s.noises.push({ x: z.x, y: z.y, r: 6 * TILE });
          if (door.hp <= 0) { door.broken = true; door.open = true; ev(s, { type: 'doorbreak', x: (ax + 0.5) * TILE, y: (ay + 0.5) * TILE }); }
        }
      }
      collide(z, zt.r, block);
      const moved = Math.hypot(z.x - ox, z.y - oy);
      z.stuck = moved < step * 0.3 ? z.stuck + dt : Math.max(0, z.stuck - dt);
    } else collide(z, zt.r, block);
    // separation
    const cx = (z.x / 64) | 0, cy = (z.y / 64) | 0;
    for (let oy2 = -1; oy2 <= 1; oy2++) for (let ox2 = -1; ox2 <= 1; ox2++) {
      const a = grid.get(cx + ox2 + (cy + oy2) * 4096); if (!a) continue;
      for (const o of a) {
        if (o === z || o.hp <= 0) continue;
        const ddx = z.x - o.x, ddy = z.y - o.y, d2 = ddx * ddx + ddy * ddy, rr = zt.r + ZT[o.type].r;
        if (d2 < rr * rr && d2 > 0.01) { const dd = Math.sqrt(d2), push = (rr - dd) * 0.5; z.x += (ddx / dd) * push; z.y += (ddy / dd) * push; }
      }
    }
    // keep off players
    for (const q of players) {
      const ddx = z.x - q.x, ddy = z.y - q.y, rr = zt.r + PLAYER_R, d2 = ddx * ddx + ddy * ddy;
      if (d2 < rr * rr && d2 > 0.01) { const dd = Math.sqrt(d2); z.x += (ddx / dd) * (rr - dd); z.y += (ddy / dd) * (rr - dd); }
    }
    collide(z, zt.r, block);
    z.groan -= dt;
    if (z.groan <= 0) { z.groan = 5 + rnd() * 10; if (d < 14 * TILE) ev(s, { type: 'groan', x: z.x, y: z.y, ztype: z.type }); }
  }
  s.zombies = s.zombies.filter((z) => z.hp > 0);
}

// ---------- commands (UI actions) ----------
function stashItems(s) { return stashCont(s).items; }
function haveCost(s, p, cost) {
  for (const id in cost) if (countItem(p.inv, id) + (isSafe(s.world, p.x, p.y) ? countItem(stashItems(s), id) : 0) < cost[id]) return false;
  return true;
}
function payCost(s, p, cost) {
  for (const id in cost) {
    let need = cost[id];
    if (isSafe(s.world, p.x, p.y)) need -= removeItem(stashItems(s), id, need);
    if (need > 0) {
      for (const it of p.inv) if (it.id === id && it === p.wpn) p.wpn = null;
      removeItem(p.inv, id, need);
    }
  }
}
export function costStatus(s, p, cost) {
  return Object.entries(cost).map(([id, n]) => ({ id, n, have: countItem(p.inv, id) + (isSafe(s.world, p.x, p.y) ? countItem(stashItems(s), id) : 0) }));
}

export function command(s, pid, c) { const n = s.events.length; runCommand(s, pid, c); stampEvents(s, n, pid); }
function runCommand(s, pid, c) {
  const p = s.players[pid]; if (!p) return;
  const w = s.world;
  if (c.t === 'respawn') {
    if (!p.dead) return;
    const np = newPlayer(s, pid, s.upgrades.locker ? 'locker' : 'none');
    s.players[pid] = np; ev(s, { type: 'respawn', pid }); return;
  }
  if (p.dead) return;
  const cont = c.cid !== undefined ? getCont(s, c.cid) : null;
  const contOk = cont && p.openCid === c.cid && cont.items;
  switch (c.t) {
    case 'take': {
      if (!contOk) return; const it = cont.items[c.idx]; if (!it) return;
      cont.items.splice(c.idx, 1); addItem(p.inv, it); autoHot(p, p.inv.findLast((x) => x.id === it.id));
      if (!cont.items.length && (cont.type === 'zombie' || cont.type === 'zsoldier')) cont.emptyT = s.time;
      ev(s, { type: 'pickup', cat: ITEMS[it.id].cat, x: p.x, y: p.y, pid: p.id, text: `+ ${ITEMS[it.id].name}${it.n > 1 ? ' x' + it.n : ''}` });
      break;
    }
    case 'takeAll': {
      if (!contOk) return;
      const nTaken = cont.items.length;
      for (const it of cont.items) { addItem(p.inv, it); autoHot(p, p.inv.findLast((x) => x.id === it.id)); }
      cont.items.length = 0; if (cont.type === 'zombie' || cont.type === 'zsoldier') cont.emptyT = s.time; ev(s, { type: 'pickup', cat: 'bag', x: p.x, y: p.y, pid: p.id, text: nTaken ? `+ ${nTaken} item${nTaken > 1 ? 's' : ''}` : '' });
      break;
    }
    case 'put': case 'putAll': {
      if (!contOk) return;
      const cap = contCap(s, cont);
      const list = c.t === 'put' ? [p.inv[c.idx]].filter(Boolean) : p.inv.filter((i) => i !== p.wpn);
      let moved = 0;
      for (const it of list) {
        const left = addItem(cont.items, it, cap);
        const n = it.n - left;
        if (n <= 0) continue;
        moved += n;
        if (left > 0) it.n = left; else { const i = p.inv.indexOf(it); p.inv.splice(i, 1); if (it === p.wpn) p.wpn = null; }
      }
      if (moved && cont.type === 'stash') { s.stats.hauled += moved; completeObjective(s, 'deposit'); }
      if (!moved) msg(s, 'No room.', '#aaa', p.id);
      ev(s, { type: 'stow', cat: list[0] ? ITEMS[list[0].id].cat : 'bag', x: p.x, y: p.y, pid: p.id });
      break;
    }
    case 'use': {
      const it = p.inv[c.idx]; if (!it) return;
      const d = ITEMS[it.id];
      if (d.cat === 'food') {
        if (d.hunger) p.hunger = Math.max(0, Math.min(100, p.hunger + d.hunger));
        if (d.thirst) p.thirst = Math.max(0, Math.min(100, p.thirst + d.thirst));
        it.n--; if (it.n <= 0) p.inv.splice(c.idx, 1);
        ev(s, { type: d.thirst > (d.hunger || 0) ? 'drink' : 'eat', x: p.x, y: p.y });
      } else if (d.cat === 'buff') {
        p.buffs = p.buffs || {}; p.buffs[d.buff] = d.time; if (d.thirst) p.thirst = Math.min(100, p.thirst + d.thirst);
        it.n--; if (it.n <= 0) p.inv.splice(c.idx, 1);
        msg(s, d.buff === 'adrenaline' ? 'ADRENALINE! Faster, stronger, tireless.' : 'Energy surge: stamina recovers twice as fast.', '#5ad0c8', p.id); ev(s, { type: 'buff', x: p.x, y: p.y, pid: p.id, buff: d.buff });
      } else if (d.cat === 'perk') msg(s, 'Passive: keep it in your inventory.', '#aaa', p.id);
      else if (d.cat === 'med') { if (!p.channel) { p.channel = { id: it.id, t: 0, dur: it.id === 'medkit' ? 2.4 : 1.4 }; ev(s, { type: 'medStart', x: p.x, y: p.y, id: p.channel.id, pid: p.id }); } }
      else if (d.cat === 'melee' || d.cat === 'gun') { p.wpn = it; p.reload = 0; ev(s, { type: 'equip' }); }
      else if (d.cat === 'bag' || d.cat === 'armor') {
        p.inv.splice(c.idx, 1);
        if (d.cat === 'bag') { if (p.bag) addItem(p.inv, p.bag); p.bag = it; }
        else { const sl = d.slot || 'body'; if (p.gear[sl]) addItem(p.inv, p.gear[sl]); p.gear[sl] = it; }
        ev(s, { type: 'equip' }); msg(s, `Wearing ${d.name}.`, '#aaa', p.id);
      } else if (d.cat === 'mod') { // attach to the equipped gun if possible, otherwise the first gun that can take it
        const free = (g) => g && modFits(g.id, it.id) && !(g.mods || []).includes(it.id);
        const gun = free(p.wpn) ? p.wpn : p.inv.find(free);
        if (gun) command(s, p.id, { t: 'attachMod', idx: c.idx, gun: p.inv.indexOf(gun) });
        else msg(s, `No gun that can take a ${d.name}.`, '#aaa', p.id);
      } else if (d.cat === 'throw') msg(s, `Aim and press ${it.id === 'noisemaker' ? 'G' : 'X'} to throw.`, '#aaa', p.id);
      break;
    }
    case 'attachMod': { // idx: the mod, gun: the gun (both inventory indexes)
      const m = p.inv[c.idx], g = p.inv[c.gun]; if (!m || !g || !MODS[m.id]) return;
      if (!modFits(g.id, m.id)) { msg(s, `A ${ITEMS[m.id].name} doesn't fit the ${ITEMS[g.id].name}.`, '#aaa', p.id); return; }
      if ((g.mods || []).includes(m.id)) { msg(s, `This ${ITEMS[g.id].name} already has a ${ITEMS[m.id].name}.`, '#aaa', p.id); return; }
      g.mods = [...(g.mods || []), m.id];
      p.inv.splice(c.idx, 1);
      ev(s, { type: 'equip', pid: p.id }); msg(s, `${ITEMS[m.id].name} attached to ${ITEMS[g.id].name}.`, '#9fe09f', p.id);
      break;
    }
    case 'detachMod': { // idx: the gun, mod: which mod. Rounds that no longer fit go back to the inventory.
      const g = p.inv[c.idx]; if (!g || !(g.mods || []).includes(c.mod)) return;
      g.mods = g.mods.filter((id) => id !== c.mod);
      addItem(p.inv, makeItem(c.mod));
      const over = g.mag - gunStats(g).mag;
      if (over > 0) { g.mag -= over; addItem(p.inv, makeItem(ITEMS[g.id].ammo, over)); }
      ev(s, { type: 'equip', pid: p.id }); msg(s, `${ITEMS[c.mod].name} removed from ${ITEMS[g.id].name}.`, '#aaa', p.id);
      break;
    }
    case 'unequip': {
      if (c.slot === 'wpn') p.wpn = null;
      else if (c.slot === 'bag') { if (p.bag) { addItem(p.inv, p.bag); p.bag = null; } }
      else if (p.gear[c.slot]) { addItem(p.inv, p.gear[c.slot]); p.gear[c.slot] = null; }
      break;
    }
    case 'drop': {
      const it = p.inv[c.idx]; if (!it) return;
      p.inv.splice(c.idx, 1); if (it === p.wpn) p.wpn = null;
      let pile = s.loose.map((id) => w.containers[id]).find((k) => k.type === 'pile' && Math.hypot(k.px - p.x, k.py - p.y) < 40);
      if (!pile) { pile = makeLoose(s, p.x + Math.cos(p.ang) * 14, p.y + Math.sin(p.ang) * 14, 'pile', []); pile.label = 'Dropped Backpack'; pile.ang = p.ang + (rnd() - 0.5); ev(s, { type: 'dropbag', x: pile.px, y: pile.py }); }
      addItem(pile.items, it);
      break;
    }
    case 'hotbar': { // assign an inventory item to a hotbar slot (idx null clears it)
      if (c.slot < 0 || c.slot > 5) return;
      if (c.idx === null || c.idx === undefined) { p.hotbar[c.slot] = null; break; }
      const it = p.inv[c.idx]; if (!it || !HOTABLE.has(ITEMS[it.id].cat)) { msg(s, "That can't go on the hotbar.", '#aaa', p.id); return; }
      // two guns of a type can sit on separate slots, since their mods can differ
      p.hotbar = p.hotbar.map((h) => (h && (h.ref === it || (h.id === it.id && ITEMS[it.id].cat !== 'gun')) ? null : h));
      p.hotbar[c.slot] = { id: it.id, ref: it }; ev(s, { type: 'click' });
      break;
    }
    case 'hotswap': { const a = p.hotbar[c.a]; p.hotbar[c.a] = p.hotbar[c.b]; p.hotbar[c.b] = a; break; }
    case 'sort': {
      const list = c.which === 'cont' ? (contOk ? cont.items : null) : p.inv;
      if (!list) return;
      const ord = (it) => CAT_ORDER.indexOf(ITEMS[it.id].cat) * 1000 + ITEMS[it.id].name.charCodeAt(0);
      const sorted = [...list].sort((a2, b2) => ord(a2) - ord(b2) || ITEMS[a2.id].name.localeCompare(ITEMS[b2.id].name));
      list.length = 0; for (const it of sorted) { if (it === p.wpn) list.push(it); else addItem(list, it); }
      ev(s, { type: 'click' });
      break;
    }
    case 'upgrade': {
      if (!isSafe(w, p.x, p.y)) return;
      const u = UPGRADES.find((k) => k.id === c.id); if (!u) return;
      const lvl = s.upgrades[u.id]; const cost = u.levels[lvl]; if (!cost) return;
      if (!haveCost(s, p, cost)) { msg(s, 'Missing materials.', '#ff8a6a', p.id); return; }
      payCost(s, p, cost); s.upgrades[u.id]++;
      msg(s, `Built: ${u.name}${u.levels.length > 1 ? ' ' + s.upgrades[u.id] : ''}`, '#9fe09f');
      ev(s, { type: 'built', id: u.id });
      completeObjective(s, 'build');
      if (UPGRADES.every((k) => s.upgrades[k.id] >= k.levels.length)) completeObjective(s, 'all');
      break;
    }
    case 'craft': {
      if (!isSafe(w, p.x, p.y) || !s.upgrades.bench) return;
      const r = RECIPES.find((k) => k.id === c.id); if (!r) return;
      if (r.needs && !s.upgrades[r.needs]) return;
      if (!haveCost(s, p, r.cost)) { msg(s, 'Missing materials.', '#ff8a6a', p.id); return; }
      payCost(s, p, r.cost); addItem(p.inv, makeItem(r.out[0], r.out[1]));
      msg(s, `Crafted ${ITEMS[r.out[0]].name}${r.out[1] > 1 ? ' x' + r.out[1] : ''}.`, '#9fe09f', p.id);
      ev(s, { type: 'crafted' }); completeObjective(s, 'craft');
      break;
    }
    case 'sellVal': {
      if (!isSafe(w, p.x, p.y) || !s.upgrades.radio) return;
      let pts = 0;
      for (const list of [stashItems(s), p.inv]) for (let i = list.length - 1; i >= 0; i--) { const d = ITEMS[list[i].id]; if (d.cat === 'val') { pts += d.val * list[i].n; list.splice(i, 1); } }
      s.tradePoints += pts; msg(s, pts ? `Radioed in valuables: +${pts} credit.` : 'No valuables to trade.', '#ffd27a', p.id);
      break;
    }
    case 'trade': {
      if (!isSafe(w, p.x, p.y) || !s.upgrades.radio || s.tradePoints < TRADE_COST) return;
      s.tradePoints -= TRADE_COST;
      const got = [];
      for (let k = 0; k < 3; k++) { const [id, n] = TRADE_POOL[(rnd() * TRADE_POOL.length) | 0]; addItem(stashItems(s), makeItem(id, n), 999); got.push(`${ITEMS[id].name} x${n}`); }
      msg(s, `Supply drop in the stash: ${got.join(', ')}`, '#9fe09f', p.id); ev(s, { type: 'crafted' });
      break;
    }
    case 'sleep': {
      if (!s.upgrades.bed) { msg(s, 'Build a Proper Bed at the Workbench first.', '#aaa', p.id); return; }
      const h = hourOf(s);
      if (h < 19 && h >= 6) { msg(s, "You're not tired. Sleep after 19:00.", '#aaa', p.id); return; }
      const sleepers = Object.values(s.players).filter((q) => !q.dead);
      if (sleepers.some((q) => !isSafe(w, q.x, q.y))) { msg(s, 'Everyone has to be back at the safehouse to sleep.', '#ffb070', p.id); return; } // sleeping skips the night for the whole world
      if (s.zombies.some((z) => z.state === 'chase' && sleepers.some((q) => dist(z, q) < 12 * TILE))) { msg(s, "You can't sleep with zombies nearby.", '#ff8a6a', p.id); return; }
      const ht = hoursTotal(s); let target = Math.floor(ht / 24) * 24 + 7; if (target <= ht) target += 24;
      s.time += ((target - ht) / 24) * DAY_LENGTH;
      for (const q of sleepers) { q.hp = Math.min(100, q.hp + 50); q.hunger = Math.max(5, q.hunger - 15); q.thirst = Math.max(5, q.thirst - 20); q.stamina = 100; }
      ev(s, { type: 'slept' });
      break;
    }
  }
}
