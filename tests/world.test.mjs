// The shared world on the relay: load, save, the out-of-date guard, one host at a time, names passed to the host.
// Run: node tests/world.test.mjs
import assert from 'node:assert';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import WebSocket from 'ws';
import { attachRelay } from '../server/relay.mjs';
import { makeWorldStore } from '../server/worldstore.mjs';

const file = path.join(os.tmpdir(), `lh-world-test-${process.pid}.json`);
const http = createServer(); const relay = attachRelay(http, { password: '', world: makeWorldStore(fileBackend(file)) });
await new Promise((r) => http.listen(0, r));
const url = (q) => `ws://localhost:${http.address().port}/coop?${q}`;
function fileBackend(f) { return { get: async () => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } }, put: async (t) => fs.writeFileSync(f, t) }; }
const open = (q) => new Promise((res) => { const ws = new WebSocket(url(q)); const inbox = []; ws.on('message', (m) => inbox.push(JSON.parse(m))); ws.on('open', () => res({ ws, inbox })); });
const next = async (c) => { for (let k = 0; k < 100 && !c.inbox.length; k++) await new Promise((r) => setTimeout(r, 10)); return c.inbox.shift(); };
const ask = async (q, send) => { const c = await open(q); if (send) c.ws.send(JSON.stringify(send)); return next(c); };
const save = (d, force) => ask('role=save', { data: JSON.stringify(d), force });

assert.deepEqual((await ask('role=load')).data, null, 'nothing saved yet');
assert.equal((await ask('role=find')).code, null, 'nobody hosting');

// Jordi starts a new world and plays
assert.equal((await save({ rev: 1, base: 0, session: 'A' }, true)).relay, 'saved');
assert.equal((await save({ rev: 2, base: 0, session: 'A' })).relay, 'saved', 'the same session keeps saving');
// his brother picks it up later from the server copy
assert.equal(JSON.parse((await ask('role=load')).data).rev, 2);
assert.equal((await save({ rev: 3, base: 2, session: 'B' })).relay, 'saved', 'a session from the newest copy is accepted');
// an old copy left in Jordi's browser must not overwrite that
const stale = await save({ rev: 9, base: 1, session: 'C' });
assert.equal(stale.relay, 'error'); assert.equal(stale.why, 'stale');
assert.equal(JSON.parse((await ask('role=load')).data).session, 'B');

// one host for the shared world; the other player is pointed at it, and the host learns their name
const h = await open('role=host&world=1'); const room = await next(h);
assert.equal(room.relay, 'room');
assert.equal((await ask('role=find')).code, room.code, 'Play finds the host');
const h2 = await ask('role=host&world=1'); assert.equal(h2.relay, 'error'); assert.equal(h2.code, room.code, 'a second host is sent to the first');
const g = await open(`room=${room.code}&who=brother`); await next(g);
assert.deepEqual(await next(h), { relay: 'peer-joined', who: 'brother' });
h.ws.close(); g.ws.close(); await new Promise((r) => setTimeout(r, 50));
assert.equal((await ask('role=find')).code, null, 'host gone: the world is free to pick up');

relay.close(); http.close(); fs.rmSync(file, { force: true });
console.log('world test ok');
