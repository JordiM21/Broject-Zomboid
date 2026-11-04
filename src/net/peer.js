// Direct browser-to-browser co-op for the live site, which has no server of its own to relay through.
// PeerJS's free service only introduces the two browsers; game data then flows straight between them.
// Both classes look like the relay's WebSocket, so coop.js doesn't care which one it has.
import { Peer } from 'peerjs';

const PREFIX = 'lasthaul-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const CONNECT_TIMEOUT = 15000;

class Link {
  constructor() { this.readyState = 0; this.conn = null; this.peer = null; }
  say(o) { if (this.onmessage) this.onmessage({ data: JSON.stringify(o) }); }
  send(text) { if (this.conn && this.conn.open) this.conn.send(text); }
  get bufferedAmount() { const c = this.conn; return c && c.dataChannel ? c.dataChannel.bufferedAmount + (c.bufferSize || 0) : 0; }
  close() { this.readyState = 3; clearTimeout(this.timer); if (this.peer) this.peer.destroy(); }
}

export class PeerHost extends Link {
  constructor() { super(); this.listen(); }
  listen() {
    let code = ''; for (let k = 0; k < 4; k++) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    const peer = this.peer = new Peer(PREFIX + code);
    peer.on('open', () => { this.readyState = 1; this.say({ relay: 'room', code }); });
    peer.on('connection', (c) => this.incoming(c));
    peer.on('disconnected', () => { if (this.readyState === 1) peer.reconnect(); }); // only affects new joiners: a connected partner is unaffected
    peer.on('error', (e) => {
      if (e.type === 'unavailable-id') { peer.destroy(); this.listen(); return; } // code taken: pick another
      if (this.readyState === 0 && this.onerror) this.onerror(e); // never got a code
    });
  }
  incoming(c) {
    if (this.conn) { c.on('open', () => { c.send(JSON.stringify({ relay: 'error', why: 'That game already has two players.' })); setTimeout(() => c.close(), 300); }); return; }
    this.conn = c;
    const gone = () => { if (this.conn === c) { this.conn = null; this.say({ relay: 'peer-left' }); } };
    c.on('open', () => this.say({ relay: 'peer-joined' }));
    c.on('data', (data) => { if (this.onmessage) this.onmessage({ data }); });
    c.on('close', gone); c.on('error', gone);
  }
}

export class PeerGuest extends Link {
  constructor(code) {
    super();
    const peer = this.peer = new Peer();
    const fail = (why) => this.say({ relay: 'error', why });
    this.timer = setTimeout(() => fail("Couldn't connect to that game. A strict network or firewall may be blocking it."), CONNECT_TIMEOUT);
    peer.on('open', () => {
      const c = this.conn = peer.connect(PREFIX + code, { reliable: true });
      c.on('open', () => { clearTimeout(this.timer); this.readyState = 1; });
      c.on('data', (data) => { if (this.onmessage) this.onmessage({ data }); });
      c.on('close', () => { if (this.readyState !== 3) this.say({ relay: 'host-left' }); });
    });
    peer.on('error', (e) => { if (this.readyState === 1) return; clearTimeout(this.timer); fail(e.type === 'peer-unavailable' ? 'No game with that code.' : "Couldn't reach the co-op service."); });
  }
}
