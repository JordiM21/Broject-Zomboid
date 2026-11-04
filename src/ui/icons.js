// Procedural item icons drawn on a 64x64 canvas. Cached as canvases and data URLs.
import { MODS } from '../data/items.js';
const cache = new Map(), urls = new Map();

const R = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
const RR = (g, x, y, w, h, r, c) => { g.fillStyle = c; g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); };
const C = (g, x, y, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
const E = (g, x, y, rx, ry, c) => { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fill(); };
const L = (g, pts, c, w = 2) => { g.strokeStyle = c; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.stroke(); };
const P = (g, pts, c) => { g.fillStyle = c; g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); g.fill(); };
const diag = (g, fn) => { g.save(); g.translate(32, 32); g.rotate(-Math.PI / 4); fn(); g.restore(); };

const can = (g, body, label, top = '#c8ccd0') => { R(g, 20, 16, 24, 34, body); R(g, 20, 24, 24, 16, label); E(g, 32, 16, 12, 4, top); E(g, 32, 50, 12, 4, body); R(g, 22, 18, 3, 30, 'rgba(255,255,255,0.25)'); };
const pistolShape = (g) => { P(g, [12, 22, 52, 22, 52, 30, 30, 30, 28, 46, 20, 46, 22, 30, 12, 30], '#5a6068'); R(g, 14, 24, 36, 2, '#7a8088'); R(g, 23, 34, 5, 10, '#5a4030'); };
const bullet = (g, x, y, h, c) => { RR(g, x, y + 4, 6, h - 4, 1, c); P(g, [x, y + 4, x + 3, y, x + 6, y + 4], '#b07a4a'); };
const bag = (g, c, c2, big) => { const w = big ? 34 : 28, x = 32 - w / 2; RR(g, x, 18, w, 34, 8, c); RR(g, x + 4, 32, w - 8, 14, 4, c2); L(g, [x + 6, 18, x + 8, 10, x + w - 8, 10, x + w - 6, 18], c2, 3); if (big) { R(g, x + 2, 24, 3, 24, c2); R(g, x + w - 5, 24, 3, 24, c2); } };

const DRAW = {
  fists: (g) => {
    RR(g, 16, 22, 30, 26, 9, '#e0b48a'); // back of the hand
    for (let k = 0; k < 4; k++) { RR(g, 18 + k * 7, 13, 8, 14, 4, k % 2 ? '#d8a87c' : '#e6bc92'); L(g, [19 + k * 7, 22, 24 + k * 7, 22], 'rgba(120,70,40,0.4)', 1); }
    P(g, [16, 34, 8, 30, 10, 40, 20, 46], '#d8a87c'); // thumb
    RR(g, 18, 46, 26, 9, 3, '#3b5c8a'); L(g, [22, 34, 40, 34], 'rgba(120,70,40,0.35)', 1.5);
  },
  beans: (g) => can(g, '#9aa0a6', '#c0582e'),
  soda: (g) => can(g, '#b02a2a', '#e8e8e8', '#d0d0d0'),
  chips: (g) => { P(g, [18, 14, 46, 14, 50, 52, 14, 52], '#e0b030'); P(g, [18, 22, 46, 22, 48, 36, 16, 36], '#c0302a'); C(g, 32, 44, 5, '#f0d070'); L(g, [18, 14, 22, 11, 26, 14, 30, 11, 34, 14, 38, 11, 42, 14, 46, 11], '#e0b030', 2); },
  apple: (g) => { C(g, 27, 36, 13, '#c0282a'); C(g, 37, 36, 13, '#c0282a'); C(g, 26, 31, 5, 'rgba(255,255,255,0.25)'); L(g, [32, 24, 33, 14], '#5a3a1a', 3); E(g, 39, 17, 6, 3, '#4a9a3a'); },
  mre: (g) => { RR(g, 14, 16, 36, 34, 4, '#8a6e44'); R(g, 14, 22, 36, 4, '#6e5634'); R(g, 20, 32, 24, 3, '#e0d0a0'); R(g, 20, 38, 16, 3, '#e0d0a0'); },
  water: (g) => { RR(g, 24, 18, 16, 34, 5, 'rgba(120,190,240,0.85)'); R(g, 27, 10, 10, 8, '#3a7ad0'); R(g, 24, 28, 16, 10, '#2a5aa0'); R(g, 26, 20, 3, 30, 'rgba(255,255,255,0.4)'); },
  rag: (g) => { P(g, [14, 24, 30, 16, 50, 22, 46, 44, 26, 50, 16, 40], '#9a948a'); L(g, [20, 30, 40, 26], '#7a746a', 2); L(g, [22, 40, 42, 36], '#7a746a', 2); C(g, 36, 32, 4, '#8a2020'); },
  bandage: (g) => { C(g, 28, 32, 15, '#f0ece0'); C(g, 28, 32, 6, '#c8c0b0'); R(g, 28, 40, 24, 9, '#f0ece0'); L(g, [16, 28, 40, 28], '#ddd6c6', 1); },
  painkillers: (g) => { RR(g, 22, 22, 20, 30, 3, '#e08a2a'); R(g, 20, 14, 24, 9, '#f0f0f0'); R(g, 24, 32, 16, 12, '#f0f0f0'); C(g, 48, 48, 4, '#fff'); C(g, 42, 52, 4, '#fff'); },
  antibiotics: (g) => { RR(g, 14, 18, 36, 28, 4, '#d8dde0'); for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) C(g, 22 + i * 10, 26 + j * 12, 4, '#3aa06a'); },
  medkit: (g) => { L(g, [24, 18, 24, 12, 40, 12, 40, 18], '#7a1a1a', 3); RR(g, 12, 18, 40, 32, 5, '#c82a2a'); R(g, 28, 24, 8, 20, '#fff'); R(g, 22, 30, 20, 8, '#fff'); },
  scrap: (g) => { P(g, [12, 40, 24, 22, 34, 30, 30, 46], '#8a9096'); P(g, [30, 20, 50, 16, 46, 34, 36, 30], '#6a7076'); P(g, [34, 40, 52, 38, 48, 52, 32, 50], '#a0a6ac'); C(g, 24, 36, 2, '#4a4f55'); },
  plank: (g) => diag(g, () => { R(g, -26, -6, 52, 12, '#a0763e'); L(g, [-22, -2, 20, -2], '#7a5628', 1); L(g, [-18, 3, 24, 3], '#7a5628', 1); C(g, 8, 0, 2, '#6a4a20'); }),
  nails: (g) => { for (let k = 0; k < 4; k++) { const x = 18 + k * 8, y = 14 + (k % 2) * 6; R(g, x, y + 4, 3, 30, '#a0a6ac'); R(g, x - 2, y, 7, 4, '#c0c6cc'); } },
  cloth: (g) => { RR(g, 14, 34, 36, 10, 2, '#4a6a9a'); RR(g, 16, 26, 34, 10, 2, '#9a4a4a'); RR(g, 14, 18, 36, 10, 2, '#d0c8a0'); },
  tape: (g) => { C(g, 32, 32, 18, '#a8b0b8'); C(g, 32, 32, 9, '#1a1d22'); C(g, 27, 26, 5, 'rgba(255,255,255,0.35)'); R(g, 40, 44, 14, 6, '#a8b0b8'); },
  electronics: (g) => { RR(g, 12, 16, 40, 32, 3, '#2a7a4a'); R(g, 18, 22, 12, 10, '#1a1d22'); R(g, 34, 24, 10, 6, '#1a1d22'); L(g, [16, 40, 30, 40, 30, 36, 46, 36], '#d0b040', 2); C(g, 44, 42, 2, '#c0302a'); },
  knife: (g) => diag(g, () => { P(g, [-4, -4, 24, -2, 26, 0, -4, 4], '#d6dde2'); RR(g, -24, -4, 20, 8, 2, '#3a2a1e'); R(g, -6, -6, 3, 12, '#888'); }),
  bat: (g) => diag(g, () => { P(g, [-26, -2, 4, -5, 26, -6, 26, 6, 4, 5, -26, 2], '#b08048'); R(g, -26, -3, 8, 6, '#3a2a1e'); }),
  spikedbat: (g) => { DRAW.bat(g); diag(g, () => { for (let k = 0; k < 5; k++) { R(g, 6 + k * 4, k % 2 ? -10 : 5, 2, 6, '#c8ccd0'); } }); },
  crowbar: (g) => diag(g, () => { L(g, [-24, 0, 20, 0], '#a02a2a', 5); L(g, [20, 0, 26, -6, 22, -10], '#a02a2a', 5); L(g, [-24, 0, -28, 4], '#a02a2a', 5); }),
  machete: (g) => diag(g, () => { P(g, [-6, -5, 22, -7, 28, -2, 24, 4, -6, 4], '#c8d0d6'); RR(g, -24, -4, 18, 8, 2, '#1a1a1a'); }),
  axe: (g) => diag(g, () => { R(g, -26, -3, 50, 6, '#8a6038'); P(g, [12, -4, 24, -14, 28, -4, 28, 4, 24, 14, 12, 4], '#c0302a'); R(g, 22, -12, 6, 24, '#b8c0c8'); }),
  pistol: (g) => pistolShape(g),
  katana: (g) => diag(g, () => { R(g, -28, -2.5, 14, 5, '#2a1a1a'); for (let k = 0; k < 3; k++) R(g, -26 + k * 4.5, -2.5, 1.5, 5, '#c8a040'); RR(g, -14, -5, 3, 10, 1, '#c8a040'); P(g, [-11, -2, 22, -3, 29, 0, 22, 2, -11, 2], '#dde4ea'); L(g, [-10, 0, 24, -1], 'rgba(255,255,255,0.7)', 1); }),
  sledge: (g) => diag(g, () => { R(g, -28, -2.5, 44, 5, '#8a6038'); RR(g, 14, -10, 14, 20, 2, '#5a6068'); R(g, 16, -8, 3, 16, '#7a8088'); }),
  spear: (g) => diag(g, () => { R(g, -30, -1.8, 46, 3.6, '#9a7044'); R(g, 10, -2.5, 5, 5, '#3a3a3a'); P(g, [15, -4, 30, 0, 15, 4], '#d0d6dc'); }),
  crossbow: (g) => { R(g, 10, 29, 40, 6, '#6a4a2c'); L(g, [40, 12, 46, 32, 40, 52], '#3a3f46', 4); L(g, [41, 13, 30, 32, 41, 51], 'rgba(230,230,210,0.9)', 1); R(g, 24, 30, 24, 3, '#c8c0a0'); P(g, [48, 29, 54, 31.5, 48, 34], '#c8ccd0'); },
  smg: (g) => { R(g, 14, 24, 32, 9, '#4a5058'); R(g, 44, 26, 10, 4, '#3a3f46'); R(g, 26, 33, 6, 16, '#2a2d31'); R(g, 16, 33, 6, 8, '#3a3f46'); R(g, 6, 26, 9, 5, '#3a3f46'); },
  bolt: (g) => { for (let k = 0; k < 3; k++) { L(g, [12, 20 + k * 10, 50, 20 + k * 10], '#8a6a44', 3); P(g, [50, 16 + k * 10, 58, 20 + k * 10, 50, 24 + k * 10], '#c8ccd0'); P(g, [12, 20 + k * 10, 6, 16 + k * 10, 10, 20 + k * 10, 6, 24 + k * 10], '#c83a3a'); } },
  riotgear: (g) => { P(g, [18, 12, 46, 12, 52, 22, 50, 54, 14, 54, 12, 22], '#1e2632'); R(g, 20, 20, 24, 26, '#2c3a4e'); C(g, 32, 14, 9, '#1a1e24'); R(g, 25, 11, 14, 5, 'rgba(140,190,230,0.7)'); R(g, 22, 40, 20, 3, '#e0c040'); },
  ghillie: (g) => { for (let k = 0; k < 26; k++) { const a = k * 2.4, d = 4 + (k % 7) * 3; E(g, 32 + Math.cos(a) * d, 34 + Math.sin(a) * d * 0.9, 6, 3, ['#4a6a2a', '#3a5222', '#6a7a3a', '#5a4a2a'][k % 4]); } },
  adrenaline: (g) => diag(g, () => { RR(g, -18, -5, 28, 10, 3, '#e8ecec'); R(g, -12, -5, 14, 10, '#d84040'); R(g, 10, -1, 14, 2, '#c8ccd0'); R(g, -24, -4, 6, 8, '#d84040'); }),
  energy: (g) => { can(g, '#1e2a3a', '#6ae04a', '#c8d0d8'); P(g, [34, 26, 28, 34, 32, 34, 29, 42, 37, 32, 33, 32], '#1e2a3a'); },
  helmet: (g) => { C(g, 32, 34, 18, '#b02a2a'); R(g, 18, 34, 28, 10, '#1e2a36'); R(g, 20, 36, 24, 5, 'rgba(140,190,230,0.6)'); C(g, 26, 26, 4, 'rgba(255,255,255,0.3)'); },
  milhelmet: (g) => { C(g, 32, 34, 18, '#4a5236'); R(g, 12, 38, 40, 5, '#3a4028'); C(g, 26, 27, 4, 'rgba(255,255,255,0.18)'); L(g, [18, 30, 46, 30], '#3a4028', 2); },
  nvg: (g) => { RR(g, 12, 26, 40, 12, 4, '#2a2d31'); C(g, 24, 32, 7, '#1a1d22'); C(g, 40, 32, 7, '#1a1d22'); C(g, 24, 32, 4, '#5ae07a'); C(g, 40, 32, 4, '#5ae07a'); L(g, [10, 30, 6, 40], '#2a2d31', 3); L(g, [54, 30, 58, 40], '#2a2d31', 3); },
  headlamp: (g) => { L(g, [10, 36, 54, 36], '#3a3f46', 5); RR(g, 24, 26, 16, 14, 4, '#e0c040'); C(g, 32, 33, 5, '#fff8c0'); },
  jeans: (g) => { P(g, [18, 10, 46, 10, 48, 54, 36, 54, 32, 24, 28, 54, 16, 54], '#3a5a8a'); L(g, [18, 16, 46, 16], '#2a4064', 2); },
  cargo: (g) => { P(g, [18, 10, 46, 10, 48, 54, 36, 54, 32, 24, 28, 54, 16, 54], '#6a6a44'); R(g, 15, 30, 9, 9, '#56562f'); R(g, 40, 30, 9, 9, '#56562f'); },
  kevlarpants: (g) => { P(g, [18, 10, 46, 10, 48, 54, 36, 54, 32, 24, 28, 54, 16, 54], '#2c3440'); R(g, 17, 32, 10, 12, '#3a4658'); R(g, 37, 32, 10, 12, '#3a4658'); },
  sneakers: (g) => { RR(g, 10, 30, 34, 14, 7, '#e8e8e8'); R(g, 10, 40, 36, 5, '#b8b8b8'); RR(g, 30, 22, 24, 14, 6, '#e8e8e8'); L(g, [16, 34, 28, 34], '#5a8ac0', 2); },
  boots: (g) => { R(g, 18, 12, 14, 30, '#2a2622'); RR(g, 18, 34, 32, 14, 5, '#2a2622'); R(g, 18, 46, 34, 4, '#111'); L(g, [20, 18, 30, 18, 20, 24, 30, 24, 20, 30, 30, 30], '#7a6a4a', 1); },
  runners: (g) => { RR(g, 10, 30, 40, 14, 7, '#c83a3a'); R(g, 10, 40, 42, 5, '#eee'); L(g, [16, 32, 30, 40], '#fff', 2); L(g, [24, 32, 36, 40], '#fff', 2); },
  reviver: (g) => { RR(g, 12, 18, 40, 30, 6, '#f0f0f0'); RR(g, 15, 21, 34, 24, 4, '#ff5aa0'); P(g, [24, 33, 29, 33, 31, 27, 34, 39, 36, 33, 41, 33], '#fff'); L(g, [20, 33, 24, 33, 29, 33], '#fff', 2); L(g, [41, 33, 45, 33], '#fff', 2); L(g, [26, 18, 26, 13, 38, 13, 38, 18], '#c8ccd0', 3); },
  shotgun: (g) => { R(g, 6, 26, 40, 6, '#5a6068'); R(g, 24, 32, 16, 5, '#5a4030'); P(g, [46, 24, 58, 26, 60, 40, 50, 40, 46, 32], '#6a4a30'); R(g, 6, 24, 30, 2, '#7a8088'); },
  rifle: (g) => { R(g, 4, 28, 40, 5, '#5a6068'); P(g, [40, 26, 60, 28, 60, 40, 48, 40, 40, 33], '#7a5434'); RR(g, 20, 20, 18, 6, 2, '#1a1a1a'); C(g, 20, 23, 3, '#5aa0d0'); R(g, 30, 33, 3, 6, '#5a6068'); },
  ammo9: (g) => { RR(g, 12, 28, 40, 24, 3, '#c8a83a'); for (let k = 0; k < 6; k++) bullet(g, 14 + k * 6, 18, 12, '#e0c060'); R(g, 16, 38, 32, 7, '#2a2a2a'); P(g, [22, 40, 26, 40, 24, 43], '#e0c060'); },
  ammomed: (g) => { RR(g, 12, 26, 40, 26, 3, '#4a8a4a'); for (let k = 0; k < 5; k++) bullet(g, 15 + k * 7, 12, 18, '#d0a040'); R(g, 16, 38, 32, 7, '#2a2a2a'); P(g, [20, 40, 24, 40, 22, 43], '#7ad07a'); P(g, [26, 40, 30, 40, 28, 43], '#7ad07a'); },
  ammo308: (g) => { RR(g, 12, 26, 40, 26, 3, '#a03a3a'); for (let k = 0; k < 4; k++) bullet(g, 16 + k * 9, 6, 26, '#d0a040'); R(g, 16, 38, 32, 7, '#2a2a2a'); for (let k = 0; k < 3; k++) P(g, [19 + k * 6, 40, 23 + k * 6, 40, 21 + k * 6, 43], '#ff8a7a'); },
  shells: (g) => { RR(g, 10, 30, 44, 22, 3, '#7a2a2a'); for (let k = 0; k < 4; k++) { RR(g, 13 + k * 10, 14, 8, 22, 2, '#c02a2a'); R(g, 13 + k * 10, 30, 8, 6, '#d0a040'); } },
  carbine: (g) => { R(g, 4, 28, 14, 6, '#3a3f46'); R(g, 18, 26, 22, 9, '#4a5058'); R(g, 40, 29, 16, 3, '#2a2d31'); R(g, 26, 35, 6, 12, '#2a2d31'); R(g, 22, 22, 12, 4, '#1e1e1e'); },
  schoolbag: (g) => bag(g, '#3a6ab0', '#2a4a80'),
  hikingbag: (g) => bag(g, '#4a8a4a', '#2e5e2e', true),
  milbag: (g) => bag(g, '#5a6040', '#3e4228', true),
  jacket: (g) => { P(g, [20, 12, 44, 12, 56, 24, 50, 30, 46, 26, 46, 54, 18, 54, 18, 26, 14, 30, 8, 24], '#5a3820'); L(g, [32, 12, 32, 54], '#3a2412', 2); P(g, [26, 12, 32, 22, 38, 12], '#3a2412'); },
  vest: (g) => { P(g, [20, 12, 28, 12, 32, 20, 36, 12, 44, 12, 48, 24, 48, 54, 16, 54, 16, 24], '#26324a'); R(g, 20, 34, 24, 8, '#e0e0e0'); R(g, 22, 36, 20, 4, '#26324a'); },
  silencer: (g) => diag(g, () => { RR(g, -24, -8, 48, 16, 3, '#8a929a'); R(g, -24, -8, 48, 4, '#b4bcc4'); R(g, -12, -8, 5, 16, MODS.silencer.color); R(g, 2, -8, 5, 16, MODS.silencer.color); R(g, 24, -4, 5, 8, '#7a8088'); }),
  extmag: (g) => { P(g, [22, 8, 40, 8, 44, 56, 26, 56], '#2a2d31'); P(g, [22, 8, 27, 8, 31, 56, 26, 56], '#4a5058'); R(g, 24, 42, 20, 14, MODS.extmag.color); for (let k = 0; k < 3; k++) R(g, 28, 14 + k * 8, 10, 3, '#d0a040'); },
  noisemaker: (g) => { C(g, 32, 36, 16, '#8a4aa0'); C(g, 32, 36, 12, '#f0e8f0'); L(g, [32, 36, 32, 28], '#222', 2); L(g, [32, 36, 38, 38], '#222', 2); C(g, 20, 20, 6, '#c8a030'); C(g, 44, 20, 6, '#c8a030'); },
  pipebomb: (g) => diag(g, () => { R(g, -18, -7, 34, 14, '#6a7076'); R(g, -22, -9, 6, 18, '#4a4f55'); R(g, 14, -9, 6, 18, '#4a4f55'); R(g, -10, -7, 4, 14, '#9a8a40'); L(g, [20, 0, 26, -6, 24, -12], '#a08060', 2); C(g, 24, -12, 3, '#ffb040'); }),
  watch: (g) => { R(g, 26, 8, 12, 48, '#5a3a20'); C(g, 32, 32, 13, '#d8b040'); C(g, 32, 32, 10, '#f0f0e8'); L(g, [32, 32, 32, 25], '#222', 2); L(g, [32, 32, 37, 34], '#222', 2); },
  jewelry: (g) => { g.strokeStyle = '#e0c050'; g.lineWidth = 3; g.beginPath(); g.arc(32, 26, 16, 0.2, Math.PI - 0.2); g.stroke(); P(g, [32, 40, 38, 46, 32, 54, 26, 46], '#40b0e0'); C(g, 30, 45, 2, 'rgba(255,255,255,0.7)'); },
  cash: (g) => { for (let k = 0; k < 3; k++) { RR(g, 10 + k * 3, 22 + k * 5, 42, 20, 2, k === 2 ? '#5a9a5a' : '#3e7a3e'); } C(g, 34, 42, 5, '#2e5e2e'); R(g, 24, 32, 3, 20, '#c0b060'); },
};

// Where mods sit on each gun drawing. muzzle: barrel tip, dir: which way it points, cx: centre of the
// gun plus silencer, used to shrink it into the icon. mag: rectangle for the part an Extended Mag adds.
const SILENCER_LEN = 14;
const MOUNT = {
  pistol: { muzzle: [52, 26], dir: 1, cx: 39, mag: [20, 45, 8, 11] },
  smg: { muzzle: [54, 28], dir: 1, cx: 37, mag: [26, 48, 6, 11] },
  carbine: { muzzle: [56, 30.5], dir: 1, cx: 37, mag: [26, 46, 6, 12] },
  shotgun: { muzzle: [6, 29], dir: -1, cx: 26, mag: [8, 33, 16, 4] },
  rifle: { muzzle: [4, 30.5], dir: -1, cx: 25, mag: [29, 38, 5, 10] },
};
function drawMounted(g, id, mods) {
  const m = MOUNT[id];
  if (mods.includes('extmag')) { const [x, y, w, h] = m.mag; RR(g, x, y, w, h, 1, MODS.extmag.color); }
  if (mods.includes('silencer')) {
    const x = m.dir > 0 ? m.muzzle[0] : m.muzzle[0] - SILENCER_LEN, y = m.muzzle[1] - 4.5;
    RR(g, x, y, SILENCER_LEN, 9, 2, '#8a929a'); R(g, x, y, SILENCER_LEN, 2, '#b4bcc4'); R(g, x + 3, y, 3, 9, MODS.silencer.color); R(g, x + 8, y, 3, 9, MODS.silencer.color);
  }
}
// small lettered tags so mods read at hotbar size even at a glance
function drawTags(g, mods) {
  Object.keys(MODS).filter((id) => mods.includes(id)).forEach((id, k) => {
    RR(g, 17 + k * 16, 3, 14, 14, 3, MODS[id].color); // starts past the corner, where the hotbar draws its slot number
    g.fillStyle = '#10141a'; g.font = '800 11px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(MODS[id].short, 24 + k * 16, 10.5);
  });
}

export function iconCanvas(id, mods = []) {
  const key = id + '|' + mods.join();
  let c = cache.get(key); if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const fn = DRAW[id];
  if (fn) {
    g.save(); g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowOffsetY = 2; g.shadowBlur = 3;
    const mounted = mods.length > 0 && MOUNT[id];
    if (mounted && mods.includes('silencer')) { g.translate(32, 32); g.scale(0.84, 0.84); g.translate(-mounted.cx, -32); }
    fn(g);
    if (mounted) drawMounted(g, id, mods);
    g.restore();
    if (mods.length) drawTags(g, mods);
  } else { C(g, 32, 32, 14, '#888'); }
  cache.set(key, c); return c;
}
export function iconURL(id, mods = []) {
  const key = id + '|' + mods.join();
  let u = urls.get(key); if (!u) { u = iconCanvas(id, mods).toDataURL(); urls.set(key, u); } return u;
}
