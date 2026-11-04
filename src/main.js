import './style.css';
import { SIM_DT } from './config.js';
import { resolveHot, daylight, createState, addPlayer, step, command, getInteract, spawnZombie, newPlayer, dayOf, weaponList } from './sim/sim.js';
import { Renderer } from './render/renderer.js';
import { assetsReady } from './render/assets.js';
import { playerFrame, zombieFrame, P_ANIMS, Z_ANIMS, prewarm } from './render/sprites.js';
const spritesReady = assetsReady.then(() => prewarm());
window.__sprites = { playerFrame, zombieFrame, P_ANIMS, Z_ANIMS };
import { los } from './world/world.js';
import { TILE } from './config.js';
import { Sfx } from './audio.js';
import { drawHUD, Minimap } from './ui/hud.js';
import { Panels } from './ui/panels.js';
import { ITEMS } from './data/items.js';
import { HotbarUI } from './ui/hotbar.js';
import { saveGame, loadGame, hasSave } from './save.js';

const LOCAL = 'p1';
const $ = (id) => document.getElementById(id);
const rend = new Renderer($('game'));
const sfx = new Sfx();
let s = null, mm = null, running = false, paused = false;
const keys = new Set(), pressed = new Set();
const mouse = { x: innerWidth / 2, y: innerHeight / 2, down: false, aim: false };
const ui = { pings: [], messages: [], mouse, mouseWorld: { x: 0, y: 0 }, interact: null, bigMap: false, panelOpen: false, dt: 0 };
const PING = { groan: 1, alert: 2, bash: 2, doorbreak: 2, zattack: 2, explode: 2, gunshot: 1 };
const zSteps = new WeakMap();
let hotEquipPending = -1, selPending = -1, hitStop = 0;

const assignHot = (k, d) => {
  const p = s.players[LOCAL];
  if (d.side === 'inv') command(s, LOCAL, { t: 'hotbar', slot: k, idx: d.idx });
  else { const it = panels.item('cont', d.idx); if (!it) return; command(s, LOCAL, { t: 'take', cid: p.openCid, idx: d.idx }); const j = p.inv.findLastIndex((x) => x.id === it.id); if (j >= 0) command(s, LOCAL, { t: 'hotbar', slot: k, idx: j }); }
  drain(); panels.refresh();
};
const panels = new Panels({
  state: () => s, player: () => s && s.players[LOCAL],
  cmd: (c) => { command(s, LOCAL, c); drain(); },
  use: (k) => { selPending = k; }, assign: assignHot,
});
const hotbar = new HotbarUI($('hotbar'), {
  use: (k) => { selPending = k; },
  holster: () => { if (s) { s.players[LOCAL].wpn = null; } },
  cmd: (c) => { command(s, LOCAL, c); drain(); },
  invDrag: () => panels.drag,
  assign: assignHot,
});

// ---------- rotating view (optional): the world turns so the character always faces up the screen ----------
const SETTINGS_KEY = 'lasthaul_settings';
const TURN_SPEED = 0.0035; // radians per pixel of mouse movement
const AIM_DIST = 240; // how far ahead the aim point sits, in world px
const settings = (() => { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { return {}; } })();
let aimAng = -Math.PI / 2;
const rotating = () => !!settings.rotate && !ui.touch;
const inPlay = () => running && !paused && !panels.isOpen && !ui.bigMap && !!s && !s.players[LOCAL].dead;
const wantLock = () => rotating() && inPlay();
function syncLock() {
  if (wantLock() && !document.pointerLockElement) { const r = $('game').requestPointerLock(); if (r && r.catch) r.catch(() => {}); }
  else if (!wantLock() && document.pointerLockElement) document.exitPointerLock();
}
function showViewSetting() { document.querySelectorAll('.btnView').forEach((b) => { b.textContent = `View: ${settings.rotate ? 'Follows character' : 'Fixed'}`; }); }
document.querySelectorAll('.btnView').forEach((b) => {
  b.title = 'Follows character: the view turns with you. W walks forward, the mouse steers.';
  b.onclick = () => { settings.rotate = !settings.rotate; try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* stays on for this session */ } showViewSetting(); };
});
// the browser drops the lock on Esc or when the window loses focus: that should pause, like Esc does
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && wantLock()) togglePause(); });
addEventListener('click', syncLock);
const addMsg = (text, color = '#ddd') => { ui.messages.push({ text, color, t: 7 }); if (ui.messages.length > 30) ui.messages.shift(); };

function drain() {
  for (const e of s.events) {
    rend.onEvent(e, LOCAL); sfx.play(e, LOCAL);
    if (PING[e.type]) { const p = s.players[LOCAL]; const d = Math.hypot(e.x - p.x, e.y - p.y); if (d > 100 && d < 1300 && (d > 15 * TILE || !los(s.world, p.x, p.y, e.x, e.y))) ui.pings.push({ x: e.x, y: e.y, t: 1.8, danger: PING[e.type] === 2 }); }
    if (e.type === 'zhit' && e.melee && e.pid === LOCAL) hitStop = Math.max(hitStop, e.crit ? 0.07 : 0.04);
    if (e.type === 'zdie') { const p = s.players[LOCAL]; if (Math.hypot(e.x - p.x, e.y - p.y) < 140) hitStop = Math.max(hitStop, e.ztype === 'brute' ? 0.12 : 0.07); }
    if (e.pid && e.pid !== LOCAL && e.type !== 'step') continue;
    switch (e.type) {
      case 'msg': addMsg(e.text, e.color); break;
      case 'open': panels.show('inv'); if (e.first && e.empty) addMsg('Nothing useful here.', '#888'); break;
      case 'close': if (panels.open === 'inv') panels.refresh(); break;
      case 'ui': panels.show('base', e.tab); break;
      case 'objective': addMsg(`✔ Objective complete: ${e.text}`, '#ffd27a'); sfx.play({ type: 'objective' }); break;
      case 'slept': addMsg('You slept until morning.', '#9ab0ff'); break;
      case 'pdie': showDeath(); break;
    }
  }
  const dirty = panels.isOpen && s.events.some((e) => e.type !== 'step' && e.type !== 'groan');
  s.events.length = 0;
  if (dirty) panels.refresh();
}

function showDeath() {
  panels.close();
  $('deathText').innerHTML = `You survived until Day ${dayOf(s)}.<br>Everything you carried is on your body, marked <b style="color:#ffd25a">✕</b> on the map.<br>Your stash and base upgrades are safe.`;
  setTimeout(() => $('death').classList.remove('hidden'), 1200);
  save();
}

function begin(state, explored) {
  s = state; rend.setWorld(s.world); rend.resize();
  const p = s.players[LOCAL]; rend.cam.x = p.x; rend.cam.y = p.y;
  mm = new Minimap(s.world, explored);
  running = true; paused = false; ui.messages = [];
  ['menu', 'death', 'pause', 'help'].forEach((id) => $(id).classList.add('hidden'));
  aimAng = p.ang;
  if (p.dead) showDeath();
  syncLock();
}
function newGame() {
  const st = createState((Math.random() * 2 ** 31) | 0);
  addPlayer(st, LOCAL);
  begin(st, null);
  addMsg('You wake up in the safehouse. Supplies are almost gone.', '#ffd27a');
  addMsg('WASD move · Mouse aim · Click attack · E interact · Tab inventory', '#bbb');
  addMsg('Loot the town and bring it back to the Stash. Zombies cannot enter the fence.', '#bbb');
  save();
}
function save() { if (s) saveGame(s, mm && mm.explored); }

// ---------- input ----------
addEventListener('keydown', (e) => {
  if (['Tab', 'Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  sfx.init();
  if (!running) return;
  if (e.code === 'Escape') {
    if (!$('help').classList.contains('hidden')) { $('help').classList.add('hidden'); return; }
    if (panels.handleKey('Escape')) return;
    if (panels.isOpen) panels.close();
    else if (ui.bigMap) ui.bigMap = false;
    else if (!$('death').classList.contains('hidden')) return;
    else togglePause();
    return;
  }
  if (paused) return;
  if (panels.handleKey(e.code, e.shiftKey)) return;
  if (!keys.has(e.code)) pressed.add(e.code);
  keys.add(e.code);
  if (e.code === 'Tab' || e.code === 'KeyI') panels.toggleInv();
  if (e.code === 'KeyM') ui.bigMap = !ui.bigMap;
  if (e.code.startsWith('Digit')) { const n = +e.code.slice(5); if (n >= 1 && n <= 6) selPending = n - 1; }
  syncLock();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); mouse.down = mouse.aim = false; });
addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; if (rotating() && inPlay()) aimAng += e.movementX * TURN_SPEED; });
$('game').addEventListener('mousedown', (e) => { sfx.init(); if (e.button === 0) mouse.down = true; if (e.button === 2) mouse.aim = true; });
addEventListener('mouseup', (e) => { if (e.button === 0) mouse.down = false; if (e.button === 2) mouse.aim = false; });
addEventListener('contextmenu', (e) => e.preventDefault());
$('game').addEventListener('wheel', (e) => {
  if (!s) return; const p = s.players[LOCAL];
  const slots = [0, 1, 2, 3, 4, 5].filter((k) => { const it = resolveHot(p, k); return it && ['melee', 'gun'].includes(ITEMS[it.id].cat); });
  if (!slots.length) return;
  const cur = slots.findIndex((k) => resolveHot(p, k) === p.wpn);
  hotEquipPending = slots[(cur + (e.deltaY > 0 ? 1 : -1) + slots.length) % slots.length];
}, { passive: true });
addEventListener('resize', () => rend.resize());
addEventListener('beforeunload', save);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

function togglePause() { paused = !paused; $('pause').classList.toggle('hidden', !paused); if (paused) save(); }

function buildInput(first) {
  const k = (c) => keys.has(c), ed = (c) => first && pressed.has(c);
  const inp = {
    mx: panels.isOpen || ui.bigMap ? undefined : ui.mouseWorld.x, my: panels.isOpen || ui.bigMap ? undefined : ui.mouseWorld.y,
    up: k('KeyW') || k('ArrowUp'), down: k('KeyS') || k('ArrowDown'), left: k('KeyA') || k('ArrowLeft'), right: k('KeyD') || k('ArrowRight'),
    sprint: k('ShiftLeft') || k('ShiftRight'), attack: mouse.down && !ui.bigMap && !panels.isOpen, aim: mouse.aim && !ui.bigMap && !panels.isOpen,
    sneak: ed('KeyC'), interact: ed('KeyE'), reload: ed('KeyR'), shove: ed('Space'), flash: ed('KeyF'), heal: ed('KeyH'), throwN: ed('KeyG'), throwB: ed('KeyX'), barricade: ed('KeyB'),
    sel: first ? selPending : -1, hotEquip: first ? hotEquipPending : -1,
    peek: k('KeyQ') && !panels.isOpen && !ui.bigMap, peekStart: ed('KeyQ'),
  };
  if (first) { selPending = -1; hotEquipPending = -1; }
  if (rotating() && s) {
    const p = s.players[LOCAL]; inp.relative = true;
    if (inp.mx !== undefined) { inp.mx = p.x + Math.cos(aimAng) * AIM_DIST; inp.my = p.y + Math.sin(aimAng) * AIM_DIST; }
  }
  if (touch.move) {
    const dx = (touch.move.x - touch.move.ox) / 45, dy = (touch.move.y - touch.move.oy) / 45;
    inp.left = dx < -0.35; inp.right = dx > 0.35; inp.up = dy < -0.35; inp.down = dy > 0.35;
  }
  if (touch.aim && s) {
    const p = s.players[LOCAL], dx = touch.aim.x - touch.aim.ox, dy = touch.aim.y - touch.aim.oy;
    if (Math.hypot(dx, dy) > 12) { const a = Math.atan2(dy, dx); inp.mx = p.x + Math.cos(a) * 160; inp.my = p.y + Math.sin(a) * 160; inp.attack = Math.hypot(dx, dy) > 40; }
  }
  return inp;
}

// ---------- touch ----------
const touch = { move: null, aim: null };
if (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) {
  $('touch').classList.remove('hidden'); ui.touch = true;
  const cv = $('game');
  cv.addEventListener('touchstart', (e) => {
    e.preventDefault(); sfx.init();
    for (const t of e.changedTouches) {
      const o = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY };
      if (t.clientX < innerWidth / 2) { if (!touch.move) touch.move = o; } else if (!touch.aim) touch.aim = o;
    }
  }, { passive: false });
  cv.addEventListener('touchmove', (e) => { e.preventDefault(); for (const t of e.changedTouches) for (const k of ['move', 'aim']) if (touch[k] && touch[k].id === t.identifier) { touch[k].x = t.clientX; touch[k].y = t.clientY; } }, { passive: false });
  const end = (e) => { for (const t of e.changedTouches) for (const k of ['move', 'aim']) if (touch[k] && touch[k].id === t.identifier) touch[k] = null; };
  cv.addEventListener('touchend', end); cv.addEventListener('touchcancel', end);
  for (const btn of document.querySelectorAll('#touch button')) {
    const k = btn.dataset.k;
    btn.addEventListener('touchstart', (e) => {
      e.preventDefault(); e.stopPropagation(); sfx.init();
      if (k === 'inv') panels.toggleInv(); else if (k === 'map') ui.bigMap = !ui.bigMap;
      else if (k === 'wpn') { const p = s.players[LOCAL], l = weaponList(p); selPending = (Math.max(0, l.indexOf(p.wpn)) + 1) % l.length; }
      else if (k === 'Escape') dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
      else { pressed.add(k); keys.add(k); }
    }, { passive: false });
    btn.addEventListener('touchend', () => { if (btn.dataset.hold || !['inv', 'map', 'wpn', 'Escape'].includes(k)) keys.delete(k); });
  }
}

// ---------- menus ----------
$('btnNew').onclick = async () => {
  const b = $('btnNew');
  if (hasSave() && !b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Overwrite your save? Click again'; b.onmouseleave = () => { delete b.dataset.armed; b.textContent = 'New World'; }; return; }
  delete b.dataset.armed; b.textContent = 'New World';
  await spritesReady; sfx.init(); newGame();
};
$('btnContinue').onclick = async () => { await spritesReady; sfx.init(); const r = loadGame(spawnZombie, newPlayer); if (r) begin(r.state, r.explored); else newGame(); };
$('btnHelp').onclick = () => $('help').classList.remove('hidden');
$('btnPauseHelp').onclick = () => $('help').classList.remove('hidden');
$('btnHelpClose').onclick = () => $('help').classList.add('hidden');
$('btnResume').onclick = () => togglePause();
$('btnQuit').onclick = () => { save(); running = false; paused = false; $('pause').classList.add('hidden'); panels.close(); showMenu(); };
$('btnRespawn').onclick = () => { command(s, LOCAL, { t: 'respawn' }); drain(); $('death').classList.add('hidden'); const p = s.players[LOCAL]; rend.cam.x = p.x; rend.cam.y = p.y; addMsg('You wake up at the safehouse.', '#ffd27a'); save(); };
$('vol').oninput = (e) => sfx.setVolume(+e.target.value);
function showMenu() { $('btnContinue').classList.toggle('hidden', !hasSave()); $('menu').classList.remove('hidden'); showViewSetting(); }

// ---------- loop ----------
let last = performance.now(), acc = 0, saveT = 0, revealT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (!running) return;
  ui.dt = paused ? 0 : dt;
  ui.mouseWorld = rend.screenToWorld(mouse.x, mouse.y);
  if (!paused) {
    if (hitStop > 0) { hitStop -= dt; } else acc += dt;
    let first = true;
    while (acc >= SIM_DT) { step(s, { [LOCAL]: buildInput(first) }, SIM_DT); first = false; acc -= SIM_DT; drain(); }
    if (!first) pressed.clear();
    for (const m of ui.messages) m.t -= dt;
    ui.messages = ui.messages.filter((m) => m.t > 0);
    saveT += dt; if (saveT > 30) { saveT = 0; save(); }
    revealT -= dt;
    const p = s.players[LOCAL];
    if (revealT <= 0 && !p.dead) { revealT = 0.4; mm.reveal(p.x, p.y); if (panels.isOpen) panels.refresh(); }
  }
  const p = s.players[LOCAL];
  ui.interact = !p.dead ? getInteract(s, p) : null;
  ui.panelOpen = panels.isOpen;
  $('game').classList.toggle('free', ui.panelOpen); // keep a visible cursor outside an open panel
  ui.rotate = rotating();
  if (!ui.rotate) aimAng = p.ang;
  if (!wantLock() && document.pointerLockElement) document.exitPointerLock();
  sfx.lx = p.x; sfx.ly = p.y; sfx.setRain(s.weather ? s.weather.rain : 0);
  const w = s.world, ti = Math.floor(p.y / TILE) * w.w + Math.floor(p.x / TILE);
  sfx.occl = (x, y) => !los(w, p.x, p.y, x, y);
  sfx.update(ui.dt, { indoor: w.bld[ti] >= 0, hp: p.hp, dead: p.dead, day: daylight(s) });
  if (!paused && !p.dead) { // zombie footsteps near the player
    let n = 0;
    for (const z of s.zombies) {
      if (z.state === 'idle' || z.atk > 0 || Math.abs(z.x - p.x) > 380 || Math.abs(z.y - p.y) > 380) continue;
      let t = (zSteps.get(z) ?? Math.random() * 0.5) - dt;
      if (t <= 0 && n < 4) { n++; t = z.type === 'runner' ? 0.26 : z.type === 'brute' ? 0.7 : 0.55; sfx.play({ type: 'zstep', x: z.x, y: z.y, surf: w.floor[Math.floor(z.y / TILE) * w.w + Math.floor(z.x / TILE)], run: z.type === 'runner' }, LOCAL); }
      zSteps.set(z, t);
    }
  }
  rend.render(s, LOCAL, ui);
  ui.aim = ui.rotate ? rend.worldToScreen(p.x + Math.cos(p.ang) * AIM_DIST, p.y + Math.sin(p.ang) * AIM_DIST) : null;
  hotbar.render(p, running && !p.dead && !ui.bigMap && !panels.isOpen); // the inventory shows its own copy of these slots
  drawHUD(rend.ctx, s, p, ui, rend, mm);
}
rend.resize();
showMenu();
requestAnimationFrame(frame);
window.__game = { spawn: (x, y, t) => spawnZombie(s, x, y, t), revealAll: () => { mm.explored.fill(1); for (let i = 0; i < mm.n; i++) mm.paint(i); mm.g.putImageData(mm.img, 0, 0); }, sfx, get state() { return s; }, newGame, command: (c) => { command(s, LOCAL, c); drain(); } };
