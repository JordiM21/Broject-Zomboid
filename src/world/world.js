import { TILE } from '../config.js';
import { T, SOLID } from './worldgen.js';

export function tileAt(w, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= w.w || ty >= w.h) return T.TREE;
  return w.tiles[ty * w.w + tx];
}
export function solidAt(w, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= w.w || ty >= w.h) return true;
  const i = ty * w.w + tx, t = w.tiles[i];
  if (t === T.DOOR) return !w.doors[i].open;
  return SOLID[t] === 1;
}
export function opaqueAt(w, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= w.w || ty >= w.h) return true;
  const i = ty * w.w + tx, t = w.tiles[i];
  if (t === T.WALL) return true;
  if (t === T.DOOR) return !w.doors[i].open;
  return false;
}
// Bullets: blocked by walls, closed doors, trees, cars
export function bulletBlock(w, tx, ty) {
  if (opaqueAt(w, tx, ty)) return true;
  const t = tileAt(w, tx, ty);
  return t === T.TREE || t === T.CAR;
}
export function isSafe(w, px, py) {
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  if (tx < 0 || ty < 0 || tx >= w.w || ty >= w.h) return false;
  return w.safe[ty * w.w + tx] === 1;
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// push circle entity out of blocked tiles
export function collide(e, r, block) {
  for (let pass = 0; pass < 2; pass++) {
    const minx = Math.floor((e.x - r) / TILE), maxx = Math.floor((e.x + r) / TILE);
    const miny = Math.floor((e.y - r) / TILE), maxy = Math.floor((e.y + r) / TILE);
    for (let ty = miny; ty <= maxy; ty++) for (let tx = minx; tx <= maxx; tx++) {
      if (!block(tx, ty)) continue;
      const rx = tx * TILE, ry = ty * TILE;
      const cx = clamp(e.x, rx, rx + TILE), cy = clamp(e.y, ry, ry + TILE);
      const dx = e.x - cx, dy = e.y - cy, d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      if (d2 > 1e-6) { const d = Math.sqrt(d2), p = (r - d) / d; e.x += dx * p; e.y += dy * p; }
      else {
        const l = e.x - rx, rr = rx + TILE - e.x, u = e.y - ry, dd = ry + TILE - e.y;
        const m = Math.min(l, rr, u, dd);
        if (m === l) e.x = rx - r; else if (m === rr) e.x = rx + TILE + r; else if (m === u) e.y = ry - r; else e.y = ry + TILE + r;
      }
    }
  }
}

// DDA line of sight between two world points
export function los(w, x0, y0, x1, y1, blockFn = opaqueAt) {
  let tx = Math.floor(x0 / TILE), ty = Math.floor(y0 / TILE);
  const ex = Math.floor(x1 / TILE), ey = Math.floor(y1 / TILE);
  const dx = x1 - x0, dy = y1 - y0;
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
  const tdx = dx !== 0 ? Math.abs(TILE / dx) : Infinity, tdy = dy !== 0 ? Math.abs(TILE / dy) : Infinity;
  let tmx = dx !== 0 ? (dx > 0 ? (tx + 1) * TILE - x0 : x0 - tx * TILE) / Math.abs(dx) : Infinity;
  let tmy = dy !== 0 ? (dy > 0 ? (ty + 1) * TILE - y0 : y0 - ty * TILE) / Math.abs(dy) : Infinity;
  let guard = 0;
  while ((tx !== ex || ty !== ey) && guard++ < 200) {
    if (tmx < tmy) { tmx += tdx; tx += sx; } else { tmy += tdy; ty += sy; }
    if (tx === ex && ty === ey) break;
    if (blockFn(w, tx, ty)) return false;
  }
  return true;
}

// Cast a ray, return distance to first blocking tile (or maxD)
export function castRay(w, x0, y0, ang, maxD, blockFn = opaqueAt) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  let tx = Math.floor(x0 / TILE), ty = Math.floor(y0 / TILE);
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
  const tdx = dx !== 0 ? Math.abs(TILE / dx) : Infinity, tdy = dy !== 0 ? Math.abs(TILE / dy) : Infinity;
  let tmx = dx !== 0 ? (dx > 0 ? (tx + 1) * TILE - x0 : x0 - tx * TILE) / Math.abs(dx) : Infinity;
  let tmy = dy !== 0 ? (dy > 0 ? (ty + 1) * TILE - y0 : y0 - ty * TILE) / Math.abs(dy) : Infinity;
  let t = 0;
  while (t < maxD) {
    if (tmx < tmy) { t = tmx; tmx += tdx; tx += sx; } else { t = tmy; tmy += tdy; ty += sy; }
    if (t >= maxD) return maxD;
    if (blockFn(w, tx, ty)) return t;
  }
  return maxD;
}

// ---------- peeking through a closed door or window ----------
export const PEEK_RANGE = 8 * TILE;
export const peekOpaque = (i) => (w, tx, ty) => (ty * w.w + tx === i ? false : opaqueAt(w, tx, ty));
// The slit of view through the gap: narrower than the opening, so you only see part of the room.
export function peekCone(p, pk) {
  const cx = (pk.tx + 0.5) * TILE, cy = (pk.ty + 0.5) * TILE, d = Math.hypot(cx - p.x, cy - p.y);
  return { a: Math.atan2(cy - p.y, cx - p.x), half: Math.max(0.2, Math.atan2(TILE * 0.35, Math.max(1, d))) };
}
export function peekSees(w, p, pk, x, y) {
  if (Math.hypot(x - p.x, y - p.y) > PEEK_RANGE) return false;
  const { a, half } = peekCone(p, pk);
  let d = Math.atan2(y - p.y, x - p.x) - a;
  while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d) <= half && los(w, p.x, p.y, x, y, peekOpaque(pk.i));
}

// BFS distance field from a target tile, for zombie navigation
export class FlowField {
  constructor(w) {
    const n = w.w * w.h;
    this.w = w; this.dist = new Int16Array(n); this.stamp = new Int32Array(n); this.cur = 0; this.q = new Int32Array(n);
    this.cx = -1; this.cy = -1;
  }
  build(sx, sy, maxD, passable) {
    const w = this.w, W = w.w; this.cur++; this.cx = sx; this.cy = sy;
    const { dist, stamp, q } = this; const cur = this.cur;
    let h = 0, t = 0;
    const s = sy * W + sx; dist[s] = 0; stamp[s] = cur; q[t++] = s;
    while (h < t) {
      const i = q[h++], d = dist[i];
      if (d >= maxD) continue;
      const x = i % W, y = (i / W) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= W || ny >= w.h) continue;
        const ni = ny * W + nx;
        if (stamp[ni] === cur || !passable(nx, ny, ni)) continue;
        stamp[ni] = cur; dist[ni] = d + 1; q[t++] = ni;
      }
    }
  }
  get(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.w.w || ty >= this.w.h) return -1;
    const i = ty * this.w.w + tx; return this.stamp[i] === this.cur ? this.dist[i] : -1;
  }
}
