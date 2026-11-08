// The bus ride between the outpost and the city. Players stand inside the bus (its own small coordinate space, nose up)
// while the scenery scrolls past. Pure helpers shared by the sim (movement, timing) and the scene renderer.
export const BW = 120, BL = 360; // bus interior, px
export const TRIP = { out: 18, back: 15 }; // seconds of driving
export const AUTO_EXIT = 12; // seconds after stopping before the doors push you out
const WALL = 8, R = 9, VMAX = 300, ACC = 3, DEC = 3.5;

// seats are solid blocks on both sides of the aisle; the driver's seat is up front on the left
export const SEATS = [];
for (let k = 0; k < 6; k++) for (const x of [WALL, BW - WALL - 26]) SEATS.push({ x, y: 128 + k * 36, w: 26, h: 24 });
export const DRIVER = { x: WALL + 2, y: 22, w: 30, h: 28 };
export const DOOR = { x: BW, y: 76, r: 40 }; // right side, behind the driver; the player must be near it
const SOLID = [...SEATS, DRIVER];

// speed envelope: ease up to cruising speed, ease down into the stop
const ease = (k) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };
export const speedAt = (dir, t) => VMAX * ease(t / ACC) * ease((TRIP[dir] - t) / DEC);
const TAB = {};
function table(dir) { // distance driven by time, sampled every 0.05 s
  if (TAB[dir]) return TAB[dir];
  const a = [0]; for (let t = 0.05; t <= TRIP[dir] + 0.05; t += 0.05) a.push(a[a.length - 1] + speedAt(dir, t - 0.025) * 0.05);
  return (TAB[dir] = a);
}
export const distAt = (dir, t) => { const a = table(dir), x = Math.max(0, Math.min(a.length - 1.001, t / 0.05)), i = Math.floor(x); return a[i] + (a[i + 1] - a[i]) * (x - i); };
export const tripLength = (dir) => { const a = table(dir); return a[a.length - 1]; };

// what the bus is doing right now. b = { dir, t, go }, t counts seconds since it pulled away
export function busPose(b) {
  if (!b.go) return { moving: false, v: 0, d: 0, arrived: false, doors: true };
  const arrived = b.t >= TRIP[b.dir];
  return { moving: !arrived, v: arrived ? 0 : speedAt(b.dir, b.t), d: distAt(b.dir, b.t), arrived, doors: arrived };
}
// Where you can step off: only while parked
export const nearDoor = (p) => Math.hypot(p.bx - (BW - WALL), p.by - DOOR.y) < DOOR.r;

export function boardAt(p) { p.bx = BW - WALL - 16; p.by = DOOR.y; p.ang = Math.PI; }

// walk around inside the bus: a point with a radius against the seats and walls, axis by axis so you slide along them
export function busMove(p, mx, my, speed, dt) {
  const hit = (x, y) => x < WALL + R || x > BW - WALL - R || y < WALL + R || y > BL - WALL - R || SOLID.some((o) => x > o.x - R && x < o.x + o.w + R && y > o.y - R && y < o.y + o.h + R);
  const nx = p.bx + mx * speed * dt, ny = p.by + my * speed * dt;
  if (!hit(nx, p.by)) p.bx = nx;
  if (!hit(p.bx, ny)) p.by = ny;
  p.moving = !!(mx || my);
}
