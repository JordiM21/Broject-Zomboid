import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium } = require(process.env.PW || 'playwright');
import path from 'path';
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const pg = await b.newPage(); const errs = [];
pg.on('pageerror', (e) => errs.push(e.message));
await pg.goto('file://' + path.resolve('dist/index.html'));
await pg.click('#btnNew'); await pg.waitForTimeout(300);
const r = await pg.evaluate(async () => {
  const g = window.__game, sfx = g.sfx; sfx.init(); await sfx.ctx.resume();
  const p = g.state.players.p1, types = ['gunshot','swing','zhit','silentKill','zdie','groan','alert','zattack','zstep','bash','doorbreak','door','searchStart','open','pickup','stow','equip','click','empty','reload','phurt','explode','beep','eat','drink','medStart','healed','built','shove','throw','step','objective','horde','pdie','slept'];
  const errs = [];
  for (const t of types) for (const extra of [{}, { ctype: 'fridge', cat: 'gun', id: 'bandage', surf: 3, w: 'knife', dur: 0.8 }, { ctype: 'car', cat: 'food', id: 'medkit', surf: 0, w: 'bat' }, { ctype: 'shelf', cat: 'med', id: 'painkillers', surf: 11 }]) {
    try { sfx.play({ type: t, x: p.x + 100, y: p.y + 50, pid: 'p1', open: true, ...extra }, 'p1'); } catch (e) { errs.push(t + ': ' + e.message); }
  }
  try { sfx.update(0.016, { indoor: true, hp: 20, dead: false }); } catch (e) { errs.push('update ' + e.message); }
  return { state: sfx.ctx.state, errs };
});
await pg.waitForTimeout(1500);
console.log(JSON.stringify(r), errs.length ? errs.join('\n') : 'no page errors');
await b.close();
