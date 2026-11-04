import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium } = require(process.env.PW || 'playwright');
import path from 'path';
const out = process.argv[2] || '.';
const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = [];
pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await pg.goto('file://' + path.resolve('dist/index.html'));
await pg.click('#btnNew'); await pg.waitForTimeout(400);
// street with zombies, SMG
await pg.evaluate(() => { const s = window.__game.state, p = s.players.p1; const z0 = s.zombies.find((z) => Math.hypot(z.x - p.x, z.y - p.y) > 900);
  p.x = z0.x - 200; p.y = z0.y; s.zombies = s.zombies.filter((z) => Math.hypot(z.x - p.x, z.y - p.y) > 500);
  for (let k = 0; k < 5; k++) { const z = window.__game.spawn(p.x + 220 + k * 18, p.y - 30 + k * 15, 'walker'); z.state = 'chase'; z.pid = 'p1'; }
  p.inv.push({ id: 'smg', n: 1, mag: 30 }, { id: 'ammo9', n: 60 }); p.wpn = p.inv[p.inv.length - 2]; });
await pg.waitForTimeout(700); await pg.mouse.move(860, 400); await pg.mouse.down(); await pg.waitForTimeout(420);
const live = await pg.evaluate(() => window.__game.state.bullets.length);
await pg.screenshot({ path: out + '/s_guns.png' }); await pg.mouse.up(); await pg.waitForTimeout(600);
const st = await pg.evaluate(() => ({ kills: window.__game.state.stats.kills, mag: window.__game.state.players.p1.wpn.mag }));
// drop to backpack
await pg.keyboard.press('Tab'); await pg.waitForTimeout(200);
await pg.dragAndDrop('#inv .tile[data-side="inv"][data-idx="1"]', '#game', { targetPosition: { x: 80, y: 80 } }); await pg.waitForTimeout(150);
await pg.keyboard.press('Tab');
const bag = await pg.evaluate(() => { const s = window.__game.state; const c = s.loose.map((i) => s.world.containers[i]).find((c) => c && c.type === 'pile'); return c ? c.label + ' ' + c.items.length : 'none'; });
// map: reveal everything and hover the hospital
await pg.evaluate(() => { const g = window.__game; g.revealAll(); });
await pg.keyboard.press('KeyM'); await pg.waitForTimeout(200);
const hp = await pg.evaluate(() => { const s = window.__game.state, z = s.world.zones.find((z) => z.kind === 'hospital'); const size = Math.min(innerWidth, innerHeight) - 110, x = innerWidth / 2 - size / 2, y = innerHeight / 2 - size / 2 - 12; return [x + (z.x / 32) * size / s.world.w, y + (z.y / 32) * size / s.world.w]; });
await pg.mouse.move(hp[0], hp[1]); await pg.waitForTimeout(300);
await pg.screenshot({ path: out + '/s_map.png' });
console.log('bullets in flight', live, '| after burst', JSON.stringify(st), '| dropped:', bag);
console.log(errs.length ? errs.join('\n') : 'no errors');
await b.close();
