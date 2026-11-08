// Headless sim check: world gen, stepping, combat, save roundtrip-ish.
import { createState, addPlayer, step, command, getInteract } from '../src/sim/sim.js';
const t0 = Date.now();
const s = createState(12345);
const p = addPlayer(s, 'p1'); p.boarded = true; step(s, { p1: {} }, 1 / 60);
console.log('gen ms', Date.now() - t0, 'buildings', s.world.buildings.length, 'containers', s.world.containers.length, 'zombies', s.zombies.length, 'cars', s.world.cars.length);
const counts = {}; for (const b of s.world.buildings) counts[b.type] = (counts[b.type] || 0) + 1; console.log(counts);
let t1 = Date.now();
for (let i = 0; i < 60 * 60; i++) {
  const inp = { mx: p.x + 100, my: p.y, right: i % 600 < 300, down: i % 900 < 200, attack: i % 30 === 0, interact: i % 120 === 0, shove: i % 200 === 0 };
  step(s, { p1: inp }, 1 / 60);
  s.events.length = 0;
}
console.log('60s sim ms', Date.now() - t1, 'player', Math.round(p.x), Math.round(p.y), 'hp', p.hp.toFixed(1), 'zombies', s.zombies.length, 'kills', s.stats.kills);
// teleport near a zombie and fight
const z = s.zombies[0]; p.x = z.x - 30; p.y = z.y; 
for (let i = 0; i < 600; i++) { step(s, { p1: { mx: z.x, my: z.y, attack: true } }, 1 / 60); s.events.length = 0; }
console.log('after fight hp', p.hp.toFixed(1), 'kills', s.stats.kills, 'dead', p.dead);
// time skip a full day
for (let i = 0; i < 60 * 650; i++) { step(s, { p1: {} }, 1 / 60); }
console.log('day after skip events', s.events.length, 'zombies', s.zombies.length, 'dead', p.dead);
