import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium } = require(process.env.PW || 'playwright');
import path from 'path';
const out = process.argv[2] || '.';
const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = [];
pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await pg.goto('file://' + path.resolve('dist/index.html'));
await pg.click('#btnNew'); await pg.waitForTimeout(200);
// fill stash with every item and open it
await pg.evaluate(() => { const s = window.__game.state, p = s.players.p1, w = s.world, st = w.containers[w.fixtures.stash];
  const ids = ['pistol','shotgun','rifle','knife','bat','spikedbat','crowbar','machete','axe','ammo9','shells','ammo308','bandage','rag','painkillers','antibiotics','medkit','beans','chips','apple','mre','water','soda','scrap','plank','nails','cloth','tape','electronics','schoolbag','hikingbag','milbag','jacket','vest','noisemaker','pipebomb','watch','jewelry','cash'];
  for (const id of ids) st.items.push({ id, n: 1, dur: 30, mag: 3 });
  p.x = (st.x + 1.5) * 32; p.y = (st.y + 1.5) * 32; p.openCid = st.id; s.events.push({ type: 'open', pid: 'p1', cid: st.id }); });
await pg.waitForTimeout(400);
await pg.hover('#inv .tile[data-side="cont"][data-idx="0"]'); await pg.waitForTimeout(200);
await pg.screenshot({ path: out + '/s_grid.png' });
// drag pistol from stash to inventory, then drag beans to ground
await pg.dragAndDrop('#inv .tile[data-side="cont"][data-idx="0"]', '#inv .col[data-drop="inv"]');
await pg.waitForTimeout(150);
const r1 = await pg.evaluate(() => window.__game.state.players.p1.inv.map((i) => i.id).join(','));
await pg.click('#inv [data-act="sortInv"]');
// corpse: kill a zombie next to player outside, search it
await pg.keyboard.press('Tab');
const r2 = await pg.evaluate(() => { const s = window.__game.state, p = s.players.p1; const z = s.zombies[5]; p.x = z.x - 30; p.y = z.y; p.ang = 0; z.hp = 1; z.state = 'idle';
  return s.loose.length; });
await pg.waitForTimeout(900);
await pg.mouse.move(800, 400); await pg.mouse.down(); await pg.waitForTimeout(120); await pg.mouse.up(); await pg.waitForTimeout(600);
const r3 = await pg.evaluate(() => { const s = window.__game.state; const c = s.loose.map((id) => s.world.containers[id]).find((c) => c.type === 'zombie'); if (!c) return 'no corpse'; const p = s.players.p1; p.x = c.px - 20; p.y = c.py; p.ang = 0; return 'corpse ok'; });
await pg.keyboard.press('KeyE'); await pg.waitForTimeout(1200);
const r4 = await pg.evaluate(() => { const p = window.__game.state.players.p1; return p.openCid; });
await pg.screenshot({ path: out + '/s_corpse.png' });
console.log(r1, '|', r2, r3, 'opened', r4);
console.log(errs.length ? errs.join('\n') : 'no errors');
await b.close();
