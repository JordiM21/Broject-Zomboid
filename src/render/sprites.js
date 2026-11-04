// Frame-by-frame character sprites, rendered once from pose keyframes into cached canvases.
// Every animation frame is its own image; the renderer just picks a frame and rotates it.
const S = 2;          // pixel density of the cached frames
const OUT = '#16171b'; // outline colour

export const P_ANIMS = { idle: 4, walk: 8, attack: 8, reload: 6, heal: 4, shove: 5 };
export const Z_ANIMS = { idle: 4, walk: 8, attack: 6, hit: 3, death: 7 };

const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
const mix = (a, b, t) => (Array.isArray(a) ? a.map((v, i) => lerp(v, b[i], t)) : lerp(a, b, t));
function key(ks, t) { // piecewise eased keyframes: [[t, value], ...]
  if (t <= ks[0][0]) return ks[0][1];
  for (let i = 1; i < ks.length; i++) if (t <= ks[i][0]) { const [t0, a] = ks[i - 1], [t1, b] = ks[i]; return mix(a, b, ease((t - t0) / (t1 - t0))); }
  return ks[ks.length - 1][1];
}
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];

// ---------- primitives ----------
function blob(g, x, y, rx, ry, fill, rot = 0) { g.fillStyle = fill; g.strokeStyle = OUT; g.lineWidth = 1.4; g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, 7); g.fill(); g.stroke(); }
function limb(g, a, b, w, col) {
  g.lineCap = 'round'; g.strokeStyle = OUT; g.lineWidth = w + 2.4; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
  g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
}
function poly(g, pts, fill) { g.fillStyle = fill; g.strokeStyle = OUT; g.lineWidth = 1.1; g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); g.fill(); g.stroke(); }

// weapon drawn along +x from the grip
export function drawWeapon(g, id) {
  switch (id) {
    case 'knife': poly(g, [-4, -1.6, 3, -1.6, 3, 1.6, -4, 1.6], '#3a2a1e'); poly(g, [3, -2, 15, -0.6, 16, 0.6, 3, 2], '#d6dde2'); break;
    case 'bat': case 'spikedbat':
      poly(g, [-5, -1.5, 8, -2, 25, -3.2, 26, 0, 25, 3.2, 8, 2, -5, 1.5], '#b4834a'); g.fillStyle = '#2a2a2a'; g.fillRect(-5, -1.6, 5, 3.2);
      if (id === 'spikedbat') { g.fillStyle = '#d0d4d8'; for (let k = 0; k < 5; k++) g.fillRect(12 + k * 3, k % 2 ? -5 : 3, 1.5, 2.2); }
      break;
    case 'crowbar': limb(g, [-5, 0], [21, 0], 2.4, '#b02a2a'); limb(g, [21, 0], [24, -4], 2.4, '#b02a2a'); break;
    case 'machete': poly(g, [-5, -1.5, 3, -1.5, 3, 1.5, -5, 1.5], '#1e1e1e'); poly(g, [3, -2.4, 22, -3, 26, 0, 22, 2.2, 3, 2.4], '#c9d1d7'); break;
    case 'axe': limb(g, [-5, 0], [25, 0], 2.6, '#8a6038'); poly(g, [18, -2, 23, -9, 27, -8, 26, 2, 18, 2], '#c0302a'); g.fillStyle = '#d8dde2'; g.fillRect(24, -8, 2.4, 9); break;
    case 'katana': poly(g, [-9, -1.8, 0, -1.8, 0, 1.8, -9, 1.8], '#2a1a1a'); g.fillStyle = '#c8a040'; for (let k = 0; k < 3; k++) g.fillRect(-8 + k * 3, -1.8, 1, 3.6); poly(g, [0, -3.5, 2, -3.5, 2, 3.5, 0, 3.5], '#c8a040'); poly(g, [2, -1.6, 28, -2.2, 33, 0.2, 28, 1.6, 2, 1.6], '#e2e8ee'); g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(3, -0.6); g.lineTo(29, -1); g.stroke(); break;
    case 'sledge': limb(g, [-8, 0], [24, 0], 2.8, '#8a6038'); poly(g, [20, -8, 30, -8, 30, 8, 20, 8], '#5a6068'); g.fillStyle = '#8a9098'; g.fillRect(21, -7, 2, 14); break;
    case 'spear': limb(g, [-12, 0], [32, 0], 2.2, '#9a7044'); poly(g, [30, -1.6, 33, -1.6, 33, 1.6, 30, 1.6], '#3a3a3a'); poly(g, [33, -3.2, 43, 0, 33, 3.2], '#d4dade'); break;
    case 'crossbow': poly(g, [-10, -2.2, 16, -2.2, 16, 2.2, -10, 2.2], '#6a4a2c'); g.strokeStyle = OUT; g.lineWidth = 3.6; g.beginPath(); g.moveTo(12, -12); g.quadraticCurveTo(18, 0, 12, 12); g.stroke(); g.strokeStyle = '#3a3f46'; g.lineWidth = 2.2; g.stroke();
      g.strokeStyle = 'rgba(230,230,210,0.9)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(12, -12); g.lineTo(4, 0); g.lineTo(12, 12); g.stroke(); poly(g, [4, -0.8, 20, -0.8, 23, 0, 20, 0.8, 4, 0.8], '#c8ccd0'); break;
    case 'smg': poly(g, [-4, -2.6, 14, -2.6, 14, 2.6, -4, 2.6], '#4a5058'); poly(g, [14, -1.4, 19, -1.4, 19, 1.4, 14, 1.4], '#2a2d31'); poly(g, [4, 2.6, 7.5, 2.6, 7.5, 10, 4, 10], '#2a2d31'); poly(g, [-10, -1.6, -4, -1.6, -4, 1.6, -10, 1.6], '#3a3f46'); break;
    case 'pistol': poly(g, [-2, -2, 12, -2, 12, 2, -2, 2], '#3a3f46'); g.fillStyle = '#6a7078'; g.fillRect(0, -1.2, 11, 1); break;
    case 'shotgun': poly(g, [-10, -2.4, 2, -2.4, 2, 2.4, -10, 2.4], '#6a4a2c'); limb(g, [0, 0], [26, 0], 2.6, '#3a3f46'); poly(g, [11, -2.6, 17, -2.6, 17, 2.6, 11, 2.6], '#5a3e26'); break;
    case 'rifle': poly(g, [-10, -2.4, 4, -2.2, 4, 2.2, -10, 2.4], '#7a5434'); limb(g, [2, 0], [30, 0], 2.2, '#3a3f46'); poly(g, [5, -4.5, 14, -4.5, 14, -1.5, 5, -1.5], '#1e1e1e'); break;
  }
}
const GUN_TIP = { pistol: 13, shotgun: 27, rifle: 31, smg: 20, crossbow: 23 };

// ---------- figure ----------
function drawFigure(g, P, L) {
  if (L.scale) g.scale(L.scale, L.scale);
  for (const f of [P.lf, P.rf]) blob(g, f[0], f[1], 4.6, 3.2, L.boots);
  // torso
  g.save(); g.translate(P.bx, 0); g.rotate(P.br); g.scale(P.bs ? P.bs[0] : 1, P.bs ? P.bs[1] : 1);
  if (L.bag) { g.fillStyle = L.bag; g.strokeStyle = OUT; g.lineWidth = 1.3; g.beginPath(); g.roundRect(-L.bw - 5, -7, 8, 14, 3); g.fill(); g.stroke(); }
  blob(g, 0, 0, L.bw, L.bh, L.top);
  g.fillStyle = L.topDark; g.beginPath(); g.ellipse(-L.bw * 0.35, 0, L.bw * 0.55, L.bh * 0.85, 0, 0, 7); g.fill();
  if (L.detail) L.detail(g, L);
  g.restore();
  const sy = L.bh - 3.5, cs = Math.cos(P.br), sn = Math.sin(P.br);
  const shL = [P.bx + sn * sy, -cs * sy], shR = [P.bx - sn * sy, cs * sy];
  // arms then weapon then hands
  for (const [sh, h] of [[shL, P.lh], [shR, P.rh]]) {
    if (L.fore) { limb(g, sh, h, L.arm, L.fore); const m = [lerp(sh[0], h[0], 0.45), lerp(sh[1], h[1], 0.45)]; g.lineCap = 'round'; g.strokeStyle = L.sleeve; g.lineWidth = L.arm; g.beginPath(); g.moveTo(sh[0], sh[1]); g.lineTo(m[0], m[1]); g.stroke(); }
    else limb(g, sh, h, L.arm, L.sleeve);
  }
  // head
  blob(g, P.hd[0], P.hd[1], L.hr, L.hr * 0.95, L.skin);
  if (L.hair) { g.fillStyle = L.hair; g.beginPath(); g.ellipse(P.hd[0] - 1.2, P.hd[1], L.hr * 0.95, L.hr * 0.9, 0, Math.PI * 0.42, Math.PI * 1.58); g.fill(); }
  if (L.head) L.head(g, P.hd, L);
  if (!P.hide && L.wpn) { g.save(); g.translate(P.rh[0], P.rh[1]); g.rotate(P.wa || 0); drawWeapon(g, L.wpn); g.restore(); }
  blob(g, P.lh[0], P.lh[1], 2.9, 2.9, L.hand);
  blob(g, P.rh[0], P.rh[1], 2.9, 2.9, L.hand);
}

// ---------- player ----------
const WCLASS = { knife: 'knife', bat: 'one', spikedbat: 'one', crowbar: 'one', machete: 'one', axe: 'axe', pistol: 'pistol', shotgun: 'long', rifle: 'long', katana: 'katana', sledge: 'sledge', spear: 'spear', crossbow: 'long', smg: 'smg' };
const GRIP = {
  fists: { lh: [9, -7], rh: [9, 7], wa: 0 },
  knife: { lh: [6, -8], rh: [9, 7], wa: 0.35 },
  one: { lh: [5, -8], rh: [8, 8], wa: 0.9 },
  axe: { lh: [6, 4], rh: [3, 9], wa: 0.75 },
  pistol: { lh: [12, -1], rh: [14, 2], wa: 0 },
  long: { lh: [17, 0], rh: [6, 5], wa: 0 },
  katana: { lh: [5, 5], rh: [9, 6], wa: -0.5 },
  sledge: { lh: [3, 5], rh: [7, 7], wa: 0.55 },
  spear: { lh: [12, 1], rh: [3, 5], wa: 0 },
  smg: { lh: [13, 0], rh: [8, 4], wa: 0 },
};
function playerPose(cls, anim, t) {
  const G = GRIP[cls];
  const P = { lf: [4, -4.5], rf: [-3, 4.5], bx: 0, br: 0, hd: [1.5, 0], lh: [...G.lh], rh: [...G.rh], wa: G.wa, hide: cls === 'fists' };
  const ph = t * Math.PI * 2;
  if (anim === 'idle') { P.bs = [1, 1 + 0.03 * Math.sin(ph)]; P.lh[1] -= Math.sin(ph) * 0.5; P.rh[1] += Math.sin(ph) * 0.5; }
  else if (anim === 'walk') {
    P.lf = [Math.sin(ph) * 8.5, -4.5]; P.rf = [-Math.sin(ph) * 8.5, 4.5]; P.br = Math.sin(ph) * 0.07; P.hd = [1.5 + Math.cos(ph * 2) * 0.4, 0];
    if (cls === 'fists' || cls === 'knife' || cls === 'one') { P.lh[0] -= Math.sin(ph) * 3; if (cls === 'fists') P.rh[0] += Math.sin(ph) * 3; }
    else { P.lh[1] += Math.cos(ph * 2) * 0.5; P.rh[1] += Math.cos(ph * 2) * 0.5; }
  } else if (anim === 'attack') {
    if (cls === 'fists') { P.rh = key([[0, [9, 7]], [0.25, [21, 3]], [0.6, [11, 7]], [1, [9, 7]]], t); P.br = key([[0, 0], [0.25, 0.25], [1, 0]], t); }
    else if (cls === 'knife') { P.rh = key([[0, [8, 7]], [0.08, [4, 9]], [0.3, [23, 2]], [0.65, [10, 7]], [1, [9, 7]]], t); P.wa = key([[0, 0.35], [0.3, 0], [1, 0.35]], t); P.br = key([[0, 0], [0.3, 0.25], [1, 0]], t); }
    else if (cls === 'one' || cls === 'axe') {
      const a = key(cls === 'axe' ? [[0, 0.75], [0.12, -1.55], [0.45, 1.35], [0.75, 1.2], [1, 0.75]] : [[0, 0.9], [0.08, -1.3], [0.4, 1.3], [0.7, 1.1], [1, 0.9]], t);
      const r = 10, c = [2, 0];
      P.rh = [c[0] + Math.cos(a * 0.75) * r, c[1] + Math.sin(a * 0.75) * r]; P.wa = a; P.br = a * 0.22;
      P.lh = cls === 'axe' ? [P.rh[0] - Math.cos(a) * 5, P.rh[1] - Math.sin(a) * 5] : [5 - Math.sin(a) * 2, -8];
    } else if (cls === 'katana') { // lightning-fast diagonal draw cut, both hands on the grip
      const a = key([[0, -0.5], [0.05, -1.7], [0.28, 1.6], [0.55, 1.45], [1, -0.5]], t);
      P.rh = [3 + Math.cos(a * 0.7) * 11, Math.sin(a * 0.7) * 11]; P.lh = [P.rh[0] - Math.cos(a) * 5, P.rh[1] - Math.sin(a) * 5]; P.wa = a; P.br = a * 0.3; P.bx = key([[0, 0], [0.28, 2], [1, 0]], t);
      P.lf = [4 + 3 * Math.max(0, Math.sin(t * Math.PI)), -4.5];
    } else if (cls === 'sledge') { // heavy wind-up, then a crushing two-handed slam
      const a = key([[0, 0.55], [0.3, -2.0], [0.48, 0.15], [0.62, 0.05], [1, 0.55]], t);
      P.rh = [2 + Math.cos(a * 0.6) * 9, Math.sin(a * 0.6) * 9]; P.lh = [P.rh[0] - Math.cos(a) * 6, P.rh[1] - Math.sin(a) * 6]; P.wa = a;
      P.br = key([[0, 0], [0.3, -0.45], [0.5, 0.25], [1, 0]], t); P.bx = key([[0, 0], [0.3, -2], [0.5, 4], [1, 0]], t); P.hd = [1.5 + P.bx * 0.6, 0];
    } else if (cls === 'spear') { // long thrust with a forward lunge
      const k = key([[0, 0], [0.1, -0.3], [0.3, 1], [0.6, 0.6], [1, 0]], t);
      P.rh = [3 + 14 * k, 5 - 2 * k]; P.lh = [12 + 12 * k, 1 - k]; P.wa = -0.04 * k; P.bx = 4 * k; P.lf = [4 + 5 * Math.max(0, k), -4.5]; P.hd = [1.5 + 3 * k, 0];
    } else if (cls === 'smg') { const k = key([[0, 0], [0.3, 1], [1, 0]], t); P.rh[0] -= 2.5 * k; P.lh[0] -= 2.5 * k; P.wa = (Math.sin(t * 40) * 0.05) * k; P.br = 0.04 * Math.sin(t * 30); }
    else if (cls === 'pistol') { const k = key([[0, 0], [0.15, 1], [1, 0]], t); P.rh[0] -= 4 * k; P.lh[0] -= 4 * k; P.wa = -0.12 * k; P.br = -0.05 * k; }
    else { const k = key([[0, 0], [0.12, 1], [1, 0]], t); P.rh[0] -= 4 * k; P.lh[0] -= 4 * k; P.br = -0.1 * k; P.bx = -1.5 * k; }
  } else if (anim === 'reload') {
    if (cls === 'smg') { P.wa = key([[0, 0], [0.2, 0.7], [0.8, 0.7], [1, 0]], t); P.lh = key([[0, [13, 0]], [0.3, [3, 10]], [0.6, [8, 5]], [1, [13, 0]]], t); }
    else if (cls === 'pistol') { P.wa = key([[0, 0], [0.2, 0.9], [0.8, 0.9], [1, 0]], t); P.rh = key([[0, [14, 2]], [0.2, [10, 3]], [0.8, [10, 3]], [1, [14, 2]]], t); P.lh = key([[0, [12, -1]], [0.3, [2, 9]], [0.6, [9, 3]], [1, [12, -1]]], t); }
    else if (cls === 'long') { P.wa = key([[0, 0], [0.2, 0.4], [0.85, 0.4], [1, 0]], t); P.lh = key([[0, [17, 0]], [0.25, [3, 9]], [0.45, [11, 3]], [0.65, [3, 9]], [0.85, [12, 2]], [1, [17, 0]]], t); }
  } else if (anim === 'heal') { P.hide = true; P.lh = [8 + Math.sin(ph * 2) * 2.5, -3]; P.rh = [8 - Math.sin(ph * 2) * 2.5, 3]; P.hd = [2.5, 0]; }
  else if (anim === 'shove') { const k = key([[0, 0], [0.35, 1], [1, 0]], t); P.lh = [9 + 10 * k, -7]; P.rh = [9 + 10 * k, 7]; P.bx = 3 * k; P.hide = true; }
  return P;
}
function playerLook(wpn, armor, bag, head, feet) {
  const top = { vest: '#2c3a52', jacket: '#5a3a22', riotgear: '#232b38', ghillie: '#4e6a30' }[armor] || '#3b5c8a';
  const dark = { vest: '#202c40', jacket: '#46301b', riotgear: '#161c26', ghillie: '#3a5222' }[armor] || '#2e4870';
  return {
    head: head ? (g, hd, L) => {
      if (head === 'helmet' || head === 'milhelmet') { blob(g, hd[0] - 0.5, hd[1], L.hr + 1.4, L.hr + 1.2, head === 'helmet' ? '#b02a2a' : '#4a5236'); if (head === 'helmet') { g.fillStyle = 'rgba(140,190,230,0.75)'; g.fillRect(hd[0] + 3, hd[1] - 4, 3, 8); } else { g.fillStyle = 'rgba(255,255,255,0.15)'; g.beginPath(); g.arc(hd[0] - 2, hd[1] - 2, 2.2, 0, 7); g.fill(); } }
      else if (head === 'nvg') { g.fillStyle = '#2a2d31'; g.fillRect(hd[0] - 6, hd[1] - 1.2, 9, 2.4); g.fillRect(hd[0] + 2, hd[1] - 4, 5, 8); g.fillStyle = '#5ae07a'; g.fillRect(hd[0] + 6, hd[1] - 3.4, 1.6, 2.4); g.fillRect(hd[0] + 6, hd[1] + 1, 1.6, 2.4); }
      else if (head === 'headlamp') { g.fillStyle = '#3a3f46'; g.fillRect(hd[0] - 5.5, hd[1] - 1, 10, 2); g.fillStyle = '#fff2a0'; g.beginPath(); g.arc(hd[0] + 5, hd[1], 2.2, 0, 7); g.fill(); }
    } : null,
    skin: '#e3b78c', hand: '#d9a87c', hair: head === 'helmet' || head === 'milhelmet' ? null : '#3a2a1a', top, topDark: dark, sleeve: dark, boots: { sneakers: '#e8e8e8', boots: '#151515', runners: '#c83a3a' }[feet] || '#2a2622', bw: 7.5, bh: 11, hr: 6, arm: 4.2, wpn,
    bag: bag === 'milbag' ? '#4a5236' : bag === 'hikingbag' ? '#3e7a3e' : bag === 'schoolbag' ? '#3a6ab0' : null,
    detail: (g) => {
      if (armor === 'riotgear') { g.fillStyle = '#3a4658'; g.fillRect(-5, -9, 9, 18); g.fillStyle = '#e0c040'; g.fillRect(-1, -6, 2, 12); }
      else if (armor === 'ghillie') { for (let k = 0; k < 14; k++) { const a = k * 2.3, d = 2 + (k % 5) * 1.6; g.fillStyle = ['#6a7a3a', '#3a5222', '#5a4a2a'][k % 3]; g.beginPath(); g.ellipse(Math.cos(a) * d, Math.sin(a) * d * 1.3, 3, 1.6, a, 0, 7); g.fill(); } }
      else if (armor === 'vest') { g.fillStyle = '#d8d8d8'; g.fillRect(-1.5, -6, 3, 12); g.fillStyle = '#3a4a62'; g.fillRect(2, -8, 3, 4); g.fillRect(2, 4, 3, 4); }
      else { g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1; g.beginPath(); g.moveTo(3, -9); g.lineTo(3, 9); g.stroke(); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(4.5, -4, 2, 8); }
    },
  };
}

// ---------- zombies ----------
const ZSKIN = ['#8a9a72', '#7d8e68', '#94a07c', '#6f8463', '#9aa48a'];
const ZVARIANTS = {
  walker: [['#4a5a3a', '#384428'], ['#6a3a3a', '#4e2a2a'], ['#3a4a5e', '#2a3646'], ['#6a6040', '#4e472e'], ['#5a4a6a', '#42364e']],
  runner: [['#8a8a8a', '#666'], ['#7a2a2a', '#5a1e1e'], ['#c8b890', '#9a8c68']],
  brute: [['#3a3530', '#2a2622'], ['#4a4038', '#352e28']],
  soldier: [['#4a5236', '#3a4028'], ['#55583c', '#40422c']],
};
export const zVariantCount = (type) => ZVARIANTS[type].length;
function zombieLook(type, v) {
  const [top, dark] = ZVARIANTS[type][v % ZVARIANTS[type].length];
  const skin = type === 'brute' ? '#9aa28a' : ZSKIN[(v * 3 + type.length) % ZSKIN.length];
  return {
    skin, hand: skin, top, topDark: dark, sleeve: dark, fore: skin, boots: '#25221e',
    bw: type === 'brute' ? 10.5 : type === 'runner' ? 6.5 : 7.5, bh: type === 'brute' ? 13 : type === 'runner' ? 10 : 11,
    hr: type === 'brute' ? 6.8 : 5.8, arm: type === 'brute' ? 6 : 4, scale: type === 'brute' ? 1.2 : 1,
    hair: type === 'soldier' ? null : ['#2a2a1e', '#4a3a22', '#555', null][v % 4],
    detail: (g, L) => {
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(2, -4, 2.2, 3, 0.4, 0, 7); g.ellipse(-2, 5, 1.8, 2.4, 0, 0, 7); g.fill();
      g.fillStyle = 'rgba(110,12,10,0.75)'; g.beginPath(); g.ellipse(3, 2 + (v % 3), 2.6, 1.8, v, 0, 7); g.fill();
      if (type === 'soldier') { g.fillStyle = '#353b26'; g.fillRect(-3, -L.bh + 3, 9, 2 * L.bh - 6); g.fillStyle = '#2a2f1e'; for (const y of [-6, -1, 4]) g.fillRect(3, y, 3, 3.5); }
      if (type === 'runner') { g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1; for (const y of [-5, 0, 5]) { g.beginPath(); g.moveTo(-4, y); g.lineTo(2, y + 1); g.stroke(); } }
    },
    head: (g, hd, L) => {
      if (type === 'soldier') { blob(g, hd[0] - 0.5, hd[1], L.hr + 1.3, L.hr + 1.1, '#4a5236'); g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.arc(hd[0] - 2, hd[1] - 2, 2.2, 0, 7); g.fill(); }
      g.fillStyle = type === 'runner' ? '#ff4030' : '#d8d890';
      g.fillRect(hd[0] + L.hr * 0.45, hd[1] - 2.6, 1.6, 1.6); g.fillRect(hd[0] + L.hr * 0.45, hd[1] + 1, 1.6, 1.6);
      g.fillStyle = 'rgba(90,10,10,0.7)'; g.fillRect(hd[0] + L.hr * 0.6, hd[1] - 0.6, 2, 1.4);
    },
  };
}
function zombiePose(type, anim, t, v) {
  const reachX = type === 'brute' ? 14 : type === 'runner' ? 12 : 16, reachY = type === 'brute' ? 11 : 6;
  const P = { lf: [4, -4.5], rf: [-3, 4.5], bx: 0, br: 0, hd: [type === 'runner' ? 5 : 3, (v % 2 ? 0.8 : -0.8)], lh: [reachX, -reachY], rh: [reachX, reachY], hide: true };
  const ph = t * Math.PI * 2;
  if (anim === 'idle') { P.br = Math.sin(ph) * 0.06; P.hd[1] += Math.sin(ph) * 1; P.lh[0] -= 3 + Math.sin(ph) * 1.5; P.rh[0] -= 3 - Math.sin(ph) * 1.5; }
  else if (anim === 'walk') {
    if (type === 'runner') {
      P.lf = [Math.sin(ph) * 9.5, -4.5]; P.rf = [-Math.sin(ph) * 9.5, 4.5]; P.br = Math.sin(ph) * 0.1;
      P.lh = [8 - Math.sin(ph) * 7, -8]; P.rh = [8 + Math.sin(ph) * 7, 8]; P.hd = [5.5, Math.sin(ph) * 0.8];
    } else {
      const st = type === 'brute' ? 7 : 8;
      P.lf = [Math.sin(ph) * st, -4.5]; P.rf = [-Math.sin(ph) * st * 0.6, 4.5]; // dragging leg
      P.br = Math.sin(ph) * (type === 'brute' ? 0.1 : 0.16);
      P.hd = [P.hd[0] + Math.cos(ph * 2) * 0.6, P.hd[1] + Math.sin(ph) * 1.6];
      P.lh = [reachX + Math.sin(ph) * 1.8, -reachY + Math.cos(ph)]; P.rh = [reachX - Math.sin(ph) * 1.8, reachY - Math.cos(ph)];
    }
  } else if (anim === 'attack') {
    const k = key([[0, 0], [0.35, -0.5], [0.65, 1], [1, 0]], t);
    P.lh = [reachX + 9 * k, -reachY * (1 - 0.45 * Math.max(0, k))]; P.rh = [reachX + 9 * k, reachY * (1 - 0.45 * Math.max(0, k))];
    P.bx = 4 * Math.max(0, k); P.hd = add(P.hd, [3 * Math.max(0, k), 0]); P.br = -0.1 * k;
  } else if (anim === 'hit') {
    const k = key([[0, 0], [0.3, 1], [1, 0]], t);
    P.hd = add(P.hd, [-5 * k, 1.5 * k]); P.br = -0.25 * k; P.bx = -2 * k;
    P.lh = [reachX - 6 * k, -reachY * (1 + 0.8 * k)]; P.rh = [reachX - 5 * k, reachY * (1 + 0.8 * k)];
  } else if (anim === 'death') {
    const e = ease(Math.min(1, t * 1.15));
    P.bx = lerp(0, -5, e); P.hd = mix(P.hd, [-17, 1.5], e); P.lf = mix(P.lf, [11, -5], e); P.rf = mix(P.rf, [12, 4], e);
    P.lh = mix(P.lh, [-6, -15], e); P.rh = mix(P.rh, [-10, 14], e); P.bs = [1 + 0.35 * e, 1 - 0.05 * e]; P.br = 0.1 * e;
  }
  return P;
}

// ---------- cache ----------
const cache = new Map();
const SIZE = 64; // world px covered by a frame
function render(keyStr, draw) {
  let c = cache.get(keyStr); if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = SIZE * S;
  const g = c.getContext('2d'); g.setTransform(S, 0, 0, S, (SIZE * S) / 2, (SIZE * S) / 2);
  draw(g); cache.set(keyStr, c); return c;
}
const frameOf = (anim, t, n) => Math.min(n - 1, Math.floor(((t % 1) + 1) % 1 * n));
export function playerFrame(wpn, armor, bag, anim, t, head, feet) {
  const n = P_ANIMS[anim], f = anim === 'attack' || anim === 'reload' || anim === 'shove' ? Math.min(n - 1, Math.floor(Math.max(0, Math.min(0.999, t)) * n)) : frameOf(anim, t, n);
  const cls = WCLASS[wpn] || 'fists';
  return render(`p|${wpn}|${armor}|${bag}|${head}|${feet}|${anim}|${f}`, (g) => drawFigure(g, playerPose(cls, anim, (f + 0.5) / n), playerLook(wpn === 'fists' ? null : wpn, armor, bag, head, feet)));
}
export function zombieFrame(type, v, anim, t) {
  const n = Z_ANIMS[anim], once = anim !== 'walk' && anim !== 'idle';
  const f = once ? Math.min(n - 1, Math.floor(Math.max(0, Math.min(0.999, t)) * n)) : frameOf(anim, t, n);
  v %= ZVARIANTS[type].length;
  return render(`z|${type}|${v}|${anim}|${f}`, (g) => drawFigure(g, zombiePose(type, anim, once ? f / (n - 1) : (f + 0.5) / n, v), zombieLook(type, v)));
}
export const muzzleTip = (wpn) => { const cls = WCLASS[wpn]; if (wpn === 'crossbow') return null; return cls === 'pistol' ? [14 + GUN_TIP.pistol, 2] : cls === 'smg' ? [8 + GUN_TIP.smg, 4] : cls === 'long' ? [6 + GUN_TIP[wpn], 5] : null; };
export const FRAME_SIZE = SIZE;
// Render every zombie frame (and the starting player frames) up front so gameplay never stalls.
export function prewarm() {
  for (const type of Object.keys(ZVARIANTS)) for (let v = 0; v < ZVARIANTS[type].length; v++) for (const [anim, n] of Object.entries(Z_ANIMS)) for (let f = 0; f < n; f++) zombieFrame(type, v, anim, (f + 0.5) / n);
  for (const [anim, n] of Object.entries(P_ANIMS)) for (let f = 0; f < n; f++) { playerFrame('knife', undefined, undefined, anim, (f + 0.5) / n); playerFrame('fists', undefined, undefined, anim, (f + 0.5) / n); }
}
