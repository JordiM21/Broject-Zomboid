// Co-op relay: pairs a host and a partner by room code and passes their messages along. It knows nothing about the game.
// In development it runs inside the Vite server at /coop. For play over the internet, host it anywhere: PORT=8787 node server/relay.mjs
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O: they read like 1 and 0
const MAX_ROOMS = 500;
const MAX_MESSAGE = 4 * 1024 * 1024;
const OPEN = 1;

export function attachRelay(httpServer, path = '/coop') {
  const rooms = new Map(); // code -> { host, guest }
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE });
  const say = (ws, relay, extra) => { if (ws && ws.readyState === OPEN) ws.send(JSON.stringify({ relay, ...extra })); };
  const newCode = () => { for (;;) { let c = ''; for (let k = 0; k < 4; k++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]; if (!rooms.has(c)) return c; } };

  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://relay');
    if (url.pathname !== path) return; // not ours: Vite's own live-reload socket shares this server
    wss.handleUpgrade(req, socket, head, (ws) => {
      const code = (url.searchParams.get('room') || '').toUpperCase();
      if (url.searchParams.get('role') === 'host') host(ws);
      else join(ws, code);
    });
  });

  function host(ws) {
    if (rooms.size >= MAX_ROOMS) { say(ws, 'error', { why: 'The server is full. Try again soon.' }); ws.close(); return; }
    const code = newCode(), room = { host: ws, guest: null };
    rooms.set(code, room); say(ws, 'room', { code });
    ws.on('message', (m, isBinary) => { if (room.guest && room.guest.readyState === OPEN) room.guest.send(m, { binary: isBinary }); });
    ws.on('close', () => { rooms.delete(code); say(room.guest, 'host-left'); if (room.guest) room.guest.close(); });
    keepAlive(ws);
  }
  function join(ws, code) {
    const room = rooms.get(code);
    if (!room) { say(ws, 'error', { why: 'No game with that code.' }); ws.close(); return; }
    if (room.guest) { say(ws, 'error', { why: 'That game already has two players.' }); ws.close(); return; }
    room.guest = ws; say(room.host, 'peer-joined'); say(ws, 'joined');
    ws.on('message', (m, isBinary) => { if (room.host.readyState === OPEN) room.host.send(m, { binary: isBinary }); });
    ws.on('close', () => { if (room.guest === ws) { room.guest = null; say(room.host, 'peer-left'); } });
    keepAlive(ws);
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
  const port = +process.env.PORT || 8787;
  const http = createServer((_, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('Last Haul co-op relay'); });
  attachRelay(http, '/coop');
  http.listen(port, () => console.log(`Co-op relay on ws://localhost:${port}/coop`));
}
