import { SAVE_KEY } from './config.js';
import { createState } from './sim/sim.js';
import { tablesChanged } from './sim/props.js';
import { fixSlots } from './sim/inventory.js';

const toB64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s); };
const fromB64 = (b) => { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };

function packPlayer(p) {
  const { inv, wpn, bag, gear } = p;
  return { id: p.id, x: p.x, y: p.y, hp: p.hp, hunger: p.hunger, thirst: p.thirst, stamina: p.stamina, bleeding: p.bleeding, bleedLv: p.bleedLv || 0, infection: p.infection,
    regen: p.regen, inv, wpn: inv.indexOf(wpn), bag, gear, buffs: p.buffs, flashlight: p.flashlight, sneak: p.sneak, dead: p.dead, inRaid: p.inRaid, downed: p.downed, boarded: p.boarded };
}

// Keeps a copy in this browser and returns the save, for the shared copy on the server.
// rev counts every save; base is the rev this session loaded, so the server can refuse an out-of-date copy.
export function saveGame(s, explored) {
  s.rev = (s.rev || 0) + 1;
  const data = packSave(s, explored);
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { console.warn('save failed', e); }
  return data;
}
export function packSave(s, explored) {
  const w = s.world;
  const cont = [];
  w.containers.forEach((c, i) => {
    if (!c) return;
    if (i >= s.baseConts) cont.push([i, c.items, c.searched ? 1 : 0, c.salt || 0, c.px, c.py, c.type, c.label || null]);
    else if (c.items !== null || c.searched) cont.push([i, c.items, c.searched ? 1 : 0, c.salt || 0]);
  });
  const doors = Object.entries(w.doors).map(([i, d]) => [+i, d.open ? 1 : 0, d.hp, d.broken ? 1 : 0, d.bar || 0, d.locked ? 1 : 0]);
  const windows = Object.entries(w.windows).filter(([, v]) => v.open || v.broken || v.hp < 20).map(([i, v]) => [+i, v.open ? 1 : 0, v.broken ? 1 : 0, v.hp]);
  const data = {
    v: 1, rev: s.rev || 0, base: s.base || 0, session: s.session || (s.session = Math.random().toString(36).slice(2)), seed: s.seed, citySeed: s.citySeed, raidNo: s.raidNo, raid: s.raid, testGear: s.testGear, time: s.time, dawnIdx: s.dawnIdx, nextId: s.nextId, upgrades: s.upgrades, hordeDay: s.hordeDay, obj: s.obj,
    stats: s.stats, tradePoints: s.tradePoints, loose: s.loose, cont, doors, windows,
    clutter: w.clutter.flatMap((c, i) => (c.broken ? [i] : [])), tables: w.tables.flatMap((ti) => { const t = w.props[ti]; return t.flip || t.hp < 60 ? [[ti, t.flip, t.hp]] : []; }),
    players: [...Object.values(s.players).map(packPlayer), ...Object.values(s.parked || {}).map((p) => ({ ...packPlayer(p), parked: true }))],
    zombies: s.zombies.map((z) => [z.type, Math.round(z.x), Math.round(z.y), Math.round(z.hp)]),
    explored: explored ? toB64(explored) : null, savedAt: Date.now(),
  };
  return data;
}
export function readLocal() { try { const d = JSON.parse(localStorage.getItem(SAVE_KEY)); return d && d.v === 1 ? d : null; } catch { return null; } }

export function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; } }
export function deleteSave() { try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } }

// Everyone but localId waits outside the world, with their gear, until they join.
export function loadGame(spawnZombie, newPlayer, localId = 'p1', d = readLocal()) {
  if (!d || d.v !== 1) return null;
  const s = createState(d.seed, false, { testGear: d.testGear, citySeed: d.citySeed });
  const w = s.world;
  Object.assign(s, { rev: d.rev || 0, base: d.rev || 0, raidNo: d.raidNo || 0, raid: d.raid || null, time: d.time, dawnIdx: d.dawnIdx, nextId: d.nextId, upgrades: { ...s.upgrades, ...d.upgrades }, hordeDay: d.hordeDay, obj: d.obj, stats: d.stats, tradePoints: d.tradePoints, loose: d.loose });
  for (const c of d.cont) {
    const [i, items, searched, salt, px, py, type, label] = c;
    if (i >= s.baseConts) {
      w.containers[i] = { id: i, x: Math.floor(px / 32), y: Math.floor(py / 32), px, py, type, items, searched: !!searched, salt };
      if (label) w.containers[i].label = label;
    } else { const k = w.containers[i]; k.items = items; k.searched = !!searched; k.salt = salt; }
  }
  for (let i = 0; i < w.containers.length; i++) if (w.containers[i] === undefined) w.containers[i] = null;
  s.loose = s.loose.filter((id) => w.containers[id]);
  for (const [i, o, hp, b, bar, lk] of d.doors) if (w.doors[i]) Object.assign(w.doors[i], { open: !!o, hp, broken: !!b, bar: bar || 0, locked: !!lk });
  for (const [i, o, b, hp] of d.windows || []) if (w.windows[i]) Object.assign(w.windows[i], { open: !!o, broken: !!b, hp });
  for (const i of d.clutter || []) if (w.clutter[i]) w.clutter[i].broken = true;
  for (const [ti, flip, hp] of d.tables || []) if (w.props[ti] && w.props[ti].kind === 'table') Object.assign(w.props[ti], { flip, hp });
  tablesChanged(w);
  for (const pp of d.players) {
    const p = newPlayer(s, pp.id, 'none');
    Object.assign(p, pp); p.inv = pp.inv; p.wpn = pp.wpn >= 0 ? p.inv[pp.wpn] : null;
    p.gear = pp.gear || { head: null, body: null, legs: null, feet: null };
    fixSlots(p.inv);
    // saved mid-session or not, a partner stays out of the world until they rejoin
    if (pp.parked || pp.id !== localId) { delete p.parked; (s.parked = s.parked || {})[p.id] = p; } // a co-op partner waits, with their gear, for their next visit
    else s.players[p.id] = p;
  }
  for (const [type, x, y, hp] of d.zombies) { const z = spawnZombie(s, x, y, type); z.hp = hp; }
  for (const id in s.players) if (!s.raid || s.players[id].inRaid !== s.raid.id) s.players[id].inRaid = 0;
  return { state: s, explored: d.explored ? fromB64(d.explored) : null };
}
