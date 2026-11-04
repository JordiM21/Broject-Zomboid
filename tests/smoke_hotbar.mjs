import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium } = require(process.env.PW || 'playwright');
import path from 'path';
const out = process.argv[2] || '.';
const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = [];
pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await pg.goto('file://' + path.resolve('dist/index.html'));
await pg.click('#btnNew'); await pg.waitForTimeout(400);
const hb0 = await pg.evaluate(() => window.__game.state.players.p1.hotbar.map((h) => h && h.id).join(','));
await pg.evaluate(() => { const p = window.__game.state.players.p1; p.inv.push({ id: 'katana', n: 1, dur: 140 }, { id: 'milhelmet', n: 1 }, { id: 'nvg', n: 1 }, { id: 'boots', n: 1 }, { id: 'cargo', n: 1 }, { id: 'adrenaline', n: 2 }); p.thirst = 50; });
await pg.keyboard.press('Tab'); await pg.waitForTimeout(300);
// drag katana (idx 4) onto hotbar slot 5
await pg.dragAndDrop('#inv .tile[data-side="inv"][data-idx="4"]', '#hotbar .hs[data-k="4"]'); await pg.waitForTimeout(150);
// hover adrenaline and press 6 to assign
await pg.hover('#inv .tile[data-side="inv"][data-idx="9"]'); await pg.keyboard.press('Digit6'); await pg.waitForTimeout(100);
// equip gear by drag onto gear slots / E
for (const idx of [8, 7, 6, 5]) { await pg.hover(`#inv .tile[data-side="inv"][data-idx="${idx}"]`); await pg.keyboard.press('KeyE'); await pg.waitForTimeout(80); }
await pg.waitForTimeout(300);
await pg.screenshot({ path: out + '/s_gear.png' });
await pg.keyboard.press('Tab'); await pg.waitForTimeout(100);
await pg.keyboard.press('Digit5'); await pg.waitForTimeout(150);
const r = await pg.evaluate(() => { const p = window.__game.state.players.p1; return { hot: p.hotbar.map((h) => h && h.id).join(','), wpn: p.wpn && p.wpn.id, gear: Object.values(p.gear).map((g) => g && g.id).join(','), carryCap: 0 }; });
await pg.keyboard.press('Digit6'); await pg.waitForTimeout(150);
const buffs = await pg.evaluate(() => JSON.stringify(window.__game.state.players.p1.buffs));
await pg.screenshot({ path: out + '/s_hotbar.png' });
console.log('start hotbar', hb0, '| after', JSON.stringify(r), '| buffs', buffs);
console.log(errs.length ? errs.join('\n') : 'no errors');
await b.close();
