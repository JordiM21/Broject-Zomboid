// Co-op relay: pairs a host and a partner by room code and passes their messages along. It knows nothing about the game.
// In development it runs inside the Vite server at /coop, open to anyone. For play over the internet:
//   RELAY_PASSWORD=... PORT=8787 node server/relay.mjs
// Every connection must carry a token, and the only way to get one is the password. Tokens are signed with the
// password itself, so they survive restarts, and changing the password logs everyone out.
import { createServer } from 'node:http';
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { makeWorldStore } from './worldstore.mjs';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O: they read like 1 and 0
const MAX_ROOMS = 20; // it's two people: anything more is someone else
const MAX_MESSAGE = 4 * 1024 * 1024;
const TOKEN_DAYS = 60;
const LOCK_MS = 15 * 60 * 1000, MAX_FAILS_PER_IP = 5, MAX_FAILS_TOTAL = 30;
const OPEN = 1;

const sha = (s) => createHash('sha256').update(String(s)).digest();
const sign = (password, exp) => createHmac('sha256', password).update(`lasthaul:${exp}`).digest('base64url');

export function makeToken(password, now = Date.now()) { const exp = now + TOKEN_DAYS * 864e5; return `${exp}.${sign(password, exp)}`; }
export function tokenOK(password, token, now = Date.now()) {
  if (!password) return true; // dev: no password, no gate
  const [exp, mac] = String(token || '').split('.');
  if (!mac || !(+exp > now)) return false;
  const want = Buffer.from(sign(password, exp)), got = Buffer.from(mac);
  return got.length === want.length && timingSafeEqual(got, want);
}

export function attachRelay(httpServer, { path = '/coop', password = process.env.RELAY_PASSWORD, world = makeWorldStore() } = {}) {
  const rooms = new Map(); // code -> { host, guest, world }
  const fails = new Map(); // ip -> [timestamps]
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE });
  const say = (ws, relay, extra) => { if (ws && ws.readyState === OPEN) ws.send(JSON.stringify({ relay, ...extra })); };
  const bye = (ws, why) => { say(ws, 'error', { why }); ws.close(); };
  const newCode = () => { for (;;) { let c = ''; for (let k = 0; k < 4; k++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]; if (!rooms.has(c)) return c; } };

  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://relay');
    if (url.pathname !== path) return; // not ours: Vite's own live-reload socket shares this server
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    wss.handleUpgrade(req, socket, head, (ws) => {
      keepAlive(ws);
      const q = url.searchParams, role = q.get('role');
      if (role === 'login') return login(ws, ip);
      if (!tokenOK(password, q.get('token'))) { say(ws, 'auth'); ws.close(); return; }
      if (role === 'check') { say(ws, 'ok'); ws.close(); return; }
      if (role === 'find') { say(ws, 'world-host', { code: worldRoom() }); ws.close(); return; }
      if (role === 'load') { world.load().then((data) => say(ws, 'world', { data }), () => say(ws, 'error', { why: 'The saved world could not be read.' })).finally(() => ws.close()); return; }
      if (role === 'save') return saveWorld(ws);
      if (role === 'host') return host(ws, (q.get('code') || '').toUpperCase(), q.get('world') === '1');
      join(ws, (q.get('room') || '').toUpperCase(), (q.get('who') || '').slice(0, 24));
    });
  });

  // The password arrives as the first message, never in a URL.
  function login(ws, ip) {
    const now = Date.now();
    for (const [k, list] of fails) { const live = list.filter((t) => now - t < LOCK_MS); if (live.length) fails.set(k, live); else fails.delete(k); }
    const total = [...fails.values()].reduce((n, l) => n + l.length, 0);
    if ((fails.get(ip) || []).length >= MAX_FAILS_PER_IP || total >= MAX_FAILS_TOTAL) return bye(ws, 'Too many wrong tries. Wait 15 minutes.');
    const t = setTimeout(() => ws.close(), 10000);
    ws.once('message', (m) => {
      clearTimeout(t);
      let tried = ''; try { tried = JSON.parse(m).password; } catch { /* not ours */ }
      if (!password || (typeof tried === 'string' && timingSafeEqual(sha(tried), sha(password)))) { say(ws, 'token', { token: password ? makeToken(password) : '' }); ws.close(); return; }
      fails.set(ip, [...(fails.get(ip) || []), Date.now()]);
      setTimeout(() => bye(ws, 'Wrong password.'), 800); // slow down guessing
    });
  }
  // The shared world: whoever is hosting it right now. Only one session runs it at a time.
  const worldRoom = () => { for (const [c, r] of rooms) if (r.world && r.host.readyState === OPEN) return c; return null; };
  function saveWorld(ws) {
    const t = setTimeout(() => ws.close(), 15000);
    ws.once('message', async (m) => {
      clearTimeout(t);
      let o = null; try { o = JSON.parse(m); } catch { /* not ours */ }
      if (!o || typeof o.data !== 'string') return bye(ws, 'Not a save.');
      try { const why = await world.save(o.data, !!o.force); if (why) return bye(ws, why); say(ws, 'saved'); ws.close(); }
      catch (e) { bye(ws, 'The world could not be saved: ' + e.message); }
    });
  }
  // A host that lost its connection asks for its old code back, so its partner can rejoin.
  function host(ws, want, isWorld) {
    if (rooms.size >= MAX_ROOMS) return bye(ws, 'The server is full. Try again soon.');
    const busy = isWorld && worldRoom();
    if (busy && busy !== want) { say(ws, 'error', { why: 'Your partner is already playing the world.', code: busy }); ws.close(); return; }
    const code = /^[A-Z]{4}$/.test(want) && !rooms.has(want) ? want : newCode(), room = { host: ws, guest: null, world: isWorld };
    rooms.set(code, room); say(ws, 'room', { code });
    ws.on('message', (m, isBinary) => { if (room.guest && room.guest.readyState === OPEN) room.guest.send(m, { binary: isBinary }); });
    ws.on('close', () => { if (rooms.get(code) === room) rooms.delete(code); say(room.guest, 'host-left'); if (room.guest) room.guest.close(); });
  }
  function join(ws, code, who) {
    const room = rooms.get(code);
    if (!room) return bye(ws, 'No game with that code.');
    if (room.guest) return bye(ws, 'That game already has two players.');
    room.guest = ws; say(room.host, 'peer-joined', { who }); say(ws, 'joined');
    ws.on('message', (m, isBinary) => { if (room.host.readyState === OPEN) room.host.send(m, { binary: isBinary }); });
    ws.on('close', () => { if (room.guest === ws) { room.guest = null; say(room.host, 'peer-left'); } });
  }
  // drop connections that vanish without saying goodbye
  function keepAlive(ws) {
    ws.alive = true; ws.on('pong', () => { ws.alive = true; });
    ws.on('error', () => ws.terminate());
    const t = setInterval(() => { if (!ws.alive) { ws.terminate(); return; } ws.alive = false; ws.ping(); }, 30000);
    ws.on('close', () => clearInterval(t));
  }
  return { rooms, close: () => { for (const c of wss.clients) c.terminate(); wss.close(); } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const password = process.env.RELAY_PASSWORD;
  if (!password) { console.error('Set RELAY_PASSWORD: the relay refuses to run open on the internet.'); process.exit(1); }
  const port = +process.env.PORT || 8787;
  // Any plain request (the game's wake-up ping, Render's health check) just gets a 204.
  const http = createServer((_, res) => { res.writeHead(204, { 'access-control-allow-origin': '*' }); res.end(); });
  attachRelay(http, { password });
  http.listen(port, () => console.log(`Co-op relay on ws://localhost:${port}/coop`));
}
