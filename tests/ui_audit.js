// Browser console audit of the inventory, stash and base panels. Paste into the dev server page opened with ?testgear.
// Reports each panel state's rectangle, whether anything moves between states, and any overflowing element.
// Saving is switched off first so it can't touch a real save.
(async () => {
  Storage.prototype.setItem = function () {};
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(1000);
  const g = window.__game; g.newGame(); await wait(200);
  const s = g.state, p = s.players.p1; s.zombies.length = 0;
  ['menu', 'death', 'pause', 'help'].forEach((id) => document.getElementById(id).classList.add('hidden'));
  const fx = s.world.fixtures, emit = (e) => { s.events.push(e); g.command({ t: 'noop' }); };
  const key = (code) => { dispatchEvent(new KeyboardEvent('keydown', { code })); dispatchEvent(new KeyboardEvent('keyup', { code })); };
  const closeAll = () => { for (const id of ['inv', 'base']) if (!document.getElementById(id).classList.contains('hidden')) key('Escape'); };
  const rect = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round).join(','); };
  const anim = (id) => { const e = document.getElementById(id); e.style.animation = 'none'; };
  for (const id of ['inv', 'base']) anim(id);
  const tileY = () => { const t = document.querySelector('#inv .tile[data-side="inv"]'); if (!t) return null; const r = t.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width)].join(','); };
  const overflow = (root) => {
    const bad = [], rr = root.getBoundingClientRect();
    for (const e of root.querySelectorAll('*')) {
      const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue;
      const scroller = getComputedStyle(e).overflowY !== 'visible' || e.closest('.grid, .cols, .scroll');
      const clip = e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'visible' && !e.classList.contains('nm') && !e.classList.contains('elbl');
      const out = !e.closest('.grid') && (r.right > rr.right + 1 || r.left < rr.left - 1 || r.bottom > rr.bottom + 1) && !scroller;
      if (clip || out) bad.push(`${e.tagName}.${e.className || ''} ${clip ? 'clipped' : 'outside'}`);
    }
    return [...new Set(bad)].slice(0, 12);
  };
  const report = {};
  const note = (name, id) => { report[name] = { panel: rect(id), firstTile: id === 'inv' ? tileY() : undefined, overflow: overflow(document.getElementById(id)) }; };

  p.inv.length = 0; p.wpn = null; p.hotbar = [null, null, null, null, null, null];
  const stock = ['rifle', 'pistol', 'smg', 'carbine', 'shotgun', 'crossbow', 'katana', 'sledge', 'spear', 'milbag', 'riotgear', 'ghillie', 'silencer', 'extmag', 'medkit', 'reviver', 'adrenaline', 'bandage', 'ammo9', 'ammomed', 'shells', 'ammo308', 'beans', 'water'];
  for (const id of stock) p.inv.push({ id, n: 1, mag: 1 });
  p.inv[0].mods = ['silencer', 'extmag'];

  key('Tab'); await wait(50); note('inventory, nothing hovered', 'inv');
  const tiles = () => [...document.querySelectorAll('#inv .tile[data-side="inv"]')];
  const hover = (t) => t.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  hover(tiles()[0]); await wait(30); note('inventory, hover modded rifle', 'inv');
  hover(tiles()[17]); await wait(30); note('inventory, hover short item', 'inv');
  key('Tab'); await wait(30);

  for (const [name, cid] of [['mod stash', fx.modstash], ['weapon rack (long)', fx.rack], ['main stash (empty)', fx.stash]]) {
    p.openCid = cid; const c = s.world.containers[cid]; c.items = c.items || []; emit({ type: 'open' }); await wait(50);
    note(name, 'inv');
    const g2 = document.querySelectorAll('#inv .grid')[1];
    if (g2 && g2.scrollHeight > g2.clientHeight) {
      g2.scrollTop = 200; const before = g2.scrollTop;
      g.command({ t: 'take', cid, idx: 0 }); await wait(30);
      report[name].scrollAfterTaking = `${before} -> ${document.querySelectorAll('#inv .grid')[1].scrollTop}`;
    }
    closeAll(); p.openCid = -1; await wait(30);
  }
  for (const tab of ['upgrades', 'craft', 'radio', 'stats']) { s.upgrades.bench = 1; emit({ type: 'ui', tab }); await wait(40); note('base: ' + tab, 'base'); }
  closeAll();
  report.window = `${innerWidth}x${innerHeight}`;
  return JSON.stringify(report, null, 1);
})();
