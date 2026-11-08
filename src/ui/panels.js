// DOM panels. The inventory works like Minecraft: click a slot to pick its stack up, click another slot to put it down
// (swap, merge, or attach a mod to a gun). Right-click picks up half, or puts down one. Shift-click sends a stack across.
// Dragging does the same in one motion: let go on a slot, a gear slot, or outside the panel to drop it on the ground.
// Base panel: upgrades, crafting, repairs, radio, the raid board and the bunker keypad.
import { PERK_NAME, ITEMS, MODS, modFits, gunStats, CAT_COLOR, UPGRADES, RECIPES, STASH_CAP, STASH_TABS, stashTab, repairCost, TRADE_COST, DESC, itemStats } from '../data/items.js';
import { getCont, contCap, contLabel, capacity, carried, costStatus, dayOf, gearStats } from '../sim/sim.js';
import { INV_SLOTS, HOT_SLOTS, RAID_LEN } from '../config.js';
import { slotOf } from '../sim/inventory.js';
import { iconURL } from './icons.js';
import { playerFrame } from '../render/sprites.js';
const dolls = new Map();
function dollURL(p) {
  const G = p.gear || {}, id = (x) => (x ? x.id : undefined), mods = (p.wpn && p.wpn.mods) || [];
  const k = `${p.wpn ? p.wpn.id : 'fists'}|${mods.join()}|${id(G.body)}|${id(p.bag)}|${id(G.head)}|${id(G.feet)}`;
  if (!dolls.has(k)) dolls.set(k, playerFrame(p.wpn ? p.wpn.id : 'fists', id(G.body), id(p.bag), 'idle', 0.1, id(G.head), id(G.feet), mods).toDataURL());
  return dolls.get(k);
}

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const USE_LABEL = { med: 'Use', melee: 'Equip', gun: 'Equip', bag: 'Wear', armor: 'Wear', mod: 'Attach', buff: 'Use' };
const fullName = (it) => [ITEMS[it.id].name, ...(it.mods || []).map((id) => ITEMS[id].name)].join(' + ');
const useLabel = (d) => (d.cat === 'food' ? ((d.thirst || 0) > (d.hunger || 0) ? 'Drink' : 'Eat') : USE_LABEL[d.cat] || null);
const kbd = (k) => `<kbd>${k}</kbd>`;
const durBar = (it) => { const d = ITEMS[it.id]; if (!d.dur || it.dur === undefined) return ''; const f = it.dur / d.dur; return `<div class="dur"><i style="width:${Math.round(f * 100)}%;background:${f > 0.5 ? '#7ad07a' : f > 0.2 ? '#d0c04a' : '#d05a4a'}"></i></div>`; };

// one slot. side: 'inv' (i = slot number) or 'cont' (i = list index)
function cell(it, side, i, p, held, extra = '') {
  if (!it) return `<div class="slot empty${extra}" data-side="${side}" data-i="${i}"></div>`;
  const d = ITEMS[it.id], isHeld = held && held.side === side && held.i === i;
  let tag = durBar(it);
  if (d.cat === 'gun') tag += `<span class="mag">${it.mag}/${gunStats(it).mag}</span>`;
  return `<div class="slot${it === p.wpn ? ' eq' : ''}${isHeld ? ' held' : ''}${extra}" data-side="${side}" data-i="${i}" title="${esc(fullName(it))}" style="--cat:${CAT_COLOR[d.cat]}">
    <img src="${iconURL(it.id, it.mods)}" alt="" draggable="false">${it.n > 1 ? `<span class="cnt">${isHeld && held.n ? it.n - held.n : it.n}</span>` : ''}${tag}</div>`;
}

export class Panels {
  constructor(handlers) {
    this.h = handlers; this.open = null; this.baseTab = 'upgrades'; this.hover = null; this.held = null; this.stashTab = 'all'; this.code = '';
    for (const id of ['inv', 'base']) {
      const el = $(id);
      el.addEventListener('click', (e) => this.click(e));
      el.addEventListener('mousedown', (e) => e.stopPropagation());
    }
    const inv = $('inv');
    this.float = document.createElement('div'); this.float.className = 'heldIcon hidden'; document.body.appendChild(this.float);
    addEventListener('mousemove', (e) => { this.float.style.left = e.clientX + 'px'; this.float.style.top = e.clientY + 'px'; this.dragMove(e); });
    inv.addEventListener('mousedown', (e) => { // a press on a stack might become a drag
      const t = e.target.closest('.slot');
      if (e.button === 0 && !e.shiftKey && t && !t.classList.contains('empty') && !this.held) this.press = { side: t.dataset.side, i: +t.dataset.i, x: e.clientX, y: e.clientY };
    });
    addEventListener('mouseup', (e) => this.dragEnd(e));
    inv.addEventListener('contextmenu', (e) => { e.preventDefault(); const t = e.target.closest('.slot'); if (t) this.slotClick(t.dataset.side, +t.dataset.i, 'right', e.shiftKey); });
    inv.addEventListener('mouseover', (e) => { const t = e.target.closest('.slot'); if (t && !t.classList.contains('empty')) { this.hover = { side: t.dataset.side, i: +t.dataset.i }; this.showDetails(); } });
    inv.addEventListener('mouseleave', () => { this.hover = null; this.showDetails(); });
  }
  get isOpen() { return !!this.open; }
  dragMove(e) {
    const P = this.press; if (!P) return;
    if (!this.dragging) {
      if (Math.hypot(e.clientX - P.x, e.clientY - P.y) < 6) return;
      this.dragging = true; this.pick(P.side, P.i, false); this.float.classList.add('drag'); this.refresh();
    }
    const el = document.elementFromPoint(e.clientX, e.clientY), over = el && el.closest('#inv .slot, #inv .eslot');
    if (over !== this.overEl) { if (this.overEl) this.overEl.classList.remove('over'); this.overEl = over; if (over) over.classList.add('over'); }
    document.body.classList.toggle('dropping', !!el && !el.closest('#inv') && P.side === 'inv'); // let go here and it falls on the ground
  }
  dragEnd(e) {
    const P = this.press; this.press = null;
    if (!this.dragging) return;
    this.dragging = false; this.float.classList.remove('drag'); document.body.classList.remove('dropping');
    if (this.overEl) { this.overEl.classList.remove('over'); this.overEl = null; }
    this.skipClick = true; setTimeout(() => { this.skipClick = false; }, 0); // the click that follows a drag is not a click
    const el = document.elementFromPoint(e.clientX, e.clientY), slot = el && el.closest('#inv .slot'), eq = el && el.closest('#inv .eslot');
    if (slot) { if (!(slot.dataset.side === P.side && +slot.dataset.i === P.i)) this.slotClick(slot.dataset.side, +slot.dataset.i, 'left'); else this.drop(); }
    else if (eq) this.equipHeld(eq.dataset.slot);
    else if (!(el && el.closest('#inv')) && P.side === 'inv' && this.item('inv', P.i)) { this.h.cmd({ t: 'drop', idx: this.idx(P.i) }); this.drop(); }
    else this.drop();
    this.refresh();
  }
  // a gear slot: wear what you hold, or take off what's there
  equipHeld(key) {
    const H = this.held, src = H && this.item(H.side, H.i);
    if (src) { if (H.side === 'cont') this.act('use', 'cont', H.i); else this.h.cmd({ t: 'use', idx: this.idx(H.i) }); this.drop(); }
    else this.h.cmd({ t: 'unequip', slot: key });
  }
  show(name, tab, extra) {
    if (this.open !== name) { this.close(); this.open = name; this._inv = this._base = null; $(name).classList.remove('hidden'); }
    if (tab) this.baseTab = tab;
    if (extra && extra.door !== undefined) { this.door = extra.door; this.code = ''; }
    this.refresh();
  }
  close() { if (this.open) $(this.open).classList.add('hidden'); this.open = null; this.hover = null; this.drop(); }
  toggleInv() { if (this.open === 'inv') this.close(); else this.show('inv'); }
  // the stack on the cursor
  drop() { this.held = null; this.float.classList.add('hidden'); }
  item(side, i) {
    const s = this.h.state(), p = this.h.player();
    if (side === 'inv') return slotOf(p.inv, i);
    const c = p.openCid >= 0 ? getCont(s, p.openCid) : null;
    return c && c.items ? c.items[i] : null;
  }
  idx(slot) { const p = this.h.player(); return p.inv.indexOf(slotOf(p.inv, slot)); } // inventory list index for the old-style commands
  pick(side, i, half) {
    const it = this.item(side, i); if (!it) return;
    this.held = { side, i, n: half && it.n > 1 ? Math.ceil(it.n / 2) : 0 };
    this.float.innerHTML = `<img src="${iconURL(it.id, it.mods)}" alt="">${it.n > 1 ? `<span>${this.held.n || it.n}</span>` : ''}`;
    this.float.classList.remove('hidden');
  }
  slotClick(side, i, button, shift) {
    const p = this.h.player(), cid = p.openCid, it = this.item(side, i), H = this.held;
    if (shift && !H) { // send it across
      if (!it) return;
      if (side === 'cont') this.h.cmd({ t: 'take', cid, idx: i });
      else if (cid >= 0) this.h.cmd({ t: 'put', cid, idx: this.idx(i) });
      else this.h.cmd({ t: 'quick', i });
      return this.refresh();
    }
    if (!H) { if (it) this.pick(side, i, button === 'right'); return this.refresh(); }
    if (H.side === side && H.i === i) { this.drop(); return this.refresh(); }
    const src = this.item(H.side, H.i); if (!src) { this.drop(); return this.refresh(); }
    // a mod dropped onto a gun goes on the gun
    if (it && side === 'inv' && MODS[src.id] && ITEMS[it.id].cat === 'gun' && modFits(it.id, src.id) && !(it.mods || []).includes(src.id)) {
      let midx = H.side === 'inv' ? this.idx(H.i) : -1;
      if (H.side === 'cont') { this.h.cmd({ t: 'take', cid, idx: H.i }); midx = p.inv.findLastIndex((x) => x.id === src.id); }
      this.h.cmd({ t: 'attachMod', idx: midx, gun: this.idx(i) });
      this.drop(); return this.refresh();
    }
    const n = button === 'right' ? 1 : H.n || 0;
    if (H.side === 'cont' && side === 'cont') { this.drop(); return this.refresh(); } // containers keep their own order
    this.h.cmd({ t: 'mv', a: { side: H.side, i: H.i }, b: { side, i }, n: n || undefined, cid });
    const left = this.item(H.side, H.i);
    if (button === 'right' && left && left.id === src.id) { if (H.n) H.n = Math.max(0, H.n - 1); if (H.n === 0 && left.n <= 0) this.drop(); }
    else this.drop();
    this.refresh();
  }
  // inventory hotkeys; returns true if the key was used
  handleKey(code, shift) {
    if (this.open === 'base' && this.baseTab === 'keypad') {
      if (code.startsWith('Digit') || code.startsWith('Numpad')) { const d = code.slice(-1); if (/\d/.test(d)) { this.keypad(d); return true; } }
      if (code === 'Backspace') { this.keypad('del'); return true; }
      if (code === 'Enter' || code === 'NumpadEnter') { this.keypad('ok'); return true; }
    }
    if (this.open !== 'inv') return false;
    if (code === 'Escape' && this.held) { this.drop(); this.refresh(); return true; }
    const p = this.h.player(), h = this.hover;
    if (code === 'KeyR' && p.openCid >= 0) { this.h.cmd({ t: shift ? 'putAll' : 'takeAll', cid: p.openCid }); this.refresh(); return true; }
    if (!h || !this.item(h.side, h.i)) return false;
    if (code.startsWith('Digit')) { // swap with that hotbar slot, like Minecraft
      const k = +code.slice(5) - 1; if (k < 0 || k >= HOT_SLOTS) return false;
      if (!(h.side === 'inv' && h.i === k)) this.h.cmd({ t: 'mv', a: h, b: { side: 'inv', i: k }, cid: p.openCid });
      this.drop(); this.refresh(); return true;
    }
    if (code === 'KeyE') return this.act('use', h.side, h.i);
    if (code === 'KeyQ') return this.act('drop', h.side, h.i);
    return false;
  }
  act(a, side, i) {
    const p = this.h.player(), cid = p.openCid, it = this.item(side, i); if (!it) return false;
    if (a === 'use') { if (side === 'inv') this.h.cmd({ t: 'use', idx: this.idx(i) }); else { this.h.cmd({ t: 'take', cid, idx: i }); const j = p.inv.findLastIndex((x) => x.id === it.id); if (j >= 0) this.h.cmd({ t: 'use', idx: j }); } }
    else if (a === 'drop') { if (side !== 'inv') return false; this.h.cmd({ t: 'drop', idx: this.idx(i) }); }
    else if (a === 'unequip') this.h.cmd({ t: 'unequip', slot: 'wpn' });
    else if (a.startsWith('attach:')) this.h.cmd({ t: 'attachMod', idx: this.idx(i), gun: this.idx(+a.slice(7)) });
    else if (a.startsWith('detach:')) this.h.cmd({ t: 'detachMod', idx: this.idx(i), mod: a.slice(7) });
    else return false;
    this.drop(); this.refresh(); return true;
  }
  keypad(k) {
    if (k === 'del') this.code = this.code.slice(0, -1);
    else if (k === 'ok') { if (this.code.length === 4) this.h.cmd({ t: 'keypad', door: this.door, code: this.code }); this.code = ''; }
    else if (this.code.length < 4) this.code += k;
    this.refresh();
  }
  click(e) {
    if (this.skipClick) return;
    const t = e.target.closest('.slot');
    if (t) { this.slotClick(t.dataset.side, +t.dataset.i, 'left', e.shiftKey); return; }
    const b = e.target.closest('[data-act]'); if (!b) return;
    e.stopPropagation();
    const p = this.h.player(), cid = p.openCid, act = b.dataset.act, i = +b.dataset.i;
    switch (act) {
      case 'close': this.close(); break;
      case 'takeAll': this.h.cmd({ t: 'takeAll', cid }); break;
      case 'putAll': this.h.cmd({ t: 'putAll', cid }); break;
      case 'sortInv': this.h.cmd({ t: 'sort', which: 'inv' }); break;
      case 'sortCont': this.h.cmd({ t: 'sort', which: 'cont', cid }); break;
      case 'stab': this.stashTab = b.dataset.tab; break;
      case 'eq': this.equipHeld(b.dataset.slot); break;
      case 'it': this.act(b.dataset.m, b.dataset.side, i); return;
      case 'tab': this.baseTab = b.dataset.tab; break;
      case 'upgrade': this.h.cmd({ t: 'upgrade', id: b.dataset.id }); break;
      case 'craft': this.h.cmd({ t: 'craft', id: b.dataset.id }); break;
      case 'repair': this.h.cmd({ t: 'repair', where: b.dataset.where, idx: i }); break;
      case 'sellVal': this.h.cmd({ t: 'sellVal' }); break;
      case 'trade': this.h.cmd({ t: 'trade' }); break;
      case 'sleep': this.h.cmd({ t: 'sleep' }); break;
      case 'key': this.keypad(b.dataset.k); return;
    }
    this.refresh();
  }
  showDetails() {
    const el = $('invDetails'); if (!el) return;
    const p = this.h.player(), d0 = this.held || this.hover, it = d0 && this.item(d0.side, d0.i);
    if (!it) { el.innerHTML = `<div class="dim">Drag a stack anywhere, or click to pick it up and click again to put it down. Right-click: half / one. Shift-click: send across. Hover + ${kbd('1')}–${kbd('9')}: swap with the hotbar. Drop outside the panel to leave it on the ground.</div>`; return; }
    const d = ITEMS[it.id], side = d0.side, i = d0.i;
    const stats = itemStats(it).map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join('');
    const btn = (m, label, k, ghost) => `<button class="${ghost ? 'ghost' : ''}" data-act="it" data-m="${m}" data-side="${side}" data-i="${i}">${label}${k ? ' ' + kbd(k) : ''}</button>`;
    let btns = '';
    const ul = useLabel(d);
    if (ul && it !== p.wpn) btns += btn('use', side === 'inv' ? ul : `Take & ${ul}`, 'E');
    if (side === 'inv') {
      if (it === p.wpn) btns += btn('unequip', 'Holster', '', true);
      if (d.cat === 'throw') btns += `<span class="dim small">Throw with ${kbd(it.id === 'noisemaker' ? 'G' : 'X')}</span>`;
      if (MODS[it.id]) for (const g of p.inv) if (modFits(g.id, it.id) && !(g.mods || []).includes(it.id)) btns += btn(`attach:${g.slot}`, `Attach to ${esc(ITEMS[g.id].name)}`, '', true);
      for (const id of it.mods || []) btns += btn(`detach:${id}`, `Remove ${ITEMS[id].name}`, '', true);
      btns += btn('drop', 'Drop', 'Q', true);
    }
    el.innerHTML = `<img src="${iconURL(it.id, it.mods)}" alt=""><div class="dInfo"><div class="dName" style="color:${CAT_COLOR[d.cat]}">${esc(fullName(it))}${it.n > 1 ? ` <span class="dim">x${it.n}</span>` : ''}</div>
      <div class="dDesc">${esc(DESC[it.id] || '')}</div><div class="dStats">${stats}</div></div><div class="dBtns">${btns}</div>`;
  }
  refresh() {
    if (!this.open) return;
    const s = this.h.state(), p = this.h.player(); if (!s || !p) return;
    if (this.held && !this.item(this.held.side, this.held.i)) this.drop();
    if (this.open === 'inv') this.renderInv(s, p); else this.renderBase(s, p);
  }
  renderInv(s, p) {
    const wt = carried(p), cap = capacity(p), f = Math.min(1, wt / cap), H = this.held;
    const G = p.gear || {};
    const eq = (name, it, key) => `<div class="eslot" data-act="eq" data-slot="${key}" title="${esc(it ? fullName(it) : name)}">${it ? `<img src="${iconURL(it.id, it.mods)}" alt="">` : `<span class="dim">${name}</span>`}</div>`;
    const c = p.openCid >= 0 ? getCont(s, p.openCid) : null;
    let top;
    if (c && c.items) {
      const ccap = contCap(s, c), stash = c.type === 'stash';
      let list = c.items.map((it, i) => [it, i]);
      let tabs = '';
      if (stash) {
        const count = {}; for (const it of c.items) { const k = stashTab(it.id); count[k] = (count[k] || 0) + 1; }
        tabs = `<div class="stabs">${STASH_TABS.map(([k, n]) => `<button class="stab ${this.stashTab === k ? 'on' : ''}" data-act="stab" data-tab="${k}">${n}${k === 'all' ? ` ${c.items.length}` : count[k] ? ` ${count[k]}` : ''}</button>`).join('')}</div>`;
        if (this.stashTab !== 'all') list = list.filter(([it]) => stashTab(it.id) === this.stashTab);
      }
      const shown = stash ? Math.max(27, Math.ceil((list.length + 9) / 9) * 9) : Math.max(9, Math.ceil(Math.min(ccap, Math.max(list.length, 9)) / 9) * 9);
      let cells = list.map(([it, i]) => cell(it, 'cont', i, p, H)).join('');
      for (let k = list.length; k < shown; k++) cells += cell(null, 'cont', c.items.length + k - list.length, p, H);
      top = `<div class="sect cont"><div class="hdr"><b>${esc(contLabel(c))}</b><span class="dim small">${c.items.length}/${ccap > 900 ? '∞' : ccap}${c.type === 'gunrack' ? ' · weapons only' : ''}</span>
          <span class="sp"></span><button class="mini ghost" data-act="sortCont">Sort</button><button class="mini" data-act="takeAll">Take all ${kbd('R')}</button><button class="mini" data-act="putAll">Put all ${kbd('⇧R')}</button></div>
        ${tabs}<div class="sgrid ${stash ? 'tall' : ''}">${cells}</div></div>`;
    } else {
      top = `<div class="sect char"><div class="charTop">
        <div class="gearcol">${eq('Head', G.head, 'head')}${eq('Body', G.body, 'body')}${eq('Legs', G.legs, 'legs')}${eq('Feet', G.feet, 'feet')}</div>
        <div class="doll"><img src="${dollURL(p)}" alt=""></div>
        <div class="gearcol">${eq('Back', p.bag, 'bag')}${eq('Hand', p.wpn, 'wpn')}</div>
        <div id="charStats"></div></div></div>`;
    }
    let main = '', hot = '';
    for (let k = HOT_SLOTS; k < INV_SLOTS; k++) main += cell(slotOf(p.inv, k), 'inv', k, p, H);
    for (let k = 0; k < HOT_SLOTS; k++) hot += cell(slotOf(p.inv, k), 'inv', k, p, H, '" data-key="' + (k + 1));
    const html = `${top}<div class="sect pinv"><div class="hdr"><b>Inventory</b><span class="dim small">Day ${dayOf(s)}</span><span class="sp"></span><button class="mini ghost" data-act="sortInv">Sort</button></div>
      <div class="wbar"><i style="width:${f * 100}%;background:${wt > cap ? '#e0603a' : f > 0.8 ? '#d0b040' : '#7ab07a'}"></i><span>${wt.toFixed(1)} / ${cap} kg${wt > cap ? ' · overloaded: slower' : ''}</span></div>
      <div class="sgrid">${main}</div><div class="sgrid hotrow">${hot}</div></div>`;
    if (this._inv !== html) {
      const body = $('invBody'), g = body.querySelector('.sgrid'), keep = g ? g.scrollTop : 0, sameTop = this._top === (c ? c.id : -1);
      this._inv = html; this._stats = null; this._top = c ? c.id : -1; body.innerHTML = html;
      if (sameTop) { const g2 = body.querySelector('.sgrid'); if (g2) g2.scrollTop = keep; }
      this.showDetails();
    }
    if (!c) this.updateStats(s, p);
  }
  updateStats(s, p) {
    const el = $('charStats'); if (!el) return;
    const bar = (label, v, col) => `<div class="sbar"><span>${label}</span><div><i style="width:${Math.max(0, Math.min(100, v))}%;background:${col}"></i></div><b>${Math.round(v)}</b></div>`;
    const gs = gearStats(p);
    const chips = [];
    if (p.bleeding) chips.push(['Bleeding', '#ff5a5a']);
    if (p.infection > 0) chips.push([`Infected ${Math.round(p.infection)}%`, '#b6ff5a']);
    if (carried(p) > capacity(p)) chips.push(['Overloaded', '#ff9a5a']);
    for (const [k, v] of Object.entries(p.buffs || {})) chips.push([`${k === 'adrenaline' ? 'Adrenaline' : 'Energy'} ${Math.ceil(v)}s`, k === 'adrenaline' ? '#ff7a7a' : '#5ad0c8']);
    if (p.inv.some((i) => i.id === 'reviver')) chips.push(['Self-revive ready', '#ff6ab0']);
    for (const k of gs.perks) chips.push([PERK_NAME[k], '#c8a0ff']);
    if (gs.carry) chips.push([`+${gs.carry} kg carry`, '#d0c080']);
    if (!chips.length) chips.push(['Healthy', '#7ad07a']);
    const html = bar('Health', p.hp, '#c94a4a') + bar('Food', p.hunger, '#d08a3a') + bar('Water', p.thirst, '#3a8ad0') + bar('Stamina', p.stamina, '#c9c04a') +
      `<div class="prot"><div><span>Damage taken</span><b>${gs.armor ? '-' : ''}${Math.round(gs.armor * 100)}%</b></div><div><span>Bite protection</span><b>${Math.round(gs.bite * 100)}%</b></div></div>` +
      `<div class="chips">${chips.map(([t, col]) => `<span style="color:${col};border-color:${col}">${t}</span>`).join('')}</div>`;
    if (this._stats !== html) { this._stats = html; el.innerHTML = html; }
  }
  renderBase(s, p) {
    const tabs = [['upgrades', 'Upgrades'], ['craft', 'Crafting'], ['repair', 'Repair'], ['radio', 'Radio'], ['stats', 'Raid Board']];
    if (this.baseTab === 'keypad') tabs.length = 0;
    let html = `<div class="tabs">${tabs.map(([k, n]) => `<button class="tab ${this.baseTab === k ? 'on' : ''}" data-act="tab" data-tab="${k}">${n}</button>`).join('')}</div><div class="scroll">`;
    const cost = (c) => costStatus(s, p, c).map((x) => `<span class="cost ${x.have >= x.n ? 'ok' : 'no'}"><img src="${iconURL(x.id)}" alt="">${esc(ITEMS[x.id].name)} ${Math.min(x.have, x.n)}/${x.n}</span>`).join(' ');
    const can = (c) => costStatus(s, p, c).every((x) => x.have >= x.n);
    if (this.baseTab === 'keypad') {
      const shown = (this.code + '____').slice(0, 4).split('').join(' ');
      html += `<div class="keypad"><div class="dim">A heavy keypad. Four digits. Someone left notes around the bunker.</div><div class="kdisp">${shown}</div>
        <div class="kgrid">${['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'].map((k) => `<button data-act="key" data-k="${k}">${k === 'del' ? '⌫' : k === 'ok' ? 'Enter' : k}</button>`).join('')}</div></div>`;
    } else if (this.baseTab === 'upgrades') {
      html += `<div class="dim pad">Materials come from the Stash first, then your inventory.</div>`;
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
    } else if (this.baseTab === 'repair') {
      const st = getCont(s, s.world.fixtures.stash).items;
      const worn = [...p.inv.map((it, i) => ['inv', it, i]), ...st.map((it, i) => ['stash', it, i])].filter(([, it]) => repairCost(it));
      html += `<div class="dim pad">Scrap Metal brings a melee weapon or tool back to full: one per quarter of its durability that's gone. Scrap comes from the Stash first.</div>`;
      if (!worn.length) html += `<div class="pad dim">Nothing needs fixing.</div>`;
      for (const [where, it, i] of worn) {
        const n = repairCost(it), d = ITEMS[it.id];
        html += `<div class="card"><img class="cimg" src="${iconURL(it.id)}" alt=""><div class="grow"><b>${esc(d.name)}</b> <span class="dim small">${where === 'stash' ? 'in the stash' : 'carried'}</span><div class="dim small">Durability ${it.dur}/${d.dur}</div><div>${cost({ scrap: n })}</div></div>
          <button data-act="repair" data-where="${where}" data-i="${i}" ${can({ scrap: n }) ? '' : 'disabled'}>Repair</button></div>`;
      }
    } else if (this.baseTab === 'radio') {
      if (!s.upgrades.radio) html += `<div class="pad warn">Build the Ham Radio to trade valuables for supply drops.</div>`;
      else html += `<div class="pad">Credit: <b>${s.tradePoints}</b>. A supply drop costs ${TRADE_COST}.</div>
        <div class="card"><div><b>Radio in valuables</b><div class="dim">Converts every Watch, Jewelry and Cash in your stash and pockets into credit.</div></div><button data-act="sellVal">Trade</button></div>
        <div class="card"><div><b>Request supply drop</b><div class="dim">3 random bundles (ammo, meds, parts) delivered to your stash.</div></div><button data-act="trade" ${s.tradePoints >= TRADE_COST ? '' : 'disabled'}>Request</button></div>`;
    } else {
      const st = s.stats, r = s.raid;
      html += `<div class="pad stats">${r ? `<div>Raid in progress <b>${Math.floor(r.t / 60)}:${String(Math.floor(r.t % 60)).padStart(2, '0')} / ${RAID_LEN / 60}:00</b></div>` : '<div>Next raid <b>board the bus</b></div>'}
        <div>Raids <b>${st.raids || 0}</b></div><div>Extractions <b>${st.extracts || 0}</b></div><div>Deaths <b>${st.deaths}</b></div><div>Zombies killed <b>${st.kills}</b></div><div>Items hauled to stash <b>${st.hauled}</b></div><div>Day <b>${dayOf(s)}</b></div></div>
        <div class="pad dim">Every raid drops you in a new city with ${RAID_LEN / 60} minutes on the clock and a drop crate of weapons by the bus stop. Get to the green smoke to leave. After the clock runs out the dead get faster, hit harder and come in waves. Sealed rooms hold armories: a keycard vault, a twin-lever bunker and a keypad bunker.</div>`;
    }
    html += `</div>${this.baseTab === 'keypad' ? '' : `<div class="foot"><button data-act="sleep" ${s.upgrades.bed ? '' : 'disabled title="Build the Proper Bed first"'}>Sleep</button></div>`}`;
    if (this._base !== html) {
      const body = $('baseBody'), old = body.querySelector('.scroll'), keep = old && this._baseTab === this.baseTab ? old.scrollTop : 0;
      this._base = html; this._baseTab = this.baseTab; body.innerHTML = html;
      body.querySelector('.scroll').scrollTop = keep;
    }
  }
}
