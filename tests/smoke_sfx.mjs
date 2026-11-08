// Real-recording check: all samples decode, and the sample-backed events actually start a source.
import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium } = require(process.env.PW || 'playwright');
import path from 'path';
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const pg = await b.newPage(); const errs = [];
pg.on('pageerror', (e) => errs.push(e.message));
await pg.goto('file://' + path.resolve('dist/index.html'));
await pg.click('#btnNew'); await pg.waitForTimeout(300);
const r = await pg.evaluate(async () => {
  const sfx = window.__game.sfx, p = window.__game.state.players.p1; sfx.init(); await sfx.ctx.resume();
  for (let i = 0; i < 50 && Object.keys(sfx.buf).length < 20; i++) await new Promise((r) => setTimeout(r, 100));
  const out = { loaded: Object.keys(sfx.buf).sort() };
  for (const [t, extra] of [['groan', { zid: 3 }], ['groan', { zid: 1 }], ['groan', { ztype: 'brute' }], ['alert', {}], ['zattack', {}], ['zdie', {}], ['door', { open: true }], ['door', { open: false }], ['glass', {}], ['reload', { gun: 'pistol' }], ['horde', {}]]) {
    const before = sfx.live; sfx.play({ type: t, x: p.x + 60, y: p.y, pid: 'p1', ...extra }, 'p1'); out[t + JSON.stringify(extra)] = sfx.live - before;
  }
  sfx.update(0.016, { indoor: false, hp: 100, dead: false, day: 0 }); sfx.amb.far = 0; sfx.update(0.016, { indoor: false, hp: 100, dead: false, day: 0 });
  return out;
});
console.log(JSON.stringify(r, null, 1), errs.length ? errs.join('\n') : 'no page errors');
await b.close();
