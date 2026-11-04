// DOM panels: inventory/container transfer, base (upgrades, crafting, radio), menus.
import { ITEMS, CAT_COLOR, UPGRADES, RECIPES, STASH_CAP, TRADE_COST } from '../data/items.js';
import { getCont, contCap, contLabel, capacity, carried, costStatus, dayOf } from '../sim/sim.js';

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function itemRow(it, idx, side, p) {
  const d = ITEMS[it.id];
  const eq = it === p.wpn ? '<span class="tag">EQUIPPED</span>' : '';
  let meta = '';
  if (d.dur && it.dur !== undefined) meta = `${Math.round((it.dur / d.dur) * 100)}%`;
  if (d.cat === 'gun') meta = `${it.mag}/${d.mag}`;
  const use = side === 'inv' && it !== p.wpn ? ({ food: 'Eat', med: 'Use', melee: 'Equip', gun: 'Equip', bag: 'Wear', armor: 'Wear' }[d.cat] || '') : '';
  return `<div class="item" data-act="${side === 'inv' ? 'put' : 'take'}" data-idx="${idx}" title="${esc(d.name)} — ${d.w} kg each">
    <span class="sw" style="background:${CAT_COLOR[d.cat]}"></span>
    <span class="nm">${esc(d.name)} ${eq}</span>
    <span class="ct">${it.n > 1 ? 'x' + it.n : ''}</span><span class="meta">${meta}</span>
    ${use ? `<button class="mini" data-act="use" data-idx="${idx}">${use}</button>` : ''}
    ${side === 'inv' ? `<button class="mini ghost" data-act="drop" data-idx="${idx}">Drop</button>` : ''}
  </div>`;
}

export class Panels {
  constructor(handlers) {
    this.h = handlers; this.open = null; this.baseTab = 'upgrades';
    for (const id of ['inv', 'base']) {
      $(id).addEventListener('click', (e) => this.click(e));
      $(id).addEventListener('mousedown', (e) => e.stopPropagation());
    }
  }
  get isOpen() { return !!this.open; }
  show(name, tab) {
    this.close(); this.open = name; if (tab) this.baseTab = tab;
    $(name).classList.remove('hidden'); this.refresh();
  }
  close() { if (this.open) $(this.open).classList.add('hidden'); this.open = null; }
  toggleInv() { if (this.open === 'inv') this.close(); else this.show('inv'); }
  click(e) {
    const b = e.target.closest('[data-act]'); if (!b) return;
    e.stopPropagation();
    const act = b.dataset.act, idx = +b.dataset.idx;
    const s = this.h.state(), p = this.h.player(), cid = p.openCid;
    switch (act) {
      case 'close': this.close(); break;
      case 'take': this.h.cmd({ t: 'take', cid, idx }); break;
      case 'put': if (cid >= 0) this.h.cmd({ t: 'put', cid, idx }); break;
      case 'takeAll': this.h.cmd({ t: 'takeAll', cid }); break;
      case 'putAll': this.h.cmd({ t: 'putAll', cid }); break;
      case 'use': this.h.cmd({ t: 'use', idx }); break;
      case 'drop': this.h.cmd({ t: 'drop', idx }); break;
      case 'unequip': this.h.cmd({ t: 'unequip', slot: b.dataset.slot }); break;
      case 'tab': this.baseTab = b.dataset.tab; break;
      case 'upgrade': this.h.cmd({ t: 'upgrade', id: b.dataset.id }); break;
      case 'craft': this.h.cmd({ t: 'craft', id: b.dataset.id }); break;
      case 'sellVal': this.h.cmd({ t: 'sellVal' }); break;
      case 'trade': this.h.cmd({ t: 'trade' }); break;
      case 'sleep': this.h.cmd({ t: 'sleep' }); break;
    }
    void s; this.refresh();
  }
  refresh() {
    if (!this.open) return;
    const s = this.h.state(), p = this.h.player(); if (!s || !p) return;
    if (this.open === 'inv') this.renderInv(s, p); else this.renderBase(s, p);
  }
  renderInv(s, p) {
    const wt = carried(p), cap = capacity(p);
    const slot = (name, it, key) => `<div class="slot"><span class="lbl">${name}</span>${it ? `<span>${esc(ITEMS[it.id].name)}</span><button class="mini ghost" data-act="unequip" data-slot="${key}">Remove</button>` : '<span class="dim">—</span>'}</div>`;
    let html = `<div class="cols"><div class="col"><div class="hdr"><b>Inventory</b><span class="${wt > cap ? 'warn' : 'dim'}">${wt.toFixed(1)} / ${cap} kg</span></div>
      <div class="slots">${slot('Weapon', p.wpn, 'wpn')}${slot('Bag', p.bag, 'bag')}${slot('Armor', p.armor, 'armor')}</div>
      <div class="list">${p.inv.length ? p.inv.map((it, i) => itemRow(it, i, 'inv', p)).join('') : '<div class="dim pad">Empty. Search containers with [E].</div>'}</div>`;
    const c = p.openCid >= 0 ? getCont(s, p.openCid) : null;
    if (c && c.items) {
      html += `<div class="foot"><button data-act="putAll">Put all ▸</button></div></div>`;
      const ccap = contCap(s, c);
      html += `<div class="col"><div class="hdr"><b>${esc(contLabel(c))}</b><span class="dim">${c.type === 'stash' ? `${c.items.length} / ${ccap} slots` : ''}</span></div>
        <div class="list">${c.items.length ? c.items.map((it, i) => itemRow(it, i, 'cont', p)).join('') : '<div class="dim pad">Nothing here.</div>'}</div>
        <div class="foot"><button data-act="takeAll">◂ Take all</button></div></div>`;
    } else html += `</div>`;
    html += `</div><div class="hint">Click an item to move it between your inventory and the open container. [Tab] closes.</div>`;
    if (this._inv !== html) { this._inv = html; $('invBody').innerHTML = html; }
  }
  renderBase(s, p) {
    const tabs = [['upgrades', 'Upgrades'], ['craft', 'Crafting'], ['radio', 'Radio'], ['stats', 'Record']];
    let html = `<div class="tabs">${tabs.map(([k, n]) => `<button class="tab ${this.baseTab === k ? 'on' : ''}" data-act="tab" data-tab="${k}">${n}</button>`).join('')}</div>`;
    const cost = (c) => costStatus(s, p, c).map((x) => `<span class="cost ${x.have >= x.n ? 'ok' : 'no'}">${esc(ITEMS[x.id].name)} ${Math.min(x.have, x.n)}/${x.n}</span>`).join(' ');
    const can = (c) => costStatus(s, p, c).every((x) => x.have >= x.n);
    if (this.baseTab === 'upgrades') {
      html += `<div class="dim pad">Materials are taken from the Stash first, then your inventory.</div>`;
      for (const u of UPGRADES) {
        const lvl = s.upgrades[u.id], max = u.levels.length, c = u.levels[lvl];
        html += `<div class="card"><div><b>${u.name}</b> <span class="dim">${max > 1 ? `Lv ${lvl}/${max}` : lvl ? 'Built' : ''}</span><div class="dim">${u.desc}${u.id === 'stash' ? ` Now: ${STASH_CAP[lvl]} slots.` : ''}</div>${c ? `<div>${cost(c)}</div>` : ''}</div>
          ${c ? `<button data-act="upgrade" data-id="${u.id}" ${can(c) ? '' : 'disabled'}>Build</button>` : '<span class="ok">✔</span>'}</div>`;
      }
    } else if (this.baseTab === 'craft') {
      if (!s.upgrades.bench) html += `<div class="pad warn">Build the Workbench to unlock crafting.</div>`;
      else for (const r of RECIPES) {
        const locked = r.needs && !s.upgrades[r.needs];
        html += `<div class="card"><div><b>${ITEMS[r.out[0]].name}${r.out[1] > 1 ? ' x' + r.out[1] : ''}</b>${locked ? ' <span class="warn">needs Armory Locker</span>' : ''}<div>${cost(r.cost)}</div></div>
          <button data-act="craft" data-id="${r.id}" ${!locked && can(r.cost) ? '' : 'disabled'}>Craft</button></div>`;
      }
    } else if (this.baseTab === 'radio') {
      if (!s.upgrades.radio) html += `<div class="pad warn">Build the Ham Radio to trade valuables for supply drops.</div>`;
      else html += `<div class="pad">Credit: <b>${s.tradePoints}</b>. A supply drop costs ${TRADE_COST}.</div>
        <div class="card"><div><b>Radio in valuables</b><div class="dim">Converts every Watch, Jewelry and Cash in your stash and pockets into credit.</div></div><button data-act="sellVal">Trade</button></div>
        <div class="card"><div><b>Request supply drop</b><div class="dim">3 random bundles (ammo, meds, parts) delivered to your stash.</div></div><button data-act="trade" ${s.tradePoints >= TRADE_COST ? '' : 'disabled'}>Request</button></div>`;
    } else {
      const st = s.stats;
      html += `<div class="pad stats"><div>Day <b>${dayOf(s)}</b></div><div>Zombies killed <b>${st.kills}</b></div><div>Items hauled to stash <b>${st.hauled}</b></div><div>Deaths <b>${st.deaths}</b></div><div>Best day reached <b>${st.bestDay}</b></div></div>`;
    }
    html += `<div class="foot"><button data-act="sleep">Sleep (bed)</button><button class="ghost" data-act="close">Close</button></div>`;
    if (this._base !== html) { this._base = html; $('baseBody').innerHTML = html; }
  }
}
