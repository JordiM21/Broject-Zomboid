// DOM panels: inventory/container grid with drag & drop, base (upgrades, crafting, radio).
import { ITEMS, CAT_COLOR, UPGRADES, RECIPES, STASH_CAP, TRADE_COST, DESC, itemStats } from '../data/items.js';
import { getCont, contCap, contLabel, capacity, carried, costStatus, dayOf } from '../sim/sim.js';
import { iconURL } from './icons.js';
import { playerFrame } from '../render/sprites.js';
const dolls = new Map();
function dollURL(p) {
  const k = `${p.wpn ? p.wpn.id : 'fists'}|${p.armor ? p.armor.id : ''}|${p.bag ? p.bag.id : ''}`;
  if (!dolls.has(k)) dolls.set(k, playerFrame(p.wpn ? p.wpn.id : 'fists', p.armor && p.armor.id, p.bag && p.bag.id, 'idle', 0.1).toDataURL());
  return dolls.get(k);
}

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const USE_LABEL = { med: 'Use', melee: 'Equip', gun: 'Equip', bag: 'Wear', armor: 'Wear' };
const useLabel = (d) => (d.cat === 'food' ? ((d.thirst || 0) > (d.hunger || 0) ? 'Drink' : 'Eat') : USE_LABEL[d.cat] || null);
const kbd = (k) => `<kbd>${k}</kbd>`;

function tile(it, idx, side, p) {
  const d = ITEMS[it.id];
  let bar = '';
  if (d.dur && it.dur !== undefined) { const f = it.dur / d.dur; bar = `<div class="dur"><i style="width:${Math.round(f * 100)}%;background:${f > 0.5 ? '#7ad07a' : f > 0.2 ? '#d0c04a' : '#d05a4a'}"></i></div>`; }
  if (d.cat === 'gun') bar = `<span class="mag">${it.mag}/${d.mag}</span>`;
  return `<div class="tile${it === p.wpn ? ' eq' : ''}" draggable="true" data-side="${side}" data-idx="${idx}" style="--cat:${CAT_COLOR[d.cat]}">
    <img src="${iconURL(it.id)}" alt="" draggable="false"><span class="nm">${esc(d.name)}</span>${it.n > 1 ? `<span class="cnt">${it.n}</span>` : ''}${bar}${it === p.wpn ? '<span class="eqb">E</span>' : ''}</div>`;
}

export class Panels {
  constructor(handlers) {
    this.h = handlers; this.open = null; this.baseTab = 'upgrades'; this.sel = null; this.drag = null;
    for (const id of ['inv', 'base']) {
      const el = $(id);
      el.addEventListener('click', (e) => this.click(e));
      el.addEventListener('mousedown', (e) => e.stopPropagation());
    }
    const inv = $('inv');
    this.menu = document.createElement('div'); this.menu.className = 'ctxmenu hidden'; document.body.appendChild(this.menu);
    this.menu.addEventListener('mousedown', (e) => e.stopPropagation());
    this.menu.addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (b) { this.menuAct(b.dataset.m); } this.hideMenu(); });
    window.addEventListener('mousedown', () => this.hideMenu());
    inv.addEventListener('mouseout', (e) => { const t = e.target.closest('.tile'); if (t && !t.contains(e.relatedTarget)) this.hover = null; });
    // dragging an item out of the window drops it on the ground
    window.addEventListener('dragover', (e) => { if (this.drag && !inv.contains(e.target)) { e.preventDefault(); document.body.classList.add('dropping'); } else document.body.classList.remove('dropping'); });
    window.addEventListener('drop', (e) => { document.body.classList.remove('dropping'); if (this.drag && !inv.contains(e.target)) { e.preventDefault(); if (this.drag.side === 'inv') this.h.cmd({ t: 'drop', idx: this.drag.idx }); this.drag = null; this.refresh(); } });
    inv.addEventListener('dblclick', (e) => { const t = e.target.closest('.tile'); if (t) this.useTile(t); });
    inv.addEventListener('contextmenu', (e) => { const t = e.target.closest('.tile'); e.preventDefault(); if (t) this.showMenu(t.dataset.side, +t.dataset.idx, e.clientX, e.clientY); });
    inv.addEventListener('mouseover', (e) => { const t = e.target.closest('.tile'); if (t) { this.hover = { side: t.dataset.side, idx: +t.dataset.idx }; this.showDetails(t.dataset.side, +t.dataset.idx); } });
    inv.addEventListener('dragstart', (e) => {
      const t = e.target.closest('.tile'); if (!t) return;
      this.drag = { side: t.dataset.side, idx: +t.dataset.idx };
      e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'item');
      const img = t.querySelector('img'); if (img) e.dataTransfer.setDragImage(img, 24, 24);
      t.classList.add('dragging');
    });
    inv.addEventListener('dragend', () => { this.drag = null; inv.querySelectorAll('.over,.dragging').forEach((n) => n.classList.remove('over', 'dragging')); });
    inv.addEventListener('dragover', (e) => { const z = e.target.closest('[data-drop]'); if (z && this.drag) { e.preventDefault(); inv.querySelectorAll('.over').forEach((n) => n !== z && n.classList.remove('over')); z.classList.add('over'); } });
    inv.addEventListener('dragleave', (e) => { const z = e.target.closest('[data-drop]'); if (z && !z.contains(e.relatedTarget)) z.classList.remove('over'); });
    inv.addEventListener('drop', (e) => {
      const z = e.target.closest('[data-drop]'); if (!z || !this.drag) return;
      e.preventDefault(); z.classList.remove('over');
      this.dropOn(z.dataset.drop, this.drag); this.drag = null;
    });
  }
  get isOpen() { return !!this.open; }
  show(name, tab) {
    if (this.open !== name) { this.close(); this.open = name; this._inv = this._base = null; $(name).classList.remove('hidden'); }
    if (tab) this.baseTab = tab;
    this.refresh();
  }
  close() { if (this.open) $(this.open).classList.add('hidden'); this.open = null; this.sel = null; this.hover = null; this.hideMenu(); }
  hideMenu() { this.menu.classList.add('hidden'); this.menuFor = null; }
  showMenu(side, idx, x, y) {
    const it = this.item(side, idx), p = this.h.player(); if (!it) return;
    const d = ITEMS[it.id], cont = p.openCid >= 0;
    const opts = [];
    const ul = useLabel(d);
    if (side === 'inv') {
      if (ul && it !== p.wpn) opts.push(['use', ul, 'E']);
      if (d.cat === 'throw') opts.push(['none', `Throw with ${it.id === 'noisemaker' ? 'G' : 'X'}`, '']);
      if (it === p.wpn) opts.push(['unequip', 'Unequip', '']);
      if (cont) opts.push(['move', 'Put in container', 'T']);
      opts.push(['drop', 'Drop', 'Q']);
    } else {
      opts.push(['move', 'Take', 'T']);
      if (ul) opts.push(['use', `Take & ${ul}`, 'E']);
    }
    this.menuFor = { side, idx };
    this.menu.innerHTML = `<div class="mh"><img src="${iconURL(it.id)}" alt="">${esc(d.name)}${it.n > 1 ? ' ×' + it.n : ''}</div>` + opts.map(([a, l, k]) => `<button data-m="${a}">${l}${k ? kbd(k) : ''}</button>`).join('');
    this.menu.classList.remove('hidden');
    const r = this.menu.getBoundingClientRect();
    this.menu.style.left = Math.min(x, innerWidth - r.width - 8) + 'px'; this.menu.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
  }
  menuAct(a) { const m = this.menuFor; if (!m) return; this.act(a, m.side, m.idx); }
  act(a, side, idx) {
    const p = this.h.player(), cid = p.openCid, it = this.item(side, idx); if (!it) return false;
    if (a === 'use') { if (side === 'inv') this.h.cmd({ t: 'use', idx }); else { this.h.cmd({ t: 'take', cid, idx }); const j = p.inv.lastIndexOf(p.inv.find((x) => x.id === it.id)); if (j >= 0) this.h.cmd({ t: 'use', idx: j }); } }
    else if (a === 'drop') { if (side !== 'inv') return false; this.h.cmd({ t: 'drop', idx }); }
    else if (a === 'move') { if (cid < 0) return false; this.h.cmd({ t: side === 'inv' ? 'put' : 'take', cid, idx }); }
    else if (a === 'unequip') this.h.cmd({ t: 'unequip', slot: 'wpn' });
    else return false;
    this.hover = null; this.sel = null; this.refresh(); return true;
  }
  // inventory hotkeys; returns true if the key was used
  handleKey(code, shift) {
    if (this.open !== 'inv') return false;
    if (code === 'Escape' && !this.menu.classList.contains('hidden')) { this.hideMenu(); return true; }
    const p = this.h.player(), h = this.hover;
    if (code === 'KeyR' && p.openCid >= 0) { this.h.cmd({ t: shift ? 'putAll' : 'takeAll', cid: p.openCid }); this.refresh(); return true; }
    if (!h) return false;
    const map = { KeyE: 'use', KeyQ: 'drop', KeyT: 'move' };
    if (!map[code]) return false;
    return this.act(map[code], h.side, h.idx) || code !== 'KeyE';
  }
  toggleInv() { if (this.open === 'inv') this.close(); else this.show('inv'); }

  item(side, idx) {
    const s = this.h.state(), p = this.h.player();
    if (side === 'inv') return p.inv[idx];
    const c = p.openCid >= 0 ? getCont(s, p.openCid) : null;
    return c && c.items ? c.items[idx] : null;
  }
  useTile(t) {
    const side = t.dataset.side, idx = +t.dataset.idx, p = this.h.player();
    if (side === 'inv') this.h.cmd({ t: 'use', idx });
    else { this.h.cmd({ t: 'take', cid: p.openCid, idx }); }
    this.refresh();
  }
  dropOn(zone, drag) {
    const p = this.h.player(), cid = p.openCid;
    if (drag.side === 'inv') {
      if (zone === 'cont' && cid >= 0) this.h.cmd({ t: 'put', cid, idx: drag.idx });
      else if (zone === 'ground') this.h.cmd({ t: 'drop', idx: drag.idx });
      else if (zone === 'equip') this.h.cmd({ t: 'use', idx: drag.idx });
    } else if (zone === 'inv' || zone === 'equip') {
      const it = this.item('cont', drag.idx);
      this.h.cmd({ t: 'take', cid, idx: drag.idx });
      if (zone === 'equip' && it) { const i = p.inv.indexOf(it); const j = i >= 0 ? i : p.inv.findIndex((x) => x.id === it.id); if (j >= 0) this.h.cmd({ t: 'use', idx: j }); }
    }
    this.sel = null; this.refresh();
  }
  click(e) {
    const t = e.target.closest('.tile');
    const p = this.h.player(), cid = p.openCid;
    if (t && !e.target.closest('[data-act]')) {
      const side = t.dataset.side, idx = +t.dataset.idx;
      if (e.shiftKey && side === 'inv') this.h.cmd({ t: 'drop', idx });
      else if (e.ctrlKey || e.metaKey) this.act('use', side, idx);
      else if (cid >= 0) { this.h.cmd({ t: side === 'inv' ? 'put' : 'take', cid, idx }); this.sel = null; }
      else { this.sel = { side, idx }; this.showDetails(side, idx); }
      this.refresh(); return;
    }
    const b = e.target.closest('[data-act]'); if (!b) return;
    e.stopPropagation();
    const act = b.dataset.act, idx = +b.dataset.idx;
    switch (act) {
      case 'close': this.close(); break;
      case 'takeAll': this.h.cmd({ t: 'takeAll', cid }); break;
      case 'putAll': this.h.cmd({ t: 'putAll', cid }); break;
      case 'sortInv': this.h.cmd({ t: 'sort', which: 'inv' }); break;
      case 'sortCont': this.h.cmd({ t: 'sort', which: 'cont', cid }); break;
      case 'use': this.h.cmd({ t: 'use', idx }); break;
      case 'drop': this.h.cmd({ t: 'drop', idx }); this.sel = null; break;
      case 'take': this.h.cmd({ t: 'take', cid, idx }); this.sel = null; break;
      case 'put': this.h.cmd({ t: 'put', cid, idx }); this.sel = null; break;
      case 'takeuse': this.act('use', 'cont', idx); break;
      case 'unequip': this.h.cmd({ t: 'unequip', slot: b.dataset.slot }); break;
      case 'tab': this.baseTab = b.dataset.tab; break;
      case 'upgrade': this.h.cmd({ t: 'upgrade', id: b.dataset.id }); break;
      case 'craft': this.h.cmd({ t: 'craft', id: b.dataset.id }); break;
      case 'sellVal': this.h.cmd({ t: 'sellVal' }); break;
      case 'trade': this.h.cmd({ t: 'trade' }); break;
      case 'sleep': this.h.cmd({ t: 'sleep' }); break;
    }
    this.refresh();
  }
  showDetails(side, idx) {
    const el = $('invDetails'); if (!el) return;
    const it = this.item(side, idx), p = this.h.player();
    if (!it) { el.innerHTML = '<div class="dim">Hover an item to inspect it. Drag items between panels or onto your gear slots; drag them out of this window to drop them.</div>'; return; }
    const d = ITEMS[it.id];
    const stats = itemStats(it).map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join('');
    let btns = '';
    if (side === 'inv') {
      const ul = useLabel(d);
      if (it !== p.wpn && ul) btns += `<button data-act="use" data-idx="${idx}">${ul} ${kbd('E')}</button>`;
      if (d.cat === 'throw') btns += `<span class="dim small">Throw with ${kbd(it.id === 'noisemaker' ? 'G' : 'X')} while aiming</span>`;
      if (p.openCid >= 0) btns += `<button class="ghost" data-act="put" data-idx="${idx}">Put ${kbd('T')}</button>`;
      btns += `<button class="ghost" data-act="drop" data-idx="${idx}">Drop ${kbd('Q')}</button>`;
    } else { btns += `<button data-act="take" data-idx="${idx}">Take ${kbd('T')}</button>`; const ul = useLabel(d); if (ul) btns += `<button class="ghost" data-act="takeuse" data-idx="${idx}">Take & ${ul} ${kbd('E')}</button>`; }
    el.innerHTML = `<img src="${iconURL(it.id)}" alt=""><div class="dInfo"><div class="dName" style="color:${CAT_COLOR[d.cat]}">${esc(d.name)}${it.n > 1 ? ` <span class="dim">x${it.n}</span>` : ''}</div>
      <div class="dDesc">${esc(DESC[it.id] || '')}</div><div class="dStats">${stats}</div><div class="dBtns">${btns}</div></div>`;
  }
  refresh() {
    if (!this.open) return;
    const s = this.h.state(), p = this.h.player(); if (!s || !p) return;
    if (this.open === 'inv') this.renderInv(s, p); else this.renderBase(s, p);
  }
  renderInv(s, p) {
    const wt = carried(p), cap = capacity(p), f = Math.min(1, wt / cap);
    const slot = (name, it, key) => `<div class="eslot" data-drop="equip" title="${name}">${it ? `<img src="${iconURL(it.id)}" alt=""><button class="x" data-act="unequip" data-slot="${key}" title="Unequip">×</button>` : key === 'wpn' ? `<img src="${iconURL('fists')}" alt="" style="opacity:.45">` : `<span class="dim">${name}</span>`}<span class="elbl">${it ? esc(ITEMS[it.id].name) : ''}</span></div>`;
    const c = p.openCid >= 0 ? getCont(s, p.openCid) : null;
    const equip = `${slot('Weapon', p.wpn, 'wpn')}${slot('Bag', p.bag, 'bag')}${slot('Armor', p.armor, 'armor')}`;
    let html = `<div class="cols"><div class="col zone" data-drop="inv">
      <div class="hdr"><b>Inventory</b><button class="mini ghost" data-act="sortInv">Sort</button></div>
      <div class="wbar"><i style="width:${f * 100}%;background:${wt > cap ? '#e0603a' : f > 0.8 ? '#d0b040' : '#7ab07a'}"></i><span>${wt.toFixed(1)} / ${cap} kg${wt > cap ? ' · overloaded' : ''}</span></div>
      ${c && c.items ? `<div class="equip">${equip}</div>` : ''}
      <div class="grid">${p.inv.map((it, i) => tile(it, i, 'inv', p)).join('') || '<div class="dim pad">Empty. Search containers with [E].</div>'}</div>`;
    if (c && c.items) {
      html += `<div class="foot"><button data-act="putAll">Put all ▸ ${kbd('Shift+R')}</button></div></div>`;
      const ccap = contCap(s, c);
      html += `<div class="col zone" data-drop="cont"><div class="hdr"><b>${esc(contLabel(c))}</b><span>${c.type === 'stash' ? `<span class="dim">${c.items.length}/${ccap}</span> ` : ''}<button class="mini ghost" data-act="sortCont">Sort</button></span></div>
        <div class="grid">${c.items.map((it, i) => tile(it, i, 'cont', p)).join('') || '<div class="dim pad">Nothing here.</div>'}</div>
        <div class="foot"><button data-act="takeAll">◂ Take all ${kbd('R')}</button></div></div>`;
    } else html += `</div><div class="col char"><div class="hdr"><b>Survivor</b><span class="dim">Day ${dayOf(s)}</span></div>
      <div class="charTop"><div class="doll"><img src="${dollURL(p)}" alt=""></div><div class="equip v">${equip}</div></div>
      <div id="charStats"></div>
      <div class="keys mini"><span>${kbd('E')} Use</span><span>${kbd('Q')} Drop</span><span>${kbd('T')} Move</span><span>${kbd('R')} Take all</span><span>${kbd('Right-click')} Menu</span><span>${kbd('Drag out')} Drop</span></div></div>`;
    html += `</div><div class="hint">Click: move · Double-click or ${kbd('E')}: use · ${kbd('Q')}: drop · Right-click: menu · Drag outside the window: drop</div>`;
    if (this._inv !== html) {
      this._inv = html; $('invBody').innerHTML = html;
      if (this.sel) this.showDetails(this.sel.side, this.sel.idx); else this.showDetails('inv', -1);
    }
    this.updateStats(s, p);
  }
  updateStats(s, p) {
    const el = $('charStats'); if (!el) return;
    const bar = (label, v, col) => `<div class="sbar"><span>${label}</span><div><i style="width:${Math.max(0, Math.min(100, v))}%;background:${col}"></i></div><b>${Math.round(v)}</b></div>`;
    const arm = p.armor ? ITEMS[p.armor.id] : null, stance = p.sneak ? 'Sneaking' : p.sprinting ? 'Running' : p.moving ? 'Walking' : 'Still';
    const chips = [];
    if (p.bleeding) chips.push(['Bleeding', '#ff5a5a']);
    if (p.infection > 0) chips.push([`Infected ${Math.round(p.infection)}%`, '#b6ff5a']);
    if (carried(p) > capacity(p)) chips.push(['Overloaded', '#ff9a5a']);
    for (const [k, v] of Object.entries(p.buffs || {})) chips.push([`${k === 'adrenaline' ? 'Adrenaline' : 'Energy'} ${Math.ceil(v)}s`, k === 'adrenaline' ? '#ff7a7a' : '#5ad0c8']);
    if (p.inv.some((i) => i.id === 'reviver')) chips.push(['Self-revive ready', '#ff6ab0']);
    if (p.wpn && ITEMS[p.wpn.id].silent) chips.push(['Silent kills', '#9ab0ff']);
    if (!chips.length) chips.push(['Healthy', '#7ad07a']);
    const html = bar('Health', p.hp, '#c94a4a') + bar('Food', p.hunger, '#d08a3a') + bar('Water', p.thirst, '#3a8ad0') + bar('Stamina', p.stamina, '#c9c04a') +
      `<div class="prot"><div><span>Damage taken</span><b>-${arm ? Math.round(arm.armor * 100) : 0}%</b></div><div><span>Bite protection</span><b>${arm ? Math.round(arm.biteProt * 100) : 0}%</b></div><div><span>Visibility</span><b>${Math.round((p.vis ?? 1) * 100)}%</b></div><div><span>Stance</span><b>${stance}</b></div></div>` +
      `<div class="chips">${chips.map(([t, col]) => `<span style="color:${col};border-color:${col}">${t}</span>`).join('')}</div>`;
    if (this._stats !== html) { this._stats = html; el.innerHTML = html; }
  }
  renderBase(s, p) {
    const tabs = [['upgrades', 'Upgrades'], ['craft', 'Crafting'], ['radio', 'Radio'], ['stats', 'Record']];
    let html = `<div class="tabs">${tabs.map(([k, n]) => `<button class="tab ${this.baseTab === k ? 'on' : ''}" data-act="tab" data-tab="${k}">${n}</button>`).join('')}</div>`;
    const cost = (c) => costStatus(s, p, c).map((x) => `<span class="cost ${x.have >= x.n ? 'ok' : 'no'}"><img src="${iconURL(x.id)}" alt="">${esc(ITEMS[x.id].name)} ${Math.min(x.have, x.n)}/${x.n}</span>`).join(' ');
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
        html += `<div class="card"><img class="cimg" src="${iconURL(r.out[0])}" alt=""><div class="grow"><b>${ITEMS[r.out[0]].name}${r.out[1] > 1 ? ' x' + r.out[1] : ''}</b>${locked ? ' <span class="warn">needs Armory Locker</span>' : ''}<div class="dim small">${esc(DESC[r.out[0]] || '')}</div><div>${cost(r.cost)}</div></div>
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
