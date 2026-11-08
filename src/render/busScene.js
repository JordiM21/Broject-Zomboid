// The bus ride, seen from above with the roof off. Bus space: x 0..BW across, y 0..BL nose to tail, the bus never moves;
// the road, trees, wrecks and the dead scroll past it. The Renderer's camera is pointed at this space while you ride,
// so the mouse (screenToWorld) and aiming keep working inside the bus.
import { BW, BL, SEATS, DRIVER, DOOR, busPose, tripLength } from '../sim/bus.js';
import { daylight } from '../sim/sim.js';
import { zombieFrame, FRAME_SIZE } from './sprites.js';

const REF = BL / 2; // the bus's middle sits at scroll distance `off`
const CELL = 60, ROAD0 = -40, ROAD1 = BW + 40;
const h1 = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
const ZTYPE = ['walker', 'walker', 'runner', 'walker', 'brute'];

// what you are driving through at distance u along the trip
function zoneAt(dir, u, D) {
  if (dir === 'out') return u < 900 ? 'yard' : u < D - 1300 ? 'forest' : 'city';
  return u < 1000 ? 'city' : u < D - 1000 ? 'forest' : 'yard';
}

export function drawBusScene(r, s, localId, ui) {
  const ctx = r.ctx, p = s.players[localId], b = p.bus, dpr = r.dpr, SW = innerWidth, SH = innerHeight;
  const st = r.busSt || (r.busSt = { prev: 0, spray: [], hit: new Set(), proxies: new WeakMap(), key: '' });
  const key = b.dir + (s.raidNo || 0);
  if (st.key !== key) { st.key = key; st.prev = 0; st.spray = []; st.hit.clear(); }
  const dt = Math.min(0.1, ui.dt || 0.016); r.time += dt; r.dt = dt;
  const pose = busPose(b), dir = b.dir, D = tripLength(dir), off = pose.d;
  const dl = s ? daylight(s) : 1;
  // camera: the whole bus fits on screen; the view rides gently with whoever you are
  r.rot = 0;
  r.cam.zoom = Math.max(0.8, Math.min(2.4, SH / (BL + 110), SW / (BW + 300)));
  const z = r.cam.zoom;
  r.cam.x = BW / 2 + 22; r.cam.y = BL / 2 + (Math.max(0, p.by - BL / 2) * 0.1);
  r.shake = Math.max(0, r.shake - dt * 30);
  const bump = pose.moving ? 0.5 + pose.v / 300 : 0;
  const sx = (Math.random() - 0.5) * (r.shake + bump), sy = (Math.random() - 0.5) * (r.shake + bump);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#0b0d10'; ctx.fillRect(0, 0, SW, SH);
  r.toWorld(ctx, r.cam.x + sx / z, r.cam.y + sy / z);
  const x0 = r.cam.x - SW / 2 / z - 40, x1 = r.cam.x + SW / 2 / z + 40, y0 = r.cam.y - SH / 2 / z - 40, y1 = r.cam.y + SH / 2 / z + 40;
  const yOf = (u) => REF - (u - off); // up the screen is further along
  const u0 = off + REF - y1, u1 = off + REF - y0;

  // ----- ground and road, by zone -----
  const i0 = Math.floor(u0 / CELL) - 1, i1 = Math.ceil(u1 / CELL) + 1;
  for (let i = i0; i <= i1; i++) {
    const uc = i * CELL, zone = zoneAt(dir, uc + CELL / 2, D), y = yOf(uc + CELL);
    const grass = zone === 'city' ? '#3a3e38' : zone === 'yard' ? '#4d4630' : '#2f4a2b';
    ctx.fillStyle = grass; ctx.fillRect(x0, y, x1 - x0, CELL + 1);
    ctx.fillStyle = zone === 'yard' ? '#6a573a' : zone === 'forest' ? '#57493a' : '#2a2c2f'; ctx.fillRect(ROAD0, y, ROAD1 - ROAD0, CELL + 1);
    if (zone === 'city') { // sidewalks and lane markings
      ctx.fillStyle = '#5b5c58'; ctx.fillRect(ROAD0 - 38, y, 38, CELL + 1); ctx.fillRect(ROAD1, y, 38, CELL + 1);
      ctx.fillStyle = '#c9b84a'; ctx.fillRect(BW / 2 - 1, y + 8, 2, 30); ctx.fillStyle = 'rgba(230,230,220,0.5)'; ctx.fillRect(ROAD0 + 2, y, 2, CELL + 1); ctx.fillRect(ROAD1 - 4, y, 2, CELL + 1);
    } else { // ruts in the dirt
      ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.fillRect(BW * 0.25 - 6, y, 12, CELL + 1); ctx.fillRect(BW * 0.75 - 6, y, 12, CELL + 1);
      for (let k = 0; k < 3; k++) { const a = h1(i, 20 + k); ctx.fillStyle = zone === 'yard' ? 'rgba(90,80,50,0.5)' : 'rgba(40,70,36,0.55)'; ctx.fillRect(x0 + a * (x1 - x0), y + h1(i, 30 + k) * CELL, 14, 8); }
    }
  }
  // the outpost fence and the gate
  const gateU = dir === 'out' ? 700 : D - 800;
  for (let i = i0; i <= i1; i++) {
    const u = i * CELL, zone = zoneAt(dir, u + CELL / 2, D), inGateZone = dir === 'out' ? u < gateU - 20 : u > gateU + 20;
    if (zone === 'yard' && inGateZone) for (const fx of [ROAD0 - 34, ROAD1 + 34]) { const y = yOf(u + CELL / 2); ctx.fillStyle = '#3a3026'; ctx.fillRect(fx - 2, y - 4, 4, 8); ctx.fillStyle = 'rgba(160,160,150,0.55)'; ctx.fillRect(fx - 0.5, y - CELL / 2, 1, CELL); }
  }
  if (gateU > u0 - 100 && gateU < u1 + 100) {
    const y = yOf(gateU); ctx.fillStyle = '#5a5e62'; ctx.fillRect(ROAD0 - 44, y - 10, 20, 20); ctx.fillRect(ROAD1 + 24, y - 10, 20, 20);
    ctx.fillStyle = '#8a8e92'; ctx.fillRect(ROAD0 - 40, y - 6, 12, 12); ctx.fillRect(ROAD1 + 28, y - 6, 12, 12);
    ctx.fillStyle = '#7a6a3a'; ctx.save(); ctx.translate(ROAD0 - 24, y); ctx.rotate(dir === 'out' ? -0.5 : 0.5); ctx.fillRect(0, -2, 34, 4); ctx.restore(); ctx.save(); ctx.translate(ROAD1 + 24, y); ctx.rotate(dir === 'out' ? 0.5 : -0.5); ctx.fillRect(-34, -2, 34, 4); ctx.restore();
  }
  // things beside the road, cell by cell
  const kills = [];
  for (let i = i0; i <= i1; i++) {
    const u = i * CELL, zone = zoneAt(dir, u + CELL / 2, D);
    for (const side of [-1, 1]) {
      const k = side > 0 ? 7 : 0, a = h1(i, 1 + k), c = h1(i, 2 + k), y = yOf(u + a * CELL), edge = side < 0 ? ROAD0 : ROAD1;
      if (zone === 'forest') {
        for (let t = 0; t < 2; t++) {
          const rr = 16 + h1(i, 3 + k + t) * 18, xx = edge + side * (24 + h1(i, 4 + k + t) * 150), yy = yOf(u + h1(i, 5 + k + t) * CELL);
          ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.arc(xx + 5, yy + 6, rr, 0, 7); ctx.fill();
          ctx.fillStyle = t ? '#2a4d2a' : '#23421f'; ctx.beginPath(); ctx.arc(xx, yy, rr, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(120,170,80,0.25)'; ctx.beginPath(); ctx.arc(xx - rr * 0.25, yy - rr * 0.25, rr * 0.55, 0, 7); ctx.fill();
        }
        if (c > 0.82) { ctx.fillStyle = '#4d6a3a'; ctx.beginPath(); ctx.arc(edge + side * 18, y, 8, 0, 7); ctx.fill(); }
      } else if (zone === 'yard') {
        if (c > 0.7) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(edge + side * 60 - 18 + 4, y - 14 + 4, 36, 28); ctx.fillStyle = c > 0.85 ? '#5d6b44' : '#8a7040'; ctx.fillRect(edge + side * 60 - 18, y - 14, 36, 28); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(edge + side * 60 - 18, y - 1, 36, 2); }
      } else { // city: roofs behind the sidewalk, wrecks and lamps by the kerb
        if (i % 3 === 0) { const bw = 90 + h1(i, 10 + k) * 70, ytop = yOf(u + CELL * 3);
          const xx = side < 0 ? ROAD0 - 46 - bw : ROAD1 + 46; ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(xx + 6, ytop + 6, bw, CELL * 3); ctx.fillStyle = ['#5a4a46', '#46505a', '#58584a', '#4a4a52', '#5e5448'][Math.floor(h1(i, 11 + k) * 5)]; ctx.fillRect(xx, ytop, bw, CELL * 3);
          ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(xx + 4, ytop + 4, bw - 8, 5); ctx.fillStyle = 'rgba(0,0,0,0.22)'; for (let q = 0; q < 3; q++) ctx.fillRect(xx + 12 + q * (bw / 3), ytop + 20, 14, 14); }
        if (c > 0.55 && c < 0.7) { // a dead car on the shoulder
          const cx = side < 0 ? ROAD0 + 2 : ROAD1 - 30, cy = y - 22;
          ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(cx + 3, cy + 3, 28, 46); ctx.fillStyle = ['#7a2a2a', '#2a4a6a', '#6a6a6a', '#4a5a3a'][Math.floor(a * 4)]; ctx.beginPath(); ctx.roundRect(cx, cy, 28, 46, 6); ctx.fill();
          ctx.fillStyle = 'rgba(150,190,210,0.5)'; ctx.fillRect(cx + 4, cy + 10, 20, 8); ctx.fillRect(cx + 4, cy + 28, 20, 8);
          if (c > 0.64) { for (let q = 0; q < 3; q++) { const fl = Math.sin(r.time * (9 + q * 3) + q + i) * 0.5 + 0.5; ctx.fillStyle = ['rgba(255,90,20,0.8)', 'rgba(255,170,50,0.8)', 'rgba(255,230,140,0.85)'][q]; ctx.beginPath(); ctx.arc(cx + 14 + Math.sin(r.time * 5 + q) * 2, cy + 22 - q * 3, (10 - q * 2.5) * (0.8 + fl * 0.3), 0, 7); ctx.fill(); } }
        }
        if (c < 0.12) { ctx.fillStyle = '#2b2b2b'; ctx.fillRect(edge + side * 30 - 2, y - 2, 4, 4); ctx.fillStyle = 'rgba(255,230,160,0.9)'; ctx.beginPath(); ctx.arc(edge + side * 30, y, 2.5, 0, 7); ctx.fill(); }
        // the dead along the sidewalk, reaching for the bus; and a few in the road that the bus runs down
        if (h1(i, 40 + k) > 0.55) {
          const id = (i + 50000) * 2 + (side > 0 ? 1 : 0), /* never negative: it picks the zombie's look */ zy = yOf(u + h1(i, 41 + k) * CELL), zx = edge + side * (10 + h1(i, 42 + k) * 36), type = ZTYPE[Math.floor(h1(i, 43 + k) * 5)];
          const face = Math.atan2(REF - zy, BW / 2 - zx);
          const fr = zombieFrame(type, id, 'walk', (r.time * 0.9 + id * 0.31) % 1);
          ctx.save(); ctx.translate(zx, zy); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(2, 3, 11, 9, 0, 0, 7); ctx.fill(); ctx.rotate(face); ctx.drawImage(fr, -FRAME_SIZE / 2, -FRAME_SIZE / 2, FRAME_SIZE, FRAME_SIZE); ctx.restore();
        }
      }
    }
    if (zone === 'city' && h1(i, 60) > 0.62) { // run down: struck at the nose, thrown clear, left in a smear
      const id = 300000 + i, ux = u + h1(i, 61) * CELL, x = 14 + h1(i, 62) * 92, type = ZTYPE[Math.floor(h1(i, 63) * 5)], dn = off + REF - ux; // > 0 once the nose (y = 0) has reached it
      const side = x < BW / 2 ? -1 : 1, yy = yOf(ux);
      if (dn < 0) { // still standing in the road, turning to look
        const fr = zombieFrame(type, id, 'walk', (r.time * 0.8 + id * 0.17) % 1);
        ctx.save(); ctx.translate(x, yy); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(2, 3, 11, 9, 0, 0, 7); ctx.fill(); ctx.rotate(Math.PI / 2 + Math.sin(id) * 0.4); ctx.drawImage(fr, -FRAME_SIZE / 2, -FRAME_SIZE / 2, FRAME_SIZE, FRAME_SIZE); ctx.restore();
        if (dn > -24 && !st.hit.has(id) && pose.moving) kills.push([id, x, yy, side]);
      } else {
        const k = Math.min(1, dn / 70), e = 1 - (1 - k) * (1 - k), tx = side < 0 ? -26 - h1(i, 64) * 14 : BW + 26 + h1(i, 64) * 14, xx = x + (tx - x) * e;
        ctx.fillStyle = 'rgba(110,8,8,0.55)'; ctx.beginPath(); ctx.ellipse(x, yy, 12, 7, 0.2, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(110,8,8,0.4)'; ctx.fillRect(Math.min(x, xx), yy - 2, Math.abs(xx - x), 4);
        const fr = zombieFrame(type, id, 'death', 1);
        ctx.save(); ctx.translate(xx, yy + dn * 0.25 * (1 - k)); ctx.rotate(side * (1 - k) * 5 + side * 1.4); ctx.drawImage(fr, -FRAME_SIZE / 2, -FRAME_SIZE / 2, FRAME_SIZE, FRAME_SIZE); ctx.restore();
      }
    }
  }
  for (const [id, x, y, side] of kills) { // the bump: shake, a spray of blood, a thump for the speakers
    st.hit.add(id); r.shake = Math.max(r.shake, 7); ui.busThump = true;
    for (let n = 0; n < 12; n++) st.spray.push({ x, y, vx: side * (30 + Math.random() * 130), vy: (Math.random() - 0.5) * 140 + 90, life: 0.7 + Math.random() * 0.4 });
  }
  for (const q of st.spray) { q.life -= dt; q.x += q.vx * dt; q.y += (q.vy + pose.v) * dt; ctx.fillStyle = `rgba(120,8,8,${Math.max(0, q.life)})`; ctx.fillRect(q.x - 1.5, q.y - 1.5, 3, 3); }
  st.spray = st.spray.filter((q) => q.life > 0);
  st.prev = off;

  // ----- the bus -----
  const braking = pose.moving && pose.v < 140 && b.t > 4;
  ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fillRect(8, 8, BW, BL);
  for (const ty of [48, 92, 252, 296]) { ctx.fillStyle = '#16181a'; ctx.fillRect(-5, ty, 7, 36); ctx.fillRect(BW - 2, ty, 7, 36); } // tyres
  ctx.fillStyle = '#d8a420'; ctx.beginPath(); ctx.roundRect(0, 0, BW, BL, 11); ctx.fill();
  ctx.fillStyle = '#b8881a'; ctx.fillRect(2, 2, 3, BL - 4); ctx.fillRect(BW - 5, 2, 3, BL - 4);
  ctx.fillStyle = '#3a3531'; ctx.fillRect(8, 8, BW - 16, BL - 16); // floor
  ctx.fillStyle = '#4a443e'; ctx.fillRect(40, 8, BW - 80, BL - 16); ctx.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 20; y < BL - 8; y += 18) ctx.fillRect(40, y, BW - 80, 1);
  ctx.fillStyle = 'rgba(120,170,200,0.65)'; for (let y = 26; y < BL - 30; y += 36) { ctx.fillRect(0.5, y, 4, 22); ctx.fillRect(BW - 4.5, y, 4, 22); } // windows
  // dashboard, windscreen, driver
  ctx.fillStyle = '#23262a'; ctx.fillRect(8, 8, BW - 16, 13);
  ctx.fillStyle = pose.moving || b.go ? 'rgba(170,215,235,0.5)' : 'rgba(170,215,235,0.35)'; ctx.beginPath(); ctx.roundRect(10, 0, BW - 20, 8, 3); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.moveTo(24, 0); ctx.lineTo(44, 0); ctx.lineTo(32, 8); ctx.lineTo(14, 8); ctx.fill();
  ctx.fillStyle = '#2f2c28'; ctx.fillRect(DRIVER.x, DRIVER.y, DRIVER.w, DRIVER.h);
  ctx.fillStyle = '#1c1a18'; ctx.fillRect(DRIVER.x, DRIVER.y + DRIVER.h - 7, DRIVER.w, 7);
  ctx.fillStyle = '#2a4260'; ctx.beginPath(); ctx.ellipse(DRIVER.x + 15, DRIVER.y + 14, 11, 7, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#d2a47c'; ctx.beginPath(); ctx.arc(DRIVER.x + 15, DRIVER.y + 12, 5.5, 0, 7); ctx.fill(); ctx.fillStyle = '#3a2f26'; ctx.beginPath(); ctx.arc(DRIVER.x + 15, DRIVER.y + 11, 5.6, Math.PI * 0.95, Math.PI * 2.05); ctx.fill();
  ctx.strokeStyle = '#111'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(DRIVER.x + 15, DRIVER.y - 2, 8, 0, 7); ctx.stroke(); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(DRIVER.x + 7, DRIVER.y - 2); ctx.lineTo(DRIVER.x + 23, DRIVER.y - 2); ctx.stroke();
  // seats (they face the front)
  for (const q of SEATS) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(q.x + 2, q.y + 2, q.w, q.h);
    ctx.fillStyle = '#58733f'; ctx.beginPath(); ctx.roundRect(q.x, q.y, q.w, q.h, 3); ctx.fill();
    ctx.fillStyle = '#41562f'; ctx.beginPath(); ctx.roundRect(q.x, q.y + q.h - 8, q.w, 8, 3); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(q.x + 3, q.y + 3, q.w - 6, 3);
  }
  // the door: shut while moving, folded open when parked
  const dy0 = DOOR.y - 22;
  if (pose.doors) {
    ctx.fillStyle = '#2a2c2f'; ctx.fillRect(BW - 6, dy0, 10, 44);
    ctx.fillStyle = '#6a5a34'; ctx.fillRect(BW - 4, dy0 + 2, 9, 40); ctx.fillStyle = '#b8881a'; ctx.save(); ctx.translate(BW + 3, dy0); ctx.rotate(-0.9); ctx.fillRect(0, -1.5, 16, 3); ctx.restore(); ctx.save(); ctx.translate(BW + 3, dy0 + 44); ctx.rotate(0.9); ctx.fillRect(0, -1.5, 16, 3); ctx.restore();
  } else { ctx.fillStyle = '#a07a18'; ctx.fillRect(BW - 6, dy0, 6, 44); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(BW - 4, DOOR.y - 1, 4, 2); ctx.fillStyle = 'rgba(120,170,200,0.55)'; ctx.fillRect(BW - 5, dy0 + 4, 3, 14); ctx.fillRect(BW - 5, dy0 + 26, 3, 14); }
  // tail lights
  ctx.fillStyle = braking || !pose.moving ? '#ff3a2a' : '#8a1f18'; ctx.fillRect(6, BL - 3, 12, 3); ctx.fillRect(BW - 18, BL - 3, 12, 3);
  ctx.fillStyle = '#f0e8c0'; ctx.fillRect(10, 0, 10, 2); ctx.fillRect(BW - 20, 0, 10, 2); // headlamps

  // the people inside, nearest the viewer last
  const me = p.bus.dir;
  for (const id in s.players) {
    const q = s.players[id]; if (!q.bus || q.bus.dir !== me || q.dead || q.bx === undefined) continue;
    let pr = st.proxies.get(q); if (!pr) { pr = {}; st.proxies.set(q, pr); }
    Object.assign(pr, q, { x: q.bx, y: q.by, roll: null, downed: null, channel: null, swing: 0, reload: 0, muzzle: 0, hurt: 0, bleeding: false, sprinting: !!(q.moving && ui.keysSprint && id === localId) });
    r.player(ctx, pr);
    if (id !== localId) r.upright(ctx, q.bx, q.by, () => { ctx.textAlign = 'center'; ctx.font = 'bold 10px system-ui, sans-serif'; ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(-20, -33, 40, 16); ctx.fillStyle = '#7ae0a0'; ctx.fillText('Partner', 0, -22); });
  }
  // a ring on the floor at the exit when you can use it
  if (ui.interact && ui.interact.kind === 'busdoor') { ctx.strokeStyle = r.hlCol; ctx.lineWidth = 2; ctx.strokeRect(BW - 22, dy0, 22, 44); }

  // ----- light -----
  if (dl < 0.95) { // night: dark outside, headlamps push it back, a warm glow inside
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = `rgba(3,6,14,${0.62 * (1 - dl)})`; ctx.fillRect(0, 0, SW, SH);
    r.toWorld(ctx, r.cam.x + sx / z, r.cam.y + sy / z); ctx.globalCompositeOperation = 'lighter';
    for (const hx of [15, BW - 15]) { const g = ctx.createLinearGradient(0, 0, 0, -200); g.addColorStop(0, `rgba(255,240,190,${0.4 * (1 - dl)})`); g.addColorStop(1, 'rgba(255,240,190,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(hx - 5, 0); ctx.lineTo(hx + 5, 0); ctx.lineTo(hx + 40 * (hx > BW / 2 ? 1 : -1) + 30, -200); ctx.lineTo(hx - 30 + (hx > BW / 2 ? 0 : -40), -200); ctx.fill(); }
    ctx.fillStyle = `rgba(255,214,140,${0.1 * (1 - dl)})`; ctx.fillRect(8, 8, BW - 16, BL - 16); ctx.globalCompositeOperation = 'source-over';
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // a little vignette keeps the eye on the bus
  const vg = ctx.createRadialGradient(SW / 2, SH / 2, Math.min(SW, SH) * 0.35, SW / 2, SH / 2, Math.hypot(SW, SH) * 0.6); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, SW, SH);
  // brief fade-in from the yard when you board / the bus pulls out
  const fade = b.go ? Math.max(0, 1 - b.t / 0.7) : 0;
  if (fade > 0) { ctx.fillStyle = `rgba(0,0,0,${fade})`; ctx.fillRect(0, 0, SW, SH); }
  return pose;
}
