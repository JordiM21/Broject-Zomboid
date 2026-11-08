// DOM hotbar: the first row of the inventory (slots 0..8). Click or press 1-9 to use; the wheel cycles weapons.
// Drag a slot onto another to swap them.
import { ITEMS } from '../data/items.js';
import { HOT_SLOTS } from '../config.js';
import { slotOf } from '../sim/inventory.js';
import { iconURL } from './icons.js';

function hotSlot(p, k) {
  const it = slotOf(p.inv, k);
  let extra = '';
  if (it) {
    const d = ITEMS[it.id];
    if (d.cat === 'gun') { const res = p.inv.filter((i) => i.id === d.ammo).reduce((a, b) => a + b.n, 0); extra = `<span class="cnt ${it.mag ? '' : 'red'}">${it.mag}/${res}</span>`; }
    else if (d.dur && it.dur !== undefined) { const f = it.dur / d.dur; extra = `<div class="dur"><i style="width:${Math.round(f * 100)}%;background:${f > 0.5 ? '#7ad07a' : f > 0.2 ? '#d0c04a' : '#d05a4a'}"></i></div>`; }
    else if (it.n > 1) extra = `<span class="cnt">${it.n}</span>`;
  }
  const name = it ? [ITEMS[it.id].name, ...(it.mods || []).map((id) => ITEMS[id].name)].join(' + ') : 'Empty';
  return `<div class="hs ${it && it === p.wpn ? 'eq' : ''}" data-k="${k}" title="${name}"><span class="key">${k + 1}</span>${it ? `<img src="${iconURL(it.id, it.mods)}" alt="" draggable="false">` : ''}${extra}</div>`;
}

export class HotbarUI {
  constructor(el, h) {
    this.el = el; this.h = h; this.last = '';
    el.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      const sl = e.target.closest('.hs'); if (e.button === 0 && sl && sl.querySelector('img')) this.press = { k: +sl.dataset.k, x: e.clientX, y: e.clientY };
    });
    addEventListener('mousemove', (e) => {
      const P = this.press; if (!P) return;
      if (!this.dragging && Math.hypot(e.clientX - P.x, e.clientY - P.y) > 6) { this.dragging = true; el.classList.add('dragging'); el.querySelector(`.hs[data-k="${P.k}"]`)?.classList.add('lift'); }
      if (!this.dragging) return;
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('#hotbar .hs');
      el.querySelectorAll('.over').forEach((n) => n !== over && n.classList.remove('over')); if (over) over.classList.add('over');
    });
    addEventListener('mouseup', (e) => {
      const P = this.press; this.press = null; if (!this.dragging) return;
      this.dragging = false; this.skip = true; setTimeout(() => { this.skip = false; }, 0);
      el.classList.remove('dragging'); el.querySelectorAll('.over,.lift').forEach((n) => n.classList.remove('over', 'lift'));
      const to = document.elementFromPoint(e.clientX, e.clientY)?.closest('#hotbar .hs');
      if (to && +to.dataset.k !== P.k) { h.cmd({ t: 'mv', a: { side: 'inv', i: P.k }, b: { side: 'inv', i: +to.dataset.k } }); this.last = ''; }
    });
    el.addEventListener('click', (e) => { if (this.skip) return; const sl = e.target.closest('.hs'); if (sl) h.use(+sl.dataset.k); else if (e.target.closest('.fist')) h.holster(); });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  render(p, visible) {
    this.el.classList.toggle('hidden', !visible); if (!visible || !p) return;
    let html = `<div class="fist ${p.wpn ? '' : 'eq'}" title="Unarmed"><img src="${iconURL('fists')}" alt=""></div>`;
    for (let k = 0; k < HOT_SLOTS; k++) html += hotSlot(p, k);
    if (html !== this.last) { this.last = html; this.el.innerHTML = html; }
  }
}
