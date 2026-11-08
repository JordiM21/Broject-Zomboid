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
import { Music } from './music.js';
import { drawHUD, Minimap } from './ui/hud.js';
import { Panels } from './ui/panels.js';
import { ITEMS } from './data/items.js';
import { HotbarUI } from './ui/hotbar.js';
import { saveGame, loadGame, readLocal } from './save.js';
import { CoopHost, CoopGuest } from './net/coop.js';
import { check, login, forget, keepWarm, findWorld, loadWorld, saveWorld } from './net/relay.js';
import { joinPlayer } from './sim/sim.js';

// Who's playing on this computer. Characters are saved by name, so each player keeps their own whoever hosts.
const WHO_KEY = 'lasthaul-who';
const cleanName = (t) => String(t || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 16);
let LOCAL = (() => { try { return cleanName(localStorage.getItem(WHO_KEY)) || 'p1'; } catch { return 'p1'; } })();
let host = null, guest = null; // co-op: at most one of these is set
const inCoop = () => !!(host || guest);
const $ = (id) => document.getElementById(id);
const rend = new Renderer($('game'));
const sfx = new Sfx();
const music = new Music(sfx);
let s = null, mm = null, running = false, paused = false;
const keys = new Set(), pressed = new Set();
const mouse = { x: innerWidth / 2, y: innerHeight / 2, down: false, aim: false };
const ui = { pings: [], messages: [], mouse, mouseWorld: { x: 0, y: 0 }, interact: null, bigMap: false, panelOpen: false, dt: 0 };
const PING = { groan: 1, alert: 2, bash: 2, doorbreak: 2, zattack: 2, explode: 2, gunshot: 1 };
const zSteps = new WeakMap();
let hotEquipPending = -1, selPending = -1, hitStop = 0;

// every menu action goes through here: a partner's is also sent to the host
const doCmd = (c) => { if (guest) guest.command(c); else { command(s, LOCAL, c); drain(); } };
const panels = new Panels({
  state: () => s, player: () => s && s.players[LOCAL],
  cmd: doCmd,
});
const hotbar = new HotbarUI($('hotbar'), {
  use: (k) => { selPending = k; },
  holster: () => { if (s) doCmd({ t: 'unequip', slot: 'wpn' }); },
  cmd: doCmd,
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
  if (host) host.captureEvents(s.events);
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
      case 'ui': panels.show('base', e.panel === 'keypad' ? 'keypad' : e.tab, e); break;
      case 'newCity': rend.setWorld(s.world); mm = new Minimap(s.world, null); if (host && host.connected) host.resync(); save(true); break;
      case 'deploy': case 'extracted': if (e.type === 'extracted') save(true); if (e.pid === LOCAL) { const p = s.players[LOCAL]; rend.cam.x = p.x; rend.cam.y = p.y; panels.close(); } break;
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
  $('deathText').innerHTML = `You died in the city.<br>Everything you carried is on your body, marked <b style="color:#ffd25a">✕</b> on the map: a partner still out there can bring it home.<br>Your stash and the outpost are safe.`;
  setTimeout(() => $('death').classList.remove('hidden'), 1200);
  save();
}

function begin(state, explored) {
  s = state; rend.setWorld(s.world); rend.resize();
  const p = s.players[LOCAL]; rend.cam.x = p.x; rend.cam.y = p.y;
  mm = new Minimap(s.world, explored);
  running = true; paused = false; ui.messages = [];
  ['menu', 'coop', 'death', 'pause', 'help'].forEach((id) => $(id).classList.add('hidden'));
  aimAng = p.ang;
  if (p.dead) showDeath();
  syncLock();
}
function newGame() {
  // ?testgear in the URL adds the Weapon Rack and Mod Stash to the outpost
  const st = createState((Math.random() * 2 ** 31) | 0, false, { testGear: new URLSearchParams(location.search).has('testgear') });
  st.fresh = true; // its first upload replaces whatever shared world was there
  addPlayer(st, LOCAL);
  begin(st, null);
  addMsg('You wake up at the outpost. The bus into the city is parked in the yard.', '#ffd27a');
  addMsg('WASD move · Mouse aim · Click attack · Space dodge roll · E interact · Tab inventory', '#bbb');
  addMsg('Raid the city, reach the green smoke to extract, and stash what you bring back.', '#bbb');
  save();
}
// The host keeps a copy in this browser and, when it runs the shared world, on the server: every 20 s or so,
// and straight away at checkpoints (raid start and end, a partner joining or leaving, quitting, hiding the tab).
let upT = -1e9, upBusy = false, upStale = false;
function save(force = false) {
  if (!s || guest) return Promise.resolve(); // the world lives with whoever hosts it
  const data = saveGame(s, mm && mm.explored);
  if (!host || !host.world || upStale || upBusy || (!force && performance.now() - upT < 20000)) return Promise.resolve();
  upBusy = true; upT = performance.now();
  return saveWorld(data, !!s.fresh).then(() => { s.fresh = false; }, (e) => {
    if (e.message === 'stale') { upStale = true; addMsg('This copy of the world is out of date: your partner played more recently. Quit and press Play to get the newest one.', '#ff8a6a'); }
    else console.warn('cloud save failed', e);
  }).finally(() => { upBusy = false; });
}
function setChip(text) { const c = $('coopChip'); c.textContent = text; c.classList.toggle('hidden', !text); }
function leaveCoop() { if (host) host.close(); if (guest) guest.close(); host = null; guest = null; setChip(''); $('btnInvite').classList.remove('hidden'); $('btnInvite').textContent = 'Invite a Partner'; }
// the password changed or the login ran out: back to the password screen
function relogin() { save(); forget(); location.reload(); }
const WAKING = 'Waking up the server… this can take up to a minute.';
const inviteLink = (code) => `${location.origin}${location.pathname}#join=${code}`;
function copyInvite(code) {
  if (!navigator.clipboard) return;
  navigator.clipboard.writeText(inviteLink(code)).then(() => addMsg(`Invite link copied. Send it to your partner (code ${code}).`, '#9fe09f'), () => {});
}
// world: this session runs the shared world, so the other player finds it with Play. Otherwise it's shared by code only.
function startHosting(world = false) {
  $('btnInvite').textContent = 'Copy Invite Link';
  const label = () => (host.connected ? `Co-op · ${host.gid} is here` : world ? 'Shared world · your partner can join any time with Play' : `Co-op code: ${host.code} · waiting for your partner`);
  host = new CoopHost({
    state: () => s, drain,
    onCode: (code) => { setChip(label()); if (!world && !host.copied) { host.copied = true; copyInvite(code); } },
    onPartner: (joined, who) => { setChip(label()); addMsg(joined ? `${who} joined.` : `${who} left. Their character will be here when they return.`, '#9fe09f'); save(true); },
    onWait: (w) => { if (w) setChip(host.code ? 'Connection lost · reconnecting…' : WAKING); },
    onError: (why, code) => { // the other player got the world first: drop this copy and join theirs
      addMsg(why, '#ff8a6a'); leaveCoop();
      if (code) { running = false; s = null; panels.close(); showMenu(); joinGame(code); }
    },
    onAuth: relogin,
  }, { world, me: LOCAL });
}
const menuMsg = (t) => { $('menuMsg').textContent = t; };
// The name box on the menu is required: it decides which character is yours.
function myName() {
  const n = cleanName($('who').value);
  if (!n) { menuMsg('Type your name first: it keeps your character yours.'); $('who').focus(); return null; }
  try { localStorage.setItem(WHO_KEY, n); } catch { /* asked again next time */ }
  LOCAL = n; return n;
}
// Play: join the world if the other player is in it. Otherwise load the newest copy (the server's or this browser's) and host it.
async function play() {
  const me = myName(); if (!me || host || guest) return;
  await spritesReady; sfx.init();
  menuMsg('Looking for your world…');
  let code;
  try { code = await findWorld((w) => w && menuMsg(WAKING)); } catch (e) { // no server: this computer's copy, alone
    menuMsg('');
    const r = loadGame(spawnZombie, newPlayer, me);
    if (r) { joinPlayer(r.state, me); begin(r.state, r.explored); } else newGame();
    addMsg(`Offline (${e.message}) Playing this computer's copy; it won't reach your partner.`, '#ffb070'); return;
  }
  if (code) { joinGame(code); return; }
  let cloud; try { cloud = await loadWorld(); } catch (e) { cloud = undefined; console.warn(e); }
  const local = readLocal(), d = [cloud, local].filter(Boolean).sort((a, b) => (b.rev || 0) - (a.rev || 0))[0];
  menuMsg('');
  if (d) { const r = loadGame(spawnZombie, newPlayer, me, d); joinPlayer(r.state, me); begin(r.state, r.explored); addMsg(`Welcome back, ${me}. You're hosting the shared world: your partner can join any time with Play.`, '#9fe09f'); }
  else newGame();
  if (cloud === undefined) addMsg("Couldn't read the shared save; playing this computer's copy.", '#ffb070');
  upStale = false; startHosting(true); save(true);
}
function joinGame(code) {
  $('coopMsg').textContent = 'Connecting...'; menuMsg('Your partner is playing. Joining their game…');
  guest = new CoopGuest(code, {
    onReady: (state) => { menuMsg(''); $('btnInvite').classList.add('hidden'); $('coop').classList.add('hidden'); begin(state, null); setChip('Co-op · connected to host'); addMsg("You joined your partner's world.", '#9fe09f'); },
    onWait: (w) => { if (guest && guest.ready) setChip(w ? 'Connection lost · reconnecting…' : 'Co-op · connected to host'); else if (w) $('coopMsg').textContent = WAKING; },
    onAuth: relogin,
    onChanged: () => panels.refresh(),
    onEnded: (why) => { const wasPlaying = running; leaveCoop(); running = false; paused = false; s = null; panels.close(); if (document.pointerLockElement) document.exitPointerLock(); ['pause', 'death'].forEach((id) => $(id).classList.add('hidden')); showMenu(); menuMsg(why === 'The host left the game.' ? 'Your partner left. Press Play to keep going in the shared world.' : why); if (wasPlaying) sfx.setRain(0); },
  }, LOCAL);
}

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
  if (e.code.startsWith('Digit')) { const n = +e.code.slice(5); if (n >= 1 && n <= 9) selPending = n - 1; }
  syncLock();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); mouse.down = mouse.aim = false; });
addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; if (rotating() && inPlay()) aimAng += e.movementX * TURN_SPEED; });
$('game').addEventListener('mousedown', (e) => {
  sfx.init();
  const h = panels.held; // clicking the world with a stack on the cursor drops it there
  if (h && s) { if (h.side === 'inv') doCmd({ t: 'drop', idx: panels.idx(h.i) }); panels.drop(); panels.refresh(); return; }
  if (e.button === 0) mouse.down = true; if (e.button === 2) mouse.aim = true;
});
addEventListener('mouseup', (e) => { if (e.button === 0) mouse.down = false; if (e.button === 2) mouse.aim = false; });
addEventListener('contextmenu', (e) => e.preventDefault());
$('game').addEventListener('wheel', (e) => {
  if (!s) return; const p = s.players[LOCAL];
  const slots = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter((k) => { const it = resolveHot(p, k); return it && ['melee', 'gun'].includes(ITEMS[it.id].cat); });
  if (!slots.length) return;
  const cur = slots.findIndex((k) => resolveHot(p, k) === p.wpn);
  hotEquipPending = slots[(cur + (e.deltaY > 0 ? 1 : -1) + slots.length) % slots.length];
}, { passive: true });
addEventListener('resize', () => rend.resize());
addEventListener('beforeunload', save);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(true); });

function togglePause() { paused = !paused; $('pause').classList.toggle('hidden', !paused); if (paused) save(); }

function buildInput(first) {
  const k = (c) => keys.has(c), ed = (c) => first && pressed.has(c);
  const inp = {
    mx: panels.isOpen || ui.bigMap ? undefined : ui.mouseWorld.x, my: panels.isOpen || ui.bigMap ? undefined : ui.mouseWorld.y,
    up: k('KeyW') || k('ArrowUp'), down: k('KeyS') || k('ArrowDown'), left: k('KeyA') || k('ArrowLeft'), right: k('KeyD') || k('ArrowRight'),
    sprint: k('ShiftLeft') || k('ShiftRight'), attack: mouse.down && !ui.bigMap && !panels.isOpen, aim: mouse.aim && !ui.bigMap && !panels.isOpen,
    sneak: ed('KeyC'), interact: ed('KeyE'), use: k('KeyE') && !panels.isOpen, reload: ed('KeyR'), roll: ed('Space'), shove: ed('KeyV'), flash: ed('KeyF'), heal: ed('KeyH'), throwN: ed('KeyG'), throwB: ed('KeyX'), barricade: ed('KeyB'),
    sel: first ? selPending : -1, hotEquip: first ? hotEquipPending : -1,
    peek: k('KeyQ') && !panels.isOpen && !ui.bigMap, peekStart: ed('KeyQ'),
  };
  if (first) { selPending = -1; hotEquipPending = -1; }
  if (rotating() && s) {
    const p = s.players[LOCAL]; inp.relative = true;
    if (inp.mx !== undefined) { inp.mx = p.x + Math.cos(aimAng) * AIM_DIST; inp.my = p.y + Math.sin(aimAng) * AIM_DIST; }
  }
  if (guest && inp.mx !== undefined) { const p = s.players[LOCAL]; inp.ang = Math.atan2(inp.my - p.y, inp.mx - p.x); } // the host's copy of us lags, so send the angle itself
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
// New World replaces the shared world for both players, so it asks twice and never while the other one is in it
$('btnNew').onclick = async () => {
  const b = $('btnNew');
  if (!myName() || host || guest) return;
  if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Replace the shared world for both of you? Click again'; b.onmouseleave = () => { delete b.dataset.armed; b.textContent = 'New World'; }; return; }
  delete b.dataset.armed; b.textContent = 'New World';
  await spritesReady; sfx.init();
  try { if (await findWorld()) { menuMsg('Your partner is playing the world right now. Press Play to join them.'); return; } } catch { /* offline: a local world */ }
  newGame(); upStale = false; startHosting(true); save(true);
};
$('btnContinue').onclick = play;
$('who').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') play(); });
$('btnHelp').onclick = () => $('help').classList.remove('hidden');
$('btnPauseHelp').onclick = () => $('help').classList.remove('hidden');
$('btnHelpClose').onclick = () => $('help').classList.add('hidden');
$('btnResume').onclick = () => togglePause();
$('btnCoop').onclick = () => { $('coopMsg').textContent = ''; $('coop').classList.remove('hidden'); };
$('btnCoopBack').onclick = () => { if (guest && !guest.ready) leaveCoop(); $('coop').classList.add('hidden'); };
$('btnHost').onclick = () => { $('coop').classList.add('hidden'); play(); };
$('btnJoin').onclick = async () => {
  const code = $('coopCode').value.trim().toUpperCase();
  if (code.length !== 4) { $('coopMsg').textContent = 'Enter the 4-letter code from your partner.'; return; }
  if (!cleanName($('who').value)) { $('coopMsg').textContent = 'Go back and type your name on the menu first.'; return; }
  myName();
  if (guest) leaveCoop(); // a second click starts over instead of leaving a stray connection
  await spritesReady; sfx.init(); joinGame(code);
};
$('coopCode').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') $('btnJoin').click(); });
$('btnInvite').onclick = () => { if (host) { if (host.code) copyInvite(host.code); } else startHosting(); togglePause(); };
$('btnQuit').onclick = () => { save(true); leaveCoop(); running = false; paused = false; $('pause').classList.add('hidden'); panels.close(); showMenu(); };
$('btnRespawn').onclick = () => { doCmd({ t: 'respawn' }); $('death').classList.add('hidden'); const p = s.players[LOCAL]; rend.cam.x = p.x; rend.cam.y = p.y; addMsg('You wake up at the outpost.', '#ffd27a'); save(); };
// Sound options live on both the main menu and the pause menu; the sliders mirror each other and are remembered.
const VOL_KEY = 'lasthaul_volume';
try { const v = parseFloat(localStorage.getItem(VOL_KEY)); if (v >= 0 && v <= 1) sfx.volume = v; } catch { /* private mode */ }
const volSliders = { sfx: [...document.querySelectorAll('.sfxVol')], music: [...document.querySelectorAll('.musicVol')] };
volSliders.sfx.forEach((el) => { el.value = sfx.volume; el.oninput = () => { sfx.setVolume(+el.value); volSliders.sfx.forEach((o) => { o.value = el.value; }); try { localStorage.setItem(VOL_KEY, el.value); } catch { /* ignore */ } }; });
volSliders.music.forEach((el) => { el.value = music.vol; el.oninput = () => { music.setVolume(+el.value); volSliders.music.forEach((o) => { o.value = el.value; }); }; });
// what the soundtrack should be doing right now (checked a few times a second, not every frame)
let moodT = 0, moodNow = 'menu';
function wantMood(dt) {
  if (!running || !s) return 'menu'; // the password screen and main menu play the main theme
  const p = s.players[LOCAL]; if (p.dead) return 'none';
  if (!p.inRaid) return 'home'; // the outpost
  if ((moodT -= dt) > 0) return moodNow;
  moodT = 0.25;
  let chase = 0, near = 0;
  for (const z of s.zombies) {
    if (z.state === 'idle') continue;
    const d = Math.hypot(z.x - p.x, z.y - p.y);
    if (z.state === 'chase' && d < TILE * 13) chase += z.type === 'runner' || z.type === 'brute' ? 2 : 1; else if (d < TILE * 22) near++;
  }
  const late = s.raid && s.raid.len - s.raid.t < 120;
  return (moodNow = chase >= 2 ? 'action' : chase || near || late || p.hp < 35 || p.downed ? 'tension' : 'explore');
}
function showMenu() { $('who').value = LOCAL === 'p1' ? '' : LOCAL; $('menu').classList.remove('hidden'); showViewSetting(); }

// ---------- loop ----------
let last = performance.now(), acc = 0, saveT = 0, revealT = 0, lastSim = performance.now();
// advance the simulation by the real time since the last call
function simTick() {
  const now = performance.now(), dt = Math.min(0.1, (now - lastSim) / 1000); lastSim = now;
  if (hitStop > 0 && !inCoop()) hitStop -= dt; else acc += dt;
  let first = true;
  while (acc >= SIM_DT) {
    const inputs = { [LOCAL]: paused ? {} : buildInput(first) };
    if (host && host.connected && host.gid) inputs[host.gid] = host.inputForTick();
    step(s, inputs, SIM_DT); first = false; acc -= SIM_DT; drain();
  }
  if (!first) pressed.clear();
  if (host) host.tick(dt);
}
function partnerTick(dt) {
  acc += dt; let first = true;
  while (acc >= SIM_DT) { guest.input(paused ? {} : buildInput(first), SIM_DT); first = false; acc -= SIM_DT; }
  if (!first) pressed.clear();
  guest.afterFrame(dt);
  drain();
}
// Browsers stop drawing a hidden tab, but a host's world must keep running for their partner. This worker timer isn't paused.
const heartbeat = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 33)'])));
heartbeat.onmessage = () => {
  const t = performance.now();
  if (host && running && t - lastSim > 100) simTick();
  // a hidden partner tab keeps up with the world, but skips the sounds rather than playing them all on return
  if (guest && guest.s && t - lastFrame > 100) { guest.receive(); guest.s.events = guest.s.events.filter((e) => MUST_HANDLE.has(e.type)); }
};
const MUST_HANDLE = new Set(['msg', 'open', 'close', 'ui', 'objective', 'slept', 'pdie', 'newCity', 'deploy', 'extracted']); // these change what's on screen, so they wait for the player's return
let lastFrame = performance.now();
function frame(now) {
  lastFrame = performance.now();
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (guest && guest.inbox.length && guest.s) guest.receive(); // includes the partner's first world, before they've started playing
  music.set(wantMood(dt), dt);
  if (!running) return;
  const live = !paused || inCoop(); // a shared world keeps running behind a pause menu
  ui.dt = live ? dt : 0;
  ui.mouseWorld = rend.screenToWorld(mouse.x, mouse.y);
  if (live) {
    if (guest) partnerTick(dt); else simTick();
    for (const m of ui.messages) m.t -= dt;
    ui.messages = ui.messages.filter((m) => m.t > 0);
    saveT += dt; if (saveT > 30) { saveT = 0; save(); }
    revealT -= dt;
    const p = s.players[LOCAL];
    if (revealT <= 0 && !p.dead) { revealT = 0.4; for (const id in s.players) if (!s.players[id].dead) mm.reveal(s.players[id].x, s.players[id].y); /* what either of you has seen goes on both maps */ if (panels.isOpen) panels.refresh(); }
  }
  const p = s.players[LOCAL];
  ui.localId = LOCAL;
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
// ---------- password ----------
// Only the two of us get past this. The server checks the password and every connection; this screen is just the door.
const gateMsg = (t) => { $('gateMsg').textContent = t; };
const gateWait = (w) => { if (w) gateMsg(WAKING); };
async function openGate() {
  $('gateForm').classList.add('hidden'); $('gateRetry').classList.add('hidden'); gateMsg('Connecting…');
  try {
    if (await check(gateWait)) { enter(); return; }
    gateMsg('Enter the password.'); $('gateForm').classList.remove('hidden'); $('gatePass').focus();
  } catch (e) { gateMsg(e.message); $('gateRetry').classList.remove('hidden'); }
}
function enter() {
  $('gate').classList.add('hidden'); showMenu();
  // opened from an invite link: the code is filled in, one click on Join
  const code = (location.hash.match(/join=([A-Za-z]{4})/) || [])[1];
  if (!code) return;
  history.replaceState(null, '', location.pathname + location.search);
  $('coop').classList.remove('hidden'); $('coopCode').value = code.toUpperCase();
  $('coopMsg').textContent = 'Press Join to enter your partner\'s game.'; $('btnJoin').focus();
}
$('gateForm').onsubmit = async (e) => {
  e.preventDefault();
  const pass = $('gatePass').value; if (!pass) return;
  $('gateForm').classList.add('hidden'); gateMsg('Checking…');
  try { await login(pass, gateWait); $('gatePass').value = ''; enter(); }
  catch (err) { gateMsg(err.message); $('gateForm').classList.remove('hidden'); $('gatePass').select(); }
};
$('gatePass').addEventListener('keydown', (e) => e.stopPropagation());
$('gateRetry').onclick = openGate;

rend.resize();
keepWarm();
openGate();
requestAnimationFrame(frame);
window.__game = { music, spawn: (x, y, t) => spawnZombie(s, x, y, t), revealAll: () => { mm.explored.fill(1); for (let i = 0; i < mm.n; i++) mm.paint(i); mm.g.putImageData(mm.img, 0, 0); }, sfx, get state() { return s; }, newGame, command: doCmd, get host() { return host; }, get guest() { return guest; } };
