import { TILE } from '../config.js';
import { T, FURN_KINDS } from '../world/worldgen.js';
import { castRay, los, opaqueAt } from '../world/world.js';
import { hash2 } from '../rng.js';
import { ITEMS } from '../data/items.js';
import { iconCanvas } from '../ui/icons.js';
import { ZT, daylight, hourOf } from '../sim/sim.js';
import { playerFrame, zombieFrame, muzzleTip, FRAME_SIZE } from './sprites.js';
import { IMG } from './assets.js';

const CH = 16, CPX = CH * TILE;
const GRASS_C = ['#3a5530', '#3d5932', '#38522e', '#405c34'];
const SKIN = ['#7d9070', '#86957a', '#6f8463', '#8a8f72'];
const SHIRT = ['#4a5a3a', '#5a4040', '#3a4a5a', '#5a5040', '#44405a'];
const FURN_STYLE = {
  fridge: ['#d9dcdc', '#aeb3b3'], counter: ['#8a6a4a', '#6a4f35'], cabinet: ['#e6e6e0', '#b8b8b0'], wardrobe: ['#6a4a30', '#4f3622'],
  dresser: ['#7a5a3a', '#5a4028'], shelf: ['#7a6040', '#5a4630'], toolbox: ['#b03a2a', '#7a281e'], grocery: ['#9aa6b0', '#6c7780'],
  pharmacy: ['#e8ecec', '#a8b8b8'], hardware: ['#8a7a5a', '#5f543e'], register: ['#3a3d42', '#25272a'], locker: ['#4a5a70', '#334050'],
  crate: ['#8a7040', '#5f4c2a'], medcab: ['#eef0f0', '#b8c0c0'], milcrate: ['#5a6040', '#3a3e26'], stash: ['#5a7a4a', '#3d5532'], bench: ['#9a7a4a', '#6a5232'], bed: ['#4a6a8a', '#e0e0e0'], radio: ['#3a3a3a', '#7ac070'],
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.fog = document.createElement('canvas'); this.night = document.createElement('canvas');
    this.chunks = new Map(); this.parts = []; this.floaters = []; this.flashes = []; this.tracers = [];
    this.cam = { x: 0, y: 0, zoom: 1.5 }; this.doorAnim = new Map(); this.dying = []; this.booms = []; this.rings2 = []; this.bolts = []; this.animSt = new WeakMap(); this.trails = []; this.rings = []; this.glow = []; this.dt = 0.016; this.hlCol = '#fff'; this.shake = 0; this.dpr = 1; this.world = null; this.time = 0;
  }
  setWorld(w) { this.world = w; this.chunks.clear(); this.doorAnim = new Map(); this.dying = []; this.roofs = new Map(); }
  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1); this.dpr = dpr;
    const W = Math.floor(window.innerWidth * dpr), H = Math.floor(window.innerHeight * dpr);
    for (const c of [this.canvas, this.fog, this.night]) { c.width = W; c.height = H; }
    this.cam.zoom = Math.max(1, Math.min(2.4, Math.min(window.innerWidth, window.innerHeight) / (17 * TILE)));
  }
  worldToScreen(x, y) { return { x: (x - this.cam.x) * this.cam.zoom + window.innerWidth / 2, y: (y - this.cam.y) * this.cam.zoom + window.innerHeight / 2 }; }
  screenToWorld(x, y) { return { x: (x - window.innerWidth / 2) / this.cam.zoom + this.cam.x, y: (y - window.innerHeight / 2) / this.cam.zoom + this.cam.y }; }

  // ---------- chunk cache ----------
  chunk(cx, cy) {
    const k = cx + cy * 1000; let c = this.chunks.get(k);
    if (!c) { c = this.renderChunk(cx, cy); this.chunks.set(k, c); }
    return c;
  }
  renderChunk(cx, cy) {
    const w = this.world, c = document.createElement('canvas'); c.width = c.height = CPX;
    const g = c.getContext('2d'); g.translate(-cx * CPX, -cy * CPX);
    const x0 = cx * CH, y0 = cy * CH;
    for (let ty = y0; ty < y0 + CH; ty++) for (let tx = x0; tx < x0 + CH; tx++) {
      if (tx >= w.w || ty >= w.h) continue;
      const i = ty * w.w + tx; const t = w.tiles[i];
      this.ground(g, (t === T.DOOR || t === T.FURN || t === T.CAR) ? w.floor[i] : t, tx, ty, i);
    }
    for (let ty = y0; ty < y0 + CH; ty++) for (let tx = x0; tx < x0 + CH; tx++) {
      if (tx >= w.w || ty >= w.h || tx < 1 || ty < 1 || tx >= w.w - 1 || ty >= w.h - 1) continue;
      const i = ty * w.w + tx, t = w.tiles[i];
      if (w.bld[i] < 0 || t === T.WALL || t === T.WINDOW) continue;
      const X = tx * TILE, Y = ty * TILE, isW = (j) => w.tiles[j] === T.WALL || w.tiles[j] === T.WINDOW;
      for (const [j, fx, fy, fw, fh, dx, dy] of [[i - w.w, X, Y, TILE, 3, 0, 1], [i + w.w, X, Y + TILE - 3, TILE, 3, 0, -1], [i - 1, X, Y, 3, TILE, 1, 0], [i + 1, X + TILE - 3, Y, 3, TILE, -1, 0]]) {
        if (!isW(j)) continue;
        for (let k = 0; k < 3; k++) { g.fillStyle = `rgba(0,0,0,${0.22 - k * 0.07})`; g.fillRect(fx + dx * k * 3, fy + dy * k * 3, fw, fh); }
      }
    }
    for (const p of w.props) if (p.x + p.w >= x0 - 1 && p.x <= x0 + CH + 1 && p.y + p.h >= y0 - 1 && p.y <= y0 + CH + 1) this.prop(g, p);
    for (let ty = y0 - 1; ty <= y0 + CH; ty++) for (let tx = x0 - 1; tx <= x0 + CH; tx++) {
      if (tx < 0 || ty < 0 || tx >= w.w || ty >= w.h) continue;
      const t = w.tiles[ty * w.w + tx];
      if (t === T.WALL || t === T.WINDOW) this.wall(g, t, tx, ty);
      else if (t === T.FENCE) this.fence(g, tx, ty);
    }
    for (let ty = y0 - 1; ty <= y0 + CH; ty++) for (let tx = x0 - 1; tx <= x0 + CH; tx++) {
      if (tx < 0 || ty < 0 || tx >= w.w || ty >= w.h) continue;
      const t = w.tiles[ty * w.w + tx];
      if (t === T.TREE) this.tree(g, tx, ty); else if (t === T.BUSH) this.bush(g, tx, ty);
    }
    return c;
  }
  ground(g, t, tx, ty, i) {
    const X = tx * TILE, Y = ty * TILE, s = this.world.seed, h = hash2(tx, ty, s);
    const dots = (col, n, sz) => { g.fillStyle = col; for (let k = 0; k < n; k++) g.fillRect(X + hash2(tx, ty, s + k * 7) * 30, Y + hash2(ty, tx, s + k * 13) * 30, sz, sz); };
    switch (t) {
      case T.GRASS: case T.TREE: case T.BUSH:
        g.fillStyle = GRASS_C[(h * 4) | 0]; g.fillRect(X, Y, TILE, TILE); dots('rgba(20,35,15,0.35)', 5, 2); dots('rgba(120,150,80,0.18)', 3, 2);
        if (h > 0.94) dots(['rgba(230,220,120,0.8)', 'rgba(220,140,180,0.7)', 'rgba(240,240,240,0.7)'][(h * 300 | 0) % 3], 4, 2);
        else if (h < 0.05) { g.fillStyle = 'rgba(70,60,30,0.35)'; g.beginPath(); g.ellipse(X + 16, Y + 16, 13, 9, h * 40, 0, 7); g.fill(); }
        break;
      case T.DIRT: g.fillStyle = h < 0.5 ? '#5a4a38' : '#564634'; g.fillRect(X, Y, TILE, TILE); dots('rgba(0,0,0,0.15)', 4, 3); break;
      case T.ROAD: {
        g.fillStyle = h < 0.5 ? '#2a2c2f' : '#2c2e31'; g.fillRect(X, Y, TILE, TILE); dots('rgba(255,255,255,0.04)', 6, 2);
        const d = this.world.deco[i];
        g.fillStyle = '#a8913a';
        if (d === 1 && tx % 3 !== 0) g.fillRect(X + 2, Y + TILE - 2, TILE - 4, 3);
        if (d === 2 && ty % 3 !== 0) g.fillRect(X + TILE - 2, Y + 2, 3, TILE - 4);
        if (h > 0.985 && IMG.oilSpill_large) { g.globalAlpha = 0.7; g.drawImage(IMG.oilSpill_large, X - 4, Y - 4, 40, 40); g.globalAlpha = 1; }
        else if (h > 0.97) { g.fillStyle = 'rgba(10,12,16,0.45)'; g.beginPath(); g.ellipse(X + 16, Y + 16, 12, 6, h * 9, 0, 7); g.fill(); g.fillStyle = 'rgba(120,140,170,0.12)'; g.beginPath(); g.ellipse(X + 13, Y + 14, 6, 2, h * 9, 0, 7); g.fill(); }
        else if (h > 0.955) { g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3; g.beginPath(); g.moveTo(X, Y + 10 + h * 8); g.quadraticCurveTo(X + 16, Y + 6, X + 32, Y + 14); g.stroke(); }
        if (hash2(tx, ty, 77) > 0.985) { g.fillStyle = 'rgba(70,10,8,0.45)'; g.beginPath(); g.arc(X + 16, Y + 16, 9, 0, 7); g.fill(); g.fillRect(X + 16, Y + 14, 14, 3); }
        if (h > 0.93 && h <= 0.955) { g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(X + 4, Y + 8); g.lineTo(X + 14, Y + 14); g.lineTo(X + 12, Y + 26); g.stroke(); }
        break;
      }
      case T.SIDEWALK: g.fillStyle = '#6b6c68'; g.fillRect(X, Y, TILE, TILE); g.fillStyle = '#5c5d59'; g.fillRect(X, Y, TILE, 1); g.fillRect(X, Y, 1, TILE); dots('rgba(0,0,0,0.1)', 3, 2);
        if (h > 0.88) { g.fillStyle = ['#d8d4c8', '#b84a3a', '#c8b060', '#7a9ab8'][(h * 100 | 0) % 4]; g.save(); g.translate(X + 8 + h * 14, Y + 10 + h * 10); g.rotate(h * 20); g.fillRect(-3, -2, 7, 5); g.restore(); }
        if (h < 0.06) { g.fillStyle = 'rgba(120,80,30,0.6)'; for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(X + hash2(tx, k, 4) * 30, Y + hash2(k, ty, 4) * 30, 3, 1.6, k, 0, 7); g.fill(); } }
        if (hash2(tx, ty, 77) > 0.985) { g.fillStyle = 'rgba(70,10,8,0.4)'; g.beginPath(); g.arc(X + 14, Y + 18, 7, 0, 7); g.fill(); }
        break;
      case T.CONCRETE: g.fillStyle = h < 0.5 ? '#4f5154' : '#525457'; g.fillRect(X, Y, TILE, TILE); dots('rgba(0,0,0,0.12)', 4, 2); if (tx % 4 === 0) { g.fillStyle = 'rgba(220,220,200,0.18)'; g.fillRect(X, Y, 2, TILE); } break;
      case T.FLOOR: g.fillStyle = '#6e5235'; g.fillRect(X, Y, TILE, TILE); g.fillStyle = '#5c432a'; for (let k = 0; k < 4; k++) g.fillRect(X, Y + k * 8 + 7, TILE, 1); g.fillRect(X + ((h * 24) | 0), Y + 8 * ((h * 4) | 0), 1, 8); break;
      case T.TILE: g.fillStyle = (tx + ty) % 2 ? '#8b8f92' : '#7e8285'; g.fillRect(X, Y, TILE, TILE); g.fillStyle = 'rgba(0,0,0,0.1)'; g.fillRect(X, Y, TILE, 1); g.fillRect(X, Y, 1, TILE); break;
      case T.CARPET: g.fillStyle = '#5b3c48'; g.fillRect(X, Y, TILE, TILE); dots('rgba(0,0,0,0.12)', 6, 2); break;
      case T.YARD: g.fillStyle = h < 0.5 ? '#5b5a4c' : '#575648'; g.fillRect(X, Y, TILE, TILE); dots('rgba(0,0,0,0.15)', 5, 2); break;
      case T.GATE: g.fillStyle = '#5b5a4c'; g.fillRect(X, Y, TILE, TILE); g.fillStyle = '#c9a63a'; for (let k = 0; k < 4; k++) g.fillRect(X + k * 8, Y + k * 8, 6, 6); break;
      default: g.fillStyle = '#333'; g.fillRect(X, Y, TILE, TILE);
    }
  }
  wall(g, t, tx, ty) {
    const X = tx * TILE, Y = ty * TILE, w = this.world;
    g.fillStyle = '#26221f'; g.fillRect(X, Y, TILE, TILE);
    g.fillStyle = '#4b443d'; g.fillRect(X + 3, Y + 3, TILE - 6, TILE - 6);
    g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(X + 3, Y + 3, TILE - 6, 3);
    if (t === T.WINDOW) {
      const horiz = [T.WALL, T.WINDOW, T.DOOR].includes(w.tiles[ty * w.w + tx - 1]) || [T.WALL, T.WINDOW, T.DOOR].includes(w.tiles[ty * w.w + tx + 1]);
      g.save(); g.translate(X + 16, Y + 16); if (!horiz) g.rotate(Math.PI / 2);
      g.fillStyle = '#d8d0bc'; g.fillRect(-15, -7, 30, 14);          // frame and sill
      g.fillStyle = '#9ad0e8'; g.fillRect(-13, -5, 12, 10); g.fillRect(1, -5, 12, 10); // two panes
      g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(-11, -4, 4, 2); g.fillRect(3, -4, 4, 2);
      g.fillStyle = '#d8d0bc'; g.fillRect(-1, -6, 2, 12);
      g.restore();
    }
  }
  fence(g, tx, ty) {
    const X = tx * TILE, Y = ty * TILE, w = this.world;
    const f = (x, y) => { const t = w.tiles[y * w.w + x]; return t === T.FENCE || t === T.GATE; };
    g.strokeStyle = '#9aa0a6'; g.lineWidth = 2; g.beginPath();
    if (f(tx + 1, ty) || f(tx - 1, ty)) { g.moveTo(X, Y + 16); g.lineTo(X + TILE, Y + 16); g.moveTo(X, Y + 12); g.lineTo(X + TILE, Y + 12); }
    if (f(tx, ty + 1) || f(tx, ty - 1)) { g.moveTo(X + 16, Y); g.lineTo(X + 16, Y + TILE); g.moveTo(X + 12, Y); g.lineTo(X + 12, Y + TILE); }
    g.stroke(); g.fillStyle = '#5a5e62'; g.fillRect(X + 11, Y + 11, 7, 7);
  }
  tree(g, tx, ty) {
    const h = hash2(tx, ty, 99), X = tx * TILE + 16 + (h - 0.5) * 6, Y = ty * TILE + 16 + (hash2(ty, tx, 5) - 0.5) * 6, r = 14 + h * 4;
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(X + 5, Y + 6, r, r * 0.8, 0, 0, 7); g.fill();
    g.fillStyle = '#4a3523'; g.fillRect(X - 3, Y - 2, 6, 8);
    g.fillStyle = h < 0.5 ? '#21401f' : '#284a22'; g.beginPath(); g.arc(X, Y, r, 0, 7); g.fill();
    g.fillStyle = h < 0.5 ? '#2c5228' : '#33592b'; g.beginPath(); g.arc(X - 3, Y - 3, r * 0.7, 0, 7); g.fill();
    g.fillStyle = 'rgba(140,190,90,0.18)'; g.beginPath(); g.arc(X - 5, Y - 6, r * 0.35, 0, 7); g.fill();
  }
  bush(g, tx, ty) {
    const X = tx * TILE + 16, Y = ty * TILE + 16;
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(X + 3, Y + 4, 12, 9, 0, 0, 7); g.fill();
    for (let k = 0; k < 4; k++) { const a = k * 1.7 + tx; g.fillStyle = k % 2 ? '#3a5f2c' : '#335525'; g.beginPath(); g.arc(X + Math.cos(a) * 5, Y + Math.sin(a) * 4, 8, 0, 7); g.fill(); }
  }
  prop(g, p) {
    const X = p.x * TILE, Y = p.y * TILE, W = p.w * TILE, H = p.h * TILE;
    switch (p.kind) {
      case 'bed': g.fillStyle = '#d8d8d0'; g.fillRect(X, Y, W, H); g.fillStyle = ['#4a6a8a', '#8a4a4a', '#4a7a5a', '#7a6a4a'][p.v]; g.fillRect(X, Y + H * 0.3, W, H * 0.7); g.fillStyle = '#f0f0ea'; g.fillRect(X + 4, Y + 4, W - 8, H * 0.2); break;
      case 'rug': g.fillStyle = ['#6a3a3a', '#3a4a6a', '#5a5a3a', '#4a3a5a'][p.v]; g.fillRect(X, Y, W, H); g.strokeStyle = 'rgba(255,255,255,0.15)'; g.strokeRect(X + 4, Y + 4, W - 8, H - 8); break;
      case 'sofa': g.fillStyle = '#4a4a5a'; g.fillRect(X, Y, W, H); g.fillStyle = '#5a5a6c'; g.fillRect(X + 4, Y + 6, W - 8, H - 8); break;
      case 'table': g.fillStyle = '#7a5a3a'; g.fillRect(X, Y, W, H); g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(X + 2, Y + 2, W - 4, 3); break;
      case 'toilet': g.fillStyle = '#eee'; g.beginPath(); g.ellipse(X + W / 2, Y + H * 0.6, W / 2, H * 0.4, 0, 0, 7); g.fill(); g.fillRect(X, Y, W, H * 0.3); break;
      case 'bench': g.fillStyle = '#6a4a2a'; g.fillRect(X, Y, W, H); break;
      case 'tent': g.fillStyle = '#4a6a3a'; g.beginPath(); g.moveTo(X, Y + H); g.lineTo(X + W / 2, Y); g.lineTo(X + W, Y + H); g.fill(); g.fillStyle = '#2a3a22'; g.fillRect(X + W / 2 - 4, Y + H - 12, 8, 12); break;
      case 'fire': g.fillStyle = '#3a3a3a'; g.beginPath(); g.arc(X + W / 2, Y + H / 2, 12, 0, 7); g.fill(); g.fillStyle = '#5a3a2a'; g.fillRect(X + 6, Y + 10, 16, 4); break;
      case 'lamp': case 'lampx': g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(X + 8, Y + 9, 6, 3, 0, 0, 7); g.fill(); g.fillStyle = '#2a2d31'; g.beginPath(); g.arc(X + 6, Y + 6, 4, 0, 7); g.fill(); g.fillStyle = p.kind === 'lamp' ? '#d8d0a0' : '#555'; g.beginPath(); g.arc(X + 6, Y + 6, 2.2, 0, 7); g.fill(); if (p.kind === 'lampx') { g.fillStyle = 'rgba(220,230,240,0.5)'; for (let k = 0; k < 4; k++) g.fillRect(X + 2 + k * 4, Y + 12 + (k % 2) * 3, 2, 1); } break;
      case 'barrel': if (IMG.barrelRust_top) { g.drawImage(IMG.barrelRust_top, X, Y, W, H); break; } g.fillStyle = '#5a3a26'; g.beginPath(); g.arc(X + W / 2, Y + H / 2, W / 2, 0, 7); g.fill(); g.strokeStyle = '#3a2416'; g.lineWidth = 2; g.stroke(); g.fillStyle = '#1a1210'; g.beginPath(); g.arc(X + W / 2, Y + H / 2, W / 2 - 3, 0, 7); g.fill(); break;
      case 'sandbag': if (IMG.sandbagBeige) { const n = Math.max(1, Math.round(W / 22)); for (let k = 0; k < n; k++) g.drawImage(IMG.sandbagBeige, X + k * (W / n) - 4, Y - 4, W / n + 8, H + 8); break; } for (let k = 0; k < 4; k++) { g.fillStyle = k % 2 ? '#a89060' : '#9a8454'; g.beginPath(); g.ellipse(X + 7 + k * (W - 14) / 3, Y + H / 2, 8, H / 2 + 1, 0, 0, 7); g.fill(); } break;
      case 'tower': g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(X + 6, Y + 6, W, H); g.fillStyle = '#4a4030'; g.fillRect(X, Y, W, H); g.strokeStyle = '#2e281e'; g.lineWidth = 3; g.beginPath(); g.moveTo(X, Y); g.lineTo(X + W, Y + H); g.moveTo(X + W, Y); g.lineTo(X, Y + H); g.stroke(); g.strokeRect(X + 2, Y + 2, W - 4, H - 4); break;
      case 'mtent': g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(X + 5, Y + 5, W, H); g.fillStyle = '#56603e'; g.fillRect(X, Y, W, H); g.fillStyle = '#48512f'; g.fillRect(X, Y + H / 2, W, H / 2); g.fillStyle = '#3a4226'; g.fillRect(X, Y + H / 2 - 1, W, 2); break;
      case 'hbed': g.fillStyle = '#b8c0c8'; g.fillRect(X, Y, W, H); g.fillStyle = '#e8ecf0'; g.fillRect(X + 3, Y + 3, W - 6, H - 6); g.fillStyle = '#7aa0c8'; g.fillRect(X + 3, Y + H * 0.35, W - 6, H * 0.6); if (p.v === 1) { g.fillStyle = 'rgba(110,10,10,0.6)'; g.beginPath(); g.arc(X + W / 2, Y + H / 2, 7, 0, 7); g.fill(); } break;
      case 'dumpster': g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(X + 5, Y + 5, W, H); g.fillStyle = '#2f5a3a'; g.fillRect(X, Y, W, H); g.fillStyle = '#244a2e'; g.fillRect(X, Y, W / 2 - 1, H); g.fillStyle = '#d8d4c8'; g.fillRect(X + W - 10, Y - 3, 6, 4); break;
      case 'tank': if (IMG.tank_dark) { g.save(); g.translate(X + W / 2, Y + H / 2); g.rotate(0.35); g.filter = 'brightness(0.7) sepia(0.4)'; g.drawImage(IMG.tank_dark, -W / 2, -H / 2, W, H); g.restore(); g.fillStyle = 'rgba(20,15,10,0.35)'; g.beginPath(); g.arc(X + W * 0.6, Y + H * 0.4, 10, 0, 7); g.fill(); } break;
      case 'mat': g.fillStyle = '#6a4a2e'; g.fillRect(X, Y, W, H); g.fillStyle = '#8a6a44'; for (let k = 0; k < 4; k++) g.fillRect(X + 2 + k * (W - 4) / 4, Y + 2, (W - 4) / 8, H - 4); break;
      case 'plant': g.fillStyle = '#7a4a2a'; g.beginPath(); g.arc(X + W / 2, Y + H / 2, W * 0.32, 0, 7); g.fill(); for (let k = 0; k < 6; k++) { const a = k * 1.05 + p.v; g.fillStyle = k % 2 ? '#3e7a32' : '#4e9a3e'; g.beginPath(); g.ellipse(X + W / 2 + Math.cos(a) * W * 0.25, Y + H / 2 + Math.sin(a) * H * 0.25, W * 0.22, W * 0.12, a, 0, 7); g.fill(); } break;
      case 'armchair': g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(X + 3, Y + 3, W, H); g.fillStyle = ['#6a3a3a', '#4a4a5a', '#5a5a3a', '#3a4a5a'][p.v]; g.fillRect(X, Y, W, H); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(X + 4, Y + 6, W - 8, H - 8); break;
      case 'chair': g.fillStyle = '#5a4028'; g.fillRect(X, Y, W, H); g.fillStyle = '#7a5a3a'; g.fillRect(X + 2, Y + 2, W - 4, H - 4); break;
      case 'tub': g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(X + 3, Y + 3, W, H); g.fillStyle = '#e8ecec'; g.beginPath(); g.roundRect(X, Y, W, H, 8); g.fill(); g.fillStyle = '#b8cad4'; g.beginPath(); g.roundRect(X + 4, Y + 4, W - 8, H - 8, 6); g.fill(); g.fillStyle = '#9aa'; g.beginPath(); g.arc(X + W / 2, Y + 8, 2, 0, 7); g.fill(); break;
      case 'pump': g.fillStyle = '#b03a2a'; g.fillRect(X + 6, Y + 2, 20, 28); g.fillStyle = '#ddd'; g.fillRect(X + 9, Y + 6, 14, 8); break;
    }
  }
  roof(b) {
    let c = this.roofs.get(b.id); if (c) return c;
    c = document.createElement('canvas'); c.width = b.w * TILE; c.height = b.h * TILE;
    const g = c.getContext('2d');
    g.fillStyle = b.roof; g.fillRect(0, 0, c.width, c.height);
    const horiz = b.w >= b.h;
    g.fillStyle = 'rgba(0,0,0,0.12)';
    if (horiz) { for (let y = 6; y < c.height; y += 10) g.fillRect(0, y, c.width, 2); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, c.height / 2, c.width, c.height / 2); g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(0, c.height / 2 - 2, c.width, 3); }
    else { for (let x = 6; x < c.width; x += 10) g.fillRect(x, 0, 2, c.height); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(c.width / 2, 0, c.width / 2, c.height); g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(c.width / 2 - 2, 0, 3, c.height); }
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 4; g.strokeRect(2, 2, c.width - 4, c.height - 4);
    if (b.type !== 'house') {
      g.font = 'bold 20px system-ui, sans-serif'; g.textAlign = 'center'; g.fillStyle = 'rgba(255,255,255,0.55)';
      g.fillText(b.name.toUpperCase(), c.width / 2, c.height / 2 - 8);
      if (b.type === 'safe') { g.fillStyle = '#9fe09f'; g.fillText('SAFE', c.width / 2, c.height / 2 + 18); }
    }
    this.roofs.set(b.id, c); return c;
  }

  // ---------- decals (persistent in chunk cache) ----------
  decal(x, y, fn) {
    const cx = Math.floor(x / CPX), cy = Math.floor(y / CPX);
    for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const k = (cx + ox) + (cy + oy) * 1000; const c = this.chunks.get(k); if (!c && (ox || oy)) continue;
      const cc = c || this.chunk(cx, cy);
      const g = cc.getContext('2d'); g.save(); g.translate(-(cx + ox) * CPX, -(cy + oy) * CPX); fn(g); g.restore();
    }
  }
  blood(x, y, n = 3, r = 6) {
    this.decal(x, y, (g) => { for (let k = 0; k < n; k++) { g.fillStyle = `rgba(${90 + Math.random() * 40},10,10,${0.5 + Math.random() * 0.3})`; g.beginPath(); g.arc(x + (Math.random() - 0.5) * r * 3, y + (Math.random() - 0.5) * r * 3, 1 + Math.random() * r, 0, 7); g.fill(); } });
  }
  corpse(x, y, ang, fr, r) {
    this.decal(x, y, (g) => {
      g.fillStyle = 'rgba(70,8,8,0.55)'; g.beginPath(); g.ellipse(x - Math.cos(ang) * 8, y - Math.sin(ang) * 8, r * 2.2, r * 1.5, ang, 0, 7); g.fill();
      g.save(); g.translate(x, y); g.rotate(ang); g.filter = 'brightness(0.75) saturate(0.8)'; g.drawImage(fr, -FRAME_SIZE / 2, -FRAME_SIZE / 2, FRAME_SIZE, FRAME_SIZE); g.restore();
    });
  }

  splat(x, y, a, sz) {
    this.decal(x, y, (g) => {
      g.fillStyle = 'rgba(90,6,6,0.75)'; g.beginPath(); g.ellipse(x + Math.cos(a) * 10 * sz, y + Math.sin(a) * 10 * sz, 14 * sz, 9 * sz, a, 0, 7); g.fill();
      g.strokeStyle = 'rgba(110,8,8,0.7)'; g.lineCap = 'round';
      for (let k = 0; k < 7; k++) { const b = a + (Math.random() - 0.5) * 1.2, l = (20 + Math.random() * 40) * sz; g.lineWidth = 1 + Math.random() * 2.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(b) * l, y + Math.sin(b) * l); g.stroke(); g.fillStyle = 'rgba(120,8,8,0.8)'; g.beginPath(); g.arc(x + Math.cos(b) * l, y + Math.sin(b) * l, 1.5 + Math.random() * 2.5, 0, 7); g.fill(); }
    });
  }

  // ---------- events ----------
  onEvent(e, localId) {
    const P = this.parts;
    switch (e.type) {
      case 'zhit': {
        for (let k = 0; k < 8; k++) P.push({ x: e.x, y: e.y, vx: e.kx * 120 + (Math.random() - 0.5) * 140, vy: e.ky * 120 + (Math.random() - 0.5) * 140, life: 0.4, max: 0.4, c: '#8a1010', s: 2 + Math.random() * 2, blood: true });
        this.blood(e.x + e.kx * 10, e.y + e.ky * 10, 2, 5);
        if (e.crit) this.floaters.push({ x: e.x, y: e.y - 14, t: 0.8, text: 'CRIT', c: '#ffd25a' });
        if (e.melee && e.pid === localId) this.shake = Math.max(this.shake, e.crit ? 5 : 2.5);
        break;
      }
      case 'zdie': {
        const big = e.ztype === 'brute', fast = e.ztype === 'runner', a0 = e.ang;
        const n = big ? 46 : fast ? 30 : 22;
        for (let k = 0; k < n; k++) { const a2 = a0 + (Math.random() - 0.5) * (fast ? 0.9 : 1.8), v = 90 + Math.random() * (fast ? 360 : 240); P.push({ x: e.x, y: e.y, vx: Math.cos(a2) * v, vy: Math.sin(a2) * v, life: 0.35 + Math.random() * 0.3, max: 0.65, c: k % 4 ? '#8a0c0c' : '#c01818', s: 2 + Math.random() * 3, blood: true }); }
        for (let k = 0; k < (big ? 10 : 4); k++) { const a2 = Math.random() * 6.28, v = 60 + Math.random() * 140; P.push({ x: e.x, y: e.y, vx: Math.cos(a2) * v, vy: Math.sin(a2) * v, life: 0.7, max: 0.7, c: '#4a0808', s: 4 + Math.random() * 3, blood: true }); }
        for (let k = 0; k < 6; k++) P.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 50, vy: (Math.random() - 0.5) * 50, life: 0.5, max: 0.5, c: 'rgba(140,10,10,0.35)', s: 9, smoke: true });
        if (e.ztype === 'soldier') { P.push({ x: e.x, y: e.y, vx: Math.cos(a0) * 160, vy: Math.sin(a0) * 160, life: 0.8, max: 0.8, c: '#4a5236', s: 9, helmet: true }); for (let k = 0; k < 6; k++) P.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 220, vy: (Math.random() - 0.5) * 220, life: 0.25, max: 0.25, c: '#ffd890', s: 2 }); }
        this.splat(e.x, e.y, a0, big ? 1.8 : fast ? 1.2 : 1);
        if (big) this.shake = Math.max(this.shake, 10); else this.shake = Math.max(this.shake, 3);
        this.floaters.push({ x: e.x, y: e.y - 20, t: 0.6, text: big ? 'BRUTE DOWN' : e.ztype === 'soldier' ? 'SOLDIER DOWN' : '', c: '#ff8a6a' });
        this.dying.push({ x: e.x, y: e.y, ang: e.face ?? e.ang + Math.PI, type: e.ztype, v: e.zid || 0, t: 0 }); this.blood(e.x, e.y, 6, 8); for (let k = 0; k < 12; k++) { const a2 = e.ang + (Math.random() - 0.5) * 1.6, v = 80 + Math.random() * 180; P.push({ x: e.x, y: e.y, vx: Math.cos(a2) * v, vy: Math.sin(a2) * v, life: 0.5, max: 0.5, c: '#7a0c0c', s: 3 }); } break; }
      case 'glass':
        for (let k = 0; k < 18; k++) { const a = (e.ang || 0) + (Math.random() - 0.5) * 2.4, v = 60 + Math.random() * 200; P.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.6, max: 0.6, c: k % 2 ? 'rgba(190,225,240,0.9)' : 'rgba(255,255,255,0.8)', s: 2 + Math.random() * 2 }); }
        this.decal(e.x, e.y, (g) => { g.fillStyle = 'rgba(200,230,245,0.55)'; for (let k = 0; k < 12; k++) { const a = Math.random() * 6.28, d = 6 + Math.random() * 22; g.fillRect(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, 2, 1.5); } });
        break;
      case 'noise': this.rings.push({ x: e.x, y: e.y, r: e.r, t: 0.7 }); break;
      case 'silentKill': this.floaters.push({ x: e.x, y: e.y - 16, t: 1.1, text: 'SILENT KILL', c: '#9ab0ff' }); break;
      case 'slam': this.rings2.push({ x: e.x, y: e.y, t: 0.35, r: 70, c: '220,200,160' }); this.shake = Math.max(this.shake, 7); for (let k = 0; k < 12; k++) { const a = Math.random() * 6.28; P.push({ x: e.x, y: e.y, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160, life: 0.45, max: 0.45, c: 'rgba(170,160,140,0.45)', s: 6, smoke: true }); } break;
      case 'revive': this.rings2.push({ x: e.x, y: e.y, t: 0.6, r: 160, c: '255,110,180' }); this.flashes.push({ x: e.x, y: e.y, t: 0.3, r: 300 }); this.shake = 12; this.floaters.push({ x: e.x, y: e.y - 24, t: 1.6, text: 'SECOND CHANCE', c: '#ff6ab0' }); for (let k = 0; k < 40; k++) { const a = Math.random() * 6.28, v = 100 + Math.random() * 260; P.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.8, max: 0.8, c: k % 2 ? '#ff6ab0' : '#fff', s: 3 }); } break;
      case 'buff': this.rings2.push({ x: e.x, y: e.y, t: 0.5, r: 60, c: e.buff === 'adrenaline' ? '255,80,80' : '90,208,200' }); this.floaters.push({ x: e.x, y: e.y - 22, t: 1.2, text: e.buff === 'adrenaline' ? 'ADRENALINE' : 'ENERGY', c: e.buff === 'adrenaline' ? '#ff6a6a' : '#5ad0c8' }); break;
      case 'swing': this.trails.push({ x: e.x, y: e.y, ang: e.ang, arc: e.arc || 1.4, range: e.range || 30, t: 0.14, katana: e.arc > 1.85 && e.range > 54 }); break;
      case 'pickup': if (e.text) this.floaters.push({ x: e.x, y: e.y - 20, t: 1.2, text: e.text, c: '#cfe8a0' }); break;
      case 'zdown': for (let k = 0; k < 6; k++) P.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 90, vy: (Math.random() - 0.5) * 90, life: 0.4, max: 0.4, c: 'rgba(180,170,150,0.4)', s: 5, smoke: true }); break;
      case 'step': if (e.loud) P.push({ x: e.x + (Math.random() - 0.5) * 8, y: e.y + 6, vx: 0, vy: 0, life: 0.35, max: 0.35, c: 'rgba(160,150,130,0.3)', s: 4, smoke: true }); break;
      case 'tracer': if (e.gun === 'crossbow') { this.bolts.push({ ...e, t: 0 }); break; } this.tracers.push({ ...e, t: 0.07 }); if (e.wall) for (let k = 0; k < 4; k++) P.push({ x: e.x1, y: e.y1, vx: (Math.random() - 0.5) * 160, vy: (Math.random() - 0.5) * 160, life: 0.25, max: 0.25, c: '#ffd890', s: 2 }); break;
      case 'gunshot':
        if (e.gun === 'crossbow') break;
        this.flashes.push({ x: e.x, y: e.y, t: 0.07, r: 240 });
        P.push({ x: e.x, y: e.y, vx: Math.cos(e.ang + 1.6) * 90, vy: Math.sin(e.ang + 1.6) * 90, life: 0.5, max: 0.5, c: '#d9b35a', s: 2 });
        for (let k = 0; k < 3; k++) P.push({ x: e.x, y: e.y, vx: Math.cos(e.ang) * 60 + (Math.random() - 0.5) * 30, vy: Math.sin(e.ang) * 60 + (Math.random() - 0.5) * 30, life: 0.6, max: 0.6, c: 'rgba(180,180,180,0.4)', s: 5, smoke: true });
        if (e.pid === localId) this.shake = Math.max(this.shake, e.gun === 'shotgun' ? 7 : 3);
        break;
      case 'explode':
        this.flashes.push({ x: e.x, y: e.y, t: 0.25, r: 420 }); this.shake = 16; this.booms.push({ x: e.x, y: e.y, t: 0 });
        for (let k = 0; k < 40; k++) { const a = Math.random() * 6.28, v = 60 + Math.random() * 260; P.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.7, max: 0.7, c: k % 3 ? '#ff9a3a' : '#555', s: 3 + Math.random() * 4, smoke: k % 3 === 0 }); }
        this.decal(e.x, e.y, (g) => { g.fillStyle = 'rgba(10,10,10,0.55)'; g.beginPath(); g.arc(e.x, e.y, 46, 0, 7); g.fill(); });
        break;
      case 'phurt': this.blood(e.x, e.y, 3, 5); if (e.pid === localId) this.shake = Math.max(this.shake, 6); break;
      case 'doorbreak': for (let k = 0; k < 14; k++) P.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 200, vy: (Math.random() - 0.5) * 200, life: 0.6, max: 0.6, c: '#6a4a2a', s: 3 }); break;
      case 'bash': P.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 60, life: 0.3, max: 0.3, c: '#6a4a2a', s: 2 }); break;
      case 'shove': for (let k = 0; k < 6; k++) P.push({ x: e.x + Math.cos(e.ang) * 20, y: e.y + Math.sin(e.ang) * 20, vx: Math.cos(e.ang + (Math.random() - 0.5)) * 80, vy: Math.sin(e.ang + (Math.random() - 0.5)) * 80, life: 0.3, max: 0.3, c: 'rgba(200,200,180,0.35)', s: 4, smoke: true }); break;
      case 'healed': this.floaters.push({ x: e.x, y: e.y - 16, t: 0.9, text: '+', c: '#7ae07a' }); break;
      case 'alert': this.floaters.push({ x: e.x, y: e.y - 18, t: 0.7, text: '!', c: '#ff5a5a' }); break;
      case 'break': this.floaters.push({ x: e.x, y: e.y - 18, t: 1, text: 'BROKEN', c: '#ff8a6a' }); break;
    }
  }

  // ---------- frame ----------
  render(s, localId, ui) {
    const ctx = this.ctx, w = s.world, p = s.players[localId], dpr = this.dpr;
    const dt = ui.dt; this.time += dt; this.dt = dt; this.simTime = s.time;
    this.hlCol = `rgba(255,230,140,${0.55 + 0.45 * Math.sin(this.time * 6)})`;
    const SW = window.innerWidth, SH = window.innerHeight;
    // camera
    if (p) {
      const lead = 0.18;
      const ld = ui.panelOpen || ui.bigMap ? 0 : lead;
      const tx = p.x + (ui.mouseWorld.x - p.x) * ld, ty = p.y + (ui.mouseWorld.y - p.y) * ld;
      this.cam.x += (tx - this.cam.x) * Math.min(1, dt * 8); this.cam.y += (ty - this.cam.y) * Math.min(1, dt * 8);
    }
    this.shake = Math.max(0, this.shake - dt * 40);
    const z = this.cam.zoom;
    const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
    const camX = this.cam.x + sx / z, camY = this.cam.y + sy / z;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0b0d10'; ctx.fillRect(0, 0, SW, SH);
    ctx.setTransform(z * dpr, 0, 0, z * dpr, (SW / 2 - camX * z) * dpr, (SH / 2 - camY * z) * dpr);
    const vx0 = camX - SW / 2 / z, vy0 = camY - SH / 2 / z, vx1 = camX + SW / 2 / z, vy1 = camY + SH / 2 / z;
    // chunks
    for (let cy = Math.floor(vy0 / CPX); cy <= Math.floor(vy1 / CPX); cy++) for (let cx = Math.floor(vx0 / CPX); cx <= Math.floor(vx1 / CPX); cx++) {
      if (cx < 0 || cy < 0 || cx * CH >= w.w || cy * CH >= w.h) continue;
      ctx.drawImage(this.chunk(cx, cy), cx * CPX, cy * CPX);
    }
    const tx0 = Math.max(0, Math.floor(vx0 / TILE) - 1), ty0 = Math.max(0, Math.floor(vy0 / TILE) - 1);
    const tx1 = Math.min(w.w - 1, Math.floor(vx1 / TILE) + 1), ty1 = Math.min(w.h - 1, Math.floor(vy1 / TILE) + 1);
    const near = p ? (ui.interact && ui.interact.kind === 'cont' ? ui.interact.cid : -1) : -1;
    const nearTile = ui.interact && (ui.interact.kind === 'door' || ui.interact.kind === 'window') ? ui.interact.i : -1;
    // building shadows
    const inB0 = p ? w.bld[Math.floor(p.y / TILE) * w.w + Math.floor(p.x / TILE)] : -1;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    for (const b of w.buildings) {
      if (b.id === inB0 || (b.x + b.w + 1) * TILE < vx0 || b.x * TILE > vx1 || (b.y + b.h + 1) * TILE < vy0 || b.y * TILE > vy1) continue;
      ctx.fillRect(b.x * TILE + 10, b.y * TILE + b.h * TILE, b.w * TILE, 12); ctx.fillRect(b.x * TILE + b.w * TILE, b.y * TILE + 10, 12, b.h * TILE - 10);
    }
    // base upgrades visuals
    if (s.upgrades.garden && w.gardenAt) this.garden(ctx, w.gardenAt.x * TILE, w.gardenAt.y * TILE);
    if (s.upgrades.rain && w.rainAt) this.rain(ctx, w.rainAt.x * TILE, w.rainAt.y * TILE);
    // doors + furniture
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const i = ty * w.w + tx, t = w.tiles[i];
      if (i === nearTile) { ctx.fillStyle = 'rgba(255,230,140,0.18)'; ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE); }
      if (t === T.DOOR) this.door(ctx, tx, ty, w.doors[i]);
      else if (t === T.WINDOW) { const wi = w.windows && w.windows[i]; if (wi && (wi.open || wi.broken)) this.windowState(ctx, tx, ty, wi); }
      if (i === nearTile) { ctx.strokeStyle = this.hlCol; ctx.lineWidth = 2; ctx.strokeRect(tx * TILE + 1, ty * TILE + 1, TILE - 2, TILE - 2); }
      else if (t === T.FURN) {
        const cid = w.contAt[i]; const c = cid >= 0 ? w.containers[cid] : null;
        this.furn(ctx, tx, ty, FURN_KINDS[w.furn[i]], c, cid === near, s);
      }
    }
    for (const car of w.cars) if (car.x * TILE < vx1 && (car.x + car.w) * TILE > vx0 && car.y * TILE < vy1 && (car.y + car.h) * TILE > vy0) this.car(ctx, car, car.cid === near, car.cid >= 0 ? w.containers[car.cid] : null);
    for (const cid of s.loose) {
      const c = w.containers[cid]; if (!c || c.px < vx0 - 40 || c.px > vx1 + 40 || c.py < vy0 - 40 || c.py > vy1 + 40) continue;
      if (c.searched && (!c.items || !c.items.length) && c.type !== 'zombie' && c.type !== 'zsoldier') continue;
      this.loose(ctx, c, cid === near);
    }
    // fires: flames, smoke and embers
    for (const f of w.fires) {
      if (f.x < vx0 - 60 || f.x > vx1 + 60 || f.y < vy0 - 60 || f.y > vy1 + 60) continue;
      const sz = f.small ? 0.6 : 1;
      for (let k = 0; k < 4; k++) { const fl = Math.sin(this.time * (9 + k * 3) + k * 2 + f.x) * 0.5 + 0.5; ctx.fillStyle = ['rgba(255,90,20,0.75)', 'rgba(255,150,40,0.75)', 'rgba(255,210,90,0.8)', 'rgba(255,240,180,0.85)'][k]; ctx.beginPath(); ctx.arc(f.x + Math.sin(this.time * 5 + k) * 3 * sz, f.y - k * 2 * sz, (12 - k * 2.6) * sz * (0.8 + fl * 0.3), 0, 7); ctx.fill(); }
      if (Math.random() < dt * 10) this.parts.push({ x: f.x + (Math.random() - 0.5) * 10, y: f.y - 6, vx: 6 + Math.random() * 8, vy: -24 - Math.random() * 20, life: 2.2, max: 2.2, c: 'rgba(60,58,56,0.35)', s: 7 * sz, smoke: true });
      if (Math.random() < dt * 6) this.parts.push({ x: f.x, y: f.y, vx: (Math.random() - 0.5) * 40, vy: -40 - Math.random() * 50, life: 0.9, max: 0.9, c: '#ffb050', s: 2 });
    }
    for (const o of s.thrown) {
      ctx.fillStyle = o.id === 'noisemaker' ? '#c77ad6' : '#555'; ctx.beginPath(); ctx.arc(o.x, o.y, 4, 0, 7); ctx.fill();
      if (o.id === 'noisemaker' && o.fly <= 0 && (this.time * 2) % 1 < 0.5) { ctx.fillStyle = '#ff4a4a'; ctx.fillRect(o.x - 1, o.y - 1, 2, 2); }
    }
    // visibility
    const dl = daylight(s);
    const R = 15 * TILE;
    const lit = (x, y) => {
      if (!p || p.dead) return 1;
      const d = Math.hypot(x - p.x, y - p.y);
      if (d > R || !los(w, p.x, p.y, x, y)) return 0;
      if (dl > 0.6) return 1;
      let l = Math.max(dl, 0.22);
      if (d < 90) l = 1;
      if (p.flashlight && d < 380) { let a = Math.atan2(y - p.y, x - p.x) - p.ang; while (a > Math.PI) a -= 6.283; while (a < -Math.PI) a += 6.283; if (Math.abs(a) < 0.48) l = 1; }
      for (const f of this.flashes) if (Math.hypot(x - f.x, y - f.y) < f.r) l = 1;
      return l;
    };
    // zombies
    for (const zb of s.zombies) {
      if (zb.x < vx0 - 40 || zb.x > vx1 + 40 || zb.y < vy0 - 40 || zb.y > vy1 + 40) continue;
      const l = lit(zb.x, zb.y); if (l <= 0) continue;
      ctx.globalAlpha = l; this.zombie(ctx, zb); ctx.globalAlpha = 1;
    }
    for (const d of this.dying) {
      d.t += dt; const k = Math.min(1, d.t / 0.55);
      const fr = zombieFrame(d.type, d.v, 'death', k);
      ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.ang); ctx.drawImage(fr, -FRAME_SIZE / 2, -FRAME_SIZE / 2, FRAME_SIZE, FRAME_SIZE); ctx.restore();
      if (k >= 1) d.done = true; // the corpse container takes over drawing the body
    }
    this.dying = this.dying.filter((d) => !d.done);
    // Kenney explosion + smoke frames
    for (const b of this.booms) {
      b.t += dt; const fi = Math.floor(b.t / 0.08);
      const img = fi < 5 ? IMG['explosion' + (fi + 1)] : IMG['explosionSmoke' + Math.min(5, fi - 4)];
      const sz = (fi < 5 ? 150 : 170) * (b.s || 1);
      if (img && img.complete) { ctx.globalAlpha = fi < 5 ? 1 : Math.max(0, 1 - (b.t - 0.4) / 0.5); ctx.drawImage(img, b.x - sz / 2, b.y - sz / 2, sz, sz); ctx.globalAlpha = 1; }
    }
    this.booms = this.booms.filter((b) => b.t < 0.9);
    for (const t of this.trails) {
      t.t -= dt; const a = Math.max(0, t.t / 0.14);
      ctx.strokeStyle = t.katana ? `rgba(170,235,255,${0.75 * a})` : `rgba(255,255,255,${0.45 * a})`; ctx.lineWidth = (t.katana ? 8 : 5) * a + 1; ctx.beginPath(); ctx.arc(t.x, t.y, t.range * 0.85, t.ang - t.arc / 2, t.ang - t.arc / 2 + t.arc * (1 - a * 0.6)); ctx.stroke();
    }
    this.trails = this.trails.filter((t) => t.t > 0);
    for (const g of this.rings2) { g.t -= dt; const k = 1 - g.t / 0.5; ctx.strokeStyle = `rgba(${g.c},${Math.max(0, 0.7 * (1 - k))})`; ctx.lineWidth = 4 * (1 - k) + 1; ctx.beginPath(); ctx.arc(g.x, g.y, g.r * Math.min(1, 0.2 + k), 0, 7); ctx.stroke(); }
    this.rings2 = this.rings2.filter((g) => g.t > 0);
    for (const b of this.bolts) { b.t += dt; const k = Math.min(1, b.t / 0.12), x = b.x0 + (b.x1 - b.x0) * k, y = b.y0 + (b.y1 - b.y0) * k, a = Math.atan2(b.y1 - b.y0, b.x1 - b.x0);
      ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = '#8a6a44'; ctx.fillRect(-14, -1, 14, 2); ctx.fillStyle = '#c8ccd0'; ctx.beginPath(); ctx.moveTo(0, -2.5); ctx.lineTo(5, 0); ctx.lineTo(0, 2.5); ctx.fill(); ctx.fillStyle = '#c83a3a'; ctx.fillRect(-15, -2.5, 4, 5); ctx.restore(); }
    this.bolts = this.bolts.filter((b) => b.t < 0.3);
    for (const g of this.rings) { g.t -= dt; const k = 1 - g.t / 0.7; ctx.strokeStyle = `rgba(200,220,255,${0.22 * (1 - k)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(g.x, g.y, g.r * (0.3 + 0.7 * k), 0, 7); ctx.stroke(); }
    this.rings = this.rings.filter((g) => g.t > 0);
    for (const id in s.players) { const q = s.players[id]; if (!q.dead) this.player(ctx, q); }
    // tracers & particles
    ctx.lineCap = 'round';
    for (const t of this.tracers) { ctx.strokeStyle = `rgba(255,230,150,${t.t / 0.07})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(t.x0, t.y0); ctx.lineTo(t.x1, t.y1); ctx.stroke(); t.t -= dt; }
    this.tracers = this.tracers.filter((t) => t.t > 0);
    for (const q of this.parts) {
      q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; const k = Math.max(0, 1 - dt * (q.smoke && q.max > 1 ? 0.4 : 6)); q.vx *= k; q.vy *= k;
      if (q.blood && q.life <= 0 && !q.stamped) { q.stamped = true; const x = q.x, y = q.y, r = q.s * 0.8; this.decal(x, y, (g) => { g.fillStyle = 'rgba(110,8,8,0.7)'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }); }
      if (q.helmet) { ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.life * 12); ctx.fillStyle = '#4a5236'; ctx.beginPath(); ctx.arc(0, 0, 6, Math.PI * 0.1, Math.PI * 1.9); ctx.fill(); ctx.restore(); continue; }
      ctx.globalAlpha = Math.max(0, q.life / q.max); ctx.fillStyle = q.c;
      const sz = q.smoke ? q.s * (2 - q.life / q.max) : q.s;
      ctx.fillRect(q.x - sz / 2, q.y - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;
    this.parts = this.parts.filter((q) => q.life > 0);
    if (this.parts.length > 600) this.parts.splice(0, this.parts.length - 600);
    // lighting
    if (p && !p.dead) this.lighting(s, p, camX, camY, dl, R);
    // rain
    const rain = s.weather ? s.weather.rain : 0;
    if (rain > 0.03) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = `rgba(20,30,50,${0.18 * rain})`; ctx.fillRect(0, 0, SW, SH);
      if (!this.drops) this.drops = Array.from({ length: 260 }, () => ({ x: Math.random() * SW, y: Math.random() * SH, v: 700 + Math.random() * 400 }));
      ctx.strokeStyle = 'rgba(170,190,220,0.35)'; ctx.lineWidth = 1; ctx.beginPath();
      const n = Math.floor(this.drops.length * rain);
      for (let k = 0; k < n; k++) {
        const d = this.drops[k]; d.y += d.v * dt; d.x += d.v * 0.15 * dt;
        if (d.y > SH) { d.y = -20; d.x = Math.random() * SW; } if (d.x > SW) d.x -= SW;
        ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 3, d.y - 16);
      }
      ctx.stroke();
    }
    // roofs drawn over the fog so buildings read clearly from outside
    ctx.setTransform(z * dpr, 0, 0, z * dpr, (SW / 2 - camX * z) * dpr, (SH / 2 - camY * z) * dpr);
    const inB = p ? w.bld[Math.floor(p.y / TILE) * w.w + Math.floor(p.x / TILE)] : -1;
    const roofDim = `rgba(4,6,12,${0.15 + (1 - dl) * 0.45})`;
    for (const b of w.buildings) {
      if (b.id === inB) continue;
      if ((b.x + b.w) * TILE < vx0 || b.x * TILE > vx1 || (b.y + b.h) * TILE < vy0 || b.y * TILE > vy1) continue;
      // roof sits inside the outer walls so doors and windows stay readable from the street
      const rx = (b.x + 1) * TILE - 5, ry = (b.y + 1) * TILE - 5, rw = (b.w - 2) * TILE + 10, rh = (b.h - 2) * TILE + 10;
      ctx.drawImage(this.roof(b), rx, ry, rw, rh);
      ctx.fillStyle = roofDim; ctx.fillRect(rx, ry, rw, rh);
    }
    // floaters
    ctx.textAlign = 'center'; ctx.font = 'bold 11px system-ui, sans-serif';
    for (const f of this.floaters) { f.t -= dt; f.y -= dt * 20; ctx.globalAlpha = Math.max(0, Math.min(1, f.t * 2)); ctx.fillStyle = f.c; ctx.fillText(f.text, f.x, f.y); }
    ctx.globalAlpha = 1; this.floaters = this.floaters.filter((f) => f.t > 0);
    for (const f of this.flashes) f.t -= dt; this.flashes = this.flashes.filter((f) => f.t > 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  lighting(s, p, camX, camY, dl, R) {
    const w = s.world, dpr = this.dpr, z = this.cam.zoom, SW = window.innerWidth, SH = window.innerHeight;
    const toWorld = (g) => g.setTransform(z * dpr, 0, 0, z * dpr, (SW / 2 - camX * z) * dpr, (SH / 2 - camY * z) * dpr);
    // visibility polygon
    const N = 300, pts = [];
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2;
      const d = castRay(w, p.x, p.y, a, R, opaqueAt);
      const e = d < R ? d + 26 : d;
      pts.push(p.x + Math.cos(a) * e, p.y + Math.sin(a) * e);
    }
    // night
    const nightA = (1 - dl) * 0.9;
    const ctx = this.ctx;
    if (nightA > 0.02) {
      const g = this.night.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, this.night.width, this.night.height);
      g.fillStyle = `rgba(3,5,14,${nightA})`; g.fillRect(0, 0, this.night.width, this.night.height);
      toWorld(g); g.globalCompositeOperation = 'destination-out';
      const light = (x, y, r, a = 1) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
      light(p.x, p.y, 110, 0.85);
      if (p.flashlight) {
        const gr = g.createRadialGradient(p.x, p.y, 10, p.x, p.y, 400); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.7, 'rgba(0,0,0,0.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.beginPath(); g.moveTo(p.x, p.y); g.arc(p.x, p.y, 400, p.ang - 0.45, p.ang + 0.45); g.closePath(); g.fill();
      }
      for (const f of this.flashes) light(f.x, f.y, f.r, Math.min(1, f.t * 12));
      if (w.safeCenter) light(w.safeCenter.x, w.safeCenter.y, 260, 0.7);
      const hw = SW / 2 / z + 160, hh = SH / 2 / z + 160;
      const near = (o) => Math.abs(o.x - camX) < hw && Math.abs(o.y - camY) < hh;
      const glow = [];
      for (const l of w.lamps) {
        if (l.broken || !near(l)) continue;
        let a = 0.85; if (l.flicker) { const f = Math.sin(this.time * 23 + l.ph) + Math.sin(this.time * 7.3 + l.ph * 2); if (f > 1.2) a = 0.15; }
        light(l.x, l.y, l.flood ? 300 : 150, a); glow.push([l.x, l.y, l.flood ? 300 : 150, a * 0.16, '255,200,130']);
      }
      for (const f of w.fires) { if (!near(f)) continue; const r = (f.small ? 130 : 190) + Math.sin(this.time * 11 + f.x) * 8 + Math.sin(this.time * 17) * 5; light(f.x, f.y, r, 0.95); glow.push([f.x, f.y, r, 0.3, '255,130,40']); }
      this.glow = glow;
      for (const pr of w.props) if (pr.kind === 'fire') { const fx = (pr.x + 0.4) * TILE, fy = (pr.y + 0.4) * TILE; if (Math.abs(fx - p.x) < 900 && Math.abs(fy - p.y) < 900) light(fx, fy, 140 + Math.sin(this.time * 9) * 8, 0.9); }
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(this.night, 0, 0);
      // warm additive glow from lamps and fires
      toWorld(ctx); ctx.globalCompositeOperation = 'lighter';
      for (const [x, y, r, a, c] of this.glow) { const gr = ctx.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${c},${a * nightA})`); gr.addColorStop(1, `rgba(${c},0)`); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
      ctx.globalCompositeOperation = 'source-over'; ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    // fog of war (line of sight)
    const g = this.fog.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, this.fog.width, this.fog.height);
    g.fillStyle = 'rgba(8,10,14,0.8)'; g.fillRect(0, 0, this.fog.width, this.fog.height);
    toWorld(g); g.globalCompositeOperation = 'destination-out';
    const gr = g.createRadialGradient(p.x, p.y, R * 0.6, p.x, p.y, R); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(pts[0], pts[1]); for (let k = 2; k < pts.length; k += 2) g.lineTo(pts[k], pts[k + 1]); g.closePath(); g.fill();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(this.fog, 0, 0);
    this.atmosphere(s, camX, camY, dl);
  }

  atmosphere(s, camX, camY, dl) {
    const ctx = this.ctx, dpr = this.dpr, SW = window.innerWidth, SH = window.innerHeight, t = this.time;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // time-of-day colour grading
    const h = hourOf(s);
    const grade = h >= 5 && h < 8 ? '255,150,170,0.07' : h >= 8 && h < 16 ? '255,235,190,0.035' : h >= 16 && h < 20 ? '255,140,60,0.09' : '60,80,160,0.1';
    ctx.fillStyle = `rgba(${grade})`; ctx.fillRect(0, 0, SW, SH);
    // morning mist and rain haze, drifting with slight parallax
    const rain = s.weather ? s.weather.rain : 0;
    const mist = Math.max(h >= 4.5 && h < 9 ? 1 - Math.abs(h - 6.5) / 2.5 : 0, rain * 0.6);
    if (mist > 0.02) {
      for (let k = 0; k < 7; k++) {
        const x = (((k * 397 + t * (8 + k * 2) - camX * 0.6 * this.cam.zoom) % (SW + 700)) + SW + 700) % (SW + 700) - 350;
        const y = (((k * 251 - camY * 0.6 * this.cam.zoom + Math.sin(t * 0.1 + k) * 40) % (SH + 600)) + SH + 600) % (SH + 600) - 300;
        const r = 260 + (k % 3) * 90, gr = ctx.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, `rgba(200,205,215,${0.13 * mist})`); gr.addColorStop(1, 'rgba(200,205,215,0)');
        ctx.fillStyle = gr; ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }
    // dust motes / ash
    ctx.fillStyle = dl > 0.4 ? 'rgba(255,245,220,0.18)' : 'rgba(180,200,255,0.12)';
    for (let k = 0; k < 36; k++) {
      const x = ((k * 137.5 + t * (6 + (k % 4) * 3) + Math.sin(t * 0.7 + k) * 12) % SW + SW) % SW;
      const y = ((k * 89.3 + t * (3 + (k % 3)) + Math.cos(t * 0.5 + k * 2) * 10) % SH + SH) % SH;
      ctx.fillRect(x, y, 1.5 + (k % 3) * 0.5, 1.5 + (k % 3) * 0.5);
    }
    // vignette
    if (!this.vig || this.vig.width !== SW || this.vig.height !== SH) {
      this.vig = document.createElement('canvas'); this.vig.width = SW; this.vig.height = SH;
      const g = this.vig.getContext('2d'), vg = g.createRadialGradient(SW / 2, SH / 2, Math.min(SW, SH) * 0.45, SW / 2, SH / 2, Math.max(SW, SH) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)'); g.fillStyle = vg; g.fillRect(0, 0, SW, SH);
    }
    ctx.drawImage(this.vig, 0, 0, SW, SH);
  }

  // ---------- sprites ----------
  door(ctx, tx, ty, d) {
    const w = this.world, X = tx * TILE, Y = ty * TILE, i = ty * w.w + tx;
    const lw = w.tiles[i - 1], rw = w.tiles[i + 1];
    const horiz = lw === T.WALL || rw === T.WALL || lw === T.WINDOW || rw === T.WINDOW || lw === T.DOOR || rw === T.DOOR;
    if (d.broken) { ctx.fillStyle = '#4a3220'; for (let k = 0; k < 4; k++) ctx.fillRect(X + 4 + k * 7, Y + 12 + (k % 2) * 6, 5, 3); return; }
    // smooth swing animation
    let a = this.doorAnim.get(i); const target = d.open ? 1 : 0;
    if (a === undefined) a = target;
    a += (target - a) * Math.min(1, this.dt * 14); if (Math.abs(target - a) < 0.01) a = target;
    this.doorAnim.set(i, a);
    const e = a * a * (3 - 2 * a);
    ctx.save();
    if (horiz) ctx.translate(X + 2, Y + 16); else ctx.translate(X + 16, Y + 2);
    ctx.rotate((horiz ? 0 : Math.PI / 2) + e * Math.PI / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(1, -3, TILE - 4, 10);
    ctx.fillStyle = '#6a4626'; ctx.fillRect(0, -5, TILE - 4, 10);
    ctx.fillStyle = '#8a5e36'; ctx.fillRect(2, -3, TILE - 8, 6);
    ctx.fillStyle = '#d0b060'; ctx.fillRect(TILE - 10, -1.5, 3, 3);
    ctx.restore();
    if (d.locked && a < 0.05) { ctx.strokeStyle = '#9a7a20'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(X + 16, Y + 13, 3, Math.PI, 0); ctx.stroke(); ctx.fillStyle = '#d8b040'; ctx.fillRect(X + 12.5, Y + 13, 7, 6); ctx.fillStyle = '#5a4a10'; ctx.fillRect(X + 15.5, Y + 15, 1, 2); }
    if (d.bar && a < 0.05) { for (let k = 0; k < d.bar; k++) { ctx.save(); ctx.translate(X + 16, Y + 16); ctx.rotate((horiz ? 0 : Math.PI / 2) + (k - 1) * 0.35); ctx.fillStyle = '#9a7a4a'; ctx.fillRect(-18, -3, 36, 6); ctx.fillStyle = '#666'; ctx.fillRect(-14, -1, 2, 2); ctx.fillRect(12, -1, 2, 2); ctx.restore(); } }
  }
  furn(ctx, tx, ty, kind, c, hl, s) {
    const X = tx * TILE, Y = ty * TILE, w = this.world;
    if ((kind === 'milcrate' || kind === 'crate') && IMG.crateMetal) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(X + 5, Y + 6, TILE - 6, TILE - 6);
      ctx.drawImage(kind === 'milcrate' ? IMG.crateMetal : IMG.crateWood, X + 1, Y + 1, TILE - 2, TILE - 2);
      if (c && c.searched && c.items && !c.items.length) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(X + 2, Y + 2, TILE - 4, TILE - 4); }
      if (hl) { ctx.strokeStyle = this.hlCol; ctx.lineWidth = 2; ctx.strokeRect(X + 1, Y + 1, TILE - 2, TILE - 2); }
      return;
    }
    // furniture faces away from the wall it stands against
    const wall = (dx, dy) => { const t = w.tiles[(ty + dy) * w.w + tx + dx]; return t === T.WALL || t === T.WINDOW; };
    const rot = wall(0, -1) ? 0 : wall(0, 1) ? Math.PI : wall(-1, 0) ? -Math.PI / 2 : wall(1, 0) ? Math.PI / 2 : 0;
    const opened = !!(c && c.searched && !['stash', 'bench', 'bed', 'radio', 'rack'].includes(c.type));
    ctx.save(); ctx.translate(X + 16, Y + 16); ctx.rotate(rot);
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(-12, -12, 28, 28);
    this.drawFurn(ctx, kind, opened, s, c);
    if (opened && c.items && !c.items.length) { ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(-15, -15, 30, 30); }
    ctx.restore();
    if (hl) { ctx.strokeStyle = this.hlCol; ctx.lineWidth = 2; ctx.strokeRect(X + 1, Y + 1, TILE - 2, TILE - 2); }
  }
  drawFurn(ctx, kind, opened, s, c) {
    const box = (x, y, w, h, f, st = 'rgba(0,0,0,0.45)') => { ctx.fillStyle = f; ctx.fillRect(x, y, w, h); ctx.strokeStyle = st; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); };
    const dark = 'rgba(15,12,10,0.85)';
    switch (kind) {
      case 'fridge': box(-14, -15, 28, 27, '#e2e6e6'); ctx.fillStyle = '#b8bec0'; ctx.fillRect(-14, -3, 28, 1.5); ctx.fillStyle = '#8a9094'; ctx.fillRect(8, 3, 2, 7);
        if (opened) { box(-12, 9, 24, 4, 'rgba(255,250,210,0.8)'); box(11, 11, 3, 15, '#d4d8d8'); } break;
      case 'counter': case 'sink': case 'register':
        box(-15, -15, 30, 28, '#6e5034'); box(-15, -15, 30, 20, kind === 'register' ? '#54585e' : '#c8b898');
        ctx.fillStyle = '#3a2a1a'; ctx.fillRect(-9, 8, 5, 1.5); ctx.fillRect(4, 8, 5, 1.5);
        if (kind === 'sink') { box(-9, -12, 18, 13, '#a8b2ba'); ctx.fillStyle = '#7a848c'; ctx.beginPath(); ctx.arc(0, -5, 1.6, 0, 7); ctx.fill(); box(-1.5, -15, 3, 5, '#c8ccd0'); }
        if (kind === 'register') { box(-8, -12, 16, 10, '#2a2d31'); box(-6, -11, 12, 4, '#7ac070'); }
        if (opened) { box(-11, 12, 22, 6, '#7a5a3c'); ctx.fillStyle = dark; ctx.fillRect(-9, 13, 18, 3); } break;
      case 'stove': box(-15, -15, 30, 28, '#d8d8d8'); box(-13, -13, 26, 19, '#2a2a2a');
        for (const [x, y] of [[-6, -7], [6, -7], [-6, 1], [6, 1]]) { ctx.strokeStyle = '#666'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 3.6, 0, 7); ctx.stroke(); }
        ctx.fillStyle = '#444'; for (let k = 0; k < 4; k++) ctx.fillRect(-9 + k * 6, 9, 3, 2);
        if (opened) { box(-12, 13, 24, 7, '#3a3a3a'); ctx.fillStyle = 'rgba(255,140,60,0.2)'; ctx.fillRect(-10, 14, 20, 3); } break;
      case 'cabinet': box(-12, -15, 24, 16, '#eaeae4'); box(-9, -13, 18, 10, '#9ab8c8'); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(-7, -12, 4, 8);
        if (opened) box(9, -12, 3, 13, '#dcdcd4'); break;
      case 'wardrobe': box(-15, -15, 30, 25, '#6a4a30'); ctx.fillStyle = '#4a3220'; ctx.fillRect(-0.5, -15, 1, 25); ctx.fillStyle = '#c8a860'; ctx.fillRect(-3, 2, 1.5, 4); ctx.fillRect(1.5, 2, 1.5, 4);
        if (opened) { box(1, 9, 3, 15, '#5a3e28'); ctx.fillStyle = dark; ctx.fillRect(1, -13, 13, 21); ctx.fillStyle = '#7a4a4a'; ctx.fillRect(4, -11, 3, 16); ctx.fillStyle = '#4a5a7a'; ctx.fillRect(8, -11, 3, 16); } break;
      case 'dresser': case 'nightstand': case 'filing': {
        const sm = kind === 'nightstand', fl = kind === 'filing';
        const W = sm ? 20 : fl ? 22 : 30, H = sm ? 18 : 24;
        box(-W / 2, -15, W, H, fl ? '#8a9096' : '#7a5a3a');
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; for (let k = 1; k < 3; k++) ctx.fillRect(-W / 2 + 2, -15 + (H / 3) * k, W - 4, 1);
        ctx.fillStyle = fl ? '#d0d4d8' : '#d0b070'; for (let k = 0; k < 3; k++) ctx.fillRect(-1.5, -15 + (H / 3) * k + H / 6 - 1, 3, 2);
        if (sm) { ctx.fillStyle = '#e8d8a0'; ctx.beginPath(); ctx.arc(-4, -9, 4.5, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.stroke(); }
        if (opened) { box(-W / 2 + 3, -15 + H - 2, W - 6, 8, fl ? '#9aa0a6' : '#8a6a4a'); ctx.fillStyle = dark; ctx.fillRect(-W / 2 + 5, -15 + H, W - 10, 4); }
        break;
      }
      case 'shelf': case 'bookshelf': box(-15, -15, 30, 14, '#6a4a30');
        { const cols = ['#a83a2a', '#3a6aa8', '#c8a83a', '#4a8a4a', '#7a4a8a', '#d8d0c0']; for (let k = 0; k < 8; k++) { ctx.fillStyle = cols[(k * 7 + (c ? c.id : 0)) % 6]; ctx.fillRect(-13 + k * 3.3, -13, 2.6, kind === 'bookshelf' ? 10 : 6 + (k % 3) * 2); } }
        if (opened) { ctx.fillStyle = '#a83a2a'; ctx.save(); ctx.rotate(0.5); ctx.fillRect(-4, 6, 7, 3); ctx.restore(); ctx.fillStyle = '#d8d0c0'; ctx.fillRect(4, 8, 6, 4); } break;
      case 'tvstand': box(-15, -4, 30, 14, '#5a4030'); box(-13, -14, 26, 7, '#151a1e'); ctx.fillStyle = 'rgba(160,200,230,0.25)'; ctx.fillRect(-11, -13, 8, 2);
        if (opened) { box(-12, 9, 9, 3, '#4a3424'); box(3, 9, 9, 3, '#4a3424'); ctx.fillStyle = dark; ctx.fillRect(-12, 0, 24, 8); } break;
      case 'desk': box(-15, -15, 30, 22, '#8a6a44'); box(-6, -14, 12, 5, '#1e2226'); ctx.save(); ctx.rotate(-0.2); box(-12, -5, 8, 10, '#f0f0e8'); ctx.restore();
        ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(2, 11, 5, 0, 7); ctx.fill();
        if (opened) { box(6, 6, 8, 7, '#7a5a3a'); ctx.fillStyle = 'rgba(240,240,232,0.9)'; ctx.fillRect(-4, 12, 6, 4); } break;
      case 'toolbox': box(-11, -10, 22, 16, '#b03a2a'); box(-5, -13, 10, 3, '#7a2a1e'); if (opened) { box(-11, 6, 22, 5, '#c84a3a'); ctx.fillStyle = '#9aa'; ctx.fillRect(-7, -6, 6, 2); ctx.fillRect(2, -4, 5, 2); } break;
      case 'grocery': case 'pharmacy': case 'hardware': {
        const st = FURN_STYLE[kind]; box(-15, -15, 30, 30, st[1]); box(-14, -14, 28, 28, st[0]);
        ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(-14, -1, 28, 2);
        if (!opened || (c && c.items && c.items.length)) { const cols = ['#c94a3a', '#3a8ac9', '#e0c04a', '#5ac95a', '#eee']; for (let k = 0; k < 10; k++) { ctx.fillStyle = cols[(k * 3 + (c ? c.id : 0)) % 5]; ctx.fillRect(-12 + (k % 5) * 5, k < 5 ? -11 : 3, 3.5, 7); } }
        break;
      }
      case 'locker': box(-12, -15, 24, 26, '#4a5a70'); ctx.fillStyle = 'rgba(0,0,0,0.35)'; for (let k = 0; k < 4; k++) ctx.fillRect(-8, -12 + k * 3, 16, 1); ctx.fillRect(-0.5, -15, 1, 26);
        if (opened) { box(0, 10, 3, 13, '#3e4e62'); ctx.fillStyle = dark; ctx.fillRect(1, -13, 10, 22); } break;
      case 'medcab': box(-13, -15, 26, 24, '#eef0f0'); ctx.fillStyle = '#c83030'; ctx.fillRect(-2, -12, 4, 13); ctx.fillRect(-6.5, -7.5, 13, 4);
        if (opened) box(11, 8, 3, 14, '#dfe2e2'); break;
      case 'stash': box(-15, -15, 30, 28, '#5a7a4a'); box(-12, -12, 24, 4, '#9fe09f', 'transparent'); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-15, 0, 30, 2); break;
      case 'bench': box(-15, -15, 30, 26, '#9a7a4a'); ctx.fillStyle = '#ccc'; ctx.fillRect(-10, -9, 9, 3); ctx.fillStyle = '#b03a2a'; ctx.fillRect(3, -6, 7, 6); ctx.fillStyle = '#6a5232'; ctx.fillRect(-15, 4, 30, 2); break;
      case 'bed': if (!s.upgrades.bed) { box(-14, -14, 28, 26, '#5a4a3a'); ctx.fillStyle = 'rgba(0,0,0,0.3)'; for (let k = 0; k < 3; k++) ctx.fillRect(-12, -10 + k * 8, 24, 2); } else { box(-14, -15, 28, 29, '#4a6a8a'); box(-12, -13, 24, 8, '#e8e8e0'); } break;
      case 'radio': box(-12, -12, 24, 18, '#2e2e2e'); ctx.fillStyle = s.upgrades.radio ? (this.time % 1 < 0.5 ? '#7ae07a' : '#3a6a3a') : '#444'; ctx.fillRect(-8, -8, 5, 5); ctx.fillStyle = '#888'; ctx.fillRect(2, -9, 7, 2); ctx.fillRect(2, -5, 7, 2); break;
      case 'rack': box(-15, -15, 30, 12, '#4a3a2a'); for (let k = 0; k < 4; k++) { ctx.fillStyle = ['#c8ccd0', '#b4834a', '#3a3f46', '#c0302a'][k]; ctx.fillRect(-13 + k * 7, -13, 3, 24); } ctx.fillStyle = '#ffd27a'; ctx.fillRect(-15, -15, 30, 2); break;
      default: box(-14, -14, 28, 28, '#777');
    }
  }
  windowState(ctx, tx, ty, wi) {
    const w = this.world, X = tx * TILE, Y = ty * TILE;
    const lw = w.tiles[ty * w.w + tx - 1], rw = w.tiles[ty * w.w + tx + 1];
    const horiz = [T.WALL, T.WINDOW, T.DOOR].includes(lw) || [T.WALL, T.WINDOW, T.DOOR].includes(rw);
    ctx.save(); ctx.translate(X + 16, Y + 16); if (!horiz) ctx.rotate(Math.PI / 2);
    ctx.fillStyle = '#1c2024'; ctx.fillRect(-13, -5, 26, 10);
    if (wi.broken) { ctx.fillStyle = 'rgba(160,200,220,0.85)'; ctx.beginPath(); ctx.moveTo(-14, -4); ctx.lineTo(-8, -4); ctx.lineTo(-12, 1); ctx.closePath(); ctx.moveTo(14, 4); ctx.lineTo(7, 4); ctx.lineTo(12, -2); ctx.closePath(); ctx.moveTo(-2, -4); ctx.lineTo(3, -4); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill(); }
    else { ctx.fillStyle = '#7fb3c9'; ctx.fillRect(-14, -4, 14, 8); ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(-12, -3, 5, 2); ctx.fillStyle = '#4b443d'; ctx.fillRect(-1, -5, 2, 10); }
    ctx.restore();
  }
  car(ctx, car, hl, c) {
    const X = car.x * TILE, Y = car.y * TILE, W = car.w * TILE, H = car.h * TILE;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(X + 5, Y + 6, W - 6, H - 6);
    ctx.fillStyle = car.color; ctx.beginPath(); ctx.roundRect(X + 3, Y + 3, W - 6, H - 6, 6); ctx.fill();
    ctx.fillStyle = 'rgba(140,180,200,0.7)';
    if (car.h > car.w) { ctx.fillRect(X + 6, Y + 14, W - 12, 10); ctx.fillRect(X + 6, Y + H - 20, W - 12, 7); }
    else { ctx.fillRect(X + 14, Y + 6, 10, H - 12); ctx.fillRect(X + W - 20, Y + 6, 7, H - 12); }
    if (car.ambulance) { ctx.fillStyle = '#c83030'; if (car.h > car.w) { ctx.fillRect(X + 3, Y + H / 2 - 3, W - 6, 6); ctx.fillStyle = (this.time * 3) % 1 < 0.5 ? '#ff3a3a' : '#3a6aff'; ctx.fillRect(X + 10, Y + 8, 12, 4); } }
    if (car.military) { ctx.fillStyle = '#3e4426'; if (car.h > car.w) ctx.fillRect(X + 4, Y + H * 0.45, W - 8, H * 0.5); }
    if (car.wrecked) { ctx.fillStyle = car.burning ? 'rgba(12,10,8,0.75)' : 'rgba(20,15,10,0.45)'; ctx.fillRect(X + 3, Y + 3, W - 6, H - 6); }
    if (c && c.searched && c.items && !c.items.length) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(X + 3, Y + 3, W - 6, H - 6); }
    if (hl) { ctx.strokeStyle = this.hlCol; ctx.lineWidth = 2; ctx.strokeRect(X + 2, Y + 2, W - 4, H - 4); }
  }
  loose(ctx, c, hl) {
    if (c.type === 'zombie' || c.type === 'zsoldier') {
      const age = c.emptyT ? this.simTime - c.emptyT : 0, a = Math.max(0, Math.min(1, 1 - (age - 10) / 5));
      if (a <= 0) return;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(c.px, c.py); ctx.rotate(c.ang || 0);
      ctx.filter = 'brightness(0.8) saturate(0.85)';
      const fr = zombieFrame(c.zt || 'walker', c.zv || 0, 'death', 1); ctx.drawImage(fr, -FRAME_SIZE / 2, -FRAME_SIZE / 2, FRAME_SIZE, FRAME_SIZE);
      ctx.filter = 'none'; ctx.restore();
      if (!c.searched) { const t = (this.time * 1.5 + c.id * 0.37) % 2; if (t < 0.5) { ctx.fillStyle = `rgba(255,240,180,${0.8 * Math.sin(t * Math.PI * 2)})`; ctx.beginPath(); ctx.arc(c.px + 4, c.py - 4, 2, 0, 7); ctx.fill(); } }
      if (hl) { ctx.strokeStyle = this.hlCol; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(c.px, c.py, 18, 0, 7); ctx.stroke(); }
      return;
    }
    if (c.type === 'body') {
      ctx.fillStyle = '#2a2a30'; ctx.beginPath(); ctx.ellipse(c.px, c.py, 14, 8, 0.3, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffd25a'; ctx.fillRect(c.px - 2, c.py - 2, 4, 4);
    } else {
      const n = Math.min(3, c.items.length);
      for (let k = 0; k < n; k++) { const ic = iconCanvas(c.items[k].id); ctx.drawImage(ic, c.px - 10 + k * 5 - (n - 1) * 2, c.py - 10 - k * 2, 20, 20); }
    }
    if (hl) { ctx.strokeStyle = this.hlCol; ctx.lineWidth = 2; ctx.strokeRect(c.px - 14, c.py - 12, 28, 24); }
  }
  garden(ctx, X, Y) {
    ctx.fillStyle = '#4a3622'; ctx.fillRect(X, Y, 96, 48);
    for (let k = 0; k < 6; k++) { ctx.fillStyle = '#4a8a3a'; ctx.beginPath(); ctx.arc(X + 12 + k * 15, Y + 14 + (k % 2) * 18, 6, 0, 7); ctx.fill(); }
  }
  rain(ctx, X, Y) {
    ctx.fillStyle = '#3a5a8a'; ctx.beginPath(); ctx.arc(X + 24, Y + 24, 20, 0, 7); ctx.fill();
    ctx.fillStyle = '#5a8ac9'; ctx.beginPath(); ctx.arc(X + 24, Y + 24, 14, 0, 7); ctx.fill();
  }
  anim(e) {
    let a = this.animSt.get(e);
    if (!a) { a = { d: 0, x: e.x, y: e.y, mv: 0 }; this.animSt.set(e, a); }
    const m = Math.hypot(e.x - a.x, e.y - a.y);
    if (m < 40) a.d += m;
    a.mv = a.mv * 0.85 + (m > 0.12 ? 0.15 : 0); a.x = e.x; a.y = e.y;
    return a;
  }
  zombie(ctx, z) {
    const zt = ZT[z.type], r = zt.r, st = this.anim(z);
    let anim = 'idle', t = (this.time * 0.7 + z.id * 0.137) % 1;
    if (z.atk > 0) { anim = 'attack'; t = 1 - z.atk / 0.45; }
    else if (z.hitT > 0) { anim = 'hit'; t = 1 - z.hitT / 0.28; }
    else if (st.mv > 0.45) { anim = 'walk'; t = st.d / (z.type === 'runner' ? 62 : z.type === 'brute' ? 46 : 40) + z.id * 0.31; }
    const fr = zombieFrame(z.type, z.id, anim, t);
    ctx.save(); ctx.translate(z.x, z.y);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(2, 3, r + 2, r, 0, 0, 7); ctx.fill();
    ctx.rotate(z.ang);
    if (z.flash > 0) ctx.filter = 'brightness(2.6)';
    ctx.drawImage(fr, -FRAME_SIZE / 2, -FRAME_SIZE / 2, FRAME_SIZE, FRAME_SIZE);
    if (z.flash > 0) ctx.filter = 'none';
    const wn = z.wounds || 0;
    for (let i = 0; i < wn; i++) { const a = hash2(z.id, i, 3) * 6.28, d = hash2(i, z.id, 9) * r * 0.55; ctx.fillStyle = 'rgba(130,8,8,0.85)'; ctx.beginPath(); ctx.arc(Math.cos(a) * d * 0.7, Math.sin(a) * d, 1.4 + hash2(z.id, i, 1) * 1.4, 0, 7); ctx.fill(); }
    ctx.restore();
    if (z.state !== 'chase' && z.sus > 0.12) { ctx.fillStyle = `rgba(255,${Math.round(220 - z.sus * 120)},80,${Math.min(1, z.sus + 0.2)})`; ctx.font = `bold ${10 + z.sus * 6}px system-ui`; ctx.textAlign = 'center'; ctx.fillText('?', z.x, z.y - r - 8); }
    if (z.hitAge !== undefined && z.hitAge < 3 && z.hp < zt.hp) {
      const a = Math.min(1, (3 - z.hitAge) * 2), w = r * 2.6, f = Math.max(0, z.hp / zt.hp);
      ctx.globalAlpha *= a;
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(z.x - w / 2 - 1, z.y - r - 13, w + 2, 5);
      ctx.fillStyle = f > 0.5 ? '#c9d04a' : f > 0.25 ? '#e0903a' : '#e03a3a'; ctx.fillRect(z.x - w / 2, z.y - r - 12, w * f, 3);
      ctx.globalAlpha /= a;
    }
  }
  player(ctx, p) {
    const st = this.anim(p), wd = p.wpn ? ITEMS[p.wpn.id] : null;
    let anim = 'idle', t = (this.time * 0.9) % 1;
    if (p.channel) { anim = 'heal'; t = (this.time * 1.6) % 1; }
    else if (p.reload > 0 && wd && wd.cat === 'gun') { anim = 'reload'; t = 1 - p.reload / wd.reload; }
    else if (p.swing > 0) { anim = p.act === 'shove' ? 'shove' : 'attack'; t = 1 - p.swing / (p.swingDur || 0.2); }
    else if (p.moving) { anim = 'walk'; t = st.d / 70; }
    const fr = playerFrame(p.wpn ? p.wpn.id : 'fists', p.armor && p.armor.id, p.bag && p.bag.id, anim, t);
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.beginPath(); ctx.ellipse(2, 3, 12, 10, 0, 0, 7); ctx.fill();
    ctx.rotate(p.ang);
    ctx.drawImage(fr, -FRAME_SIZE / 2, -FRAME_SIZE / 2, FRAME_SIZE, FRAME_SIZE);
    if (p.muzzle > 0 && wd && wd.cat === 'gun') {
      const m = muzzleTip(p.wpn.id);
      if (m) { ctx.fillStyle = '#fff2b0'; ctx.beginPath(); ctx.moveTo(m[0], m[1] - 4); ctx.lineTo(m[0] + 12, m[1]); ctx.lineTo(m[0], m[1] + 4); ctx.fill(); ctx.fillStyle = '#ffb040'; ctx.beginPath(); ctx.arc(m[0] + 2, m[1], 3.5, 0, 7); ctx.fill(); }
    }
    ctx.restore();
    if (p.hurt > 0) { ctx.fillStyle = `rgba(255,0,0,${p.hurt * 0.6})`; ctx.beginPath(); ctx.arc(p.x, p.y, 13, 0, 7); ctx.fill(); }
  }
}
