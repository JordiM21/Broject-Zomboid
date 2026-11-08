// Adaptive soundtrack. One mood at a time, crossfaded with smooth ease curves; tracks within a mood rotate and start
// from a random point so nothing feels like a loop. Streamed from /music (not inlined) through the shared AudioContext
// so it works on iOS too, sits well below the effects, and has its own volume.
const MOODS = { menu: ['main'], home: ['home1', 'home2'], explore: ['explore1', 'explore2'], tension: ['tension'], action: ['action'] };
const RANK = { menu: 0, home: 0, explore: 0, tension: 1, action: 2 };
const BASE = 0.2; // full slider = this much of the master: music is a bed under the sound effects, never over them
const KEY = 'lasthaul_music';
const FADE_IN = 4, FADE_OUT = 3.5, FADE_ACTION = 1.8; // seconds; the shift into action is quicker so it lands with the danger
const CALM = { action: 9, tension: 14 }; // seconds of calm needed before the music is allowed to relax

export class Music {
  constructor(sfx) {
    this.sfx = sfx; this.mood = null; this.cur = null; this.calm = 0; this.blocked = false; this.recent = {};
    this.vol = 0.7;
    try { const v = parseFloat(localStorage.getItem(KEY)); if (v >= 0 && v <= 1) this.vol = v; } catch { /* private mode */ }
    // browsers only allow sound after a gesture: the first key press or click (typing the password counts) starts the music
    const wake = () => { this.sfx.init(); this.blocked = false; };
    for (const t of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(t, wake, true);
  }
  get ctx() { return this.sfx.ctx; }
  setVolume(v) {
    this.vol = v; try { localStorage.setItem(KEY, String(v)); } catch { /* ignore */ }
    if (this.bus) this.bus.gain.setTargetAtTime(v * BASE, this.ctx.currentTime, 0.1);
  }
  // Call every frame with the mood the game wants. Handles hysteresis, rotation and the fades.
  set(want, dt) {
    const c = this.ctx; if (!c || c.state !== 'running') return;
    if (!this.bus) { this.bus = c.createGain(); this.bus.gain.value = this.vol * BASE; this.bus.connect(c.destination); }
    if (this.blocked) return; // autoplay was refused; wake() clears this on the next click or key
    if (this.vol === 0) want = 'none';
    if (want !== this.mood) {
      const slow = this.mood && (want === 'explore' && RANK[this.mood] > 0 || want === 'tension' && this.mood === 'action'); // relaxing: wait it out
      this.calm += dt;
      if (!slow || this.calm >= CALM[this.mood]) { this.calm = 0; this.mood = want; this.go(want); }
    } else this.calm = 0;
    const t = this.cur;
    if (t && !t.leaving && this.mood !== 'none') { // a track is ending, or has been on long enough: hand over to the next one
      const left = t.a.duration - t.a.currentTime;
      if (t.a.ended || (isFinite(left) && left < FADE_OUT + 1) || (MOODS[this.mood].length > 1 && t.started && c.currentTime - t.started > t.limit)) this.go(this.mood);
    }
  }
  go(mood) {
    const old = this.cur; this.cur = null;
    if (old) this.fadeOut(old, mood === 'action' ? FADE_ACTION : FADE_OUT);
    if (mood === 'none') return;
    const list = MOODS[mood], pool = list.filter((n) => n !== this.recent[mood]), name = pool[(Math.random() * pool.length) | 0] || list[0];
    this.recent[mood] = name;
    this.cur = this.start(name, mood);
  }
  start(name, mood) {
    const c = this.ctx, a = new Audio();
    a.preload = 'auto'; a.src = `${import.meta.env.BASE_URL}music/${name}.mp3`;
    const src = c.createMediaElementSource(a), g = c.createGain(); g.gain.value = 0; src.connect(g); g.connect(this.bus);
    const t = { a, g, src, started: 0, limit: 150 + Math.random() * 90, leaving: false };
    a.addEventListener('loadedmetadata', () => {
      // anywhere but the main theme starts partway in, leaving at least ~70 s of track
      if (mood !== 'menu' && a.duration > 140) a.currentTime = Math.random() * (a.duration - 100) * 0.9;
      a.play().catch(() => { this.blocked = true; this.mood = null; this.dispose(t); }); // autoplay refused: try again after the next click or key
    }, { once: true });
    a.addEventListener('playing', () => { t.started = c.currentTime; if (!t.leaving) this.ramp(g, 1, mood === 'action' ? FADE_ACTION : FADE_IN); }, { once: true });
    a.addEventListener('error', () => { this.dispose(t); if (this.cur === t) { this.cur = null; this.mood = null; this.blocked = true; } }); // a missing file just means silence, never a crash
    return t;
  }
  fadeOut(t, dur) { t.leaving = true; this.ramp(t.g, 0, dur); setTimeout(() => this.dispose(t), dur * 1000 + 300); }
  dispose(t) {
    if (t.dead) return; t.dead = true;
    try { t.a.pause(); t.a.removeAttribute('src'); t.a.load(); t.src.disconnect(); t.g.disconnect(); } catch { /* already gone */ }
  }
  // smoothstep fade from wherever the gain is right now, so an interrupted fade never jumps
  ramp(g, to, dur) {
    const p = g.gain, t = this.ctx.currentTime, cur = p.value, n = 64, curve = new Float32Array(n);
    p.cancelScheduledValues(t); p.setValueAtTime(cur, t);
    for (let i = 0; i < n; i++) { const x = i / (n - 1); curve[i] = cur + (to - cur) * x * x * (3 - 2 * x); }
    p.setValueCurveAtTime(curve, t, dur);
  }
}
