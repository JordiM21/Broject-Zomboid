// Talking to the co-op relay (server/relay.mjs): the password, the saved login, and waking a sleeping server.
// The live relay sleeps when nobody uses it, so every connection retries quietly for a while before giving up.
const LIVE = 'wss://broject-zomboid.onrender.com/coop';
const BASE = import.meta.env.VITE_RELAY || (import.meta.env.DEV ? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/coop` : LIVE);
const KEY = 'lasthaul-token';
const WAKE_MS = 90000;

const load = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
const store = (t) => { try { if (t) localStorage.setItem(KEY, t); else localStorage.removeItem(KEY); } catch { /* private window: ask again next time */ } };

// Open a socket, retrying while the server wakes up. onWait(true) fires once it's clearly taking a while.
export function connect(query, onWait = () => {}) {
  const until = Date.now() + WAKE_MS;
  const sep = query ? '&' : '';
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const ws = new WebSocket(`${BASE}?${query}${sep}token=${encodeURIComponent(load())}`);
      ws.onopen = () => { ws.onopen = ws.onerror = ws.onclose = null; onWait(false); resolve(ws); };
      ws.onerror = () => {};
      ws.onclose = () => {
        if (Date.now() > until) { reject(new Error("Can't reach the game server. Check your internet and try again.")); return; }
        onWait(true); setTimeout(attempt, 2000);
      };
    };
    attempt();
  });
}

// The first message on a short-lived socket.
function ask(query, send, onWait) {
  return connect(query, onWait).then((ws) => new Promise((resolve) => {
    if (send) ws.send(JSON.stringify(send));
    ws.onmessage = (e) => { resolve(JSON.parse(e.data)); ws.close(); };
    ws.onclose = () => resolve({ relay: 'error', why: 'The server closed the connection. Try again.' });
  }));
}

// true if this browser is already let in (or the server has no password)
export const check = (onWait) => ask('role=check', null, onWait).then((m) => m.relay === 'ok');

export async function login(password, onWait) {
  const m = await ask('role=login', { password }, onWait);
  if (m.relay !== 'token') throw new Error(m.why || 'Wrong password.');
  store(m.token);
}

export const forget = () => store('');

// Plain requests count as activity, so the server doesn't doze off under someone who's about to invite a partner.
const http = BASE.replace(/^ws/, 'http').replace(/\/coop$/, '/');
export function keepWarm() {
  const ping = () => { if (!document.hidden) fetch(http, { mode: 'no-cors' }).catch(() => {}); };
  setInterval(ping, 10 * 60 * 1000);
  document.addEventListener('visibilitychange', ping);
}

// ---------- the shared world ----------
// One world for both players, kept on the server. Whoever plays first hosts it; the other joins.
const expect = (m, kind) => { if (m.relay === 'auth') throw new Error('Please log in again.'); if (m.relay !== kind) throw Object.assign(new Error(m.why || 'The server said no.'), { code: m.code }); return m; };
export const findWorld = (onWait) => ask('role=find', null, onWait).then((m) => expect(m, 'world-host').code || null);
export const loadWorld = (onWait) => ask('role=load', null, onWait).then((m) => { const t = expect(m, 'world').data; return t ? JSON.parse(t) : null; });
export const saveWorld = (data, force = false) => ask('role=save', { data: JSON.stringify(data), force }).then((m) => expect(m, 'saved'));
