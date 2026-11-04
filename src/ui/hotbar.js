// DOM hotbar: drag items from the inventory onto slots, drag slots to reorder, drag off or right-click to clear.
import { ITEMS } from '../data/items.js';
import { iconURL } from './icons.js';

const findRef = (p, h) => (h ? (h.ref && p.inv.includes(h.ref) ? h.ref : p.inv.find((i) => i.id === h.id) || null) : null);

export class HotbarUI {
  constructor(el, h) {
    this.el = el; this.h = h; this.last = ''; this.drag = null;
    el.addEventListener('mousedown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => { const sl = e.target.closest('.hs'); if (sl) h.use(+sl.dataset.k); else if (e.target.closest('.fist')) h.holster(); });
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); const sl = e.target.closest('.hs'); if (sl) h.cmd({ t: 'hotbar', slot: +sl.dataset.k, idx: null }); });
    el.addEventListener('dragstart', (e) => { const sl = e.target.closest('.hs'); if (!sl) return; this.drag = +sl.dataset.k; e.dataTransfer.setData('text/plain', 'hot'); e.dataTransfer.effectAllowed = 'move'; });
    el.addEventListener('dragend', (e) => { if (this.drag !== null && e.dataTransfer.dropEffect === 'none') h.cmd({ t: 'hotbar', slot: this.drag, idx: null }); this.drag = null; this.clearOver(); });
    el.addEventListener('dragover', (e) => { const sl = e.target.closest('.hs'); if (!sl) return; e.preventDefault(); e.stopPropagation(); this.clearOver(); sl.classList.add('over'); });
    el.addEventListener('dragleave', (e) => { const sl = e.target.closest('.hs'); if (sl && !sl.contains(e.relatedTarget)) sl.classList.remove('over'); });
    el.addEventListener('drop', (e) => {
      const sl = e.target.closest('.hs'); if (!sl) return; e.preventDefault(); e.stopPropagation(); this.clearOver();
      const k = +sl.dataset.k;
      if (this.drag !== null) { if (this.drag !== k) h.cmd({ t: 'hotswap', a: this.drag, b: k }); this.drag = null; }
      else { const d = h.invDrag(); if (d) h.assign(k, d); }
      this.last = '';
    });
  }
  clearOver() { this.el.querySelectorAll('.over').forEach((n) => n.classList.remove('over')); }
  render(p, visible) {
    this.el.classList.toggle('hidden', !visible); if (!visible || !p) return;
    let html = `<div class="fist ${p.wpn ? '' : 'eq'}" title="Unarmed"><img src="${iconURL('fists')}" alt=""><span class="key">~</span></div>`;
    for (let k = 0; k < 6; k++) {
      const h = p.hotbar && p.hotbar[k], it = findRef(p, h);
      let extra = '';
      if (h) {
        const d = ITEMS[h.id];
        if (d.cat === 'gun' && it) { const res = p.inv.filter((i) => i.id === d.ammo).reduce((a, b) => a + b.n, 0); extra = `<span class="cnt ${it.mag ? '' : 'red'}">${it.mag}/${res}</span>`; }
        else if (d.dur && it && it.dur !== undefined) { const f = it.dur / d.dur; extra = `<div class="dur"><i style="width:${Math.round(f * 100)}%;background:${f > 0.5 ? '#7ad07a' : f > 0.2 ? '#d0c04a' : '#d05a4a'}"></i></div>`; }
        else if (d.cat !== 'melee') { const n = p.inv.filter((i) => i.id === h.id).reduce((a, b) => a + b.n, 0); extra = `<span class="cnt ${n ? '' : 'red'}">${n}</span>`; }
      }
      const name = h ? ITEMS[h.id].name : 'Empty: drag an item here';
      html += `<div class="hs ${it && it === p.wpn ? 'eq' : ''} ${h && !it ? 'gone' : ''}" draggable="${!!h}" data-k="${k}" title="${name}"><span class="key">${k + 1}</span>${h ? `<img src="${iconURL(h.id)}" alt="" draggable="false">` : ''}${extra}</div>`;
    }
    if (html !== this.last) { this.last = html; this.el.innerHTML = html; }
  }
}
