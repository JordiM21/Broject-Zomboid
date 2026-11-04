import { ITEMS, LOOT, itemWeight } from '../data/items.js';
import { RNG } from '../rng.js';

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

export function rollLoot(type, seed, cid, salt = 0) {
  const tab = LOOT[type]; if (!tab) return [];
  const rng = new RNG((seed * 31 + cid * 7919 + salt * 104729) >>> 0);
  rng.next();
  if (tab.all) return tab.t.map(([id]) => makeItem(id, rng.int(...ITEMS[id].roll) + rng.int(...ITEMS[id].roll))); // two normal finds of each
  const out = [];
  // containers are empty ~22% of the time; otherwise at least one item
  const rolls = tab.rolls[0] === 0 && rng.chance(0.22) ? 0 : rng.int(Math.max(1, tab.rolls[0]), tab.rolls[1]);
  for (let k = 0; k < rolls; k++) {
    const id = rng.weighted(tab.t);
    const d = ITEMS[id];
    const n = d.roll ? rng.int(d.roll[0], d.roll[1]) : 1;
    const it = makeItem(id, n);
    if (d.dur) it.dur = Math.max(5, Math.round(d.dur * rng.range(0.4, 1)));
    if (d.cat === 'gun') it.mag = rng.int(0, d.mag);
    addItem(out, it);
  }
  return out;
}
