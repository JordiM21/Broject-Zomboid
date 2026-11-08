// Co-op connections. CoopHost runs on the machine with the simulation, CoopGuest on the partner's.
import { createState, command, predictMove, spawnZombie, addPlayer, joinPlayer, parkPlayer } from '../sim/sim.js';
import { connect } from './relay.js';
import { FRAME_HZ, WORLD_HZ, newTracker, packFrame, packWorld, applyFrame, applyWorld, smooth, compactInput, nextInput, newInputQueue } from './sync.js';

export const GUEST_ID = 'p2';
const BACKLOG_LIMIT = 256 * 1024; // skip a frame rather than queue up stale ones on a slow connection
const REJOIN_MS = 60000; // how long a dropped partner keeps trying to get back in

export class CoopHost {
  // hooks: state(), drain(), onCode(code), onPartner(joined), onWait(waking), onError(text), onAuth()
  // A dropped connection reconnects by itself and keeps the same code, so the partner can find the way back.
  constructor(hooks) {
    this.h = hooks; this.connected = false; this.events = []; this.frameT = 0; this.worldT = 0; this.q = newInputQueue();
    this.open();
  }
  open() {
    connect(`role=host${this.code ? `&code=${this.code}` : ''}`, (w) => this.h.onWait(w)).then((ws) => {
      if (this.closed) { ws.close(); return; }
      this.ws = ws;
      ws.onmessage = (e) => this.onMessage(JSON.parse(e.data));
      ws.onclose = () => { if (this.closed) return; if (this.connected) this.partnerLeft(); this.h.onWait(true); this.open(); };
    }, (e) => { if (!this.closed) { this.closed = true; this.h.onError(e.message); } });
  }
  send(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  onMessage(m) {
    if (m.relay === 'room') { this.code = m.code; this.h.onCode(m.code); return; }
    if (m.relay === 'auth') { this.close(); this.h.onAuth(); return; }
    if (m.relay === 'error') { this.close(); this.h.onError(m.why); return; }
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
  close() {
    if (this.connected) this.send({ k: 'bye' }); // tells the partner not to wait for us
    this.closed = true; this.connected = false;
    if (this.ws) { this.ws.onclose = null; this.ws.close(); }
  }
}

export class CoopGuest {
  // hooks: onReady(state), onEnded(text), onChanged(), onWait(waking), onAuth()
  constructor(code, hooks) {
    this.h = hooks; this.code = code; this.seq = 0; this.history = []; this.outbox = []; this.inbox = []; this.ended = false;
    this.open();
  }
  open() {
    connect(`room=${encodeURIComponent(this.code)}`, (w) => this.h.onWait(w)).then((ws) => {
      if (this.ended) { ws.close(); return; }
      this.ws = ws;
      ws.onmessage = (e) => this.onMessage(JSON.parse(e.data));
      ws.onclose = () => this.lost();
    }, (e) => this.end(e.message));
  }
  // The connection dropped, or the host's did: keep knocking for a minute before giving up.
  lost() {
    if (this.ended) return;
    if (!this.ready && !this.retryUntil) { this.end('The connection to the game was lost.'); return; }
    this.retryUntil = this.retryUntil || Date.now() + REJOIN_MS;
    if (Date.now() > this.retryUntil) { this.end('The connection to the game was lost.'); return; }
    this.ws = null; this.h.onWait(true); setTimeout(() => { if (!this.ended) this.open(); }, 2000);
  }
  end(text) { if (this.ended) return; this.ended = true; if (this.ws) { this.ws.onclose = null; this.ws.close(); } this.h.onEnded(text); }
  onMessage(m) {
    if (m.relay === 'auth') { this.end('Please log in again.'); this.h.onAuth(); return; }
    if (m.relay === 'error') { if (this.retryUntil && Date.now() < this.retryUntil) return; this.end(m.why); return; } // while rejoining, the host may not be back yet
    if (m.relay === 'host-left') return; // the close that follows decides: rejoin, unless the host said goodbye
    if (m.relay === 'joined') { if (this.retryUntil) { this.retryUntil = 0; this.h.onWait(false); } return; }
    if (m.relay) return;
    if (m.k === 'bye') { this.end('The host left the game.'); return; }
    if (m.k === 'h') { this.s = createState(m.seed, false, { testGear: m.testGear }); this.s.time = m.time; this.s.weather = m.weather; addPlayer(this.s, GUEST_ID); this.ready = false; this.inbox = []; this.history = []; return; }
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
  flush() { if (this.ws && this.ws.readyState === 1 && this.outbox.length) { this.ws.send(JSON.stringify({ k: 'i', l: this.outbox })); this.outbox = []; } }
  // Apply a menu action straight away for instant feedback, and ask the host to do it for real.
  command(c) {
    const s = this.s, cont = c.cid !== undefined ? s.world.containers[c.cid] : null;
    const expect = c.t === 'take' && cont && cont.items && cont.items[c.idx] ? cont.items[c.idx].id : undefined;
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ k: 'c', c: { ...c, expect } }));
    const pending = s.events.length;
    command(s, GUEST_ID, c);
    s.events.length = pending; // sounds and messages come back from the host, once
  }
  afterFrame(dt) { smooth(this.s, dt, GUEST_ID); this.s.time += dt; }
  close() { this.ended = true; if (this.ws) { this.ws.onclose = null; this.ws.close(); } }
}
