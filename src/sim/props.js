// Reactive room clutter (books, papers, bottles, cans, boxes) and tables you can flip into cover.
// Both live on the world so worldgen, the sim, saves and co-op all see the same objects.
import { TILE } from '../config.js';

// r: how close something has to pass to knock it over. noise: tiles of sound when it breaks (bottles and cans give you away).
export const CLUTTER = {
  books: { r: 8, noise: 0, paper: true },
  papers: { r: 9, noise: 0, paper: true },
  box: { r: 9, noise: 0, paper: true },
  bottle: { r: 6, noise: 5, glass: true },
  cans: { r: 7, noise: 4, metal: true },
};
export const TABLE_HP = 60;
const SLAB = 9; // how thick a flipped table is, in px

const key = (w, tx, ty) => ty * w.w + tx;
// tile -> ids, built once per world and kept off the saved/synced data
function grid(w, name, fill) {
  if (w[name]) return w[name];
  const g = new Map(); Object.defineProperty(w, name, { value: g, enumerable: false });
  fill((tx, ty, id) => { const k = key(w, tx, ty); let a = g.get(k); if (!a) g.set(k, (a = [])); a.push(id); });
  return g;
}
const clutterGrid = (w) => grid(w, '_clutterAt', (add) => w.clutter.forEach((c, i) => add(Math.floor(c.x / TILE), Math.floor(c.y / TILE), i)));
const tableGrid = (w) => grid(w, '_tableAt', (add) => w.tables.forEach((ti) => addTable(w, ti, add)));
function addTable(w, ti, add) {
  const t = w.props[ti];
  for (let ty = Math.floor(t.y) - 1; ty <= Math.floor(t.y + t.h); ty++) for (let tx = Math.floor(t.x) - 1; tx <= Math.floor(t.x + t.w); tx++) add(tx, ty, ti);
}
// Only the flipped ones can be bumped into. Every zombie checks this each tick, so it's a separate, usually empty, grid.
const flipGrids = new WeakMap();
export const tablesChanged = (w) => flipGrids.delete(w);
function flippedGrid(w) {
  let g = flipGrids.get(w); if (g) return g;
  g = new Map(); flipGrids.set(w, g);
  for (const ti of w.tables) if (tableRect(w.props[ti])) addTable(w, ti, (tx, ty, id) => { const k = key(w, tx, ty); let a = g.get(k); if (!a) g.set(k, (a = [])); a.push(id); });
  return g;
}
function near(g, w, x, y, r, fn) {
  const r0 = Math.floor((x - r) / TILE), r1 = Math.floor((x + r) / TILE), q0 = Math.floor((y - r) / TILE), q1 = Math.floor((y + r) / TILE);
  for (let ty = q0; ty <= q1; ty++) for (let tx = r0; tx <= r1; tx++) { const a = g.get(key(w, tx, ty)); if (a) for (const id of a) fn(id); }
}

// ---------- clutter ----------
function breakClutter(s, i, ang, byPlayer) {
  const c = s.world.clutter[i]; if (c.broken) return;
  c.broken = true;
  const d = CLUTTER[c.kind];
  s.events.push({ type: 'clutter', x: c.x, y: c.y, kind: c.kind, ang, v: c.v });
  if (d.noise) s.noises.push({ pl: byPlayer ? 1 : 0, x: c.x, y: c.y, r: d.noise * TILE });
}
// something walked or rolled over this spot. careful (sneaking) feet step around it.
export function trample(s, e, r, byPlayer, careful = false) {
  const w = s.world; if (careful || !w.clutter || !w.clutter.length) return;
  const ang = Math.atan2(e.vy || Math.sin(e.ang || 0), e.vx || Math.cos(e.ang || 0));
  near(clutterGrid(w), w, e.x, e.y, r + 10, (i) => {
    const c = w.clutter[i]; if (c.broken) return;
    if (Math.hypot(c.x - e.x, c.y - e.y) < r + CLUTTER[c.kind].r) breakClutter(s, i, ang, byPlayer);
  });
}
// a bullet, swing or blast went through a circle or along a segment
export function smashClutter(s, x0, y0, x1, y1, r, byPlayer) {
  const w = s.world; if (!w.clutter || !w.clutter.length) return;
  const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy, ang = Math.atan2(dy, dx);
  near(clutterGrid(w), w, (x0 + x1) / 2, (y0 + y1) / 2, Math.sqrt(L2) / 2 + r + 10, (i) => {
    const c = w.clutter[i]; if (c.broken) return;
    const t = L2 ? Math.max(0, Math.min(1, ((c.x - x0) * dx + (c.y - y0) * dy) / L2)) : 0;
    if (Math.hypot(c.x - (x0 + dx * t), c.y - (y0 + dy * t)) < r + CLUTTER[c.kind].r) breakClutter(s, i, L2 ? ang : Math.atan2(c.y - y0, c.x - x0), byPlayer);
  });
}

// ---------- tables ----------
// flipped: a thin slab along the side it was pushed toward. dirs 1..4 = N E S W. upright or broken: nothing to bump into.
export function tableRect(t) {
  if (!t.flip || t.hp <= 0) return null;
  const X = t.x * TILE, Y = t.y * TILE, W = t.w * TILE, H = t.h * TILE;
  if (t.flip === 1) return [X, Y, W, SLAB];
  if (t.flip === 3) return [X, Y + H - SLAB, W, SLAB];
  if (t.flip === 2) return [X + W - SLAB, Y, SLAB, H];
  return [X, Y, SLAB, H];
}
// push a circle out of any flipped table; returns the table it hit
export function collideTables(w, e, r) {
  if (!w.tables) return null;
  const g = flippedGrid(w); if (!g.size) return null;
  let hit = null;
  near(g, w, e.x, e.y, r, (ti) => {
    const t = w.props[ti], R = tableRect(t); if (!R) return;
    const cx = Math.max(R[0], Math.min(e.x, R[0] + R[2])), cy = Math.max(R[1], Math.min(e.y, R[1] + R[3]));
    let dx = e.x - cx, dy = e.y - cy; const d = Math.hypot(dx, dy);
    if (d >= r) return;
    if (d > 1e-4) { e.x += (dx / d) * (r - d); e.y += (dy / d) * (r - d); }
    else if (R[2] < R[3]) e.x = e.x < R[0] + R[2] / 2 ? R[0] - r : R[0] + R[2] + r; else e.y = e.y < R[1] + R[3] / 2 ? R[1] - r : R[1] + R[3] + r;
    hit = t;
  });
  return hit;
}
// the upright table in reach that the player is facing most
export function tableInReach(w, p, ax, ay) {
  if (!w.tables) return null;
  let best = null, bd = 1e9;
  near(tableGrid(w), w, p.x, p.y, 40, (ti) => {
    const t = w.props[ti]; if (t.flip || t.hp <= 0) return;
    const X = t.x * TILE, Y = t.y * TILE, cx = Math.max(X, Math.min(p.x, X + t.w * TILE)), cy = Math.max(Y, Math.min(p.y, Y + t.h * TILE));
    if (Math.hypot(cx - p.x, cy - p.y) > 26) return;
    const d = Math.hypot(X + (t.w * TILE) / 2 - ax, Y + (t.h * TILE) / 2 - ay);
    if (d < bd) { bd = d; best = ti; }
  });
  return best;
}
// Flip it away from you. Anything standing on the far side takes the edge of it.
export function flipTable(s, p, ti) {
  const w = s.world, t = w.props[ti]; if (!t || t.flip || t.hp <= 0) return null;
  const cx = (t.x + t.w / 2) * TILE, cy = (t.y + t.h / 2) * TILE, dx = cx - p.x, dy = cy - p.y;
  t.flip = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 2 : 4) : (dy > 0 ? 3 : 1); tablesChanged(w);
  const nx = t.flip === 2 ? 1 : t.flip === 4 ? -1 : 0, ny = t.flip === 3 ? 1 : t.flip === 1 ? -1 : 0;
  smashClutter(s, cx, cy, cx, cy, (Math.max(t.w, t.h) * TILE) / 2, true); // whatever was on it goes flying
  s.events.push({ type: 'tflip', ti, x: cx, y: cy, ang: Math.atan2(ny, nx) });
  s.noises.push({ pl: 1, x: cx, y: cy, r: 6 * TILE });
  return { nx, ny, cx: cx + nx * (t.w * TILE) / 2, cy: cy + ny * (t.h * TILE) / 2 };
}
export function damageTable(s, t, dmg, x, y) {
  if (t.hp <= 0) return;
  t.hp -= dmg;
  if (t.hp <= 0) { t.hp = 0; tablesChanged(s.world); s.events.push({ type: 'tbreak', x, y }); s.noises.push({ x, y, r: 7 * TILE }); }
  else s.events.push({ type: 'bash', x, y });
}
