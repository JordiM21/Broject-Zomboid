// Procedural item icons drawn on a 64x64 canvas. Cached as canvases and data URLs.
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
  shotgun: (g) => { R(g, 6, 26, 40, 6, '#5a6068'); R(g, 24, 32, 16, 5, '#5a4030'); P(g, [46, 24, 58, 26, 60, 40, 50, 40, 46, 32], '#6a4a30'); R(g, 6, 24, 30, 2, '#7a8088'); },
  rifle: (g) => { R(g, 4, 28, 40, 5, '#5a6068'); P(g, [40, 26, 60, 28, 60, 40, 48, 40, 40, 33], '#7a5434'); RR(g, 20, 20, 18, 6, 2, '#1a1a1a'); C(g, 20, 23, 3, '#5aa0d0'); R(g, 30, 33, 3, 6, '#5a6068'); },
  ammo9: (g) => { RR(g, 12, 28, 40, 24, 3, '#4a5a3a'); for (let k = 0; k < 5; k++) bullet(g, 15 + k * 7, 16, 14, '#d0a040'); R(g, 16, 38, 32, 6, '#e0d0a0'); },
  shells: (g) => { for (let k = 0; k < 4; k++) { RR(g, 12 + k * 11, 18, 9, 24, 2, '#c02a2a'); R(g, 12 + k * 11, 40, 9, 8, '#d0a040'); } },
  ammo308: (g) => { for (let k = 0; k < 4; k++) bullet(g, 14 + k * 10, 10, 40, '#d0a040'); },
  schoolbag: (g) => bag(g, '#3a6ab0', '#2a4a80'),
  hikingbag: (g) => bag(g, '#4a8a4a', '#2e5e2e', true),
  milbag: (g) => bag(g, '#5a6040', '#3e4228', true),
  jacket: (g) => { P(g, [20, 12, 44, 12, 56, 24, 50, 30, 46, 26, 46, 54, 18, 54, 18, 26, 14, 30, 8, 24], '#5a3820'); L(g, [32, 12, 32, 54], '#3a2412', 2); P(g, [26, 12, 32, 22, 38, 12], '#3a2412'); },
  vest: (g) => { P(g, [20, 12, 28, 12, 32, 20, 36, 12, 44, 12, 48, 24, 48, 54, 16, 54, 16, 24], '#26324a'); R(g, 20, 34, 24, 8, '#e0e0e0'); R(g, 22, 36, 20, 4, '#26324a'); },
  noisemaker: (g) => { C(g, 32, 36, 16, '#8a4aa0'); C(g, 32, 36, 12, '#f0e8f0'); L(g, [32, 36, 32, 28], '#222', 2); L(g, [32, 36, 38, 38], '#222', 2); C(g, 20, 20, 6, '#c8a030'); C(g, 44, 20, 6, '#c8a030'); },
  pipebomb: (g) => diag(g, () => { R(g, -18, -7, 34, 14, '#6a7076'); R(g, -22, -9, 6, 18, '#4a4f55'); R(g, 14, -9, 6, 18, '#4a4f55'); R(g, -10, -7, 4, 14, '#9a8a40'); L(g, [20, 0, 26, -6, 24, -12], '#a08060', 2); C(g, 24, -12, 3, '#ffb040'); }),
  watch: (g) => { R(g, 26, 8, 12, 48, '#5a3a20'); C(g, 32, 32, 13, '#d8b040'); C(g, 32, 32, 10, '#f0f0e8'); L(g, [32, 32, 32, 25], '#222', 2); L(g, [32, 32, 37, 34], '#222', 2); },
  jewelry: (g) => { g.strokeStyle = '#e0c050'; g.lineWidth = 3; g.beginPath(); g.arc(32, 26, 16, 0.2, Math.PI - 0.2); g.stroke(); P(g, [32, 40, 38, 46, 32, 54, 26, 46], '#40b0e0'); C(g, 30, 45, 2, 'rgba(255,255,255,0.7)'); },
  cash: (g) => { for (let k = 0; k < 3; k++) { RR(g, 10 + k * 3, 22 + k * 5, 42, 20, 2, k === 2 ? '#5a9a5a' : '#3e7a3e'); } C(g, 34, 42, 5, '#2e5e2e'); R(g, 24, 32, 3, 20, '#c0b060'); },
};

export function iconCanvas(id) {
  let c = cache.get(id); if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const fn = DRAW[id];
  if (fn) { g.save(); g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowOffsetY = 2; g.shadowBlur = 3; fn(g); g.restore(); }
  else { C(g, 32, 32, 14, '#888'); }
  cache.set(id, c); return c;
}
export function iconURL(id) {
  let u = urls.get(id); if (!u) { u = iconCanvas(id).toDataURL(); urls.set(id, u); } return u;
}
