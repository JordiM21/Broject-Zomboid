import { RNG } from '../rng.js';
import { WORLD_W, WORLD_H, CITY_H } from '../config.js';

export const T = {
  GRASS: 0, ROAD: 1, SIDEWALK: 2, FLOOR: 3, WALL: 4, DOOR: 5, WINDOW: 6, TREE: 7, FENCE: 8, YARD: 9,
  DIRT: 10, TILE: 11, CARPET: 12, CONCRETE: 13, CAR: 14, BUSH: 15, GATE: 16, FURN: 17,
};
export const SOLID = new Uint8Array(32);
[T.WALL, T.WINDOW, T.TREE, T.FENCE, T.CAR, T.FURN].forEach((t) => (SOLID[t] = 1));

export const FURN_KINDS = ['none', 'fridge', 'counter', 'cabinet', 'wardrobe', 'dresser', 'shelf', 'toolbox',
  'grocery', 'pharmacy', 'hardware', 'register', 'locker', 'crate', 'stash', 'bench', 'bed', 'radio', 'medcab', 'milcrate', 'stove', 'sink', 'nightstand', 'bookshelf', 'tvstand', 'desk', 'filing', 'rack', 'modstash', 'weaponcase', 'modcase', 'ammocase', 'gunrack', 'armory', 'dropcrate', 'lever', 'board'];
const FK = Object.fromEntries(FURN_KINDS.map((k, i) => [k, i]));

// which case a place keeps, as weights. Tune how many there are through the chances at each addCase call.
const caseMix = (weapon, ammo, mod) => [['weaponcase', weapon], ['ammocase', ammo], ['modcase', mod]];
const CASES = { home: caseMix(3, 4, 3), yard: caseMix(2, 4, 2), office: caseMix(3, 3, 3), hardware: caseMix(3, 4, 3), police: caseMix(3, 4, 3), camp: caseMix(3, 5, 2) };

const CAR_COLORS = ['#7a2e2e', '#2e4a7a', '#5d6066', '#8a7a3a', '#3f6b4a', '#a8a8a8', '#4a3a5a'];
const ROOF = { house: ['#5a3a32', '#4a4a52', '#3e4f5c', '#6a5038', '#58443c'], grocery: ['#556070'], pharmacy: ['#5f6e6a'], hardware: ['#6a5a40'], hospital: ['#c8ccd0'], military: ['#4a5236'], police: ['#2f3c52'], gas: ['#704038'], safe: ['#3d5a3d'] };

// The map holds two places that never touch: the city (rows 0..CITY_H) and the outpost below it, behind a band of forest.
// The outpost is built first from the world seed, so its containers keep the same ids whichever city is generated.
export function generateWorld(seed, { testGear = false, citySeed = seed } = {}) {
  const W = WORLD_W, H = CITY_H, N = W * WORLD_H;
  let rng = new RNG((seed ^ 0x5bd1e995) >>> 0);
  let crng = new RNG((seed ^ 0x2545f491) >>> 0); // clutter has its own stream, so adding it never moves the rest of the town
  const world = {
    seed, citySeed, w: W, h: WORLD_H, cityH: H,
    tiles: new Uint8Array(N), floor: new Uint8Array(N), deco: new Uint8Array(N), furn: new Uint8Array(N),
    bld: new Int16Array(N).fill(-1), safe: new Uint8Array(N), contAt: new Int32Array(N).fill(-1),
    buildings: [], containers: [], clutter: [], tables: [], doors: {}, cars: [], props: [], safeRect: null, spawn: null, fixtures: {}, windows: {}, zones: [], lamps: [], fires: [],
  };
  const I = (x, y) => y * W + x;
  const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < WORLD_H;
  const ground = (x, y, t) => { if (inb(x, y)) { const i = I(x, y); world.tiles[i] = t; world.floor[i] = t; } };
  const obj = (x, y, t) => { if (inb(x, y)) world.tiles[I(x, y)] = t; };
  const tile = (x, y) => (inb(x, y) ? world.tiles[I(x, y)] : T.TREE);
  const door = (x, y, open) => { const i = I(x, y); world.tiles[i] = T.DOOR; world.doors[i] = { open, hp: 60, broken: false }; };
  const addCont = (x, y, type) => {
    const id = world.containers.length;
    world.containers.push({ id, x, y, type, items: type === 'stash' ? [] : null, searched: type === 'stash' });
    if (type !== 'car') { const i = I(x, y); world.tiles[i] = T.FURN; world.furn[i] = FK[type] || 0; world.contAt[i] = id; }
    return id;
  };
  const addCase = (x, y, mix, chance) => { if (rng.chance(chance)) addCont(x, y, rng.weighted(mix)); };
  const addBuilding = (x, y, w, h, type, name) => {
    const id = world.buildings.length;
    world.buildings.push({ id, x, y, w, h, type, name, roof: rng.pick(ROOF[type] || ROOF.house) });
    return id;
  };
  const shell = (x, y, w, h, id, fl) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      const edge = xx === x || yy === y || xx === x + w - 1 || yy === y + h - 1;
      ground(xx, yy, fl); if (edge) obj(xx, yy, T.WALL);
      world.bld[I(xx, yy)] = id;
    }
  };
  const windows = (x, y, w, h, p) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      const top = yy === y, bot = yy === y + h - 1, lef = xx === x, rig = xx === x + w - 1;
      if (!(top || bot || lef || rig) || ((top || bot) && (lef || rig))) continue;
      if (tile(xx, yy) !== T.WALL || !rng.chance(p)) continue;
      const ix = xx + (lef ? 1 : rig ? -1 : 0), iy = yy + (top ? 1 : bot ? -1 : 0);
      const inT = tile(ix, iy);
      if (inT === T.WALL || inT === T.DOOR || inT === T.FURN) continue;
      const a = (top || bot) ? [tile(xx - 1, yy), tile(xx + 1, yy)] : [tile(xx, yy - 1), tile(xx, yy + 1)];
      if (a[0] === T.WALL || a[0] === T.WINDOW) if (a[1] === T.WALL || a[1] === T.WINDOW) { obj(xx, yy, T.WINDOW); world.windows[I(xx, yy)] = { open: false, broken: false, hp: 20 }; }
    }
  };
  const addCar = (x, y, vert, withLoot = true) => {
    const w = vert ? 1 : 2, h = vert ? 2 : 1;
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      const t = tile(xx, yy);
      if (SOLID[t] || t === T.DOOR || t === T.GATE) return;
    }
    const cid = withLoot ? addCont(x, y, 'car') : -1;
    const car = { x, y, w, h, color: rng.pick(CAR_COLORS), cid, wrecked: rng.chance(0.3) };
    world.cars.push(car);
    if (car.wrecked && rng.chance(0.2)) { car.burning = true; world.fires.push({ x: (x + w / 2) * 32, y: (y + h / 2) * 32 }); }
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { obj(xx, yy, T.CAR); if (cid >= 0) world.contAt[I(xx, yy)] = cid; }
  };
  const prop = (x, y, w, h, kind) => world.props.push({ x, y, w, h, kind, v: rng.int(0, 3) });
  const FLOORS = [T.FLOOR, T.TILE, T.CARPET, T.CONCRETE];
  // n loose items somewhere on open floor inside the rectangle
  const scatter = (x, y, w, h, kinds, n) => {
    for (let k = 0, tries = 0; k < n && tries < n * 6; tries++) {
      const tx = x + crng.int(0, w - 1), ty = y + crng.int(0, h - 1);
      if (!FLOORS.includes(tile(tx, ty))) continue;
      world.clutter.push({ x: (tx + 0.2 + crng.next() * 0.6) * 32, y: (ty + 0.2 + crng.next() * 0.6) * 32, kind: crng.pick(kinds), v: crng.int(0, 3), a: crng.next() * 6.28 });
      k++;
    }
  };

  buildOutpost();
  world.hubConts = world.containers.length;
  rng = new RNG(citySeed); crng = new RNG((citySeed ^ 0x9e3779b9) >>> 0);

  // ---------- base: grass + roads ----------
  const RW = 4, M = 7;
  const xs = [], ys = [];
  for (let p = M; p + RW < W - M; p += RW + rng.int(22, 27)) xs.push(p);
  for (let p = M; p + RW < H - M; p += RW + rng.int(22, 27)) ys.push(p);
  const x0 = xs[0], x1 = xs[xs.length - 1] + RW, y0 = ys[0], y1 = ys[ys.length - 1] + RW;
  for (const rx of xs) for (let y = y0; y < y1; y++) for (let k = 0; k < RW; k++) ground(rx + k, y, T.ROAD);
  for (const ry of ys) for (let x = x0; x < x1; x++) for (let k = 0; k < RW; k++) ground(x, ry + k, T.ROAD);
  const inRoadX = (x) => xs.some((r) => x >= r && x < r + RW);
  const inRoadY = (y) => ys.some((r) => y >= r && y < r + RW);
  for (const rx of xs) for (let y = y0; y < y1; y++) if (!inRoadY(y)) world.deco[I(rx + 1, y)] = 2;
  for (const ry of ys) for (let x = x0; x < x1; x++) if (!inRoadX(x)) world.deco[I(x, ry + 1)] = 1;

  // ---------- blocks ----------
  const blocks = [];
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ys.length - 1; j++) {
    const bx = xs[i] + RW, by = ys[j] + RW, bw = xs[i + 1] - bx, bh = ys[j + 1] - by;
    for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) {
      const edge = x === bx || y === by || x === bx + bw - 1 || y === by + bh - 1;
      ground(x, y, edge ? T.SIDEWALK : T.GRASS);
    }
    for (const [lx2, ly2] of [[bx, by], [bx + bw - 1, by], [bx, by + bh - 1], [bx + bw - 1, by + bh - 1], [bx + (bw >> 1), by], [bx + (bw >> 1), by + bh - 1], [bx, by + (bh >> 1)], [bx + bw - 1, by + (bh >> 1)]]) {
      const broken = rng.chance(0.35);
      world.lamps.push({ x: (lx2 + 0.5) * 32, y: (ly2 + 0.5) * 32, broken, flicker: !broken && rng.chance(0.2), ph: rng.next() * 9 });
      prop(lx2 + 0.3, ly2 + 0.3, 0.4, 0.4, broken ? 'lampx' : 'lamp');
    }
    blocks.push({ i, j, x: bx + 1, y: by + 1, w: bw - 2, h: bh - 2 });
  }
  const ci = Math.floor((xs.length - 1) / 2), cj = Math.floor((ys.length - 1) / 2);
  const cx = W / 2, cy = H / 2, maxD = Math.hypot(W / 2, H / 2);
  const others = [...blocks]; // the city has no safe zone
  // shuffle
  for (let k = others.length - 1; k > 0; k--) { const r = rng.int(0, k); [others[k], others[r]] = [others[r], others[k]]; }
  { // military goes to the block farthest from the safehouse
    let fi = 0, fd = -1; others.forEach((b, k) => { const d = Math.hypot(b.x + b.w / 2 - cx, b.y + b.h / 2 - cy); if (d > fd) { fd = d; fi = k; } });
    others.unshift(others.splice(fi, 1)[0]);
  }
  const forced = ['military', 'vault', 'levers', 'keypad', 'hospital', 'grocery', 'pharmacy', 'hardware', 'police', 'gas', 'grocery', 'pharmacy', 'hardware', 'police', 'parking', 'park', 'hospital', 'res', 'res', 'gas'];
  others.forEach((b, k) => {
    if (k < forced.length) { b.type = forced[k]; return; }
    const d = Math.hypot(b.x + b.w / 2 - cx, b.y + b.h / 2 - cy) / maxD;
    b.type = rng.weighted([['res', 60], ['park', 7], ['parking', 5], ['grocery', 3], ['hardware', 2], ['camp', d > 0.45 ? 8 : 1], ['gas', 2]]);
  });

  for (const b of blocks) {
    switch (b.type) {
      case 'vault': case 'levers': case 'keypad': buildBunker(b, b.type); break;
      case 'res': buildResidential(b); break;
      case 'grocery': case 'pharmacy': case 'hardware': buildShop(b, b.type); break;
      case 'police': buildPolice(b); break;
      case 'gas': buildGas(b); break;
      case 'park': buildPark(b, false); break;
      case 'camp': buildPark(b, true); break;
      case 'parking': buildParking(b); break;
      case 'hospital': buildHospital(b); break;
      case 'military': buildMilitary(b); break;
    }
  }

  // ---------- outskirts forest ----------
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const inside = x >= x0 && x < x1 && y >= y0 && y < y1;
    if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) { ground(x, y, T.GRASS); obj(x, y, T.TREE); continue; }
    if (inside) continue;
    const t = tile(x, y);
    if (t !== T.GRASS) continue;
    const r = rng.next();
    if (r < 0.3) obj(x, y, T.TREE); else if (r < 0.38) obj(x, y, T.BUSH); else if (r < 0.45) ground(x, y, T.DIRT);
  }
  // a few camps in the forest ring
  for (let k = 0; k < 10; k++) {
    const side = rng.int(0, 3);
    const x = side === 0 ? rng.int(3, x0 - 3) : side === 1 ? rng.int(x1 + 2, W - 4) : rng.int(4, W - 5);
    const y = side >= 2 ? (side === 2 ? rng.int(3, y0 - 3) : rng.int(y1 + 2, H - 4)) : rng.int(4, H - 5);
    for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) if (inb(xx, yy) && xx > 1 && yy > 1 && xx < W - 2 && yy < H - 2) ground(xx, yy, T.DIRT);
    if (x > 2 && y > 2 && x < W - 3 && y < H - 3) { addCont(x, y, 'crate'); prop(x - 1, y + 1, 1, 1, 'tent'); addCase(x + 1, y - 1, CASES.camp, 0.2); }
  }

  // ---------- road cars ----------
  for (const rx of xs) for (let y = y0 + 2; y < y1 - 3; y += rng.int(5, 14)) {
    if (inRoadY(y) || inRoadY(y + 1) || inRoadY(y - 1) || inRoadY(y + 2)) continue;
    if (rng.chance(0.45)) addCar(rx + (rng.chance(0.5) ? 0 : 3), y, true, rng.chance(0.8));
  }
  for (const ry of ys) for (let x = x0 + 2; x < x1 - 3; x += rng.int(5, 14)) {
    if (inRoadX(x) || inRoadX(x + 1) || inRoadX(x - 1) || inRoadX(x + 2)) continue;
    if (rng.chance(0.45)) addCar(x, ry + (rng.chance(0.5) ? 0 : 3), false, rng.chance(0.8));
  }
  // the vault keycard is in a police office: a desk or filing cabinet, as far from the vault as possible
  if (world.vaultAt) {
    const offices = world.containers.filter((c) => (c.type === 'desk' || c.type === 'filing') && c.id >= world.hubConts);
    const police = offices.filter((c) => (world.buildings[world.bld[I(c.x, c.y)]] || {}).type === 'police');
    const pool = police.length ? police : offices, far = (c) => Math.hypot(c.x - world.vaultAt.x, c.y - world.vaultAt.y);
    if (pool.length) { pool.sort((a, b) => far(b) - far(a)); pool[rng.int(0, Math.min(pool.length, 2) - 1)].bonus = [{ id: 'keycard', n: 1 }]; }
  }
  // insertion: a road crossing on the edge of town. Extraction: a crossing across town, never next door
  {
    const cross = []; for (let i = 0; i < xs.length; i++) for (let j = 0; j < ys.length; j++) cross.push({ i, j, x: xs[i] + RW / 2, y: ys[j] + RW / 2 });
    const edge = cross.filter((c) => c.i === 0 || c.j === 0 || c.i === xs.length - 1 || c.j === ys.length - 1);
    const ins = rng.pick(edge), dd = (c) => Math.hypot(c.x - ins.x, c.y - ins.y), maxD = Math.max(...cross.map(dd));
    const ext = rng.pick(cross.filter((c) => dd(c) > maxD * 0.5 && dd(c) < maxD * 0.85));
    world.insert = { x: ins.x * 32, y: ins.y * 32 };
    world.extract = { x: ext.x * 32, y: ext.y * 32, r: 2.6 * 32 };
    prop(ext.x - 1.6, ext.y - 1.6, 3.2, 3.2, 'helipad');
    const dx = Math.floor(ins.x) + (ins.i === 0 ? 1 : -2), dy = Math.floor(ins.y) + (ins.j === 0 ? 1 : -2);
    prop(ins.x - 0.5, ins.y - 0.4, 1, 0.8, 'busstop');
    { // the bus that drops you parks on the road beside the drop point, door side to you, then leaves along the road. Heading: whichever way keeps it clear of the crate
      const axis = ins.i === 0 || ins.i === xs.length - 1 ? [0, 1] : [1, 0], cx = (dx + 0.5) * 32, cy = (dy + 0.5) * 32;
      const spot = (sg) => { const ax = axis[0] * sg, ay = axis[1] * sg; return { ax, ay, x: world.insert.x - ax * 40 + ay * 60, y: world.insert.y - ay * 40 - ax * 60 }; };
      const p1 = spot(1), p2 = spot(-1), pick = Math.hypot(p1.x - cx, p1.y - cy) > Math.hypot(p2.x - cx, p2.y - cy) ? p1 : p2;
      world.insert.dx = pick.ax; world.insert.dy = pick.ay;
    }
  }
  world.props.forEach((p, i) => { if (p.kind === 'table') { p.flip = 0; p.hp = 60; world.tables.push(i); } });
  return world;

  // ================= puzzle rooms =================
  // A sealed concrete room in the middle of a block. Inside: an armory with two loaded guns, ammo and mods.
  // 'vault' opens with the keycard, 'levers' with two levers pulled together, 'keypad' with a code from four notes.
  function buildBunker(b, kind) {
    for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) ground(xx, yy, kind === 'vault' ? T.CONCRETE : rng.chance(0.35) ? T.DIRT : T.GRASS);
    const w = 9, h = 7, x = b.x + Math.floor((b.w - w) / 2), y = b.y + Math.floor((b.h - h) / 2);
    const id = addBuilding(x, y, w, h, 'bunker', { vault: 'Sealed Vault', levers: 'Twin-Lock Bunker', keypad: 'Keypad Bunker' }[kind]);
    world.buildings[id].roof = '#3a3e42';
    shell(x, y, w, h, id, T.CONCRETE);
    const dx = x + Math.floor(w / 2), dy = y + h - 1, di = I(dx, dy);
    door(dx, dy, false); Object.assign(world.doors[di], { locked: true, vault: kind, hp: 9999 });
    for (let yy = dy + 1; yy < b.y + b.h; yy++) ground(dx, yy, T.CONCRETE);
    addCont(x + Math.floor(w / 2), y + 1, 'armory');
    addCont(x + 1, y + 1, kind === 'vault' ? 'milcrate' : 'crate'); addCont(x + w - 2, y + 1, 'medcab'); addCont(x + 1, y + h - 2, 'ammocase');
    prop(x + 2, y + 3, 2, 1, 'table');
    world.lamps.push({ x: (dx + 0.5) * 32, y: (dy + 1.5) * 32, flood: true, ph: 0 });
    world.zones.push({ x: (x + w / 2) * 32, y: (y + h / 2) * 32, r: 11 * 32, kind: 'bunker', name: world.buildings[id].name });
    if (kind === 'vault') {
      world.vaultAt = { x: dx, y: dy };
      prop(x - 2, y + h + 1, 1.6, 0.6, 'sandbag'); prop(x + w + 0.4, y + h + 1, 1.6, 0.6, 'sandbag');
      prop(b.x + 1, b.y + 1, 1.6, 1.6, 'tower'); barrel(b.x + b.w - 3, b.y + 2);
    } else if (kind === 'levers') {
      // two sheds on opposite sides of the block, a lever in each
      const levers = [];
      for (const side of [0, 1]) {
        const sx = side ? b.x + b.w - 6 : b.x + 1, sy = b.y + 1 + rng.int(0, Math.max(0, b.h - 7));
        const sid = addBuilding(sx, sy, 5, 5, 'shed', 'Pump Shed'); shell(sx, sy, 5, 5, sid, T.CONCRETE);
        door(sx + 2, sy + 4, false); levers.push(addCont(sx + 2, sy + 1, 'lever'));
      }
      world.doors[di].levers = levers;
    } else {
      const code = [rng.int(0, 9), rng.int(0, 9), rng.int(0, 9), rng.int(0, 9)];
      world.doors[di].code = code.join('');
      const ORD = ['1st', '2nd', '3rd', '4th'];
      // four abandoned camps around the bunker, each with one note in its crate
      const spots = [[b.x + 2, b.y + 2], [b.x + b.w - 4, b.y + 2], [b.x + 2, b.y + b.h - 4], [b.x + b.w - 4, b.y + b.h - 4]];
      for (let k = 0; k < 4; k++) {
        const [cx2, cy2] = spots[k];
        const cid = addCont(cx2, cy2, 'crate'); prop(cx2 - 1, cy2 + 1, 1, 1, 'tent');
        world.containers[cid].bonus = [{ id: 'note', n: 1, txt: `Keypad: the ${ORD[k]} digit is ${code[k]}.` }];
      }
    }
    yardDeco(b.x, b.y, b.w, b.h);
  }

  // ================= outpost =================
  // Fenced compound below the forest: headquarters with the stash, workbench, radio, bed and gun displays, and the bus out.
  function buildOutpost() {
    for (let y = CITY_H; y < WORLD_H; y++) for (let x = 0; x < W; x++) { ground(x, y, T.GRASS); obj(x, y, T.TREE); }
    const ow = 46, oh = 32, ox = Math.floor((W - ow) / 2), oy = CITY_H + 4;
    for (let yy = oy - 2; yy < oy + oh + 2; yy++) for (let xx = ox - 3; xx < ox + ow + 3; xx++) { if (rng.chance(0.75)) { ground(xx, yy, T.GRASS); if (rng.chance(0.08)) obj(xx, yy, T.BUSH); } }
    world.safeRect = { x: ox, y: oy, w: ow, h: oh };
    for (let yy = oy; yy < oy + oh; yy++) for (let xx = ox; xx < ox + ow; xx++) {
      const edge = xx === ox || yy === oy || xx === ox + ow - 1 || yy === oy + oh - 1;
      ground(xx, yy, rng.chance(0.15) ? T.DIRT : T.YARD); if (edge) obj(xx, yy, T.FENCE);
    }
    for (let yy = oy - 3; yy < WORLD_H; yy++) for (let xx = ox - 4; xx < ox + ow + 4; xx++) if (inb(xx, yy)) world.safe[I(xx, yy)] = 1;
    // headquarters
    const x = ox + 3, y = oy + 3, w = 20, h = 12;
    const id = addBuilding(x, y, w, h, 'safe', 'Outpost HQ');
    shell(x, y, w, h, id, T.FLOOR);
    door(x + 6, y + h - 1, true); door(x + 14, y + h - 1, true); door(x + w - 1, y + 6, true);
    // the stash runs along the back wall: one big store behind several shelves
    world.fixtures.stash = addCont(x + 1, y + 1, 'stash');
    for (let k = 2; k <= 6; k++) { obj(x + k, y + 1, T.FURN); world.furn[I(x + k, y + 1)] = FK.stash; world.contAt[I(x + k, y + 1)] = world.fixtures.stash; }
    world.fixtures.bench = addCont(x + 9, y + 1, 'bench');
    obj(x + 10, y + 1, T.FURN); world.furn[I(x + 10, y + 1)] = FK.bench; world.contAt[I(x + 10, y + 1)] = world.fixtures.bench;
    world.fixtures.radio = addCont(x + 12, y + 1, 'radio');
    world.fixtures.board = addCont(x + 14, y + 1, 'board');
    world.fixtures.racks = [];
    for (let k = 0; k < 4; k++) world.fixtures.racks.push(addCont(x + w - 2, y + 2 + k * 2, 'gunrack'));
    world.fixtures.bed = addCont(x + 1, y + h - 2, 'bed');
    obj(x + 2, y + h - 2, T.FURN); world.furn[I(x + 2, y + h - 2)] = FK.bed; world.contAt[I(x + 2, y + h - 2)] = world.fixtures.bed;
    if (testGear) {
      world.fixtures.rack = addCont(x + 1, y + 4, 'rack');
      world.fixtures.modstash = addCont(x + 1, y + 6, 'modstash');
    }
    prop(x + 6, y + 4, 6, 4, 'rug'); prop(x + 7, y + 5, 4, 2, 'table'); prop(x + 14, y + 6, 2.2, 1.6, 'sofa'); prop(x + 1, y + h - 4, 0.7, 0.7, 'plant');
    windows(x, y, w, h, 0.4);
    world.spawn = { x: (x + 9.5) * 32, y: (y + 8.5) * 32 };
    world.safeCenter = { x: (ox + ow / 2) * 32, y: (oy + oh / 2) * 32 };
    // yard: garden, rain collector, tents and sandbags
    world.gardenAt = { x: ox + 27, y: oy + 3 }; world.rainAt = { x: ox + 33, y: oy + 3 };
    prop(ox + 38, oy + 3, 3, 2.4, 'mtent'); prop(ox + 38, oy + 7, 3, 2.4, 'mtent');
    prop(ox + 1.2, oy + 1.2, 1.6, 1.6, 'tower'); prop(ox + ow - 2.8, oy + 1.2, 1.6, 1.6, 'tower');
    for (let k = 0; k < 4; k++) prop(ox + 26 + k * 2, oy + 12, 1.6, 0.6, 'sandbag');
    barrel(ox + 25, oy + 9);
    world.lamps.push({ x: (ox + 2) * 32, y: (oy + 2) * 32, flood: true, ph: 0 }, { x: (ox + ow - 2) * 32, y: (oy + 2) * 32, flood: true, ph: 0 }, { x: (ox + 30) * 32, y: (oy + 24) * 32, flood: true, ph: 0 });
    // the bus, parked on a dirt road that runs out through the south gate
    for (let yy = oy + 17; yy < WORLD_H; yy++) for (let xx = ox + 26; xx < ox + 32; xx++) if (inb(xx, yy)) ground(xx, yy, yy >= oy + oh - 1 ? T.ROAD : T.DIRT);
    for (let xx = ox + 26; xx < ox + 32; xx++) ground(xx, oy + oh - 1, T.GATE);
    const bx = ox + 28, by = oy + 19;
    world.fixtures.bus = world.containers.length;
    world.containers.push({ id: world.fixtures.bus, x: bx, y: by, type: 'bus', items: [], searched: true });
    for (let yy = by; yy < by + 6; yy++) for (let xx = bx; xx < bx + 2; xx++) { obj(xx, yy, T.CAR); world.contAt[I(xx, yy)] = world.fixtures.bus; }
    prop(bx - 0.1, by - 0.1, 2.2, 6.2, 'bus');
    world.busAt = { x: (bx + 1) * 32, y: (by + 3) * 32 };
  }

  // ================= builders =================
  function buildHouse(x, y, w, h, face) {
    const id = addBuilding(x, y, w, h, 'house', 'House');
    shell(x, y, w, h, id, T.FLOOR);
    const doors = [];
    const fx = x + rng.int(2, w - 3), fy = face === 'N' ? y : y + h - 1;
    door(fx, fy, false); doors.push([fx, fy]); prop(fx + 0.12, (face === 'N' ? fy - 1 : fy + 1) + 0.22, 0.76, 0.56, 'mat'); if (rng.chance(0.35)) world.doors[I(fx, fy)].locked = true;
    if (rng.chance(0.4)) { // back door
      const bx = x + rng.int(2, w - 3), by = face === 'N' ? y + h - 1 : y;
      door(bx, by, false); doors.push([bx, by]); if (rng.chance(0.5)) world.doors[I(bx, by)].locked = true;
    }
    const leaves = [];
    const split = (r, depth) => {
      const canV = r.w >= 7, canH = r.h >= 7;
      if (depth >= 3 || (!canV && !canH) || r.w * r.h < 20 || (depth > 0 && r.w * r.h < 36 && rng.chance(0.5))) { leaves.push(r); return; }
      let vert = canV && (!canH || r.w >= r.h);
      if (canV && canH && rng.chance(0.25)) vert = !vert;
      for (let tries = 0; tries < 6; tries++) {
        if (vert) {
          const sx = r.x + rng.int(3, r.w - 4);
          if (doors.some((d) => d[0] === sx && (d[1] === r.y - 1 || d[1] === r.y + r.h))) continue;
          for (let yy = r.y; yy < r.y + r.h; yy++) obj(sx, yy, T.WALL);
          const dy = r.y + rng.int(0, r.h - 1);
          if (rng.chance(0.7)) door(sx, dy, rng.chance(0.5)); else obj(sx, dy, T.FLOOR);
          doors.push([sx, dy]);
          split({ x: r.x, y: r.y, w: sx - r.x, h: r.h }, depth + 1);
          split({ x: sx + 1, y: r.y, w: r.x + r.w - sx - 1, h: r.h }, depth + 1);
          return;
        } else {
          const sy = r.y + rng.int(3, r.h - 4);
          if (doors.some((d) => d[1] === sy && (d[0] === r.x - 1 || d[0] === r.x + r.w))) continue;
          for (let xx = r.x; xx < r.x + r.w; xx++) obj(xx, sy, T.WALL);
          const dx = r.x + rng.int(0, r.w - 1);
          if (rng.chance(0.7)) door(dx, sy, rng.chance(0.5)); else obj(dx, sy, T.FLOOR);
          doors.push([dx, sy]);
          split({ x: r.x, y: r.y, w: r.w, h: sy - r.y }, depth + 1);
          split({ x: r.x, y: sy + 1, w: r.w, h: r.y + r.h - sy - 1 }, depth + 1);
          return;
        }
      }
      leaves.push(r);
    };
    split({ x: x + 1, y: y + 1, w: w - 2, h: h - 2 }, 0);
    leaves.sort((a, b) => b.w * b.h - a.w * a.h);
    const roles = leaves.length === 1 ? ['combo'] : leaves.length === 2 ? ['combo', 'bedroom'] : leaves.length === 3 ? ['living', 'kitchen', 'bedroom'] : ['living', 'kitchen', 'bedroom', ...Array(leaves.length - 4).fill('bedroom'), 'bathroom'];
    leaves.forEach((r, k) => furnishRoom(r, roles[k]));
    windows(x, y, w, h, 0.35);
  }

  function furnishRoom(r, role) {
    const fl = role === 'kitchen' || role === 'bathroom' ? T.TILE : role === 'bedroom' ? T.CARPET : T.FLOOR;
    for (let yy = r.y; yy < r.y + r.h; yy++) for (let xx = r.x; xx < r.x + r.w; xx++) ground(xx, yy, fl);
    const list = { living: ['bookshelf', 'tvstand', 'shelf'], kitchen: ['fridge', 'stove', 'sink', 'counter', 'counter'], bedroom: ['wardrobe', 'dresser', 'nightstand'], bathroom: ['cabinet', 'sink'], combo: ['fridge', 'stove', 'counter', 'tvstand'] }[role];
    if (role === 'bedroom' && rng.chance(0.4)) list.push(rng.chance(0.5) ? 'desk' : 'nightstand');
    if (role === 'living' && rng.chance(0.35)) list.push('toolbox');
    const cands = [];
    for (let yy = r.y; yy < r.y + r.h; yy++) for (let xx = r.x; xx < r.x + r.w; xx++) {
      const edge = xx === r.x || yy === r.y || xx === r.x + r.w - 1 || yy === r.y + r.h - 1;
      if (!edge) continue;
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const t = tile(xx + dx, yy + dy); return t === T.DOOR || (t !== T.WALL && t !== T.WINDOW && world.bld[I(xx + dx, yy + dy)] >= 0 && (xx + dx < r.x || yy + dy < r.y || xx + dx >= r.x + r.w || yy + dy >= r.y + r.h)); });
      if (!near) cands.push([xx, yy]);
    }
    if (r.w < 3 || r.h < 3) return;
    for (const k of list) {
      if (!cands.length) break;
      const ci2 = rng.int(0, cands.length - 1);
      const [xx, yy] = cands.splice(ci2, 1)[0];
      addCont(xx, yy, k);
    }
    // kept out of sight along a wall in a bedroom or the living room
    if (role === 'bedroom' || role === 'living') {
      const open = cands.filter(([xx, yy]) => !SOLID[tile(xx + 1, yy)] || !SOLID[tile(xx - 1, yy)] || !SOLID[tile(xx, yy + 1)] || !SOLID[tile(xx, yy - 1)]);
      if (open.length) { const [xx, yy] = rng.pick(open); addCase(xx, yy, CASES.home, 0.1); }
    }
    const ck = { living: [['books', 'books', 'papers'], 3 + crng.int(0, 2)], bedroom: [['books', 'papers', 'bottle', 'box'], 1 + crng.int(0, 2)], kitchen: [['bottle', 'cans', 'cans', 'papers'], 2 + crng.int(0, 2)], bathroom: [['bottle'], crng.int(0, 1)], combo: [['books', 'bottle', 'cans', 'papers'], 3 + crng.int(0, 2)] }[role];
    scatter(r.x, r.y, r.w, r.h, ck[0], ck[1]);
    const mx = r.x + Math.floor(r.w / 2), my = r.y + Math.floor(r.h / 2);
    if (role === 'bedroom') { prop(mx - 0.5, my - 1, 1.4, 2, 'bed'); if (r.w > 3) prop(r.x + 0.15, r.y + r.h - 0.9, 0.7, 0.7, 'plant'); }
    else if (role === 'living' || role === 'combo') {
      prop(mx - 1, my - 0.5, 2.2, 1.6, 'rug'); prop(mx - 0.8, my - 0.6, 1.6, 0.7, 'sofa');
      if (r.w > 4) prop(mx + 1, my + 0.3, 0.8, 0.8, 'armchair');
      prop(r.x + r.w - 0.85, r.y + r.h - 0.85, 0.7, 0.7, 'plant');
      if (role === 'combo') { prop(mx - 0.6, my + 1, 1.2, 1, 'table'); }
    } else if (role === 'kitchen') { prop(mx - 0.6, my - 0.6, 1.2, 1.2, 'table'); prop(mx - 1.05, my - 0.35, 0.45, 0.6, 'chair'); prop(mx + 0.6, my - 0.35, 0.45, 0.6, 'chair'); }
    else if (role === 'bathroom') { prop(mx - 0.3, my - 0.3, 0.7, 0.8, 'toilet'); if (r.w >= 3 && r.h >= 3) prop(r.x + 0.1, r.y + 0.1, 0.9, 1.6, 'tub'); }
  }

  function yardDeco(x, y, w, h) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      if (tile(xx, yy) !== T.GRASS) continue;
      const nearB = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => world.bld[I(xx + dx, yy + dy)] >= 0 || tile(xx + dx, yy + dy) === T.DIRT);
      if (nearB) continue;
      const r = rng.next();
      if (r < 0.05) obj(xx, yy, T.TREE); else if (r < 0.1) obj(xx, yy, T.BUSH);
    }
  }

  function buildResidential(b) {
    const rowH = Math.floor(b.h / 2);
    for (let row = 0; row < 2; row++) {
      const ly = b.y + row * rowH, lh = row === 0 ? rowH : b.h - rowH;
      const face = row === 0 ? 'N' : 'S';
      let lx = b.x;
      while (lx < b.x + b.w) {
        let lw = rng.int(9, 13);
        if (b.x + b.w - (lx + lw) < 8) lw = b.x + b.w - lx;
        const hw = Math.min(lw - 2, rng.int(7, 11)), hh = Math.min(lh - 3, rng.int(7, 10));
        const hx = lx + 1 + rng.int(0, Math.max(0, lw - 2 - hw));
        const hy = face === 'N' ? ly + 2 : ly + lh - 2 - hh;
        if (hw >= 6 && hh >= 6) {
          buildHouse(hx, hy, hw, hh, face);
          // path from front door to sidewalk
          for (let xx = hx; xx < hx + hw; xx++) {
            const dyy = face === 'N' ? hy : hy + hh - 1;
            if (tile(xx, dyy) === T.DOOR) {
              if (face === 'N') for (let yy = ly; yy < hy; yy++) ground(xx, yy, T.DIRT);
              else for (let yy = hy + hh; yy < ly + lh; yy++) ground(xx, yy, T.DIRT);
            }
          }
          if (rng.chance(0.2)) {
            const sx = hx + hw + 0 < lx + lw - 1 ? hx + hw : hx - 2;
            const cy2 = face === 'N' ? ly : ly + lh - 2;
            if (sx >= lx && sx < lx + lw - 1) addCar(sx, cy2, true, true);
          }
        }
        { // stashed behind the house, out of sight of the street, next to a bush
          const cx2 = hx + rng.int(0, Math.max(0, hw - 1)), cy3 = face === 'N' ? ly + lh - 1 : ly;
          if (tile(cx2, cy3) === T.GRASS && tile(cx2, cy3 + (face === 'N' ? -1 : 1)) !== T.DOOR && rng.chance(0.08)) {
            addCont(cx2, cy3, rng.weighted(CASES.yard));
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (tile(cx2 + dx, cy3 + dy) === T.GRASS && rng.chance(0.6)) obj(cx2 + dx, cy3 + dy, T.BUSH);
          }
        }
        yardDeco(lx, ly, lw, lh);
        lx += lw;
      }
    }
  }

  function buildShop(b, kind) {
    const w = Math.min(b.w - 2, rng.int(16, 20)), h = Math.min(b.h - 5, rng.int(11, 14));
    const x = b.x + Math.floor((b.w - w) / 2), y = b.y + 1;
    const names = { grocery: 'Grocery Store', pharmacy: 'Pharmacy', hardware: 'Hardware Store' };
    const id = addBuilding(x, y, w, h, kind, names[kind]);
    shell(x, y, w, h, id, kind === 'hardware' ? T.CONCRETE : T.TILE);
    const dx = x + Math.floor(w / 2) - 1;
    door(dx, y, false); door(dx + 1, y, false);
    door(x + w - 3, y + h - 1, false);
    addCont(x + 2, y + 2, 'register'); obj(x + 3, y + 2, T.FURN); world.furn[I(x + 3, y + 2)] = FK.counter;
    // back office: a desk, a filing cabinet, and sometimes what the owner kept out of sight
    const ox = x + 6, oy = y + h - 6;
    for (let yy = oy + 1; yy < y + h - 1; yy++) for (let xx = x + 1; xx < ox; xx++) ground(xx, yy, T.CARPET);
    for (let yy = oy; yy < y + h - 1; yy++) obj(ox, yy, T.WALL);
    for (let xx = x + 1; xx < ox; xx++) obj(xx, oy, T.WALL);
    door(ox, y + h - 3, false);
    addCont(x + 2, oy + 1, 'desk'); addCont(x + 4, oy + 1, 'filing');
    addCase(x + 1, y + h - 2, kind === 'hardware' ? CASES.hardware : CASES.office, kind === 'hardware' ? 0.6 : 0.3);
    let n = 0;
    for (let sx = x + 2; sx < x + w - 2; sx += 3) {
      for (let sy = y + 4; sy < y + h - 2; sy++) {
        if (sx >= dx - 1 && sx <= dx + 2 && sy < y + 5) continue;
        if (sx <= ox + 1 && sy >= oy - 1) continue;
        if (n++ % 2 === 0) addCont(sx, sy, kind);
        else { obj(sx, sy, T.FURN); world.furn[I(sx, sy)] = FK[kind]; }
      }
    }
    scatter(x + 1, y + 3, w - 2, h - 4, kind === 'hardware' ? ['box', 'cans'] : kind === 'pharmacy' ? ['box', 'bottle', 'papers'] : ['cans', 'bottle', 'box'], 8 + crng.int(0, 5));
    scatter(x + 1, oy + 1, ox - x - 1, y + h - oy - 2, ['papers', 'papers', 'books'], 3);
    windows(x, y, w, h, 0.6);
    for (let yy = y + h; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) ground(xx, yy, T.CONCRETE);
    for (let xx = b.x; xx < b.x + b.w; xx++) ground(xx, b.y, T.CONCRETE);
    for (let xx = b.x + 1; xx < b.x + b.w - 2; xx += 3) if (rng.chance(0.3)) addCar(xx, y + h + 1, true);
    prop(b.x + b.w - 3, b.y + b.h - 2, 1.6, 1, 'dumpster');
    if (rng.chance(0.3)) barrel(b.x + 1, b.y + b.h - 2);
    yardDeco(b.x, b.y, b.w, b.h);
  }

  function buildPolice(b) {
    const w = Math.min(b.w - 2, 16), h = Math.min(b.h - 4, 13);
    const x = b.x + Math.floor((b.w - w) / 2), y = b.y + 2;
    const id = addBuilding(x, y, w, h, 'police', 'Police Station');
    shell(x, y, w, h, id, T.TILE);
    const dx = x + Math.floor(w / 2) - 1;
    door(dx, y, false); door(dx + 1, y, false);
    const sy = y + 6;
    for (let xx = x + 1; xx < x + w - 1; xx++) obj(xx, sy, T.WALL);
    door(x + Math.floor(w / 2), sy, false);
    for (let xx = x + 1; xx < x + w - 1; xx++) for (let yy = sy + 1; yy < y + h - 1; yy++) ground(xx, yy, T.CONCRETE);
    for (let xx = x + 2; xx < x + w - 2; xx += 2) addCont(xx, y + h - 2, 'locker');
    addCont(x + 1, sy + 2, 'locker'); addCont(x + w - 2, sy + 2, 'locker');
    addCase(x + 1, y + h - 2, CASES.police, 1); // the evidence corner
    addCont(x + 2, y + 2, 'desk'); addCont(x + w - 3, y + 2, 'filing'); addCont(x + 3, y + 2, 'filing');
    prop(x + 3, y + 3, 2, 1, 'table'); prop(x + w - 5, y + 3, 2, 1, 'table');
    scatter(x + 1, y + 1, w - 2, 5, ['papers', 'papers', 'books', 'box'], 7);
    windows(x, y, w, h, 0.5);
    for (let xx = b.x; xx < b.x + b.w; xx += 3) if (rng.chance(0.5)) addCar(xx, y + h + 1, true);
  }

  function buildGas(b) {
    for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) ground(xx, yy, T.CONCRETE);
    const w = 10, h = 7, x = b.x + 2, y = b.y + b.h - h - 2;
    const id = addBuilding(x, y, w, h, 'gas', 'Gas Station');
    shell(x, y, w, h, id, T.TILE);
    door(x + 4, y, false);
    addCont(x + 1, y + 1, 'register');
    for (let xx = x + 2; xx < x + w - 1; xx += 2) addCont(xx, y + 4, 'grocery');
    scatter(x + 1, y + 1, w - 2, h - 2, ['cans', 'bottle', 'box'], 4);
    addCont(x + w - 2, y + 1, 'fridge'); addCont(x + w - 2, y + 2, 'toolbox');
    windows(x, y, w, h, 0.6);
    for (let k = 0; k < 3; k++) prop(b.x + 4 + k * 5, b.y + 3, 1, 1, 'pump');
    addCar(b.x + 6, b.y + 5, false); addCar(b.x + 14, b.y + 2, true);
  }

  function buildPark(b, camp) {
    for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) {
      const r = rng.next();
      if (r < (camp ? 0.3 : 0.08)) obj(xx, yy, T.TREE); else if (r < (camp ? 0.38 : 0.13)) obj(xx, yy, T.BUSH);
    }
    const mx = b.x + Math.floor(b.w / 2), my = b.y + Math.floor(b.h / 2);
    for (let yy = my - 2; yy <= my + 2; yy++) for (let xx = mx - 3; xx <= mx + 3; xx++) ground(xx, yy, T.DIRT);
    if (camp) { addCase(mx + 3, my - 2, CASES.camp, 0.3); addCont(mx - 2, my - 1, 'crate'); addCont(mx + 2, my + 1, 'crate'); prop(mx - 1, my - 2, 1.4, 1.2, 'tent'); prop(mx, my, 0.8, 0.8, 'fire'); world.fires.push({ x: (mx + 0.4) * 32, y: (my + 0.4) * 32, small: true }); }
    else {
      for (let xx = b.x; xx < b.x + b.w; xx++) ground(xx, my, T.DIRT);
      for (let yy = b.y; yy < b.y + b.h; yy++) ground(mx, yy, T.DIRT);
      prop(mx - 3, my - 2, 1.2, 0.5, 'bench'); prop(mx + 2, my + 2, 1.2, 0.5, 'bench');
      if (rng.chance(0.5)) addCont(mx + 3, my - 2, 'crate');
    }
  }

  function barrel(x, y) { prop(x, y, 0.7, 0.7, 'barrel'); world.fires.push({ x: (x + 0.35) * 32, y: (y + 0.35) * 32, small: true }); }

  function buildHospital(b) {
    const w = Math.min(b.w - 2, 22), h = Math.min(b.h - 5, 16), x = b.x + Math.floor((b.w - w) / 2), y = b.y + 2;
    const id = addBuilding(x, y, w, h, 'hospital', 'Hospital');
    shell(x, y, w, h, id, T.TILE);
    const mx = x + Math.floor(w / 2);
    door(mx - 1, y, false); door(mx, y, false);
    // reception
    addCont(x + 2, y + 2, 'register'); addCont(x + 3, y + 2, 'medcab'); addCont(x + w - 3, y + 2, 'medcab');
    prop(mx - 2, y + 2, 4, 1, 'table');
    scatter(x + 1, y + 1, w - 2, 4, ['papers', 'bottle', 'box'], 6);
    const wy = y + 5;
    for (let xx = x + 1; xx < x + w - 1; xx++) obj(xx, wy, T.WALL);
    // wards
    let wx = x + 1; const wards = [];
    while (wx < x + w - 1) {
      let ww = Math.min(6, x + w - 1 - wx); if (x + w - 1 - (wx + ww) < 4) ww = x + w - 1 - wx;
      wards.push([wx, ww]);
      door(wx + Math.floor(ww / 2), wy, false);
      if (wx + ww < x + w - 1) for (let yy = wy + 1; yy < y + h - 1; yy++) obj(wx + ww, yy, T.WALL);
      wx += ww + 1;
    }
    wards.forEach(([ax, aw], k) => {
      const pharm = k === wards.length - 1;
      for (let yy = wy + 1; yy < y + h - 1; yy++) for (let xx = ax; xx < ax + aw; xx++) ground(xx, yy, pharm ? T.TILE : T.FLOOR);
      if (pharm) { for (let yy = wy + 3; yy < y + h - 2; yy += 2) { addCont(ax, yy, 'medcab'); if (aw > 3) addCont(ax + aw - 1, yy, 'medcab'); } }
      else {
        for (let yy = wy + 2; yy < y + h - 2; yy += 3) { prop(ax + 0.1, yy, 1.4, 2, 'hbed'); if (aw > 4) prop(ax + aw - 1.5, yy, 1.4, 2, 'hbed'); }
        addCont(ax + Math.floor(aw / 2), y + h - 2, 'medcab');
      }
    });
    windows(x, y, w, h, 0.5);
    for (let xx = b.x; xx < b.x + b.w; xx++) { ground(xx, b.y, T.CONCRETE); ground(xx, b.y + 1, T.CONCRETE); }
    for (let yy = y + h; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) ground(xx, yy, T.CONCRETE);
    for (let k = 0; k < 3; k++) { const n = world.cars.length; addCar(b.x + 2 + k * 4, y + h + 1, true); if (world.cars.length > n) { world.cars[n].color = '#e4e4e0'; world.cars[n].ambulance = true; } }
    prop(b.x + b.w - 3, y + h + 1, 1.6, 1, 'dumpster');
    world.zones.push({ x: (x + w / 2) * 32, y: (y + h / 2) * 32, r: 15 * 32, kind: 'hospital', name: 'Hospital Grounds' });
  }

  function buildMilitary(b) {
    for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) {
      const edge = xx === b.x || yy === b.y || xx === b.x + b.w - 1 || yy === b.y + b.h - 1;
      ground(xx, yy, rng.chance(0.3) ? T.DIRT : T.CONCRETE); if (edge) obj(xx, yy, T.FENCE);
    }
    const gx = b.x + Math.floor(b.w / 2) - 1;
    for (const xx of [gx, gx + 1]) { ground(xx, b.y, T.GATE); ground(xx, b.y + b.h - 1, T.GATE); }
    prop(gx - 2, b.y + 1, 1.6, 0.6, 'sandbag'); prop(gx + 2.4, b.y + 1, 1.6, 0.6, 'sandbag');
    prop(gx - 2, b.y + b.h - 1.6, 1.6, 0.6, 'sandbag'); prop(gx + 2.4, b.y + b.h - 1.6, 1.6, 0.6, 'sandbag');
    // barracks
    const w = Math.min(b.w - 6, 14), h = 8, x = b.x + 3, y = b.y + 3;
    const id = addBuilding(x, y, w, h, 'military', 'Barracks');
    shell(x, y, w, h, id, T.CONCRETE);
    door(x + Math.floor(w / 2), y + h - 1, false);
    for (let xx = x + 1; xx < x + w - 1; xx += 2) { addCont(xx, y + 1, 'milcrate'); }
    addCont(x + 1, y + h - 2, 'weaponcase'); addCont(x + w - 2, y + h - 2, 'modcase'); // always worth the trip
    for (let xx = x + 2; xx < x + w - 2; xx += 3) prop(xx, y + 3, 1.2, 2, 'bed');
    windows(x, y, w, h, 0.4);
    // tents, crates, trucks
    const ty2 = y + h + 2;
    for (let k = 0; k < 3; k++) {
      const tx2 = b.x + 3 + k * 6; if (tx2 + 3 >= b.x + b.w - 1 || ty2 + 3 >= b.y + b.h - 1) continue;
      prop(tx2, ty2, 3, 2.4, 'mtent'); addCont(tx2 + 1, ty2 + 3, 'milcrate');
    }
    for (let k = 0; k < 2; k++) { const n = world.cars.length; addCar(b.x + b.w - 4 - k * 3, b.y + 3, true); if (world.cars.length > n) { world.cars[n].color = '#4a5230'; world.cars[n].military = true; } }
    prop(b.x + 1.2, b.y + 1.2, 1.6, 1.6, 'tower'); prop(b.x + b.w - 2.8, b.y + b.h - 2.8, 1.6, 1.6, 'tower');
    barrel(b.x + b.w - 3, b.y + b.h - 5);
    { const tx3 = b.x + b.w - 9, ty3 = b.y + b.h - 5; prop(tx3, ty3, 2, 2.2, 'tank'); for (let yy = ty3; yy < ty3 + 2; yy++) for (let xx = tx3; xx < tx3 + 2; xx++) if (!SOLID[tile(xx, yy)] && tile(xx, yy) !== T.GATE) obj(xx, yy, T.CAR); }
    world.lamps.push({ x: (b.x + 2) * 32, y: (b.y + 2) * 32, flood: true, ph: 0 }, { x: (b.x + b.w - 2) * 32, y: (b.y + b.h - 2) * 32, flood: true, ph: 0 });
    world.zones.push({ x: (b.x + b.w / 2) * 32, y: (b.y + b.h / 2) * 32, r: 16 * 32, kind: 'military', name: 'Military Zone' });
  }

  function buildParking(b) {
    for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) ground(xx, yy, T.CONCRETE);
    for (let yy = b.y + 2; yy < b.y + b.h - 3; yy += 5) for (let xx = b.x + 1; xx < b.x + b.w - 1; xx += 2) if (rng.chance(0.4)) addCar(xx, yy, true);
  }
}
