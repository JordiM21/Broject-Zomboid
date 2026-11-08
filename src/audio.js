// Procedural spatial audio: stereo panning, distance falloff, wall occlusion,
// indoor/outdoor reverb, surface-aware footsteps. No asset files.
import { ITEMS } from './data/items.js';
const SURF = { 0: 'grass', 15: 'bush', 1: 'hard', 2: 'hard', 13: 'hard', 9: 'gravel', 16: 'gravel', 10: 'dirt', 3: 'wood', 5: 'wood', 11: 'tile', 12: 'carpet' };
const BLADE = new Set(['knife', 'machete', 'axe']);
// Sounds with no place in the world: fine for your own actions, wrong at full volume for a partner across town.
const OWN_ONLY = new Set(['revive', 'buff', 'equip', 'click', 'empty', 'eat', 'drink', 'medStart', 'healed', 'crafted', 'throw']);
// Suppressed shots. The ammo sets the character of the shot: thump [from Hz, to Hz, secs, wave, gain], gas puff
// [secs, Hz, filter, gain], supersonic crack [secs, Hz, gain] that a silencer can't remove, and a low tail.
const SUPPRESSED = {
  ammo9: { reach: 450, wet: 0.08, thump: [240, 110, 0.05, 'triangle', 0.2], puff: [0.07, 1300, 'lowpass', 0.5] }, // subsonic: a soft "pft"
  ammomed: { reach: 600, wet: 0.12, thump: [170, 70, 0.09, 'triangle', 0.3], puff: [0.11, 1800, 'bandpass', 0.45], crack: [0.018, 5200, 0.22] }, // a sharp "tsst"
  ammo308: { reach: 850, wet: 0.2, thump: [110, 38, 0.2, 'sine', 0.6], puff: [0.22, 900, 'lowpass', 0.75], crack: [0.03, 4200, 0.4], tail: [0.45, 380, 0.16] }, // a heavy "thoomp" with a crack
  shells: { reach: 700, wet: 0.18, thump: [95, 42, 0.16, 'sine', 0.55], puff: [0.2, 650, 'lowpass', 0.9], tail: [0.3, 260, 0.2] }, // a wide, dull "fwump"
};
// The gun on top of that: pitch and length of the shot, plus its metal action (at: seconds after firing).
const SILENCED_ACTION = {
  pistol: { pitch: 1, len: 1, metal: 1900, gain: 0.05, at: [0.025] }, // slide
  smg: { pitch: 1.3, len: 0.7, metal: 2700, gain: 0.025, at: [0.012] }, // light, fast bolt
  carbine: { pitch: 1, len: 1, metal: 1300, gain: 0.06, at: [0.04] }, // gas-driven bolt
  rifle: { pitch: 1, len: 1, metal: 700, gain: 0.09, at: [0.55, 0.72] }, // bolt worked by hand
  shotgun: { pitch: 1, len: 1, metal: 520, gain: 0.12, at: [0.5, 0.64] }, // pump back and forward
};
// Per-gun voice: crack = brightness of the snap, body = thump pitch (Hz), len/tail = blast and echo length, sub = chest boom.
const GUNS = {
  pistol: { crack: 5200, body: 150, len: 0.8, tail: 0.4, gain: 0.9 },
  smg: { crack: 6400, body: 200, len: 0.55, tail: 0.28, gain: 0.7 },
  carbine: { crack: 4800, body: 125, len: 0.95, tail: 0.5, gain: 0.95, sub: 0.15 },
  shotgun: { crack: 3200, body: 85, len: 1.3, tail: 0.75, gain: 1.1, sub: 0.35, act: [0.5, 0.64], metal: 520, am: 0.1 },
  rifle: { crack: 4000, body: 70, len: 1.5, tail: 1.1, gain: 1.15, sub: 0.45, act: [0.55, 0.72], metal: 700, am: 0.08 },
};
const METAL = new Set(['gun', 'melee', 'ammo', 'throw']);
// Real recordings (src/assets/sfx, inlined by Vite). gain evens out loudness; off/dur trim the silence around the sound.
const SFX_URLS = import.meta.glob('./assets/sfx/*.mp3', { query: '?url', import: 'default', eager: true });
const SAMPLE = {
  zgroan: { gain: 0.55 }, zgrowl: { gain: 0.5 }, zfemale: { gain: 5 }, zalert: { gain: 2.5, dur: 2 },
  door: { gain: 1.5, off: 0.3, dur: 1.2 }, glass: { gain: 1.5, off: 0.35, dur: 1.7 }, reload: { gain: 1.2 },
  wolf: { gain: 0.3 }, siren: { gain: 1.4 }, heli: { gain: 0.4 }, wind: { gain: 1 },
  zdeath1: { gain: 1.4 }, zdeath2: { gain: 1.3 }, eat: { gain: 3 }, drink: { gain: 1.1 }, bandage: { gain: 1.8 },
  down: { gain: 1.2 }, gameover: { gain: 0.9 }, zextract: { gain: 1.6 }, zrounds: { gain: 1.1 },
};
// Walkers, runners and the odd female voice use different recordings; brutes get the growl pitched down.
const zvoice = (e) => e.ztype === 'brute' || e.ztype === 'runner' ? 'zgrowl' : (e.zid || 0) % 3 === 0 ? 'zfemale' : 'zgroan';

function impulse(c, secs, decay, pre = 0) {
  const len = Math.floor(c.sampleRate * secs), buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch), p0 = Math.floor(pre * c.sampleRate);
    for (let i = p0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - (i - p0) / (len - p0), decay);
  }
  return buf;
}

export class Sfx {
  constructor() { this.ctx = null; this.lx = 0; this.ly = 0; this.volume = 0.6; this.indoor = false; this.occl = () => false; this.hbT = 0; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = (this.ctx = new AC());
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(c.destination);
    this.master = c.createGain(); this.master.gain.value = this.volume; this.master.connect(comp);
    // reverbs: small room for indoors, long tail with pre-delay for outdoor echo
    this.room = c.createConvolver(); this.room.buffer = impulse(c, 0.6, 3);
    this.outv = c.createConvolver(); this.outv.buffer = impulse(c, 2.4, 4, 0.09);
    this.roomG = c.createGain(); this.outG = c.createGain();
    this.room.connect(this.roomG); this.outv.connect(this.outG); this.roomG.connect(this.master); this.outG.connect(this.master);
    this.roomG.gain.value = 0; this.outG.gain.value = 1;
    const len = c.sampleRate * 2, nb = c.createBuffer(1, len, c.sampleRate), d = nb.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.nbuf = nb;
    const loop = (freq, type, gain) => { const s = c.createBufferSource(); s.buffer = nb; s.loop = true; const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; const g = c.createGain(); g.gain.value = gain; s.connect(f); f.connect(g); g.connect(this.master); s.start(0, Math.random()); return { f, g }; };
    this.wind = loop(350, 'lowpass', 0.03);
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07; const lg = c.createGain(); lg.gain.value = 140; lfo.connect(lg); lg.connect(this.wind.f.frequency); lfo.start();
    this.rain = loop(1300, 'highpass', 0);
    this.buf = {}; this.live = 0;
    for (const [path, url] of Object.entries(SFX_URLS)) {
      const name = path.split('/').pop().replace('.mp3', '');
      fetch(url).then((r) => r.arrayBuffer()).then((a) => c.decodeAudioData(a)).then((b) => { this.buf[name] = b; if (name === 'wind') this.startWind(b); }).catch(() => {}); // missing sample = procedural fallback
    }
  }
  // the recorded wind runs as a bed under the synthesized one; the loop skips the file's faded ends so it never dips
  startWind(b) {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = b; s.loop = true; s.loopStart = 1; s.loopEnd = b.duration - 0.7;
    this.windS = c.createGain(); this.windS.gain.value = this.indoor ? 0.1 : 0.45; s.connect(this.windS); this.windS.connect(this.master); s.start();
  }
  // play a recording through a spatial bus. Returns false when it isn't loaded so the caller can fall back to synthesis.
  snd(name, out, { rate = 1, gain = 1, off, dur, delay = 0 } = {}) {
    const b = this.buf && this.buf[name]; if (!b) return false;
    if (this.live > 16) return true; // crowd of zombies: drop the extras rather than smear them
    const c = this.ctx, t = c.currentTime + delay, S = SAMPLE[name];
    off = off ?? S.off ?? 0; dur = dur ?? S.dur ?? (b.duration - off) / rate;
    const s = c.createBufferSource(); s.buffer = b; s.playbackRate.value = rate;
    const g = c.createGain(), end = t + Math.min(dur, (b.duration - off) / rate);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain * S.gain, t + 0.02);
    g.gain.setValueAtTime(gain * S.gain, Math.max(t + 0.02, end - 0.12)); g.gain.linearRampToValueAtTime(0.0001, end);
    s.connect(g); g.connect(out); s.start(t, off, dur * rate); this.live++; s.onended = () => { this.live--; };
    return true;
  }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  setRain(r) { if (this.rain) this.rain.g.gain.value = r * (this.indoor ? 0.03 : 0.07); }
  // per-frame listener update
  update(dt, { indoor, hp, dead, day = 1 }) {
    if (!this.ctx) return;
    this.ambient(dt, day, indoor);
    this.indoor = indoor;
    const t = this.ctx.currentTime;
    this.roomG.gain.setTargetAtTime(indoor ? 0.5 : 0.05, t, 0.3);
    this.outG.gain.setTargetAtTime(indoor ? 0.15 : 0.9, t, 0.3);
    this.wind.g.gain.setTargetAtTime(indoor ? 0.008 : 0.03, t, 0.5);
    if (this.windS) this.windS.gain.setTargetAtTime(indoor ? 0.1 : 0.45, t, 0.5);
    if (!dead && hp < 35) {
      this.hbT -= dt;
      if (this.hbT <= 0) { this.hbT = 0.55 + hp / 60; const o = this.bus(); this.tone(60, 40, 0.12, 'sine', 0.5, 0, o); this.tone(55, 38, 0.1, 'sine', 0.35, 0.16, o); }
    }
  }
  // world ambience: birds by day, crickets by night, distant events any time
  ambient(dt, day, indoor) {
    this.amb = this.amb || { bird: 2, cricket: 1, far: 15 };
    const a = this.amb, quiet = indoor ? 0.35 : 1;
    const far = (vol) => this.bus(this.lx + (Math.random() - 0.5) * 1600, this.ly + (Math.random() - 0.5) * 1600, 99999, 0.9);
    a.bird -= dt; a.cricket -= dt; a.far -= dt;
    if (day > 0.5 && a.bird <= 0) {
      a.bird = 3 + Math.random() * 7; const o = far(); o.gain.value = 0.35 * quiet; const f = 2400 + Math.random() * 1600;
      for (let k = 0; k < 2 + (Math.random() * 3 | 0); k++) this.tone(f, f * (1.2 + Math.random() * 0.3), 0.07, 'sine', 0.06, k * 0.11, o);
    }
    if (day < 0.4 && a.cricket <= 0) {
      a.cricket = 0.6 + Math.random() * 1.2; const o = far(); o.gain.value = 0.3 * quiet; const f = 4200 + Math.random() * 600;
      for (let k = 0; k < 3; k++) this.tone(f, f, 0.025, 'sine', 0.035, k * 0.05, o);
    }
    if (a.far <= 0) {
      a.far = 18 + Math.random() * 35; const o = far(); o.gain.value = 0.22 * quiet;
      const r = Math.random();
      if (r < 0.3) { if (!this.buf.wolf) this.voice(o, 260 + Math.random() * 80, 1.1, 0.25, 1200); else if (day < 0.5) { o.gain.value = 1; this.snd('wolf', o, { rate: 0.95 + Math.random() * 0.1, gain: quiet }); } } // wolves only howl at night
      else if (r < 0.55) { for (let k = 0; k < 2 + (Math.random() * 3 | 0); k++) { this.noise(0.2, 900, 'lowpass', 0.6, k * (0.3 + Math.random() * 0.4), o); } }
      else if (r < 0.8) { for (let k = 0; k < 3; k++) this.voice(o, 300, 0.12, 0.2, 900, k * 0.35); }
      else if (r > 0.93 && this.buf.heli) { o.gain.value = 1; this.snd('heli', o, { gain: quiet, rate: 0.9 + Math.random() * 0.2 }); }
      else if (this.buf.siren) { if (this.ctx.currentTime > (this.sirenEnd || 0)) { o.gain.value = 1; this.snd('siren', o, { gain: quiet }); this.sirenEnd = this.ctx.currentTime + 29; } }
      else { const c = this.ctx, t = c.currentTime, osc = c.createOscillator(), g = c.createGain(); osc.type = 'triangle'; osc.frequency.setValueAtTime(650, t); for (let k = 0; k < 6; k++) osc.frequency.linearRampToValueAtTime(k % 2 ? 650 : 900, t + 0.6 * (k + 1)); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + 0.5); g.gain.linearRampToValueAtTime(0.0001, t + 3.6); osc.connect(g); g.connect(o); osc.start(t); osc.stop(t + 3.7); }
    }
  }
  // build a spatial bus for a world position: gain -> occlusion lowpass -> pan -> master (+ reverb send)
  bus(x, y, maxD = 900, wet = 0.25) {
    const c = this.ctx;
    const g = c.createGain(), f = c.createBiquadFilter(), pan = c.createStereoPanner ? c.createStereoPanner() : null;
    let v = 1, occ = false;
    if (x !== undefined) {
      const dx = x - this.lx, dy = y - this.ly, d = Math.hypot(dx, dy);
      v = Math.max(0, 1 - d / maxD); v *= v;
      occ = d > 40 && this.occl(x, y);
      if (pan) pan.pan.value = Math.max(-0.9, Math.min(0.9, dx / 420));
      f.frequency.value = occ ? 650 : 18000 - Math.min(14000, d * 12);
    } else f.frequency.value = 18000;
    g.gain.value = v * (occ ? 0.6 : 1);
    g.connect(f); if (pan) { f.connect(pan); pan.connect(this.master); } else f.connect(this.master);
    const send = c.createGain(); send.gain.value = wet; f.connect(send); send.connect(this.room); send.connect(this.outv);
    g.v = v; return g;
  }
  noise(dur, freq, type, gain, delay = 0, out = this.master, q = 1) {
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.nbuf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
    return f;
  }
  sweep(dur, f0, f1, type, gain, delay, out, q = 4) { const f = this.noise(dur, f0, type, gain, delay, out, q); f.frequency.exponentialRampToValueAtTime(f1, this.ctx.currentTime + delay + dur); }
  tone(f0, f1, dur, type, gain, delay = 0, out = this.master) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
  }
  clank(out, base, gain, delay = 0) { for (const m of [1, 1.47, 2.09, 2.76]) this.tone(base * m, base * m * 0.98, 0.25 / m + 0.05, 'triangle', gain / m, delay, out); }
  voice(out, f, dur, gain, form = 700, delay = 0) { // grunt/groan: buzzy source through a formant
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * 0.75, t + dur);
    const vib = c.createOscillator(); vib.frequency.value = 5 + Math.random() * 5; const vg = c.createGain(); vg.gain.value = f * 0.08; vib.connect(vg); vg.connect(o.frequency);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = form; bp.Q.value = 3;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = form * 1.6;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(bp); bp.connect(lp); lp.connect(g); g.connect(out); o.start(t); vib.start(t); o.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
  }
  footstep(surf, loud, out, g0 = 1) {
    // every step is a heel strike then a softer toe-down, with its own weight and pitch, so a run never sounds like a loop
    const r = Math.random(), g = (loud ? 1.6 : 1) * g0 * (0.8 + r * 0.4), p = 0.85 + Math.random() * 0.3, toe = 0.06 + Math.random() * 0.03;
    switch (SURF[surf] || 'hard') {
      case 'grass': this.noise(0.1, 1400 * p, 'bandpass', 0.05 * g, 0, out, 0.8); this.noise(0.14, 3200 * p, 'highpass', 0.02 * g, 0.03, out); this.tone(80, 55, 0.06, 'sine', 0.03 * g, 0, out); break; // blades swishing over a soft thud
      case 'bush': this.noise(0.22, 2200 * p, 'bandpass', 0.07 * g, 0, out, 0.6); this.noise(0.12, 900 * p, 'bandpass', 0.04 * g, 0.05, out); for (let k = 0; k < 3; k++) this.noise(0.02, 4500, 'bandpass', 0.03 * g, 0.03 + Math.random() * 0.15, out, 3); break; // twigs
      case 'dirt': this.noise(0.07, 700 * p, 'bandpass', 0.07 * g, 0, out, 1.2); this.noise(0.05, 2500 * p, 'highpass', 0.02 * g, 0.01, out); this.noise(0.05, 500 * p, 'bandpass', 0.04 * g, toe, out, 1); this.tone(75, 50, 0.07, 'sine', 0.05 * g, 0, out); break;
      case 'gravel': for (let k = 0, n = 4 + (Math.random() * 4 | 0); k < n; k++) this.noise(0.03 + Math.random() * 0.02, (2400 + Math.random() * 2600) * p, 'bandpass', 0.03 * g, Math.random() * 0.09, out, 2.5); this.tone(85, 60, 0.05, 'sine', 0.035 * g, 0, out); break; // a crunch of grains
      case 'wood': this.tone(130 * p, 85 * p, 0.09, 'sine', 0.1 * g, 0, out); this.noise(0.05, 600 * p, 'bandpass', 0.05 * g, 0, out, 2); this.tone(105 * p, 75 * p, 0.07, 'sine', 0.06 * g, toe, out); if (Math.random() < 0.12) this.sweep(0.25, 380, 620, 'bandpass', 0.035 * g, 0.03, out, 14); break; // hollow boards, now and then a creak
      case 'tile': this.noise(0.03, 3200 * p, 'bandpass', 0.06 * g, 0, out, 3); this.tone(220 * p, 180 * p, 0.04, 'sine', 0.04 * g, 0, out); this.tone(2600 * p, 2500 * p, 0.09, 'sine', 0.012 * g, 0.005, out); this.noise(0.025, 2600 * p, 'bandpass', 0.035 * g, toe, out, 3); break; // hard click with a little ring
      case 'carpet': this.noise(0.06, 500 * p, 'lowpass', 0.035 * g, 0, out); this.tone(70, 50, 0.07, 'sine', 0.035 * g, 0, out); this.noise(0.05, 400 * p, 'lowpass', 0.02 * g, toe, out); break;
      default: this.noise(0.04, 1800 * p, 'bandpass', 0.05 * g, 0, out, 1.5); this.tone(90 * p, 70 * p, 0.05, 'sine', 0.05 * g, 0, out); this.noise(0.03, 1300 * p, 'bandpass', 0.025 * g, toe, out, 1.5);
    }
  }
  rummage(dur, out) { const n = Math.max(2, Math.round(dur / 0.22)); for (let k = 0; k < n; k++) this.noise(0.08 + Math.random() * 0.06, 1200 + Math.random() * 2000, 'bandpass', 0.06, k * (dur / n) + Math.random() * 0.05, out, 1.5); }

  // A real shot is four things stacked: a razor-thin supersonic crack, the muzzle blast (a noise burst whose
  // brightness collapses as the gas expands), the chest-felt body, and the world answering back (tail + echo slaps).
  // Every shot is pitched a hair differently so full-auto never sounds like a looped sample.
  gunBlast(gun, o, me) {
    const G = GUNS[gun] || GUNS.pistol, j = 0.93 + Math.random() * 0.14, n = this.indoor ? 1.25 : 1;
    this.noise(0.012, G.crack * j, 'highpass', 0.85 * G.gain, 0, o); // the crack
    this.noise(0.035, 2600 * j, 'bandpass', 0.55 * G.gain, 0, o, 0.8);
    this.sweep(0.2 * G.len, 5200 * j, 420, 'lowpass', 1.0 * G.gain, 0, o, 0.7); // the blast
    this.tone(G.body * j, G.body * 0.28, 0.14 * G.len, 'sine', 0.55 * G.gain, 0, o); // the body
    this.tone(G.body * 2 * j, G.body * 0.6, 0.05, 'triangle', 0.18, 0, o);
    if (G.sub) this.tone(62, 24, 0.35 * G.len, 'sine', G.sub, 0.01, o);
    this.noise(G.tail * n, 480, 'lowpass', 0.3 * G.gain, 0.03, o); // the room / the valley
    this.noise(0.28, 1000, 'lowpass', 0.11 * G.gain, 0.17 + Math.random() * 0.08, o); // echo off the buildings
    if (!this.indoor) this.noise(0.4, 600, 'lowpass', 0.06 * G.gain, 0.42 + Math.random() * 0.12, o);
    if (me && G.act) for (const d of G.act) this.clank(this.bus(), G.metal, G.am, d); // your own bolt / pump
  }
  silencedShot(gun, o) {
    const r = SUPPRESSED[ITEMS[gun].ammo], a = SILENCED_ACTION[gun], [f0, f1, dur, wave, gain] = r.thump, [pd, pf, pt, pg] = r.puff;
    this.tone(f0 * a.pitch, f1 * a.pitch, dur * a.len, wave, gain, 0, o);
    this.noise(pd * a.len, pf * a.pitch, pt, pg, 0, o);
    if (r.crack) this.noise(r.crack[0], r.crack[1], 'highpass', r.crack[2], 0, o);
    if (r.tail) this.noise(r.tail[0], r.tail[1], 'lowpass', r.tail[2], 0.02, o);
    for (const d of a.at) this.clank(o, a.metal, a.gain, d);
  }

  play(e, localId) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const pos = e.x !== undefined;
    const L = (maxD = 900, wet = 0.25) => this.bus(pos ? e.x : undefined, pos ? e.y : undefined, maxD, wet);
    const me = e.pid === localId;
    if (!me && e.pid && OWN_ONLY.has(e.type)) return;
    let o;
    switch (e.type) {
      case 'gunshot': {
        if (e.gun === 'crossbow') { o = L(500, 0.1); this.tone(180, 90, 0.12, 'triangle', 0.25, 0, o); this.noise(0.06, 2500, 'bandpass', 0.2, 0, o, 3); this.sweep(0.15, 3000, 800, 'bandpass', 0.06, 0.02, o, 4); break; }
        if (e.silenced) { const r = SUPPRESSED[ITEMS[e.gun].ammo]; o = L(r.reach, r.wet); if (!o.v) return; this.silencedShot(e.gun, o); break; }
        o = this.bus(e.x, e.y, 2400, 0.9); if (!o.v) return;
        this.gunBlast(e.gun, o, me);
        if (me) this.tone(2600 + Math.random() * 400, 2300, 0.03, 'triangle', 0.04, 0.12 + Math.random() * 0.05, this.bus(e.x, e.y + 8)); // brass hitting the ground
        break;
      }
      case 'swing': o = L(500, 0.05); this.sweep(0.16, 600, 2400, 'bandpass', 0.12, 0, o, 2); break;
      case 'zhit': {
        if (e.silent) return;
        o = L(900, 0.1); if (!o.v) return;
        if (e.w === 'gun') { this.noise(0.08, 900, 'lowpass', 0.5, 0, o); this.tone(120, 60, 0.07, 'sine', 0.3, 0, o); }
        else if (BLADE.has(e.w)) { this.sweep(0.1, 3500, 1200, 'bandpass', 0.25, 0, o, 3); this.noise(0.09, 500, 'lowpass', 0.4, 0.02, o); }
        else { this.tone(95, 45, 0.12, 'sine', 0.6, 0, o); this.noise(0.06, 1400, 'bandpass', 0.35, 0, o, 1.5); }
        if (e.crit) { this.noise(0.05, 2600, 'bandpass', 0.35, 0.03, o, 4); this.tone(70, 40, 0.15, 'square', 0.12, 0.02, o); }
        break;
      }
      case 'peek': o = L(160, 0); this.noise(0.2, 650, 'bandpass', 0.05, 0, o, 3); break; // only you can hear the hinge
      case 'silentKill': o = L(400, 0.05); this.noise(0.12, 400, 'lowpass', 0.4, 0, o); this.sweep(0.12, 2500, 900, 'bandpass', 0.12, 0.02, o); this.noise(0.4, 900, 'lowpass', 0.06, 0.15, o); break;
      case 'zdie': o = L(900, 0.2); if (!o.v) return; this.noise(0.18, 700, 'lowpass', e.ztype === 'brute' ? 0.9 : 0.5, 0, o); this.noise(0.1, 2200, 'bandpass', 0.25, 0.02, o, 2); if (!this.snd((e.zid || 0) % 2 ? 'zdeath1' : 'zdeath2', o, { rate: (e.ztype === 'brute' ? 0.8 : 0.95) + Math.random() * 0.12 })) this.voice(o, 75, 0.55, 0.16, 450); this.tone(80, 40, 0.15, 'sine', 0.35, 0.3, o); this.noise(0.15, 300, 'lowpass', 0.4, 0.3, o); break;
      case 'groan': o = L(1000, 0.35); if (!o.v) return; if (this.snd(zvoice(e), o, { rate: e.ztype === 'brute' ? 0.7 : 0.9 + Math.random() * 0.25, gain: e.ztype === 'brute' ? 0.9 : 0.6, dur: 2.6 })) break; this.voice(o, (e.ztype === 'brute' ? 55 : e.ztype === 'runner' ? 120 : 80) + Math.random() * 25, 0.7 + Math.random() * 0.6, 0.14, e.ztype === 'runner' ? 900 : 550); break;
      case 'alert': o = L(1200, 0.35); if (!o.v) return; if (this.snd('zalert', o, { rate: 0.95 + Math.random() * 0.15 })) break; this.voice(o, 150 + Math.random() * 40, 0.45, 0.2, 1100); this.sweep(0.35, 900, 2200, 'bandpass', 0.06, 0, o, 5); break;
      case 'zattack': o = L(600, 0.1); if (!o.v) return; if (this.buf.zgrowl) { const t = this.ctx.currentTime; if (t > (this.atkT || 0)) { this.atkT = t + 0.6; this.snd('zgrowl', o, { rate: 1.05 + Math.random() * 0.2, off: 0.6 + Math.random() * 1.5, dur: 0.8, gain: 0.7 }); } break; } this.voice(o, 100, 0.25, 0.14, 800); break;
      case 'zstep': o = L(500, 0.05); if (!o.v) return; this.footstep(e.surf, e.run, o, 0.7); this.noise(0.18, 400, 'lowpass', 0.02, 0.03, o); break;
      case 'bash': o = L(1100, 0.4); this.tone(70, 45, 0.15, 'sine', 0.6, 0, o); this.noise(0.15, 350, 'lowpass', 0.7, 0, o); this.noise(0.05, 1800, 'bandpass', 0.2, 0.02, o, 2); break;
      case 'doorbreak': o = L(1400, 0.5); this.noise(0.5, 900, 'lowpass', 0.9, 0, o); for (let k = 0; k < 4; k++) this.noise(0.05, 2000 + k * 400, 'bandpass', 0.3, 0.05 + k * 0.06, o, 3); break;
      case 'door': o = L(700, 0.2);
        if (e.open ? this.snd('door', o) : this.snd('door', o, { rate: 1.4, dur: 0.45, gain: 0.7 })) { if (!e.open) this.tone(110, 70, 0.1, 'sine', 0.3, 0.05, o); break; }
        if (e.open) { this.sweep(0.35, 500, 900, 'bandpass', 0.05, 0.03, o, 8); this.tone(1800, 1700, 0.02, 'square', 0.04, 0, o); }
        else { this.tone(110, 70, 0.1, 'sine', 0.3, 0.05, o); this.tone(1600, 1500, 0.02, 'square', 0.05, 0.07, o); }
        break;
      case 'glass': o = L(1300, 0.4); if (this.snd('glass', o, { rate: 0.95 + Math.random() * 0.1 })) break; this.noise(0.08, 5000, 'highpass', 0.9, 0, o); for (let k = 0; k < 9; k++) this.tone(3000 + Math.random() * 4000, 2500, 0.08 + Math.random() * 0.15, 'triangle', 0.08, 0.02 + Math.random() * 0.35, o); this.noise(0.3, 2500, 'bandpass', 0.2, 0.05, o, 2); break;
      case 'pry': o = L(700, 0.2); this.sweep(1.3, 300, 900, 'bandpass', 0.08, 0, o, 12); this.clank(o, 600, 0.06, 0.2); this.clank(o, 500, 0.06, 0.8); break;
      case 'pried': o = L(800, 0.3); this.noise(0.15, 1500, 'bandpass', 0.6, 0, o, 2); this.tone(120, 60, 0.15, 'sine', 0.4, 0, o); break;
      case 'locked': o = L(500, 0.1); for (let k = 0; k < 3; k++) { this.tone(1800, 1600, 0.03, 'square', 0.05, k * 0.09, o); this.noise(0.04, 900, 'bandpass', 0.12, k * 0.09, o, 3); } break;
      case 'winopen': o = L(500, 0.15); this.sweep(0.4, 800, 1400, 'bandpass', 0.06, 0, o, 8); this.tone(200, 140, 0.08, 'sine', 0.12, 0.35, o); break;
      case 'climb': o = L(500, 0.1); this.noise(0.35, 1000, 'bandpass', 0.12, 0, o, 1); this.tone(110, 60, 0.12, 'sine', 0.3, 0.45, o); this.noise(0.08, 500, 'lowpass', 0.25, 0.45, o); break;
      case 'slam': o = L(900, 0.3); this.tone(70, 30, 0.35, 'sine', 0.8, 0, o); this.noise(0.3, 300, 'lowpass', 0.8, 0, o); this.noise(0.08, 1800, 'bandpass', 0.3, 0, o, 2); break;
      case 'revive': this.tone(220, 880, 0.6, 'sawtooth', 0.12); this.tone(440, 1320, 0.7, 'sine', 0.15, 0.1); this.noise(0.5, 300, 'lowpass', 0.6); break;
      case 'buff': this.tone(e.buff === 'adrenaline' ? 300 : 500, e.buff === 'adrenaline' ? 900 : 1000, 0.3, 'sine', 0.1); this.noise(0.15, 3000, 'highpass', 0.05); break;
      case 'searchStart': this.rummage(e.dur, L(500, 0.1)); this.openSound(e.ctype, L(500, 0.1)); break;
      case 'open': if (!e.first) this.openSound(e.ctype, L(500, 0.1)); else if (e.empty && me) this.tone(260, 200, 0.12, 'triangle', 0.05); break;
      case 'pickup': case 'stow': this.itemSound(e.cat, L(400, 0.05)); break;
      case 'equip': this.tone(1400, 1300, 0.03, 'square', 0.04); this.noise(0.08, 1500, 'bandpass', 0.06, 0.02); break;
      case 'click': this.tone(900, 800, 0.025, 'square', 0.035); break;
      case 'empty': this.tone(1500, 1400, 0.02, 'square', 0.1); this.tone(900, 900, 0.02, 'square', 0.05, 0.03); break;
      case 'reload': o = L(500, 0.05); if (this.snd('reload', o, { rate: Math.min(1.35, Math.max(0.9, 2.5 / (ITEMS[e.gun]?.reload || 2.5))) })) break; this.clank(o, 900, 0.08); this.noise(0.05, 2500, 'bandpass', 0.08, 0.2, o, 3); this.clank(o, 1300, 0.1, 0.45); break;
      case 'reloaded': if (!me) break; this.clank(L(300, 0.05), 1500, 0.07); this.tone(2200, 2000, 0.02, 'square', 0.04, 0.03); break;
      case 'roll': o = L(400, 0.05); this.sweep(0.3, 700, 220, 'bandpass', 0.1, 0, o, 2); this.noise(0.08, 300, 'lowpass', 0.18, 0.26, o); break;
      case 'clutter': o = L(e.kind === 'bottle' || e.kind === 'cans' ? 1000 : 450, 0.15); if (!o.v) return;
        if (e.kind === 'bottle') { this.noise(0.06, 5200, 'highpass', 0.5, 0, o); for (let k = 0; k < 5; k++) this.tone(2400 + Math.random() * 2200, 2000, 0.05, 'sine', 0.06, 0.01 + k * 0.025, o); }
        else if (e.kind === 'cans') for (let k = 0; k < 4; k++) this.clank(o, 700 + Math.random() * 500, 0.06, k * 0.07);
        else { this.sweep(0.22, 1800, 4200, 'bandpass', 0.12, 0, o, 1.5); this.noise(0.08, 500, 'lowpass', 0.12, 0, o); }
        break;
      case 'tflip': o = L(900, 0.3); this.sweep(0.18, 400, 1200, 'bandpass', 0.12, 0, o, 2); this.tone(90, 45, 0.22, 'sine', 0.7, 0.16, o); this.noise(0.18, 500, 'lowpass', 0.6, 0.16, o); break;
      case 'tbreak': o = L(1100, 0.4); this.noise(0.4, 900, 'lowpass', 0.8, 0, o); for (let k = 0; k < 3; k++) this.tone(140 - k * 20, 60, 0.12, 'triangle', 0.25, k * 0.05, o); break;
      case 'phurt': o = L(400, 0.1); this.tone(110, 50, 0.15, 'sine', 0.5, 0, o); this.noise(0.08, 900, 'lowpass', 0.4, 0, o); this.voice(o, 170 + Math.random() * 30, 0.22, 0.2, 650, 0.02); break;
      case 'explode': o = this.bus(e.x, e.y, 3000, 1); this.noise(1.6, 360, 'lowpass', 1.4, 0, o); this.tone(70, 22, 0.9, 'sine', 0.8, 0, o); for (let k = 0; k < 6; k++) this.noise(0.08, 2000, 'bandpass', 0.2, 0.2 + Math.random() * 0.8, o, 2); break;
      case 'beep': o = L(1400, 0.3); this.tone(1500, 1500, 0.07, 'square', 0.12, 0, o); this.tone(1900, 1900, 0.07, 'square', 0.08, 0.1, o); break;
      case 'eat': if (this.snd('eat', this.master)) break; for (let k = 0; k < 4; k++) { this.noise(0.05, 1800 + Math.random() * 1500, 'bandpass', 0.12, k * 0.13, this.master, 2); this.tone(140, 100, 0.05, 'sine', 0.08, k * 0.13 + 0.02); } break;
      case 'drink': if (this.snd('drink', this.master)) break; this.tone(1400, 900, 0.05, 'sine', 0.04); for (let k = 0; k < 4; k++) { this.tone(260 + k * 20, 160, 0.09, 'sine', 0.14, 0.1 + k * 0.17); this.noise(0.06, 500, 'lowpass', 0.05, 0.12 + k * 0.17); } break;
      case 'medStart': this.medSound(e.id); break;
      case 'healed': this.tone(520, 780, 0.15, 'sine', 0.07); this.tone(780, 1040, 0.2, 'sine', 0.05, 0.08); break;
      case 'built': case 'crafted': o = L(500, 0.2); for (let k = 0; k < 3; k++) { this.clank(o, 500 + Math.random() * 200, 0.1, k * 0.18); this.noise(0.05, 900, 'lowpass', 0.3, k * 0.18, o); } break;
      case 'shove': o = L(500, 0.05); this.voice(o, 160, 0.15, 0.1, 700); this.noise(0.12, 500, 'lowpass', 0.35, 0.02, o); break;
      case 'throw': this.sweep(0.25, 500, 1600, 'bandpass', 0.08, 0, this.master, 2); break;
      case 'step': if (me) this.footstep(e.surf, e.loud, this.bus(), e.sneak ? 0.45 : 1); else { o = L(500, 0.05); if (o.v) this.footstep(e.surf, e.loud, o, e.sneak ? 0.3 : 0.8); } break;
      case 'objective': this.tone(660, 660, 0.15, 'sine', 0.1); this.tone(990, 990, 0.3, 'sine', 0.1, 0.12); break;
      case 'horde': if (this.buf.zgrowl) { this.snd('zgrowl', this.master, { rate: 0.6, gain: 0.8 }); this.snd('zgroan', this.master, { rate: 0.7, gain: 0.7, delay: 0.5 }); this.snd('zgrowl', this.master, { rate: 0.8, gain: 0.5, delay: 1.2 }); } else { this.voice(this.master, 60, 3, 0.15, 400); this.voice(this.master, 75, 2.6, 0.1, 500, 0.4); } this.noise(3, 150, 'lowpass', 0.4); break;
      case 'pdie': if (!me) { o = L(1500, 0.3); this.voice(o, 140, 0.8, 0.2, 600); break; } if (this.snd('gameover', this.master)) break; this.tone(110, 35, 2.2, 'sawtooth', 0.15); this.voice(this.master, 140, 0.8, 0.2, 600); break;
      case 'slept': this.tone(392, 392, 0.4, 'sine', 0.06); this.tone(523, 523, 0.5, 'sine', 0.05, 0.3); break;
      case 'lever': o = L(1300, 0.5); this.clank(o, 300, 0.2); this.tone(90, 40, 0.3, 'sine', 0.6, 0.05, o); this.clank(o, 450, 0.12, 0.2); break;
      case 'vault': o = L(1500, 0.6); this.noise(1.2, 500, 'lowpass', 0.6, 0, o); this.sweep(1.2, 200, 60, 'lowpass', 0.4, 0, o); this.clank(o, 700, 0.15, 1.1); break;
      case 'deploy': case 'extracted': if (!me) break; if (this.snd(e.type === 'deploy' ? 'zrounds' : 'zextract', this.master)) break; this.tone(140, 90, 0.8, 'sawtooth', 0.08); this.noise(1.2, 400, 'lowpass', 0.3); this.tone(660, 660, 0.15, 'sine', 0.06, 0.6); break;
      case 'pdown': if (this.snd('down', me ? this.master : L(1500, 0.3))) break; this.tone(160, 50, 1.4, 'sawtooth', 0.12); this.voice(this.master, 150, 0.6, 0.2, 600); break;
      case 'reviveStart': this.noise(0.3, 900, 'bandpass', 0.08); break;
      case 'raidWarn': if (!e.left && this.snd('zrounds', this.master, { rate: 0.85 })) break; for (let k = 0; k < (e.left ? 2 : 4); k++) this.tone(e.left ? 880 : 520, e.left ? 880 : 380, 0.18, 'square', 0.05, k * 0.28); break;
    }
  }
  openSound(t, o) {
    if (t === 'fridge') { this.noise(0.12, 3000, 'highpass', 0.08, 0, o); this.tone(60, 60, 0.4, 'sine', 0.04, 0.05, o); }
    else if (['toolbox', 'locker', 'car', 'register'].includes(t)) { this.clank(o, t === 'car' ? 220 : 420, 0.12); this.noise(0.1, 600, 'lowpass', 0.2, 0, o); }
    else if (['body', 'pile', 'zombie', 'crate'].includes(t)) this.noise(0.3, 1200, 'bandpass', 0.07, 0, o, 1);
    else this.sweep(0.22, 400, 900, 'bandpass', 0.09, 0, o, 3); // drawers, shelves, wardrobes
  }
  itemSound(cat, o) {
    if (METAL.has(cat)) { this.clank(o, 1200 + Math.random() * 400, 0.05); this.clank(o, 1700, 0.03, 0.05); }
    else if (cat === 'food') this.noise(0.12, 3500, 'bandpass', 0.07, 0, o, 2);
    else if (cat === 'med') { for (let k = 0; k < 3; k++) this.noise(0.025, 4000, 'bandpass', 0.06, k * 0.03, o, 4); }
    else if (cat === 'val') { this.tone(2400, 2400, 0.12, 'sine', 0.05, 0, o); this.tone(3100, 3100, 0.1, 'sine', 0.04, 0.04, o); }
    else if (cat === 'mat') { this.tone(160, 110, 0.07, 'sine', 0.15, 0, o); this.noise(0.05, 900, 'bandpass', 0.06, 0, o); }
    else this.noise(0.2, 1100, 'bandpass', 0.07, 0, o, 1);
  }
  medSound(id) {
    const o = this.master;
    if ((id === 'bandage' || id === 'rag') && this.snd('bandage', o, { rate: id === 'rag' ? 0.9 : 1 })) return;
    if (id === 'bandage') { this.sweep(0.25, 3000, 5000, 'bandpass', 0.07, 0, o, 3); this.sweep(0.25, 3000, 5000, 'bandpass', 0.07, 0.5, o, 3); this.noise(0.4, 900, 'bandpass', 0.04, 0.8, o); }
    else if (id === 'rag') { this.sweep(0.3, 1500, 3500, 'bandpass', 0.09, 0.1, o, 2); }
    else if (id === 'painkillers') { for (let k = 0; k < 8; k++) this.tone(3000 + Math.random() * 1500, 2800, 0.02, 'triangle', 0.04, k * 0.04); this.tone(260, 160, 0.1, 'sine', 0.1, 0.6); }
    else if (id === 'antibiotics') { this.noise(0.03, 3000, 'bandpass', 0.15, 0.1, o, 4); this.noise(0.03, 3000, 'bandpass', 0.15, 0.4, o, 4); }
    else if (id === 'medkit') { for (let k = 0; k < 14; k++) this.noise(0.03, 5000, 'bandpass', 0.05, k * 0.035, o, 3); this.sweep(0.3, 3000, 5000, 'bandpass', 0.07, 0.9, o, 3); this.sweep(0.3, 3000, 5000, 'bandpass', 0.07, 1.5, o, 3); }
  }
}
