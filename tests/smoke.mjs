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
await pg.waitForTimeout(800);
await pg.keyboard.down('KeyS'); await pg.waitForTimeout(1200); await pg.keyboard.up('KeyS');
await pg.mouse.move(800, 300);
await pg.waitForTimeout(400);
await pg.screenshot({ path: out + '/shot1.png' });
// walk out and look around
await pg.keyboard.down('KeyS'); await pg.keyboard.down('ShiftLeft'); await pg.waitForTimeout(3500); await pg.keyboard.up('KeyS'); await pg.keyboard.up('ShiftLeft');
await pg.screenshot({ path: out + '/shot2.png' });
// night
await pg.evaluate(() => { window.__game.state.time = 600 * (14 / 24); });
await pg.waitForTimeout(500);
await pg.screenshot({ path: out + '/shot3.png' });
await pg.keyboard.press('Tab'); await pg.waitForTimeout(300);
await pg.screenshot({ path: out + '/shot4.png' });
const fps = await pg.evaluate(() => new Promise((r) => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t < 1000) requestAnimationFrame(f); else r(n); }; requestAnimationFrame(f); }));
console.log('fps', fps);
console.log(errs.length ? errs.join('\n') : 'no errors');
await b.close();
