import { TILE } from '../config.js';
import { T } from '../world/worldgen.js';
import { ITEMS, OBJECTIVES, CAT_COLOR } from '../data/items.js';
import { iconCanvas } from './icons.js';
import { hourOf, dayOf, daylight, weaponList, capacity, carried, gunSpread } from '../sim/sim.js';

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

function stanceIcon(ctx, kind, x, y, col) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.arc(0, 0, 17, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const t = performance.now() / 1000, sw = kind === 'run' ? Math.sin(t * 14) : kind === 'walk' ? Math.sin(t * 8) : 0;
  const pose = {
    stand: { h: [0, -8], hip: [0, 2], k1: [-2, 7], f1: [-2, 11], k2: [2, 7], f2: [2, 11], hand1: [-4, 3], hand2: [4, 3] },
    walk: { h: [0, -8], hip: [0, 2], k1: [-3 * sw, 7], f1: [-4 * sw, 11], k2: [3 * sw, 7], f2: [4 * sw, 11], hand1: [3 * sw, 3], hand2: [-3 * sw, 3] },
    run: { h: [3, -8], hip: [0, 1], k1: [-5 * sw + 1, 6], f1: [-7 * sw, 10], k2: [5 * sw + 1, 6], f2: [7 * sw, 10], hand1: [6 * sw + 3, -1], hand2: [-6 * sw + 3, 1] },
    crouch: { h: [3, -3], hip: [-2, 5], k1: [3, 6], f1: [1, 11], k2: [-5, 9], f2: [-1, 11], hand1: [6, 3], hand2: [3, 4] },
  }[kind];
  ctx.beginPath(); ctx.arc(pose.h[0], pose.h[1], 2.6, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.moveTo(pose.h[0], pose.h[1] + 2.5); ctx.lineTo(pose.hip[0], pose.hip[1]);
  ctx.moveTo(pose.hip[0], pose.hip[1]); ctx.lineTo(pose.k1[0], pose.k1[1]); ctx.lineTo(pose.f1[0], pose.f1[1]);
  ctx.moveTo(pose.hip[0], pose.hip[1]); ctx.lineTo(pose.k2[0], pose.k2[1]); ctx.lineTo(pose.f2[0], pose.f2[1]);
  const sh = [(pose.h[0] + pose.hip[0]) / 2 + pose.h[0] * 0.2, (pose.h[1] + pose.hip[1]) / 2 - 2];
  ctx.moveTo(sh[0], sh[1]); ctx.lineTo(pose.hand1[0], pose.hand1[1]); ctx.moveTo(sh[0], sh[1]); ctx.lineTo(pose.hand2[0], pose.hand2[1]);
  ctx.stroke();
  ctx.font = '700 8px system-ui'; ctx.textAlign = 'center'; ctx.fillText({ stand: 'STILL', walk: 'WALK', run: 'RUN', crouch: 'SNEAK' }[kind], 0, 24);
  ctx.restore();
}
const LOC_INFO = {
  bunker: ['Sealed Room', 'A concrete bunker with an armory inside: two loaded guns, ammo and mods. The Vault needs a police keycard, the Twin-Lock two levers pulled together, the Keypad Bunker a code from four notes nearby.', 'Guarded', '#ffb04a'],
  shed: ['Pump Shed', 'One of two levers that open the Twin-Lock Bunker. Both have to be pulled within 4 seconds.', 'Medium', '#e0c04a'],
  grocery: ['Grocery Store', 'Shelves of food, drinks and energy drinks. A cash register by the door.', 'Medium', '#e0c04a'],
  pharmacy: ['Pharmacy', 'Bandages, painkillers and antibiotics. Worth the detour when you are hurt.', 'Medium', '#e0c04a'],
  hardware: ['Hardware Store', 'Nails, planks, scrap, tape and electronics. Tools, sometimes a sledgehammer.', 'Medium', '#e0c04a'],
  police: ['Police Station', 'Lockers with pistols, shotguns, ammo, vests and helmets. Doors are often locked.', 'High', '#ff9a4a'],
  gas: ['Gas Station', 'Snacks, a fridge, a toolbox and abandoned cars to search.', 'Low', '#9fe09f'],
  hospital: ['Hospital', 'Medical cabinets full of bandages, antibiotics and first aid kits. Crowded with runners and brutes.', 'Very high', '#ff5a4a'],
  military: ['Military Zone', 'Crates of rifles, SMGs, armor, night vision and pipe bombs. Guarded by armored soldier zombies.', 'Extreme', '#ff3a6a'],
  camp: ['Survivor Camp', 'Abandoned tents with supply crates: rations, crossbows, bolts and outdoor gear.', 'Low', '#9fe09f'],
  house: ['House', 'Kitchens, bedrooms and bathrooms. Food, clothes, meds and the odd surprise. Doors may be locked.', 'Low', '#9fe09f'],
};
function locations(w) {
  if (w._locs) return w._locs;
  const L = [];
  for (const b of w.buildings) { if (b.type === 'house' || b.type === 'military' || b.type === 'hospital' || b.type === 'safe' || b.y >= w.cityH) continue; L.push({ x: b.x + b.w / 2, y: b.y + b.h / 2, k: b.type }); }
  for (const z of w.zones) L.push({ x: z.x / TILE, y: z.y / TILE, k: z.kind });
  for (const c of w.containers) { if (!c || c.type !== 'crate') continue; if (w.zones.some((z) => Math.hypot(z.x / TILE - c.x, z.y / TILE - c.y) < 20)) continue; if (L.some((l) => l.k === 'camp' && Math.hypot(l.x - c.x, l.y - c.y) < 8)) continue; L.push({ x: c.x + 0.5, y: c.y + 0.5, k: 'camp' }); }
  return (w._locs = L);
}
function drawLocations(ctx, s, mm, x, y, size, mouse) {
  const w = s.world, sc = size / w.w, known = (l) => mm.explored[Math.floor(l.y) * w.w + Math.floor(l.x)];
  let hover = null, hd = 1e9;
  const mx = (mouse.x - x) / sc, my = (mouse.y - y) / sc, inMap = mx >= 0 && my >= 0 && mx < w.w && my < w.cityH;
  ctx.textAlign = 'center';
  for (const l of locations(w)) {
    if (!known(l)) continue;
    const info = LOC_INFO[l.k]; if (!info) continue;
    const px = x + l.x * sc, py = y + l.y * sc;
    ctx.fillStyle = info[3]; ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, l.k === 'military' || l.k === 'hospital' ? 6 : 4, 0, 7); ctx.fill(); ctx.stroke();
    ctx.font = '700 11px system-ui'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.strokeText(info[0], px, py - 9); ctx.fillStyle = '#f2ece0'; ctx.fillText(info[0], px, py - 9);
    const d = Math.hypot(l.x - mx, l.y - my); if (inMap && d < 7 && d < hd) { hd = d; hover = l; }
  }
  if (!hover && inMap) { const bi = w.bld[Math.floor(my) * w.w + Math.floor(mx)]; if (bi >= 0 && w.buildings[bi].type === 'house' && mm.explored[Math.floor(my) * w.w + Math.floor(mx)]) hover = { k: 'house' }; }
  if (hover) {
    const info = LOC_INFO[hover.k]; const tw = 280;
    ctx.font = '13px system-ui'; const words = info[1].split(' '); const lines = []; let line = '';
    for (const wd of words) { if (ctx.measureText(line + wd).width > tw - 20) { lines.push(line); line = ''; } line += wd + ' '; } lines.push(line);
    const th = 50 + lines.length * 17; let bx = mouse.x + 16, by = mouse.y + 12; if (bx + tw > window.innerWidth) bx = mouse.x - tw - 16; if (by + th > window.innerHeight) by = mouse.y - th - 12;
    ctx.fillStyle = 'rgba(14,16,20,0.96)'; ctx.strokeStyle = info[3]; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(bx, by, tw, th, 8); ctx.fill(); ctx.stroke();
    ctx.textAlign = 'left'; ctx.font = '700 15px system-ui'; ctx.fillStyle = '#f2ece0'; ctx.fillText(info[0], bx + 12, by + 22);
    ctx.font = '700 11px system-ui'; ctx.fillStyle = info[3]; ctx.textAlign = 'right'; ctx.fillText('Danger: ' + info[2], bx + tw - 12, by + 22); ctx.textAlign = 'left';
    ctx.font = '13px system-ui'; ctx.fillStyle = '#cfcac0'; lines.forEach((ln, i) => ctx.fillText(ln, bx + 12, by + 44 + i * 17));
  }
  // legend
  ctx.textAlign = 'center'; ctx.font = '600 12px system-ui'; ctx.fillStyle = '#bbb';
  ctx.fillText('Hover a place for details  ·  green smoke: extraction  ·  ■ dropped backpack  ·  ✕ a body  ·  [M] close', x + size / 2, y + size + 2 - 6 + 18);
}
function statIcon(ctx, kind, x, y, col, sc) {
  ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); ctx.fillStyle = col; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; ctx.beginPath();
  if (kind === 'hp') { ctx.moveTo(0, 5); ctx.bezierCurveTo(-8, -1, -5, -7, 0, -3); ctx.bezierCurveTo(5, -7, 8, -1, 0, 5); }
  else if (kind === 'food') { ctx.ellipse(-1.5, -1.5, 4.5, 3.8, -0.6, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#f0e8d8'; ctx.beginPath(); ctx.moveTo(1.5, 1); ctx.lineTo(5, 4.5); ctx.arc(5.5, 5.5, 1.4, 0, 7); }
  else if (kind === 'water') { ctx.moveTo(0, -6); ctx.bezierCurveTo(3, -2, 5, 0, 5, 2); ctx.arc(0, 2, 5, 0, Math.PI); ctx.bezierCurveTo(-5, 0, -3, -2, 0, -6); }
  else { ctx.moveTo(2, -6); ctx.lineTo(-4, 1); ctx.lineTo(0, 1); ctx.lineTo(-2, 6); ctx.lineTo(4, -1); ctx.lineTo(0, -1); ctx.closePath(); }
  ctx.fill(); ctx.stroke(); ctx.restore();
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
  if (p.reviving) { prog = p.reviving.t / p.reviving.dur; ptxt = 'Reviving... keep holding [E]'; }
  else if (p.extractT > 0) { prog = p.extractT / (p.downed ? 2 : 4); ptxt = 'Extracting...'; }
  else if (p.search) { prog = p.search.t / p.search.dur; ptxt = 'Searching...'; }
  else if (p.channel) { prog = p.channel.t / p.channel.dur; ptxt = `Using ${ITEMS[p.channel.id].name}...`; }
  else if (p.pry) { prog = p.pry.t / p.pry.dur; ptxt = 'Prying the door...'; }
  else if (p.climb) { prog = p.climb.t / p.climb.dur; ptxt = 'Climbing...'; }
  // reloads get a quick bar over the head instead of the ring: a tick runs across it, and it flashes when the gun is ready
  const wdh = p.wpn && ITEMS[p.wpn.id];
  if (p.reload > 0 && wdh && prog === null) {
    const k = 1 - p.reload / wdh.reload, bw = 46, x0 = ps.x - bw / 2, y0 = ps.y - 34;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x0 - 2, y0 - 2, bw + 4, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x0, y0, bw, 4);
    ctx.fillStyle = '#ffd27a'; ctx.fillRect(x0, y0, bw * k, 4);
    ctx.fillStyle = '#fff'; ctx.fillRect(x0 + bw * k - 1, y0 - 3, 2, 10);
  } else if (wdh && wdh.cat === 'gun' && p.wpn.mag <= 0 && !p.dead && prog === null && (performance.now() % 700) < 450) {
    ctx.font = '800 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText('RELOAD [R]', ps.x + 1, ps.y - 29);
    ctx.fillStyle = '#ffd27a'; ctx.fillText('RELOAD [R]', ps.x, ps.y - 30);
  }
  if (prog !== null) {
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(ps.x, ps.y, 26, 0, 7); ctx.stroke();
    ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(ps.x, ps.y, 26, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(ptxt, ps.x, ps.y - 34);
  }
  // downed: the world goes red and the clock is all that matters
  if (p.downed) {
    const k = Math.max(0, p.downed.t / p.downed.max), pulse = 0.5 + 0.5 * Math.sin(performance.now() / 200);
    const g = ctx.createRadialGradient(SW / 2, SH / 2, Math.min(SW, SH) * 0.2, SW / 2, SH / 2, Math.max(SW, SH) * 0.65);
    g.addColorStop(0, 'rgba(90,0,0,0.15)'); g.addColorStop(1, `rgba(120,0,0,${0.55 + pulse * 0.15})`); ctx.fillStyle = g; ctx.fillRect(0, 0, SW, SH);
    ctx.textAlign = 'center'; ctx.font = '900 30px system-ui, sans-serif'; ctx.fillStyle = '#ff5a4a'; ctx.fillText(`DOWNED · ${Math.ceil(p.downed.t)} s`, SW / 2, SH * 0.3);
    ctx.font = '600 14px system-ui, sans-serif'; ctx.fillStyle = '#f2e0d0';
    const mate = Object.values(s.players).some((q) => q !== p && q.inRaid && !q.dead && !q.downed);
    ctx.fillText(mate ? 'Crawl toward your partner. They can hold [E] on you to revive.' : 'Crawl to the green smoke before you bleed out. Getting hit costs you seconds.', SW / 2, SH * 0.3 + 24);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(SW / 2 - 150, SH * 0.3 + 36, 300, 8); ctx.fillStyle = '#ff5a4a'; ctx.fillRect(SW / 2 - 150, SH * 0.3 + 36, 300 * k, 8);
  }
  // a partner who is down: their bleed-out ring
  for (const id in s.players) {
    const m = s.players[id]; if (m === p || !m.downed || m.dead) continue;
    const q = rend.worldToScreen(m.x, m.y), k = Math.max(0, m.downed.t / m.downed.max);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(q.x, q.y, 22, 0, 7); ctx.stroke();
    ctx.strokeStyle = '#ff5a4a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(q.x, q.y, 22, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.stroke();
    ctx.font = '800 11px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#ff8a7a'; ctx.fillText(`DOWN ${Math.ceil(m.downed.t)}s`, q.x, q.y - 28);
  }
  // raid clock, top centre
  {
    let t, col;
    if (s.raid && p.inRaid) { const left = s.raid.len - s.raid.t, a = Math.abs(left); t = `${left < 0 ? 'OVERTIME +' : 'RAID '}${Math.floor(a / 60)}:${String(Math.floor(a % 60)).padStart(2, '0')}`; col = left < 0 ? (performance.now() % 600 < 300 ? '#ff3a2a' : '#ff8a6a') : left < 120 ? '#ffb070' : '#f2ece0'; }
    else if (s.raid) { t = 'Your partner is still out there · ride the bus to join them'; col = '#ffd27a'; }
    else { const on = Object.values(s.players).filter((q) => q.boarded).length, all = Object.keys(s.players).length; t = on ? `On the bus ${on}/${all} · waiting for everyone` : 'OUTPOST · board the bus to raid'; col = '#9fe09f'; }
    ctx.font = `800 ${s.raid && p.inRaid ? 20 : 14}px system-ui, sans-serif`; ctx.textAlign = 'center';
    const tw = ctx.measureText(t).width + 24, ty = 44;
    ctx.fillStyle = 'rgba(10,12,16,0.7)'; ctx.fillRect(SW / 2 - tw / 2, ty, tw, 30); ctx.fillStyle = col; ctx.fillText(t, SW / 2, ty + 21);
  }
  // the way out: an arrow at the screen edge toward the green smoke
  if (s.raid && p.inRaid && s.world.extract) {
    const e = s.world.extract, q = rend.worldToScreen(e.x, e.y), m = 70;
    if (q.x < m || q.y < m || q.x > SW - m || q.y > SH - m) {
      const ang = Math.atan2(q.y - SH / 2, q.x - SW / 2), k = Math.min((SW / 2 - m) / Math.abs(Math.cos(ang) || 1e-6), (SH / 2 - m) / Math.abs(Math.sin(ang) || 1e-6));
      const ax = SW / 2 + Math.cos(ang) * k, ay = SH / 2 + Math.sin(ang) * k;
      ctx.save(); ctx.translate(ax, ay); ctx.rotate(ang); ctx.fillStyle = '#5aff7a'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(-8, -10); ctx.lineTo(-3, 0); ctx.lineTo(-8, 10); ctx.closePath(); ctx.stroke(); ctx.fill(); ctx.restore();
      ctx.fillStyle = '#5aff7a'; ctx.font = '800 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`EXIT ${Math.round(Math.hypot(e.x - p.x, e.y - p.y) / TILE)} m`, ax - Math.cos(ang) * 26, ay - Math.sin(ang) * 26 + 4);
    }
  }
  // bars
  const bx = 16, by = SH - 96;
  ctx.fillStyle = 'rgba(10,12,16,0.55)'; ctx.fillRect(bx - 8, by - 26, 212, 112);
  const D = ui.disp || (ui.disp = { hp: p.hp, trail: p.hp, hunger: p.hunger, thirst: p.thirst, st: p.stamina });
  const k = Math.min(1, ui.dt * 10);
  D.hp += (p.hp - D.hp) * k; D.hunger += (p.hunger - D.hunger) * k; D.thirst += (p.thirst - D.thirst) * k; D.st += (p.stamina - D.st) * k;
  D.trail = D.trail > D.hp ? Math.max(D.hp, D.trail - ui.dt * 25) : D.hp;
  const lowSt = p.stamina < 15 && performance.now() % 500 < 250;
  bar(ctx, bx + 20, by, 176, D.hp, p.hp < 30 ? '#e03a3a' : '#c94a4a', '', D.trail);
  bar(ctx, bx + 20, by + 16, 176, D.hunger, '#d08a3a', '');
  bar(ctx, bx + 20, by + 32, 176, D.thirst, '#3a8ad0', '');
  bar(ctx, bx + 20, by + 48, 176, D.st, lowSt ? '#ff6a3a' : '#c9c04a', '');
  const beat = p.hp < 35 ? 1 + Math.max(0, Math.sin(performance.now() / 160)) * 0.18 : 1;
  statIcon(ctx, 'hp', bx + 8, by + 6, p.hp < 30 ? '#ff4a4a' : '#e05a5a', beat);
  statIcon(ctx, 'food', bx + 8, by + 22, p.hunger < 20 ? '#ffb05a' : '#e09a4a', 1);
  statIcon(ctx, 'water', bx + 8, by + 38, p.thirst < 20 ? '#7ac8ff' : '#4a9ae0', 1);
  statIcon(ctx, 'st', bx + 8, by + 54, lowSt ? '#ff7a3a' : '#e0d04a', 1);
  const wt = carried(p), cap = capacity(p);
  ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'left';
  ctx.fillStyle = wt > cap ? '#ff8a6a' : '#bbb'; ctx.fillText(`Carry ${wt.toFixed(1)} / ${cap}`, bx, by + 76);
  stanceIcon(ctx, p.sneak ? 'crouch' : p.sprinting ? 'run' : p.moving ? 'walk' : 'stand', bx + 232, by + 26, p.sneak ? '#9ab0ff' : p.sprinting ? '#ffb05a' : '#ddd');
  const hunted = s.zombies.some((z) => z.state === 'chase' && z.pid === p.id && Math.abs(z.x - p.x) < 600 && Math.abs(z.y - p.y) < 600);
  const v = p.vis ?? 1;
  const [vt, vc] = hunted ? ['DETECTED', '#ff5a4a'] : v < 0.4 ? ['HIDDEN', '#7ad07a'] : v < 0.8 ? ['LOW PROFILE', '#d0c04a'] : ['EXPOSED', '#ffa05a'];
  ctx.textAlign = 'right'; ctx.fillStyle = vc; ctx.fillText(`◉ ${vt}`, bx + 196, by + 76); ctx.textAlign = 'left';
  const tags = [];
  if (p.bleeding) tags.push(['BLEEDING', '#ff5a5a']);
  if (p.infection > 0) tags.push([`INFECTED ${Math.round(p.infection)}%`, '#b6ff5a']);
  if (wt > cap) tags.push(['OVERLOADED', '#ff9a5a']);
  for (const [k, v] of Object.entries(p.buffs || {})) tags.push([`${k === 'adrenaline' ? 'ADRENALINE' : 'ENERGY'} ${Math.ceil(v)}s`, k === 'adrenaline' ? '#ff7a7a' : '#5ad0c8']);
  if (p.inv.some((i) => i.id === 'reviver')) tags.push(['REVIVE READY', '#ff6ab0']);
  if (p.hunger < 20) tags.push(['STARVING', '#ffb05a']);
  if (p.thirst < 20) tags.push(['THIRSTY', '#5ab0ff']);
  let tx = bx; ctx.font = '700 10px system-ui, sans-serif';
  for (const [t, c] of tags) { const tw = ctx.measureText(t).width + 10; ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(tx, by - 20, tw, 15); ctx.fillStyle = c; ctx.fillText(t, tx + 5, by - 9); tx += tw + 4; }
  // hotbar
  const wl = weaponList(p);
  const slot = small ? 38 : 54, gap = small ? 4 : 6, hw = 6 * (slot + gap) - gap, hx = small ? Math.max(230, SW / 2 - hw / 2) : SW / 2 - hw / 2, hy = SH - slot - (small ? 8 : 14);
  ui.selPop = Math.max(0, (ui.selPop || 0) - ui.dt * 5);
  // prompt
  if (ui.interact && !p.search && !ui.panelOpen) {
    const canPeek = ui.interact.label === 'Open Door' || ui.interact.label === 'Open Window';
    const t = p.peek ? 'Peeking: release [Q] to let go' : `[E] ${ui.interact.label}` + (canPeek ? '   [Q] Peek' : '') + (ui.interact.kind === 'door' && ui.interact.label === 'Open Door' ? '   [B] Barricade' : ''); ctx.font = '600 14px system-ui, sans-serif'; ctx.textAlign = 'center';
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
  const zn = w.zones.find((z) => Math.hypot(z.x - p.x, z.y - p.y) < z.r);
  ctx.fillText((safe ? 'OUTPOST · SAFE' : bid >= 0 ? w.buildings[bid].name : zn ? zn.name : 'The City') + (s.weather && s.weather.rain > 0.3 ? '  ·  Raining' : ''), 20, 50);
  const ob = OBJECTIVES[s.obj];
  ctx.fillStyle = '#ffd27a'; ctx.font = '600 12px system-ui, sans-serif';
  ctx.fillText(ob ? `▸ ${ob.text}` : '▸ Survive. Haul. Repeat.', 20, 69);
  // minimap
  const ms = small ? 110 : 170, mx = SW - ms - 12, my = 12;
  ctx.fillStyle = 'rgba(10,12,16,0.7)'; ctx.fillRect(mx - 4, my - 4, ms + 8, ms + 8);
  const big = ui.bigMap;
  const drawMap = (x, y, size, full) => {
    ctx.imageSmoothingEnabled = false;
    if (full) ctx.drawImage(mm.canvas, 0, 0, w.w, w.cityH, x, y, size, size); // the big map is the city; the outpost is off its edge
    else { const span = 64, sx = p.x / TILE - span / 2, sy = p.y / TILE - span / 2; ctx.drawImage(mm.canvas, sx, sy, span, span, x, y, size, size); }
    ctx.imageSmoothingEnabled = true;
    const scale = full ? size / w.w : size / 64, ox = full ? 0 : p.x / TILE - 32, oy = full ? 0 : p.y / TILE - 32;
    const pt = (wx, wy) => [x + (wx / TILE - ox) * scale, y + (wy / TILE - oy) * scale];
    const inside = ([a, b]) => a >= x && b >= y && a <= x + size && b <= y + size;
    if (s.raid && w.extract) { const q = pt(w.extract.x, w.extract.y); if (inside(q)) { const r = 4 + (performance.now() % 1000) / 250; ctx.fillStyle = '#5aff7a'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, 7); ctx.fill(); ctx.stroke(); if (full) { ctx.font = '800 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText('EXTRACTION', q[0], q[1] - 10); } } }
    if (s.raid && w.insert && full) { const q = pt(w.insert.x, w.insert.y); if (inside(q)) { ctx.fillStyle = '#ffd27a'; ctx.fillRect(q[0] - 3, q[1] - 3, 6, 6); ctx.font = '700 10px system-ui'; ctx.textAlign = 'center'; ctx.fillText('BUS STOP', q[0], q[1] - 8); } }
    for (const cid of s.loose) { const c = w.containers[cid]; if (!c || c.type !== 'pile' || !c.items || !c.items.length) continue; const q = pt(c.px, c.py); if (inside(q)) { ctx.fillStyle = '#c89a5a'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.fillRect(q[0] - 3, q[1] - 3, 6, 6); ctx.strokeRect(q[0] - 3, q[1] - 3, 6, 6); } }
    for (const cid of s.loose) { const c = w.containers[cid]; if (!c || c.type !== 'body' || !c.items.length) continue; const q = pt(c.px, c.py); if (inside(q)) { ctx.fillStyle = '#ffd25a'; ctx.font = '700 12px system-ui'; ctx.textAlign = 'center'; ctx.fillText('✕', q[0], q[1] + 4); } }
    const q = pt(p.x, p.y);
    ctx.save(); ctx.translate(q[0], q[1]); ctx.rotate(p.ang); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4); ctx.fill(); ctx.restore();
    for (const id in s.players) { // partner, pinned to the edge of the minimap when out of range
      const m = s.players[id]; if (m === p || m.dead) continue;
      const a = pt(m.x, m.y), ax = Math.max(x + 5, Math.min(x + size - 5, a[0])), ay = Math.max(y + 5, Math.min(y + size - 5, a[1]));
      ctx.fillStyle = '#7ae0a0'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(ax, ay, 4.5, 0, 7); ctx.fill(); ctx.stroke();
    }
  };
  ctx.save(); ctx.beginPath(); ctx.rect(mx, my, ms, ms); ctx.clip(); ctx.fillStyle = '#07080a'; ctx.fillRect(mx, my, ms, ms); drawMap(mx, my, ms, false); ctx.restore();
  ctx.fillStyle = '#888'; ctx.font = '600 10px system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.fillText('[M] Map', SW - 14, my + ms + 16);
  if (big) {
    const size = Math.min(SW, SH) - 110, x = SW / 2 - size / 2, y = SH / 2 - size / 2 - 12;
    ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(x - 10, y - 10, size + 20, size + 20);
    ctx.fillStyle = '#07080a'; ctx.fillRect(x, y, size, size); drawMap(x, y, size, true);
    drawLocations(ctx, s, mm, x, y, size, ui.mouse);
  }
  // arrow at the screen edge pointing to a partner who is off-screen
  for (const id in s.players) {
    const m = s.players[id]; if (m === p || m.dead) continue;
    const q = rend.worldToScreen(m.x, m.y), e = 60;
    if (q.x > e && q.y > e && q.x < SW - e && q.y < SH - e) continue;
    const ang = Math.atan2(q.y - SH / 2, q.x - SW / 2), k = Math.min((SW / 2 - e) / Math.abs(Math.cos(ang) || 1e-6), (SH / 2 - e) / Math.abs(Math.sin(ang) || 1e-6));
    const ax = SW / 2 + Math.cos(ang) * k, ay = SH / 2 + Math.sin(ang) * k;
    ctx.save(); ctx.translate(ax, ay); ctx.rotate(ang); ctx.fillStyle = '#7ae0a0'; ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(-7, -9); ctx.lineTo(-3, 0); ctx.lineTo(-7, 9); ctx.fill(); ctx.restore();
    ctx.fillStyle = '#7ae0a0'; ctx.font = '700 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`${Math.round(Math.hypot(m.x - p.x, m.y - p.y) / TILE)} m`, ax - Math.cos(ang) * 22, ay - Math.sin(ang) * 22 + 4);
  }
  // sound pings: where unseen zombie noises come from
  for (const g of ui.pings) {
    g.t -= ui.dt; const a = Math.min(1, g.t), q = rend.worldToScreen(g.x, g.y);
    const col = g.danger ? '255,90,70' : '225,225,205', m = 46;
    if (q.x < m || q.y < m || q.x > SW - m || q.y > SH - m) {
      const ang = Math.atan2(q.y - SH / 2, q.x - SW / 2);
      const k = Math.min((SW / 2 - m) / Math.abs(Math.cos(ang) || 1e-6), (SH / 2 - m) / Math.abs(Math.sin(ang) || 1e-6));
      ctx.save(); ctx.translate(SW / 2 + Math.cos(ang) * k, SH / 2 + Math.sin(ang) * k); ctx.rotate(ang);
      ctx.fillStyle = `rgba(${col},${0.85 * a})`; ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-6, -8); ctx.lineTo(-2, 0); ctx.lineTo(-6, 8); ctx.fill(); ctx.restore();
    } else {
      ctx.strokeStyle = `rgba(${col},${0.7 * a})`; ctx.lineWidth = 2;
      for (let j = 0; j < 2; j++) { ctx.beginPath(); ctx.arc(q.x, q.y, 6 + ((1.8 - g.t) * 26 + j * 10) % 30, 0, 7); ctx.stroke(); }
    }
  }
  ui.pings = ui.pings.filter((g) => g.t > 0);
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
    const { x, y } = ui.aim || ui.mouse; const gun = p.wpn && ITEMS[p.wpn.id].cat === 'gun';
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.5; ctx.beginPath();
    const wd = gun ? ITEMS[p.wpn.id] : null;
    const target = gun ? 6 + gunSpread(p, wd) * 260 : 5;
    ui.crossR = (ui.crossR ?? target) + (target - (ui.crossR ?? target)) * Math.min(1, ui.dt * 18); // eases open and closed
    const r = ui.crossR; ctx.moveTo(x - r - 4, y); ctx.lineTo(x - r, y); ctx.moveTo(x + r, y); ctx.lineTo(x + r + 4, y); ctx.moveTo(x, y - r - 4); ctx.lineTo(x, y - r); ctx.moveTo(x, y + r); ctx.lineTo(x, y + r + 4); ctx.stroke();
  }
}
export { CAT_COLOR };
