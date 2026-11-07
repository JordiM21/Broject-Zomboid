// Co-op connections. CoopHost runs on the machine with the simulation, CoopGuest on the partner's.
import { createState, command, predictMove, spawnZombie, addPlayer, joinPlayer, parkPlayer } from '../sim/sim.js';
import { PeerHost, PeerGuest } from './peer.js';
import { FRAME_HZ, WORLD_HZ, newTracker, packFrame, packWorld, applyFrame, applyWorld, smooth, compactInput, nextInput, newInputQueue } from './sync.js';

export const GUEST_ID = 'p2';
const BACKLOG_LIMIT = 256 * 1024; // skip a frame rather than queue up stale ones on a slow connection

// Development and self-hosted builds use the relay; the plain live build connects browsers directly.
const useRelay = import.meta.env.DEV || !!import.meta.env.VITE_RELAY;
function relayURL(query) {
  const base = import.meta.env.VITE_RELAY || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/coop`;
  return `${base}?${query}`;
}

export class CoopHost {
  // hooks: state(), drain(), onCode(code), onPartner(joined), onError(text)
  constructor(hooks) {
    this.h = hooks; this.connected = false; this.events = []; this.frameT = 0; this.worldT = 0; this.q = newInputQueue();
    this.ws = useRelay ? new WebSocket(relayURL('role=host')) : new PeerHost();
    this.ws.onmessage = (e) => this.onMessage(JSON.parse(e.data));
    this.ws.onerror = () => hooks.onError("Couldn't reach the co-op server.");
    this.ws.onclose = () => { if (this.connected) this.partnerLeft(); hooks.onError('Lost connection to the co-op server. Your world is safe.'); };
  }
  send(o) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  onMessage(m) {
    if (m.relay === 'room') { this.code = m.code; this.h.onCode(m.code); return; }
    if (m.relay === 'error') { this.h.onError(m.why); return; }
    if (m.relay === 'peer-joined') { this.partnerJoined(); return; }
    if (m.relay === 'peer-left') { this.partnerLeft(); return; }
    if (m.k === 'i') { for (const i of m.l) this.q.list.push(i); return; }
    if (m.k === 'c') this.partnerCommand(m.c);
  }
  partnerJoined() {
    const s = this.h.state(); joinPlayer(s, GUEST_ID);
    this.t = newTracker(); this.q = newInputQueue(); this.events = [];
    this.send({ k: 'h', seed: s.seed, testGear: s.testGear, time: s.time, weather: s.weather });
    this.sendWorld(); this.sendFrame();
    this.connected = true; this.h.onPartner(true);
  }
  partnerLeft() {
    this.connected = false; const s = this.h.state(); if (s) parkPlayer(s, GUEST_ID);
    this.h.onPartner(false);
  }
  partnerCommand(c) {
    const s = this.h.state(), p = s.players[GUEST_ID]; if (!p) return;
    // both players can reach for the same item: only take it if it's still the one the partner saw
    const stale = c.expect && c.t === 'take' && (!s.world.containers[c.cid] || !s.world.containers[c.cid].items || (s.world.containers[c.cid].items[c.idx] || {}).id !== c.expect);
    if (!stale) command(s, GUEST_ID, c);
    this.h.drain();
    // always answer, so a wrong guess on the partner's side gets corrected
    delete this.t.pl[GUEST_ID];
    if (c.cid !== undefined) this.t.cont[c.cid] = 'resend';
    if (p.openCid >= 0) this.t.cont[p.openCid] = 'resend';
    this.sendWorld();
  }
  sendWorld() { const o = packWorld(this.h.state(), this.t); if (o) this.send(o); }
  sendFrame() {
    const f = packFrame(this.h.state(), this.t, GUEST_ID, this.q.ack, this.events);
    this.events = []; this.send(f);
  }
  // called once per simulation tick
  inputForTick() { return nextInput(this.q, performance.now()); }
  captureEvents(list) {
    if (!this.connected) return;
    this.events.push(...list);
    if (this.events.length > 2000) this.events.splice(0, this.events.length - 2000); // a stalled connection shouldn't grow forever
    if (list.some((e) => e.type === 'open')) this.worldT = 0; // send a container's contents before the message that opens it
  }
  tick(dt) {
    if (!this.connected) return;
    this.frameT -= dt; this.worldT -= dt;
    if (this.ws.bufferedAmount > BACKLOG_LIMIT) return;
    if (this.worldT <= 0) { this.worldT = 1 / WORLD_HZ; this.sendWorld(); }
    if (this.frameT <= 0) { this.frameT = 1 / FRAME_HZ; this.sendFrame(); }
  }
  close() { this.connected = false; this.ws.onclose = null; this.ws.close(); }
}

export class CoopGuest {
  // hooks: onReady(state), onEnded(text), onChanged()
  constructor(code, hooks) {
    this.h = hooks; this.seq = 0; this.history = []; this.outbox = []; this.inbox = []; this.ended = false;
    this.ws = useRelay ? new WebSocket(relayURL(`room=${encodeURIComponent(code)}`)) : new PeerGuest(code);
    this.ws.onmessage = (e) => this.onMessage(JSON.parse(e.data));
    this.ws.onerror = () => this.end("Couldn't reach the co-op server.");
    this.ws.onclose = () => this.end('The connection to the game was lost.');
  }
  end(text) { if (this.ended) return; this.ended = true; this.h.onEnded(text); }
  onMessage(m) {
    if (m.relay === 'error') { this.end(m.why); return; }
    if (m.relay === 'host-left') { this.end('The host left the game.'); return; }
    if (m.relay) return;
    if (m.k === 'h') { this.s = createState(m.seed, false, { testGear: m.testGear }); this.s.time = m.time; this.s.weather = m.weather; addPlayer(this.s, GUEST_ID); this.ready = false; return; }
    this.inbox.push(m);
  }
  // apply everything that arrived, once per rendered frame
  receive() {
    let changed = false;
    for (const m of this.inbox) {
      if (m.k === 'w') { applyWorld(this.s, m); changed = changed || !!m.c; }
      else if (m.k === 'f') {
        changed = applyFrame(this.s, m, GUEST_ID, spawnZombie, addPlayer) || changed;
        this.reconcile(m.a);
        if (!this.ready) { this.ready = true; this.h.onReady(this.s); }
      }
    }
    this.inbox.length = 0;
    if (changed) this.h.onChanged();
  }
  // put our character where the host says, then replay the inputs it hasn't seen yet
  reconcile(ack) {
    const p = this.s.players[GUEST_ID]; if (p.hostX === undefined) return;
    while (this.history.length && this.history[0].seq <= ack) this.history.shift();
    if (!this.ready) { p.x = p.hostX; p.y = p.hostY; return; }
    const seenX = p.x, seenY = p.y; p.x = p.hostX; p.y = p.hostY; p.roll = p.hostRoll ? { ...p.hostRoll } : null;
    for (const h of this.history) predictMove(this.s, p, h.inp, h.dt);
    const miss = Math.hypot(p.x - seenX, p.y - seenY);
    if (miss < 48) { p.x = seenX + (p.x - seenX) * 0.25; p.y = seenY + (p.y - seenY) * 0.25; } // small slip: ease it out
  }
  // called once per simulation tick
  input(inp, dt) {
    inp.seq = ++this.seq;
    this.history.push({ seq: inp.seq, inp, dt }); if (this.history.length > 120) this.history.shift();
    this.outbox.push(compactInput(inp));
    const p = this.s.players[GUEST_ID];
    if (!p.dead) predictMove(this.s, p, inp, dt);
    if (this.outbox.length >= 2) this.flush();
  }
  flush() { if (this.ws.readyState === 1 && this.outbox.length) { this.ws.send(JSON.stringify({ k: 'i', l: this.outbox })); this.outbox = []; } }
  // Apply a menu action straight away for instant feedback, and ask the host to do it for real.
  command(c) {
    const s = this.s, cont = c.cid !== undefined ? s.world.containers[c.cid] : null;
    const expect = c.t === 'take' && cont && cont.items && cont.items[c.idx] ? cont.items[c.idx].id : undefined;
    if (this.ws.readyState === 1) this.ws.send(JSON.stringify({ k: 'c', c: { ...c, expect } }));
    const pending = s.events.length;
    command(s, GUEST_ID, c);
    s.events.length = pending; // sounds and messages come back from the host, once
  }
  afterFrame(dt) { smooth(this.s, dt, GUEST_ID); this.s.time += dt; }
  close() { this.ended = true; this.ws.onclose = null; this.ws.close(); }
}
