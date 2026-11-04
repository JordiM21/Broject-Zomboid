import { TILE } from '../config.js';
import { T } from '../world/worldgen.js';
import { ITEMS, OBJECTIVES, CAT_COLOR } from '../data/items.js';
import { iconCanvas } from './icons.js';
import { hourOf, dayOf, daylight, weaponList, capacity, carried } from '../sim/sim.js';

const MM_COL = {
  [T.GRASS]: [47, 69, 39], [T.TREE]: [29, 51, 25], [T.BUSH]: [42, 64, 34], [T.ROAD]: [38, 40, 43], [T.SIDEWALK]: [80, 81, 80],
  [T.FLOOR]: [96, 80, 66], [T.WALL]: [150, 140, 128], [T.DOOR]: [140, 100, 60], [T.WINDOW]: [120, 170, 200], [T.FENCE]: [150, 150, 150],
  [T.YARD]: [74, 100, 58], [T.DIRT]: [74, 61, 46], [T.TILE]: [96, 96, 100], [T.CARPET]: [96, 70, 80], [T.CONCRETE]: [60, 62, 64],
  [T.CAR]: [130, 70, 58], [T.GATE]: [180, 160, 60], [T.FURN]: [110, 95, 80],
};

export class Minimap {
  constructor(world, explored) {
    this.w = world; this.n = world.w * world.h;
    this.explored = explored || new Uint8Array(this.n);
    this.canvas = document.createElement('canvas'); this.canvas.width = world.w; this.canvas.height = world.h;
    this.g = this.canvas.getContext('2d');
    this.img = this.g.createImageData(world.w, world.h);
    for (let i = 0; i < this.n; i++) if (this.explored[i]) this.paint(i);
    this.g.putImageData(this.img, 0, 0);
  }
  paint(i) {
    const w = this.w; const c = MM_COL[w.tiles[i]] || [60, 60, 60]; const o = i * 4;
    const safe = w.safe[i];
    this.img.data[o] = safe ? c[0] * 0.8 : c[0]; this.img.data[o + 1] = safe ? Math.min(255, c[1] * 1.2) : c[1]; this.img.data[o + 2] = c[2]; this.img.data[o + 3] = 255;
  }
  reveal(px, py, r = 13) {
    const w = this.w, cx = Math.floor(px / TILE), cy = Math.floor(py / TILE); let ch = false;
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      if (x < 0 || y < 0 || x >= w.w || y >= w.h || (x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
      const i = y * w.w + x; if (!this.explored[i]) { this.explored[i] = 1; this.paint(i); ch = true; }
    }
    if (ch) this.g.putImageData(this.img, 0, 0);
  }
}

function bar(ctx, x, y, w, v, col, label, trail = v) {
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x, y, w, 12);
  if (trail > v) { ctx.fillStyle = 'rgba(255,240,220,0.75)'; ctx.fillRect(x + 1 + (w - 2) * v / 100, y + 1, (w - 2) * (trail - v) / 100, 10); }
  ctx.fillStyle = col; ctx.fillRect(x + 1, y + 1, (w - 2) * Math.max(0, Math.min(1, v / 100)), 10);
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = '600 10px system-ui, sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(label, x + 4, y + 10);
  ctx.textAlign = 'right'; ctx.fillText(Math.round(v), x + w - 4, y + 10);
}

export function drawHUD(ctx, s, p, ui, rend, mm) {
  const SW = window.innerWidth, SH = window.innerHeight;
  const small = SW < 700 || SH < 500;
  ctx.textBaseline = 'alphabetic';
  if (p.dead) return;
  // vignettes
  if (p.hp < 35 || p.hurt > 0) {
    const a = p.hurt > 0 ? p.hurt * 0.8 : (0.25 + Math.sin(performance.now() / 300) * 0.1) * (1 - p.hp / 35);
    const g = ctx.createRadialGradient(SW / 2, SH / 2, Math.min(SW, SH) * 0.35, SW / 2, SH / 2, Math.max(SW, SH) * 0.7);
    g.addColorStop(0, 'rgba(120,0,0,0)'); g.addColorStop(1, `rgba(140,0,0,${Math.min(0.7, a)})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, SW, SH);
  }
  // progress ring (search / heal / reload)
  const ps = rend.worldToScreen(p.x, p.y);
  let prog = null, ptxt = '';
  if (p.search) { prog = p.search.t / p.search.dur; ptxt = 'Searching...'; }
  else if (p.channel) { prog = p.channel.t / p.channel.dur; ptxt = `Using ${ITEMS[p.channel.id].name}...`; }
  else if (p.reload > 0 && p.wpn) { prog = 1 - p.reload / ITEMS[p.wpn.id].reload; ptxt = 'Reloading...'; }
  if (prog !== null) {
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(ps.x, ps.y, 26, 0, 7); ctx.stroke();
    ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(ps.x, ps.y, 26, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(ptxt, ps.x, ps.y - 34);
  }
  // bars
  const bx = 16, by = SH - 96;
  ctx.fillStyle = 'rgba(10,12,16,0.55)'; ctx.fillRect(bx - 8, by - 26, 212, 112);
  const D = ui.disp || (ui.disp = { hp: p.hp, trail: p.hp, hunger: p.hunger, thirst: p.thirst, st: p.stamina });
  const k = Math.min(1, ui.dt * 10);
  D.hp += (p.hp - D.hp) * k; D.hunger += (p.hunger - D.hunger) * k; D.thirst += (p.thirst - D.thirst) * k; D.st += (p.stamina - D.st) * k;
  D.trail = D.trail > D.hp ? Math.max(D.hp, D.trail - ui.dt * 25) : D.hp;
  const lowSt = p.stamina < 15 && performance.now() % 500 < 250;
  bar(ctx, bx, by, 196, D.hp, p.hp < 30 ? '#e03a3a' : '#c94a4a', 'HEALTH', D.trail);
  bar(ctx, bx, by + 16, 196, D.hunger, '#d08a3a', 'FOOD');
  bar(ctx, bx, by + 32, 196, D.thirst, '#3a8ad0', 'WATER');
  bar(ctx, bx, by + 48, 196, D.st, lowSt ? '#ff6a3a' : '#c9c04a', 'STAMINA');
  const wt = carried(p), cap = capacity(p);
  ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'left';
  ctx.fillStyle = wt > cap ? '#ff8a6a' : '#bbb'; ctx.fillText(`Carry ${wt.toFixed(1)} / ${cap}`, bx, by + 76);
  const tags = [];
  if (p.bleeding) tags.push(['BLEEDING', '#ff5a5a']);
  if (p.infection > 0) tags.push([`INFECTED ${Math.round(p.infection)}%`, '#b6ff5a']);
  if (wt > cap) tags.push(['OVERLOADED', '#ff9a5a']);
  if (p.sneak) tags.push(['SNEAKING', '#9ab0ff']);
  if (p.hunger < 20) tags.push(['STARVING', '#ffb05a']);
  if (p.thirst < 20) tags.push(['THIRSTY', '#5ab0ff']);
  let tx = bx; ctx.font = '700 10px system-ui, sans-serif';
  for (const [t, c] of tags) { const tw = ctx.measureText(t).width + 10; ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(tx, by - 20, tw, 15); ctx.fillStyle = c; ctx.fillText(t, tx + 5, by - 9); tx += tw + 4; }
  // hotbar
  const wl = weaponList(p);
  const slot = small ? 38 : 54, gap = small ? 4 : 6, hw = 6 * (slot + gap) - gap, hx = small ? Math.max(230, SW / 2 - hw / 2) : SW / 2 - hw / 2, hy = SH - slot - (small ? 8 : 14);
  for (let k = 0; k < 6; k++) {
    const x = hx + k * (slot + gap), it = wl[k];
    const sel = k < wl.length && wl[k] === p.wpn;
    if (sel && ui.lastSel !== k) { ui.lastSel = k; ui.selPop = 1; }
    const pop = sel ? (ui.selPop || 0) : 0;
    ctx.save(); ctx.translate(x + slot / 2, hy + slot / 2); ctx.scale(1 + pop * 0.15, 1 + pop * 0.15); ctx.translate(-x - slot / 2, -hy - slot / 2);
    ctx.fillStyle = sel ? 'rgba(255,210,122,0.25)' : 'rgba(10,12,16,0.6)'; ctx.fillRect(x, hy, slot, slot);
    ctx.strokeStyle = sel ? '#ffd27a' : 'rgba(255,255,255,0.15)'; ctx.lineWidth = sel ? 2 : 1; ctx.strokeRect(x + 0.5, hy + 0.5, slot - 1, slot - 1);
    ctx.fillStyle = '#888'; ctx.font = '600 10px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(k + 1, x + 4, hy + 12);
    if (k >= wl.length) { ctx.restore(); continue; }
    const d = it ? ITEMS[it.id] : null;
    ctx.fillStyle = '#eee'; ctx.textAlign = 'center'; ctx.font = `600 ${small ? 9 : 10}px system-ui, sans-serif`;
    const nm = it ? d.name.split(' ').slice(-1)[0] : 'Fists';
    if (it) ctx.drawImage(iconCanvas(it.id), x + slot * 0.14, hy + slot * 0.06, slot * 0.72, slot * 0.72); else ctx.fillText(nm, x + slot / 2, hy + slot / 2 + 4);
    if (it && d.dur) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x + 4, hy + slot - 8, slot - 8, 4); const f = it.dur / d.dur; ctx.fillStyle = f > 0.5 ? '#7ad07a' : f > 0.2 ? '#d0c04a' : '#d05a4a'; ctx.fillRect(x + 4, hy + slot - 8, (slot - 8) * f, 4); }
    if (it && d.cat === 'gun') { const res = p.inv.filter((i) => i.id === d.ammo).reduce((a, b) => a + b.n, 0); ctx.fillStyle = it.mag ? '#ffd27a' : '#ff6a6a'; ctx.fillText(`${it.mag}/${res}`, x + slot / 2, hy + slot - 6); }
    ctx.restore();
  }
  ui.selPop = Math.max(0, (ui.selPop || 0) - ui.dt * 5);
  // prompt
  if (ui.interact && !p.search) {
    const t = `[E] ${ui.interact.label}` + (ui.interact.kind === 'door' && ui.interact.label === 'Open Door' ? '   [B] Barricade' : ''); ctx.font = '600 14px system-ui, sans-serif'; ctx.textAlign = 'center';
    const tw = ctx.measureText(t).width + 20;
    ctx.fillStyle = 'rgba(10,12,16,0.75)'; ctx.fillRect(SW / 2 - tw / 2, hy - 44, tw, 26);
    ctx.fillStyle = '#ffe9b0'; ctx.fillText(t, SW / 2, hy - 26);
  }
  // clock + location + objective
  const h = hourOf(s), hh = Math.floor(h), mi = Math.floor((h - hh) * 60), dl = daylight(s);
  ctx.fillStyle = 'rgba(10,12,16,0.6)'; ctx.fillRect(10, 10, 250, 70);
  ctx.textAlign = 'left'; ctx.font = '700 16px system-ui, sans-serif'; ctx.fillStyle = dl < 0.3 ? '#9ab0ff' : '#ffe0a0';
  ctx.fillText(`${dl < 0.3 ? '☾' : '☀'} Day ${dayOf(s)}  ${String(hh).padStart(2, '0')}:${String(mi).padStart(2, '0')}`, 20, 32);
  const w = s.world; const ti = Math.floor(p.y / TILE) * w.w + Math.floor(p.x / TILE);
  const bid = w.bld[ti]; const safe = w.safe[ti];
  ctx.font = '600 12px system-ui, sans-serif'; ctx.fillStyle = safe ? '#9fe09f' : '#bbb';
  ctx.fillText((safe ? 'SAFE ZONE' : bid >= 0 ? w.buildings[bid].name : 'Outside') + (s.weather && s.weather.rain > 0.3 ? '  ·  Raining' : ''), 20, 50);
  const ob = OBJECTIVES[s.obj];
  ctx.fillStyle = '#ffd27a'; ctx.font = '600 12px system-ui, sans-serif';
  ctx.fillText(ob ? `▸ ${ob.text}` : '▸ Survive. Haul. Repeat.', 20, 69);
  // minimap
  const ms = small ? 110 : 170, mx = SW - ms - 12, my = 12;
  ctx.fillStyle = 'rgba(10,12,16,0.7)'; ctx.fillRect(mx - 4, my - 4, ms + 8, ms + 8);
  const big = ui.bigMap;
  const drawMap = (x, y, size, full) => {
    ctx.imageSmoothingEnabled = false;
    if (full) ctx.drawImage(mm.canvas, x, y, size, size);
    else { const span = 64, sx = p.x / TILE - span / 2, sy = p.y / TILE - span / 2; ctx.drawImage(mm.canvas, sx, sy, span, span, x, y, size, size); }
    ctx.imageSmoothingEnabled = true;
    const scale = full ? size / w.w : size / 64, ox = full ? 0 : p.x / TILE - 32, oy = full ? 0 : p.y / TILE - 32;
    const pt = (wx, wy) => [x + (wx / TILE - ox) * scale, y + (wy / TILE - oy) * scale];
    const inside = ([a, b]) => a >= x && b >= y && a <= x + size && b <= y + size;
    if (w.safeCenter) { const q = pt(w.safeCenter.x, w.safeCenter.y); if (inside(q)) { ctx.fillStyle = '#7ae07a'; ctx.fillRect(q[0] - 4, q[1] - 4, 8, 8); } }
    for (const cid of s.loose) { const c = w.containers[cid]; if (c.type !== 'body' || !c.items.length) continue; const q = pt(c.px, c.py); if (inside(q)) { ctx.fillStyle = '#ffd25a'; ctx.font = '700 12px system-ui'; ctx.textAlign = 'center'; ctx.fillText('✕', q[0], q[1] + 4); } }
    const q = pt(p.x, p.y);
    ctx.save(); ctx.translate(q[0], q[1]); ctx.rotate(p.ang); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4); ctx.fill(); ctx.restore();
  };
  ctx.save(); ctx.beginPath(); ctx.rect(mx, my, ms, ms); ctx.clip(); ctx.fillStyle = '#07080a'; ctx.fillRect(mx, my, ms, ms); drawMap(mx, my, ms, false); ctx.restore();
  ctx.fillStyle = '#888'; ctx.font = '600 10px system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.fillText('[M] Map', SW - 14, my + ms + 16);
  if (big) {
    const size = Math.min(SW, SH) - 80, x = SW / 2 - size / 2, y = SH / 2 - size / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(x - 10, y - 10, size + 20, size + 20);
    ctx.fillStyle = '#07080a'; ctx.fillRect(x, y, size, size); drawMap(x, y, size, true);
  }
  // messages
  let my2 = by - 40;
  ctx.textAlign = 'left'; ctx.font = `600 ${small ? 11 : 13}px system-ui, sans-serif`;
  for (let k = ui.messages.length - 1; k >= 0 && k >= ui.messages.length - (small ? 3 : 6); k--) {
    const m = ui.messages[k]; const a = Math.min(1, m.t / 1.5); const slide = Math.max(0, 1 - (7 - m.t) * 6) * -24;
    ctx.save(); ctx.translate(slide, 0);
    ctx.globalAlpha = a; ctx.fillStyle = 'rgba(0,0,0,0.5)'; const tw = ctx.measureText(m.text).width;
    ctx.fillRect(12, my2 - 14, tw + 12, 19); ctx.fillStyle = m.color; ctx.fillText(m.text, 18, my2); my2 -= 22;
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  // crosshair
  if (!ui.panelOpen && !ui.touch) {
    const { x, y } = ui.mouse; const gun = p.wpn && ITEMS[p.wpn.id].cat === 'gun';
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.5; ctx.beginPath();
    const r = gun ? 8 : 5; ctx.moveTo(x - r - 4, y); ctx.lineTo(x - r, y); ctx.moveTo(x + r, y); ctx.lineTo(x + r + 4, y); ctx.moveTo(x, y - r - 4); ctx.lineTo(x, y - r); ctx.moveTo(x, y + r); ctx.lineTo(x, y + r + 4); ctx.stroke();
  }
}
export { CAT_COLOR };
