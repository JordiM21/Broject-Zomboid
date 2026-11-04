// Authoritative simulation. Pure state + inputs -> state + events.
// Netcode-ready: every player action arrives as an input frame or a command object.
import { TILE, DAY_LENGTH, START_HOUR, PLAYER_R, BASE_CARRY } from '../config.js';
import { ITEMS, FISTS, UPGRADES, STASH_CAP, RECIPES, TRADE_COST, TRADE_POOL, OBJECTIVES, CONTAINER_LABEL } from '../data/items.js';
import { generateWorld, T, SOLID } from '../world/worldgen.js';
import { solidAt, collide, los, castRay, bulletBlock, isSafe, FlowField } from '../world/world.js';
import { makeItem, addItem, countItem, removeItem, invWeight, rollLoot } from './inventory.js';

export const ZT = {
  walker: { hp: 60, spd: 36, dmg: 9, sight: 7, r: 10 },
  runner: { hp: 45, spd: 80, dmg: 7, sight: 9, r: 9 },
  brute: { hp: 240, spd: 30, dmg: 20, sight: 6, r: 14 },
};
const SEARCH_TIME = { car: 1.4, locker: 1.2, crate: 1.2, body: 0.6, pile: 0.3 };
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
export function createState(seed, fresh = true) {
  const world = generateWorld(seed);
  const s = {
    seed, world, time: 0, dawnIdx: 0, players: {}, zombies: [], thrown: [], noises: [], events: [], nextId: 1,
    upgrades: Object.fromEntries(UPGRADES.map((u) => [u.id, 0])), spawnT: 0, hordeDay: 0, obj: 0,
    stats: { kills: 0, deaths: 0, hauled: 0, bestDay: 1 }, tradePoints: 0, loose: [],
  };
  s.dawnIdx = dawnIndex(s);
  s.baseConts = world.containers.length;
  if (fresh) for (let k = 0; k < 300; k++) spawnRandomZombie(s, 22, false);
  initRuntime(s);
  return s;
}
export function initRuntime(s) {
  s.flows = {}; s.events = s.events || []; s.noises = [];
}

export function newPlayer(s, id, kit = 'start') {
  const sp = s.world.spawn;
  const p = {
    id, x: sp.x, y: sp.y, ang: -Math.PI / 2, hp: 100, hunger: 85, thirst: 85, stamina: 100, bleeding: false, infection: 0, regen: 0,
    inv: [], wpn: null, bag: null, armor: null, flashlight: true, sneak: false, atkCd: 0, swing: 0, reload: 0,
    channel: null, search: null, dead: false, invuln: 0, hurt: 0, moving: false, sprinting: false, openCid: -1, stepT: 0, muzzle: 0,
  };
  if (kit === 'start') {
    addItem(p.inv, makeItem('knife')); addItem(p.inv, makeItem('bandage', 2)); addItem(p.inv, makeItem('water')); addItem(p.inv, makeItem('beans'));
    p.wpn = p.inv[0];
  } else if (kit === 'locker') {
    addItem(p.inv, makeItem('knife')); addItem(p.inv, makeItem('bandage', 2)); addItem(p.inv, makeItem('water'));
    p.wpn = p.inv[0];
  } else addItem(p.inv, makeItem('rag', 2));
  return p;
}
export function addPlayer(s, id) { s.players[id] = newPlayer(s, id); return s.players[id]; }

const ev = (s, e) => s.events.push(e);
const msg = (s, text, color = '#ddd', pid = null) => ev(s, { type: 'msg', text, color, pid });
export const getCont = (s, cid) => s.world.containers[cid];
export const stashCont = (s) => s.world.containers[s.world.fixtures.stash];
export const capacity = (p) => BASE_CARRY + (p.bag ? ITEMS[p.bag.id].cap : 0);
export const carried = (p) => invWeight(p.inv) + (p.armor ? ITEMS[p.armor.id].w * 0.5 : 0);
export const contCap = (s, c) => (c.type === 'stash' ? STASH_CAP[s.upgrades.stash] : c.type === 'pile' || c.type === 'body' ? 999 : 20);
const contPos = (c) => (c.px !== undefined ? { x: c.px, y: c.py } : { x: (c.x + 0.5) * TILE, y: (c.y + 0.5) * TILE });
export const contLabel = (c) => c.label || CONTAINER_LABEL[c.type] || 'Container';

function completeObjective(s, id) {
  const o = OBJECTIVES[s.obj];
  if (o && o.id === id) { s.obj++; ev(s, { type: 'objective', text: o.text }); }
}

// ---------- step ----------
export function step(s, inputs, dt) {
  s.time += dt;
  const di = dawnIndex(s);
  if (di > s.dawnIdx) { s.dawnIdx = di; onDawn(s); }
  const day = dayOf(s);
  if (day > s.stats.bestDay) s.stats.bestDay = day;
  const h = hourOf(s);
  if (h >= 22 && day >= 2 && s.hordeDay < day) { s.hordeDay = day; spawnHorde(s); }
  for (const id in s.players) updatePlayer(s, s.players[id], inputs[id] || {}, dt);
  updateThrown(s, dt);
  updateZombies(s, dt);
  s.spawnT -= dt;
  if (s.spawnT <= 0) {
    s.spawnT = 4;
    const night = daylight(s) < 0.3;
    const target = Math.min(520, 260 + day * 25) + (night ? 60 : 0);
    for (let k = 0; k < 4 && s.zombies.length < target; k++) spawnRandomZombie(s, 30, night);
  }
  s.noises.length = 0;
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
    if (!c.searched || ['stash', 'bench', 'bed', 'radio', 'body', 'pile'].includes(c.type)) continue;
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
    if (t === T.DOOR) cand = { kind: 'door', i, tx, ty, label: w.doors[i].broken ? 'Broken Door' : w.doors[i].open ? 'Close Door' : 'Open Door' };
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
    if (!c || (c.items && !c.items.length && c.searched)) continue;
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

function doInteract(s, p) {
  const it = getInteract(s, p); if (!it) return;
  const w = s.world;
  if (it.kind === 'door') {
    const d = w.doors[it.i];
    if (d.broken) { msg(s, 'This door is broken.', '#aaa', p.id); return; }
    if (d.open) { // don't close on someone
      const rx = it.tx * TILE, ry = it.ty * TILE;
      const blocked = [...Object.values(s.players), ...s.zombies].some((e) => !e.dead && e.x > rx - 10 && e.x < rx + TILE + 10 && e.y > ry - 10 && e.y < ry + TILE + 10);
      if (blocked) return;
    }
    d.open = !d.open;
    ev(s, { type: 'door', x: (it.tx + 0.5) * TILE, y: (it.ty + 0.5) * TILE, open: d.open });
    s.noises.push({ x: p.x, y: p.y, r: 2 * TILE });
    return;
  }
  const c = getCont(s, it.cid);
  if (c.type === 'bench') { ev(s, { type: 'ui', pid: p.id, panel: 'base', tab: 'upgrades' }); return; }
  if (c.type === 'radio') { ev(s, { type: 'ui', pid: p.id, panel: 'base', tab: 'radio' }); return; }
  if (c.type === 'bed') { command(s, p.id, { t: 'sleep' }); return; }
  if (c.searched) openCont(s, p, c);
  else p.search = { cid: c.id, t: 0, dur: SEARCH_TIME[c.type] || 0.8 };
}
function openCont(s, p, c) {
  if (c.items === null) c.items = rollLoot(c.type, s.seed, c.id, c.salt || 0);
  const first = !c.searched;
  c.searched = true; p.openCid = c.id;
  ev(s, { type: 'open', pid: p.id, cid: c.id, first, empty: !c.items.length });
  if (c.type !== 'stash') completeObjective(s, 'search');
}

function updatePlayer(s, p, inp, dt) {
  if (p.dead) return;
  const w = s.world;
  p.atkCd -= dt; p.swing -= dt; p.invuln -= dt; p.hurt -= dt; p.muzzle -= dt;
  if (inp.mx !== undefined) p.ang = Math.atan2(inp.my - p.y, inp.mx - p.x);
  if (inp.sneak) { p.sneak = !p.sneak; msg(s, p.sneak ? 'Sneaking: quieter, harder to spot.' : 'Walking.', '#aaa', p.id); }
  if (inp.flash) { p.flashlight = !p.flashlight; ev(s, { type: 'click', x: p.x, y: p.y }); }
  if (inp.sel !== undefined && inp.sel >= 0) selectWeapon(s, p, inp.sel);

  let mx = (inp.right ? 1 : 0) - (inp.left ? 1 : 0), my = (inp.down ? 1 : 0) - (inp.up ? 1 : 0);
  const ml = Math.hypot(mx, my); if (ml > 0) { mx /= ml; my /= ml; }
  p.moving = ml > 0;
  const over = carried(p) / capacity(p);
  const slow = over > 1 ? Math.max(0.4, 1 - (over - 1) * 1.2) : 1;
  p.sprinting = !!inp.sprint && p.moving && p.stamina > 3 && !p.channel && !p.sneak;
  let speed = p.sneak ? 62 : p.sprinting ? 172 : 112;
  speed *= slow; if (p.channel) speed *= 0.4; if (p.reload > 0) speed *= 0.8;
  const tHere = w.tiles[Math.floor(p.y / TILE) * w.w + Math.floor(p.x / TILE)];
  if (tHere === T.BUSH) speed *= 0.6;
  p.x += mx * speed * dt; p.y += my * speed * dt;
  collide(p, PLAYER_R, (tx, ty) => solidAt(w, tx, ty));
  if (p.moving) {
    p.stepT -= dt;
    if (p.stepT <= 0) {
      p.stepT = p.sprinting ? 0.3 : p.sneak ? 0.6 : 0.45;
      const r = p.sprinting ? 6 : p.sneak ? 0 : 2.5;
      if (r) s.noises.push({ x: p.x, y: p.y, r: r * TILE });
      ev(s, { type: 'step', x: p.x, y: p.y, pid: p.id, loud: p.sprinting });
    }
  }

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
  if (inp.reload) startReload(s, p);
  if (p.reload > 0) { p.reload -= dt; if (p.reload <= 0) finishReload(s, p); }
  if (inp.shove) shove(s, p);
  if (inp.heal) quickHeal(s, p);
  if (inp.throwN) throwItem(s, p, 'noisemaker', inp);
  if (inp.throwB) throwItem(s, p, 'pipebomb', inp);
  if (inp.attack && p.atkCd <= 0 && p.reload <= 0 && !p.channel && !p.search) attack(s, p);

  survival(s, p, dt);
  if (p.hp <= 0) killPlayer(s, p);
}

function survival(s, p, dt) {
  p.hunger = Math.max(0, p.hunger - (dt * 100) / (DAY_LENGTH * 1.6));
  p.thirst = Math.max(0, p.thirst - ((dt * 100) / (DAY_LENGTH * 1.1)) * (p.sprinting ? 1.6 : 1));
  if (p.sprinting) p.stamina = Math.max(0, p.stamina - 20 * dt);
  else if (p.atkCd < 0) p.stamina = Math.min(100, p.stamina + (p.hunger < 15 || p.thirst < 15 ? 7 : 15) * dt);
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
function selectWeapon(s, p, n) {
  const l = weaponList(p); if (n >= l.length) return;
  p.wpn = l[n]; p.reload = 0;
  ev(s, { type: 'equip', pid: p.id });
}

function attack(s, p) {
  const wd = p.wpn ? ITEMS[p.wpn.id] : FISTS;
  if (wd.cat === 'gun') return fire(s, p, wd);
  p.atkCd = wd.cd; p.swing = 0.2;
  let mult = 1;
  if (p.stamina < wd.stam) { mult = 0.5; p.atkCd *= 1.5; }
  p.stamina = Math.max(0, p.stamina - wd.stam);
  ev(s, { type: 'swing', x: p.x, y: p.y, ang: p.ang, pid: p.id });
  let hit = false;
  for (const z of s.zombies) {
    if (z.hp <= 0) continue;
    const d = dist(p, z); const zr = ZT[z.type].r;
    if (d > wd.range + zr) continue;
    if (d > zr && angDiff(Math.atan2(z.y - p.y, z.x - p.x), p.ang) > wd.arc / 2) continue;
    if (!los(s.world, p.x, p.y, z.x, z.y)) continue;
    const crit = rnd() < 0.12;
    const dmg = wd.dmg * mult * (crit ? 2 : 1) * (0.9 + rnd() * 0.2);
    const a = Math.atan2(z.y - p.y, z.x - p.x);
    damageZombie(s, z, dmg, Math.cos(a), Math.sin(a), wd.knock, p, crit);
    hit = true;
  }
  if (hit) {
    s.noises.push({ x: p.x, y: p.y, r: 3 * TILE });
    if (p.wpn && p.wpn.dur !== undefined) {
      p.wpn.dur--;
      if (p.wpn.dur <= 0) { msg(s, `Your ${wd.name} broke!`, '#ff8a6a', p.id); const i = p.inv.indexOf(p.wpn); if (i >= 0) p.inv.splice(i, 1); p.wpn = null; ev(s, { type: 'break', x: p.x, y: p.y }); }
    }
  }
}

function fire(s, p, wd) {
  const w = s.world;
  if (p.wpn.mag <= 0) {
    p.atkCd = 0.3;
    if (countItem(p.inv, wd.ammo) > 0) startReload(s, p); else { ev(s, { type: 'empty', x: p.x, y: p.y }); msg(s, 'Out of ammo.', '#aaa', p.id); }
    return;
  }
  p.wpn.mag--; p.atkCd = wd.cd; p.muzzle = 0.06;
  const spread = wd.spread * (p.sneak ? 0.6 : 1) * (p.moving ? 1.5 : 1);
  const ox = p.x + Math.cos(p.ang) * 16, oy = p.y + Math.sin(p.ang) * 16;
  for (let k = 0; k < wd.pellets; k++) {
    const a = p.ang + (rnd() - 0.5) * 2 * spread;
    const ca = Math.cos(a), sa = Math.sin(a);
    const maxD = castRay(w, ox, oy, a, wd.range, bulletBlock);
    const hits = [];
    for (const z of s.zombies) {
      if (z.hp <= 0) continue;
      const rx = z.x - ox, ry = z.y - oy;
      const t = rx * ca + ry * sa;
      if (t < 0 || t > maxD) continue;
      if (Math.abs(rx * sa - ry * ca) < ZT[z.type].r + 2) hits.push({ z, t });
    }
    hits.sort((a2, b) => a2.t - b.t);
    let end = maxD;
    for (let h = 0; h < Math.min(wd.pierce, hits.length); h++) {
      const { z, t } = hits[h];
      const fall = wd.pellets > 1 ? 1 - (t / wd.range) * 0.6 : 1;
      damageZombie(s, z, wd.dmg * fall * (0.9 + rnd() * 0.2), ca, sa, wd.pellets > 1 ? 40 : 60, p, false);
      end = t;
    }
    ev(s, { type: 'tracer', x0: ox, y0: oy, x1: ox + ca * end, y1: oy + sa * end, wall: end === maxD && maxD < wd.range });
  }
  ev(s, { type: 'gunshot', gun: p.wpn.id, x: ox, y: oy, ang: p.ang, pid: p.id });
  s.noises.push({ x: p.x, y: p.y, r: wd.noise * TILE });
}

function startReload(s, p) {
  if (!p.wpn || p.reload > 0) return;
  const wd = ITEMS[p.wpn.id]; if (wd.cat !== 'gun' || p.wpn.mag >= wd.mag) return;
  if (countItem(p.inv, wd.ammo) <= 0) { msg(s, `No ${ITEMS[wd.ammo].name}.`, '#aaa', p.id); return; }
  p.reload = wd.reload; ev(s, { type: 'reload', x: p.x, y: p.y });
}
function finishReload(s, p) {
  if (!p.wpn) return; const wd = ITEMS[p.wpn.id]; if (wd.cat !== 'gun') return;
  p.wpn.mag += removeItem(p.inv, wd.ammo, wd.mag - p.wpn.mag);
}

function shove(s, p) {
  if (p.stamina < 8 || p.atkCd > 0) return;
  p.stamina -= 12; p.atkCd = 0.45; p.swing = 0.15;
  ev(s, { type: 'shove', x: p.x, y: p.y, ang: p.ang });
  for (const z of s.zombies) {
    if (z.hp <= 0) continue;
    const d = dist(p, z); if (d > 48 + ZT[z.type].r) continue;
    const a = Math.atan2(z.y - p.y, z.x - p.x);
    if (d > 14 && angDiff(a, p.ang) > 1.2) continue;
    const res = z.type === 'brute' ? 0.3 : 1;
    z.vx += Math.cos(a) * 280 * res; z.vy += Math.sin(a) * 280 * res; z.stagger = Math.max(z.stagger, 0.9 * res); z.atk = 0;
  }
}

function damageZombie(s, z, dmg, kx, ky, knock, p, crit) {
  z.hp -= dmg;
  const res = z.type === 'brute' ? 0.35 : 1;
  z.vx += kx * knock * res; z.vy += ky * knock * res; z.stagger = Math.max(z.stagger, 0.3 * res); z.atk = 0;
  if (p) { z.state = 'chase'; z.pid = p.id; z.lx = p.x; z.ly = p.y; z.lost = 0; }
  ev(s, { type: 'zhit', x: z.x, y: z.y, kx, ky, crit, dmg: Math.round(dmg) });
  if (z.hp <= 0) {
    ev(s, { type: 'zdie', x: z.x, y: z.y, ztype: z.type, ang: Math.atan2(ky, kx) });
    s.stats.kills++; completeObjective(s, 'kill');
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
  ev(s, { type: 'medStart', x: p.x, y: p.y });
}
function applyMed(s, p, id) {
  const d = ITEMS[id];
  if (d.heal) p.hp = Math.min(100, p.hp + d.heal);
  if (d.stopBleed && p.bleeding && rnd() < d.stopBleed) { p.bleeding = false; msg(s, 'Bleeding stopped.', '#9fe09f', p.id); }
  else if (d.stopBleed && p.bleeding) msg(s, 'The rag did not stop the bleeding.', '#ffb070', p.id);
  if (d.regen) p.regen += d.regen;
  if (d.cure && p.infection > 0) { p.infection = 0; msg(s, 'The infection is gone.', '#9fe09f', p.id); }
  ev(s, { type: 'healed', x: p.x, y: p.y, pid: p.id });
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
  const arm = p.armor ? ITEMS[p.armor.id] : null;
  p.hp -= zt.dmg * (1 - (arm ? arm.armor : 0)) * (0.85 + rnd() * 0.3);
  p.invuln = 0.25; p.hurt = 0.45; p.channel = null; p.search = null;
  const prot = arm ? arm.biteProt : 0;
  if (!p.bleeding && rnd() < 0.3 * (1 - prot)) { p.bleeding = true; msg(s, 'You are bleeding! [H] to bandage.', '#ff6a6a', p.id); }
  if (p.infection <= 0 && rnd() < 0.08 * (1 - prot)) { p.infection = 1; msg(s, 'You were bitten. Find Antibiotics.', '#c6ff6a', p.id); }
  ev(s, { type: 'phurt', x: p.x, y: p.y, pid: p.id, ang: Math.atan2(p.y - z.y, p.x - z.x) });
}

function killPlayer(s, p) {
  p.dead = true; p.hp = 0;
  const items = [...p.inv]; if (p.bag) items.push(p.bag); if (p.armor) items.push(p.armor);
  if (items.length) {
    const c = makeLoose(s, p.x, p.y, 'body', items);
    c.label = `Your Body (Day ${dayOf(s)})`;
  }
  p.inv = []; p.bag = null; p.armor = null; p.wpn = null; p.openCid = -1; p.channel = null; p.search = null;
  s.stats.deaths++;
  ev(s, { type: 'pdie', pid: p.id, x: p.x, y: p.y });
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
function spawnHorde(s) {
  const p = Object.values(s.players).find((q) => !q.dead); if (!p) return;
  const n = 10 + dayOf(s) * 3;
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
      f.build(tx, ty, 40, (nx, ny, ni) => { const t = w.tiles[ni]; if (w.safe[ni]) return false; return t === T.DOOR || !SOLID[t]; });
    }
  }
  // spatial hash
  const grid = new Map();
  for (const z of s.zombies) { const k = ((z.x / 64) | 0) + ((z.y / 64) | 0) * 4096; let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(z); }

  for (const z of s.zombies) {
    if (z.hp <= 0) continue;
    const zt = ZT[z.type];
    let p = null, d = 1e9;
    for (const q of players) { const dq = dist(z, q); if (dq < d) { d = dq; p = q; } }
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
      const pSafe = isSafe(w, p.x, p.y);
      let sight = zt.sight * TILE * (dark ? (p.flashlight ? 1.15 : 0.55) : 1) * (p.sneak ? 0.6 : 1);
      z.seen = !pSafe && d < sight && los(w, z.x, z.y, p.x, p.y);
      if ((z.seen || (d < 1.6 * TILE && !pSafe)) && z.state !== 'chase') { z.state = 'chase'; z.pid = p.id; ev(s, { type: 'alert', x: z.x, y: z.y }); }
      if (z.state === 'chase') {
        const tp = s.players[z.pid];
        if (!tp || tp.dead || isSafe(w, tp.x, tp.y)) { z.state = 'investigate'; z.tx = z.lx; z.ty = z.ly; }
        else if (tp === p && z.seen) { z.lx = p.x; z.ly = p.y; z.lost = 0; }
      }
    }
    for (const n of s.noises) {
      if (z.state === 'chase' && !n.lure) continue;
      if (Math.hypot(n.x - z.x, n.y - z.y) < n.r) {
        z.state = 'investigate'; z.tx = n.x + (rnd() - 0.5) * 48; z.ty = n.y + (rnd() - 0.5) * 48; z.stuck = 0;
      }
    }

    let gx = z.x, gy = z.y, spd = zt.spd * (dark ? 1.2 : 1);
    if (z.state === 'chase') {
      const tp = s.players[z.pid] || p;
      z.lost += z.seen ? 0 : dt;
      if (z.lost > 7) { z.state = 'investigate'; z.tx = z.lx; z.ty = z.ly; }
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
      const step = Math.min(dl, spd * dt);
      z.x += dx * step; z.y += dy * step;
      const ta = Math.atan2(dy, dx); let da = ta - z.ang; while (da > Math.PI) da -= 6.283; while (da < -Math.PI) da += 6.283; z.ang += da * Math.min(1, dt * 8);
      // door bashing
      const ax = Math.floor((z.x + dx * (zt.r + 6)) / TILE), ay = Math.floor((z.y + dy * (zt.r + 6)) / TILE);
      const ai = ay * w.w + ax;
      if (w.tiles[ai] === T.DOOR && !w.doors[ai].open && z.state !== 'idle') {
        z.bash += dt;
        if (z.bash >= 1) {
          z.bash = 0; const door = w.doors[ai]; door.hp -= z.type === 'brute' ? 25 : 8;
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

export function command(s, pid, c) {
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
      cont.items.splice(c.idx, 1); addItem(p.inv, it);
      ev(s, { type: 'pickup', x: p.x, y: p.y });
      break;
    }
    case 'takeAll': {
      if (!contOk) return;
      for (const it of cont.items) addItem(p.inv, it);
      cont.items.length = 0; ev(s, { type: 'pickup', x: p.x, y: p.y });
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
      ev(s, { type: 'pickup', x: p.x, y: p.y });
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
      } else if (d.cat === 'med') { if (!p.channel) { p.channel = { id: it.id, t: 0, dur: it.id === 'medkit' ? 2.4 : 1.4 }; ev(s, { type: 'medStart', x: p.x, y: p.y }); } }
      else if (d.cat === 'melee' || d.cat === 'gun') { p.wpn = it; p.reload = 0; ev(s, { type: 'equip' }); }
      else if (d.cat === 'bag' || d.cat === 'armor') {
        const slot = d.cat === 'bag' ? 'bag' : 'armor';
        p.inv.splice(c.idx, 1);
        if (p[slot]) addItem(p.inv, p[slot]);
        p[slot] = it; ev(s, { type: 'equip' });
      } else if (d.cat === 'throw') msg(s, `Aim and press ${it.id === 'noisemaker' ? 'G' : 'X'} to throw.`, '#aaa', p.id);
      break;
    }
    case 'unequip': {
      if (c.slot === 'wpn') p.wpn = null;
      else if (p[c.slot]) { addItem(p.inv, p[c.slot]); p[c.slot] = null; }
      break;
    }
    case 'drop': {
      const it = p.inv[c.idx]; if (!it) return;
      p.inv.splice(c.idx, 1); if (it === p.wpn) p.wpn = null;
      let pile = s.loose.map((id) => w.containers[id]).find((k) => k.type === 'pile' && Math.hypot(k.px - p.x, k.py - p.y) < 40);
      if (!pile) pile = makeLoose(s, p.x, p.y, 'pile', []);
      addItem(pile.items, it);
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
      if (s.zombies.some((z) => z.state === 'chase' && dist(z, p) < 12 * TILE)) { msg(s, "You can't sleep with zombies nearby.", '#ff8a6a', p.id); return; }
      const ht = hoursTotal(s); let target = Math.floor(ht / 24) * 24 + 7; if (target <= ht) target += 24;
      s.time += ((target - ht) / 24) * DAY_LENGTH;
      p.hp = Math.min(100, p.hp + 50); p.hunger = Math.max(5, p.hunger - 15); p.thirst = Math.max(5, p.thirst - 20); p.stamina = 100;
      ev(s, { type: 'slept' });
      break;
    }
  }
}
