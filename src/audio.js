// Procedural WebAudio sound effects; no asset files.
export class Sfx {
  constructor() { this.ctx = null; this.lx = 0; this.ly = 0; this.volume = 0.6; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain(); this.master.gain.value = this.volume; this.master.connect(c.destination);
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.nbuf = buf;
    // ambient wind
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 350;
    const g = c.createGain(); g.gain.value = 0.035;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.08; const lg = c.createGain(); lg.gain.value = 150; lfo.connect(lg); lg.connect(f.frequency); lfo.start();
    src.connect(f); f.connect(g); g.connect(this.master); src.start();
  }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  noise(dur, freq, type, gain, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.nbuf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  tone(f0, f1, dur, type, gain, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  groan(v, low) {
    const c = this.ctx, t = c.currentTime, dur = 0.7 + Math.random() * 0.6;
    const o = c.createOscillator(); o.type = 'sawtooth'; const base = (low ? 55 : 80) + Math.random() * 30;
    o.frequency.setValueAtTime(base, t); o.frequency.linearRampToValueAtTime(base * 0.75, t + dur);
    const vib = c.createOscillator(); vib.frequency.value = 6 + Math.random() * 4; const vg = c.createGain(); vg.gain.value = 8; vib.connect(vg); vg.connect(o.frequency);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
    const g = c.createGain(); g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(0.12 * v, t + 0.15); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f); f.connect(g); g.connect(this.master); o.start(t); vib.start(t); o.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
  }
  play(e, localId) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const v = e.x !== undefined ? Math.max(0, 1 - Math.hypot(e.x - this.lx, e.y - this.ly) / 900) : 1;
    if (v <= 0.01) return;
    switch (e.type) {
      case 'gunshot': {
        const big = e.gun === 'shotgun' ? 1.3 : e.gun === 'rifle' ? 1.5 : 1;
        this.noise(0.25 * big, 1800, 'lowpass', 0.9 * v); this.tone(150, 40, 0.18 * big, 'square', 0.35 * v); this.noise(0.6 * big, 500, 'lowpass', 0.2 * v, 0.05);
        break;
      }
      case 'swing': this.noise(0.12, 900, 'bandpass', 0.18 * v); break;
      case 'zhit': this.tone(110, 50, 0.09, 'square', 0.18 * v); this.noise(0.08, 600, 'lowpass', 0.4 * v); break;
      case 'zdie': this.tone(140, 50, 0.45, 'sawtooth', 0.1 * v); break;
      case 'groan': this.groan(v, e.ztype === 'brute'); break;
      case 'bash': this.noise(0.15, 300, 'lowpass', 0.6 * v); this.tone(70, 50, 0.12, 'sine', 0.3 * v); break;
      case 'doorbreak': this.noise(0.45, 900, 'lowpass', 0.8 * v); break;
      case 'door': this.tone(e.open ? 320 : 240, e.open ? 220 : 160, 0.09, 'triangle', 0.12 * v); break;
      case 'pickup': case 'click': case 'equip': this.tone(900, 700, 0.04, 'square', 0.05); break;
      case 'empty': this.tone(1200, 1100, 0.03, 'square', 0.08); break;
      case 'reload': this.tone(700, 600, 0.04, 'square', 0.08 * v); this.tone(500, 900, 0.05, 'square', 0.08 * v, 0.25); break;
      case 'phurt': this.tone(220, 110, 0.18, 'sawtooth', 0.2); this.noise(0.1, 700, 'lowpass', 0.3); break;
      case 'explode': this.noise(1.4, 380, 'lowpass', 1.4 * v); this.tone(70, 25, 0.8, 'sine', 0.7 * v); break;
      case 'beep': this.tone(1500, 1500, 0.08, 'square', 0.12 * v); break;
      case 'eat': for (let k = 0; k < 3; k++) this.noise(0.06, 1500, 'bandpass', 0.15, k * 0.12); break;
      case 'drink': for (let k = 0; k < 3; k++) this.tone(300, 200, 0.08, 'sine', 0.1, k * 0.14); break;
      case 'medStart': this.noise(0.35, 2500, 'highpass', 0.08); break;
      case 'healed': this.tone(600, 900, 0.12, 'sine', 0.1); break;
      case 'built': case 'crafted': for (let k = 0; k < 3; k++) { this.noise(0.06, 1200, 'bandpass', 0.4, k * 0.15); this.tone(180, 120, 0.05, 'square', 0.1, k * 0.15); } break;
      case 'shove': this.noise(0.15, 500, 'lowpass', 0.3 * v); break;
      case 'throw': this.noise(0.2, 1200, 'bandpass', 0.1); break;
      case 'step': if (e.pid === localId) this.noise(0.05, e.loud ? 500 : 300, 'lowpass', e.loud ? 0.09 : 0.04); break;
      case 'objective': this.tone(660, 660, 0.12, 'sine', 0.12); this.tone(990, 990, 0.25, 'sine', 0.12, 0.12); break;
      case 'horde': this.tone(55, 45, 2.5, 'sawtooth', 0.12); this.noise(2.5, 120, 'lowpass', 0.4); break;
      case 'pdie': this.tone(110, 40, 2, 'sawtooth', 0.18); break;
      case 'open': if (e.first && e.empty) this.tone(300, 250, 0.06, 'triangle', 0.06); else this.noise(0.12, 2000, 'bandpass', 0.1); break;
      case 'alert': this.tone(180, 120, 0.25, 'sawtooth', 0.05 * v); break;
    }
  }
}
