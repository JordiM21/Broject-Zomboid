import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium } = require(process.env.PW || 'playwright');
import path from 'path';
const out = process.argv[2] || '.';
const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: 1280, height: 760 } });
const errs = [];
pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
pg.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await pg.goto('file://' + path.resolve('dist/index.html'));
await pg.click('#btnNew');
await pg.waitForTimeout(300);
// teleport next to a fridge in a house and search it
const info = await pg.evaluate(() => {
  const s = window.__game.state, w = s.world, p = s.players.p1;
  const c = w.containers.find((k) => k.type === 'fridge');
  // stand on a free neighbor tile
  for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const tx = c.x + dx, ty = c.y + dy, t = w.tiles[ty * w.w + tx]; if (t === 3 || t === 11 || t === 12) { p.x = (tx + .5) * 32; p.y = (ty + .5) * 32; p.ang = Math.atan2(-dy, -dx); break; } }
  return { cx: c.x, cy: c.y, px: p.x, py: p.y };
});
await pg.mouse.move(640 - 0, 380);
await pg.waitForTimeout(300);
const scr = await pg.evaluate(({ cx, cy }) => { return null; }, info);
await pg.keyboard.press('KeyE'); await pg.waitForTimeout(1500);
await pg.screenshot({ path: out + '/s_inv.png' });
await pg.keyboard.press('Escape');
// base panel with materials
await pg.evaluate(() => { const s = window.__game.state, p = s.players.p1; p.x = s.world.spawn.x; p.y = s.world.spawn.y;
  const st = s.world.containers[s.world.fixtures.stash]; st.items.push({ id: 'plank', n: 10 }, { id: 'nails', n: 30 }, { id: 'scrap', n: 8 }, { id: 'cloth', n: 6 });
  s.events.push({ type: 'ui', pid: 'p1', panel: 'base', tab: 'upgrades' }); });
await pg.waitForTimeout(400);
await pg.screenshot({ path: out + '/s_base.png' });
await pg.click('button[data-id="bench"]'); await pg.waitForTimeout(200);
const up = await pg.evaluate(() => window.__game.state.upgrades.bench);
await pg.keyboard.press('Escape');
// fight: put player near zombies outside
await pg.evaluate(() => { const s = window.__game.state, p = s.players.p1; const z = s.zombies.find((z) => Math.hypot(z.x - p.x, z.y - p.y) > 800); p.x = z.x - 70; p.y = z.y; p.inv.push({ id: 'pistol', n: 1, mag: 12 }, { id: 'ammo9', n: 30 }); });
await pg.waitForTimeout(300);
const zs = await pg.evaluate(() => { const s = window.__game.state, p = s.players.p1; const z = s.zombies.reduce((a, b) => Math.hypot(a.x - p.x, a.y - p.y) < Math.hypot(b.x - p.x, b.y - p.y) ? a : b); return { x: z.x - p.x, y: z.y - p.y }; });
await pg.mouse.move(640 + zs.x * 1.5, 380 + zs.y * 1.5);
await pg.keyboard.press('Digit3');
await pg.mouse.down(); await pg.waitForTimeout(700); await pg.mouse.up();
await pg.waitForTimeout(100);
await pg.screenshot({ path: out + '/s_fight.png' });
const st = await pg.evaluate(() => ({ kills: window.__game.state.stats.kills, hp: window.__game.state.players.p1.hp }));
console.log('bench built', up, 'stats', JSON.stringify(st));
console.log(errs.length ? errs.join('\n') : 'no errors');
await b.close();
