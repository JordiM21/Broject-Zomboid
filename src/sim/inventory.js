import { ITEMS, LOOT, KITS, MODS, modFits, gunStats, weaponPool, itemWeight } from '../data/items.js';
import { INV_SLOTS, HOT_SLOTS } from '../config.js';
import { RNG } from '../rng.js';

// The player's inventory is a plain list of stacks; each stack remembers which of the 36 slots it sits in
// (0..8 are the hotbar). New stacks take the first free slot: weapons and things you use go to the hotbar first.
const HOT_FIRST = new Set(['melee', 'gun', 'food', 'med', 'buff', 'throw']);
export const slotOf = (inv, k) => inv.find((i) => i.slot === k) || null;
export function freeSlot(inv, id) {
  const used = new Set(inv.map((i) => i.slot));
  const order = HOT_FIRST.has(ITEMS[id].cat) ? [0, INV_SLOTS] : [HOT_SLOTS, INV_SLOTS, 0, HOT_SLOTS];
  for (let r = 0; r < order.length; r += 2) for (let k = order[r]; k < order[r + 1]; k++) if (!used.has(k)) return k;
  return -1;
}
// Gives every stack a unique slot. Returns the stacks that don't fit, already taken out of the list.
export function fixSlots(inv) {
  const seen = new Set(), over = [];
  for (const it of inv) { if (Number.isInteger(it.slot) && it.slot >= 0 && it.slot < INV_SLOTS && !seen.has(it.slot)) seen.add(it.slot); else it.slot = -1; }
  for (const it of inv) if (it.slot < 0) { const k = freeSlot(inv.filter((x) => x.slot >= 0), it.id); if (k < 0) over.push(it); else it.slot = k; }
  for (const it of over) inv.splice(inv.indexOf(it), 1);
  return over;
}

export function makeItem(id, n = 1) {
  const d = ITEMS[id]; const it = { id, n };
  if (d.dur) it.dur = d.dur;
  if (d.cat === 'gun') it.mag = 0;
  return it;
}
export const stackOf = (id) => ITEMS[id].stack || 1;

// returns leftover count that didn't fit
export function addItem(inv, item, maxSlots = Infinity) {
  const st = stackOf(item.id);
  let n = item.n;
  if (st > 1) for (const s of inv) {
    if (s.id === item.id && s.n < st) { const m = Math.min(st - s.n, n); s.n += m; n -= m; if (!n) return 0; }
  }
  while (n > 0 && inv.length < maxSlots) {
    const m = Math.min(st, n); inv.push({ ...item, n: m }); n -= m;
  }
  return n;
}
export function countItem(inv, id) { let c = 0; for (const s of inv) if (s.id === id) c += s.n; return c; }
export function removeItem(inv, id, n) {
  let removed = 0;
  for (let i = inv.length - 1; i >= 0 && removed < n; i--) {
    const s = inv[i]; if (s.id !== id) continue;
    const m = Math.min(s.n, n - removed); s.n -= m; removed += m;
    if (s.n <= 0) inv.splice(i, 1);
  }
  return removed;
}
export function invWeight(inv) { let w = 0; for (const s of inv) w += itemWeight(s) * s.n; return w; }

// A ready-to-fight bundle: loaded guns with spare rounds and a random mod on each, plus melee weapons.
export function rollKit(kind, rng) {
  const k = KITS[kind], out = [];
  const pick = (cat, n) => { const pool = weaponPool(cat, k.tiers), got = []; for (let i = 0; i < n && pool.length; i++) { const id = rng.weighted(pool); got.push(id); pool.splice(pool.findIndex(([x]) => x === id), 1); } return got; };
  for (const id of pick('melee', k.melee)) { const it = makeItem(id); it.dur = Math.round(ITEMS[id].dur * rng.range(0.7, 1)); out.push(it); }
  for (const id of pick('gun', k.guns)) {
    const g = makeItem(id), mods = Object.keys(MODS).filter((m) => modFits(id, m));
    if (mods.length) g.mods = [rng.pick(mods)];
    g.mag = gunStats(g).mag; out.push(g);
    addItem(out, makeItem(ITEMS[id].ammo, ITEMS[id].mag * k.mags));
  }
  for (let i = 0; i < (k.mods || 0); i++) out.push(makeItem(rng.pick(Object.keys(MODS))));
  for (const [id, n] of k.extra) addItem(out, makeItem(id, n));
  return out;
}

// boost: an item category this city has plenty of (the raid's surplus), weighted up
export function rollLoot(type, seed, cid, salt = 0, boost = null) {
  const rng = new RNG((seed * 31 + cid * 7919 + salt * 104729) >>> 0);
  rng.next();
  if (KITS[type]) return rollKit(type, rng);
  const tab = LOOT[type]; if (!tab) return [];
  if (tab.all) return tab.t.map(([id]) => makeItem(id, rng.int(...ITEMS[id].roll) + rng.int(...ITEMS[id].roll))); // two normal finds of each
  const out = [];
  // containers are empty ~22% of the time; otherwise at least one item
  const rolls = tab.rolls[0] === 0 && rng.chance(0.22) ? 0 : rng.int(Math.max(1, tab.rolls[0]), tab.rolls[1]);
  for (let k = 0; k < rolls; k++) {
    const id = rng.weighted(boost ? tab.t.map(([i, wt]) => [i, ITEMS[i].cat === boost ? wt * 3 : wt]) : tab.t);
    const d = ITEMS[id];
    const n = d.roll ? rng.int(d.roll[0], d.roll[1]) : 1;
    const it = makeItem(id, n);
    if (d.dur) it.dur = Math.max(5, Math.round(d.dur * rng.range(0.4, 1)));
    if (d.cat === 'gun') it.mag = rng.int(0, d.mag);
    addItem(out, it);
  }
  return out;
}
