import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium } = require(process.env.PW || 'playwright');
import path from 'path';
const out = process.argv[2] || '.';
const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1200, height: 900 } }); const errs = [];
pg.on('pageerror', (e) => errs.push(e.message));
await pg.goto('file://' + path.resolve('dist/index.html'));
await pg.evaluate(() => {
  const { playerFrame, zombieFrame, P_ANIMS, Z_ANIMS } = window.__sprites;
  const c = document.createElement('canvas'); c.width = 1200; c.height = 900; c.style.cssText = 'position:fixed;inset:0;z-index:99;background:#5a5a4c';
  document.body.appendChild(c); const g = c.getContext('2d'); g.fillStyle = '#4a4a3e'; g.fillRect(0, 0, 1200, 900);
  g.font = '11px sans-serif'; g.fillStyle = '#fff';
  let y = 4; const S = 64;
  const row = (label, fn, n) => { g.fillText(label, 4, y + 34); for (let i = 0; i < n; i++) g.drawImage(fn((i + 0.5) / n), 110 + i * S, y, S, S); y += S - 6; };
  row('walk bat', (t) => playerFrame('bat', null, 'hikingbag', 'walk', t), 8);
  row('swing bat', (t) => playerFrame('bat', null, null, 'attack', t), 8);
  row('stab knife', (t) => playerFrame('knife', 'jacket', null, 'attack', t), 8);
  row('axe', (t) => playerFrame('axe', 'vest', 'milbag', 'attack', t), 8);
  row('rifle reload', (t) => playerFrame('rifle', 'vest', null, 'reload', t), 6);
  row('pistol fire', (t) => playerFrame('pistol', null, null, 'attack', t), 8);
  row('katana', (t) => playerFrame('katana', 'ghillie', null, 'attack', t), 8);
  row('sledge', (t) => playerFrame('sledge', 'riotgear', null, 'attack', t), 8);
  row('spear', (t) => playerFrame('spear', null, null, 'attack', t), 8);
  row('crossbow/smg', (t) => t < 0.5 ? playerFrame('crossbow', null, null, 'attack', t * 2) : playerFrame('smg', null, null, 'attack', (t - 0.5) * 2), 8);
  row('heal / shove', (t) => t < 0.5 ? playerFrame('fists', null, null, 'heal', t * 2) : playerFrame('fists', null, null, 'shove', (t - 0.5) * 2), 9);
  for (const [ty, v] of [['walker', 0], ['brute', 0]]) {
    row(ty + ' walk', (t) => zombieFrame(ty, v, 'walk', t), 8);
  }
  row('walker atk', (t) => zombieFrame('walker', 1, 'attack', t), 6);
  row('hit + death', (t) => t < 0.3 ? zombieFrame('walker', 3, 'hit', t / 0.3) : zombieFrame('walker', 3, 'death', (t - 0.3) / 0.7), 10);
});
await pg.screenshot({ path: out + '/sheet.png', clip: { x: 0, y: 0, width: 760, height: 900 } });
console.log(errs.length ? errs.join('\n') : 'no errors');
await b.close();
