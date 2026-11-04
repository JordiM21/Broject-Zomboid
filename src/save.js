import { SAVE_KEY } from './config.js';
import { createState } from './sim/sim.js';

const toB64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s); };
const fromB64 = (b) => { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };

function packPlayer(p) {
  const { inv, wpn, bag, armor } = p;
  return { id: p.id, x: p.x, y: p.y, hp: p.hp, hunger: p.hunger, thirst: p.thirst, stamina: p.stamina, bleeding: p.bleeding, infection: p.infection,
    regen: p.regen, inv, wpn: inv.indexOf(wpn), bag, armor, flashlight: p.flashlight, sneak: p.sneak, dead: p.dead };
}

export function saveGame(s, explored) {
  const w = s.world;
  const cont = [];
  w.containers.forEach((c, i) => {
    if (i >= s.baseConts) cont.push([i, c.items, 1, 0, c.px, c.py, c.type, c.label || null]);
    else if (c.items !== null || c.searched) cont.push([i, c.items, c.searched ? 1 : 0, c.salt || 0]);
  });
  const doors = Object.entries(w.doors).map(([i, d]) => [+i, d.open ? 1 : 0, d.hp, d.broken ? 1 : 0]);
  const data = {
    v: 1, seed: s.seed, time: s.time, dawnIdx: s.dawnIdx, nextId: s.nextId, upgrades: s.upgrades, hordeDay: s.hordeDay, obj: s.obj,
    stats: s.stats, tradePoints: s.tradePoints, loose: s.loose, cont, doors,
    players: Object.values(s.players).map(packPlayer),
    zombies: s.zombies.map((z) => [z.type, Math.round(z.x), Math.round(z.y), Math.round(z.hp)]),
    explored: explored ? toB64(explored) : null, savedAt: Date.now(),
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); return true; } catch (e) { console.warn('save failed', e); return false; }
}

export function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; } }
export function deleteSave() { try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } }

export function loadGame(spawnZombie, newPlayer) {
  let d;
  try { d = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return null; }
  if (!d || d.v !== 1) return null;
  const s = createState(d.seed, false);
  const w = s.world;
  Object.assign(s, { time: d.time, dawnIdx: d.dawnIdx, nextId: d.nextId, upgrades: { ...s.upgrades, ...d.upgrades }, hordeDay: d.hordeDay, obj: d.obj, stats: d.stats, tradePoints: d.tradePoints, loose: d.loose });
  for (const c of d.cont) {
    const [i, items, searched, salt, px, py, type, label] = c;
    if (i >= s.baseConts) {
      w.containers[i] = { id: i, x: Math.floor(px / 32), y: Math.floor(py / 32), px, py, type, items, searched: true };
      if (label) w.containers[i].label = label;
    } else { const k = w.containers[i]; k.items = items; k.searched = !!searched; k.salt = salt; }
  }
  for (const [i, o, hp, b] of d.doors) if (w.doors[i]) Object.assign(w.doors[i], { open: !!o, hp, broken: !!b });
  for (const pp of d.players) {
    const p = newPlayer(s, pp.id, 'none');
    Object.assign(p, pp); p.inv = pp.inv; p.wpn = pp.wpn >= 0 ? p.inv[pp.wpn] : null;
    s.players[p.id] = p;
  }
  for (const [type, x, y, hp] of d.zombies) { const z = spawnZombie(s, x, y, type); z.hp = hp; }
  return { state: s, explored: d.explored ? fromB64(d.explored) : null };
}
