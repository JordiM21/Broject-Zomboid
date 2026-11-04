import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium } = require(process.env.PW || 'playwright');
import path from 'path';
const out = process.argv[2] || '.';
const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1280, height: 760 } }); const errs = [];
pg.on('pageerror', (e) => errs.push(e.message));
await pg.goto('file://' + path.resolve('dist/index.html'));
await pg.click('#btnNew'); await pg.waitForTimeout(400);
await pg.evaluate(() => {
  const s = window.__game.state, w = s.world, p = s.players.p1;
  const st = w.containers.find((c) => c && c.type === 'stove'); const b = w.buildings[w.bld[st.y * w.w + st.x]];
  p.x = (b.x + b.w / 2) * 32; p.y = (b.y + b.h / 2) * 32; p.wpn = null; p.hp = 30;
  s.zombies = s.zombies.filter((z) => Math.hypot(z.x - p.x, z.y - p.y) > 500);
  for (const c of w.containers) if (c && w.bld[c.y * w.w + c.x] === b.id && Math.random() < 0.5) { c.searched = true; c.items = c.items || []; }
  for (const [i, wi] of Object.entries(w.windows)) if (w.bld[i] === b.id && Math.random() < 0.4) wi.broken = true;
});
await pg.mouse.move(700, 300); await pg.waitForTimeout(1200);
await pg.screenshot({ path: out + '/s_interior.png' });
console.log(errs.length ? errs.join('\n') : 'no errors');
await b.close();
