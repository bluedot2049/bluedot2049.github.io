// 海市的路人：不說話，只是走來走去，讓街上熱鬧。
// 人多人少跟著台灣時間走，但故意跟一般夜市反過來：晚上八到十點最冷清，只剩攤販和三四個人；
// 半夜開始有人從碼頭和屋子裡出來，早上七到十點最擠，下午慢慢散。人變多的時候大多往山上走，變少的時候往下走。
// 跟訪客一樣，誰在哪裡、走去哪、停在哪一攤，全由「現在幾點」雜湊算出來，每位玩家看到的一樣，不用傳資料。
// 每一組人（一個人，或兩個人一起走）每五分鐘出門一趟：從門口或碼頭出來，逛一兩攤，走進另一扇門或回到船上。
// 近處的人用完整的角色（手機最多 10 個、電腦 18 個），遠處的人是兩個簡單的形狀（身體、頭），提燈籠的那盞燈另外畫成光點。
// 路人不擋玩家：玩家靠近就往旁邊讓一點。偶爾轉頭看玩家一眼，大部分時間只是路過，兩個人一起走的會轉頭看彼此。
// 網址加 ?crowd=0.8 可以指定人潮（0 到 1），方便測試
import * as THREE from 'three';
import { Character } from './character.js';
import { sanitizeLook, presetLook, RACES, SLIDERS, CLOTH, SKINS } from './looks.js';
import { glowPoints } from './world.js';

const SLOTS = 110, SLOTS_LOW = 60;   // 最多幾組人
const POOL = 18, POOL_LOW = 10;      // 完整的角色最多幾個
const TRIP = 300;                    // 每組人每五分鐘出門一趟
const NEAR = 24, NEAR_DY = 4.5;      // 多近、高低差多少以內用完整的角色
const REBUILD = 1;                   // 每一幀最多換幾個角色的外觀（換外觀要重建網格）
const FADE = 1.2;                    // 從門口出來、走進門裡淡入淡出幾秒
const DODGE = 1.2;                   // 玩家在這個距離內，路人往旁邊讓
const GLANCE = 0.15;                 // 玩家走到面前時，轉頭看一眼的機率
const OWLS = 2;                      // 夜貓子：不管幾點都在外面晃，每一站停很久，最冷清的時候街上也不會空掉
const PLANS = 8;                     // 每一幀最多排幾趟行程，剛進來時不會一下子卡住

// 台灣時間每個整點的人潮（0 到 1），中間直線接起來。跟一般夜市反過來，最冷清的時候也留幾個人
const BUSY = [0.25, 0.32, 0.4, 0.5, 0.62, 0.75, 0.88, 1, 1, 1, 0.95, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.18, 0.12, 0.09, 0.09, 0.09, 0.13, 0.2];
export function busyAt(now) {
  const h = (((now / 3600 + 8) % 24) + 24) % 24, i = Math.floor(h), f = h - i;
  return BUSY[i] + (BUSY[(i + 1) % 24] - BUSY[i]) * f;
}

// 幾個整數攪成 0 到 1 之間的數。連續的小整數（第 0、1、2 組人）也要打得很散，不然大家會同時出門
const hash = (...n) => {
  let h = 0x811c9dc5;
  for (const v of n) {
    h = Math.imul(h ^ (v | 0), 0x01000193);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 12;
    h = Math.imul(h, 0x297a2d39);
    h ^= h >>> 15;
  }
  return (h >>> 0) / 4294967296;
};
function rng(seed) {
  let a = Math.floor(seed * 4294967296) | 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ---------- 衣櫃 ----------
// 本地人：羽織、袴、圍裙、木屐、藍白拖、斗笠、毛巾，布的顏色只挑暗沉的；外地人：背包、夏威夷衫、運動鞋，什麼顏色都有。種族不挑
const LOCAL = {
  hat: ['none', 'none', 'none', 'none', 'none', 'straw', 'straw'],
  top: ['shirt', 'tee', 'tank', 'sweater', 'robe', 'shirt'],
  bottom: ['pants', 'pants', 'shorts', 'skirt', 'hakama', 'robe'],
  outer: ['none', 'none', 'none', 'haori', 'haori', 'apron', 'vest', 'mino'],
  shoes: ['geta', 'geta', 'slippers', 'slippers', 'rainboots', 'boots'],
  neck: ['none', 'none', 'none', 'towel', 'scarf'],
  back: ['none', 'none', 'none', 'none', 'pouch', 'satchel'],
};
const OUTSIDE = {
  hat: ['none', 'none', 'straw', 'wizard'],
  top: ['hawaii', 'tee', 'hoodie', 'shirt'],
  bottom: ['pants', 'shorts', 'track'],
  outer: ['none', 'none', 'raincoat', 'cloak', 'cape'],
  shoes: ['sneakers', 'boots', 'sneakers'],
  neck: ['none', 'scarf', 'none'],
  back: ['backpack', 'backpack', 'backpack', 'satchel'],
};
const FACE = {
  eyes: ['base', 'base', 'dot', 'big', 'line', 'sleepy'], brows: ['none', 'none', 'thick', 'sad'], nose: ['none', 'none', 'ball', 'big'],
  mouth: ['none', 'smile', 'smile', 'flat', 'pout', 'open'], mark: ['base', 'base', 'none', 'blush', 'stache', 'beard', 'mole', 'freckle'],
  glasses: ['none', 'none', 'none', 'none', 'none', 'none', 'round'], hair: ['short', 'short', 'bald', 'comb', 'long', 'buns', 'spiky', 'afro'],
};
const MUTED = [0, 1, 2, 3, 4, 5, 6, 7, 16, 17, 18, 21, 22, 23];
const COLOR_KEYS = ['topC', 'topC2', 'botC', 'botC2', 'outC', 'outC2', 'oneC', 'oneC2', 'shoeC', 'neckC', 'backC', 'handC'];

function personLook(R, local, hand) {
  const pick = (a) => a[Math.floor(R() * a.length)];
  const race = RACES[Math.floor(R() * RACES.length)], L = presetLook(0);
  for (const [k, v] of Object.entries(local ? LOCAL : OUTSIDE)) L[k] = pick(v);
  for (const [k, v] of Object.entries(FACE)) L[k] = pick(v);
  L.race = race.id;
  L.skin = R() < 0.6 && race.skin != null ? race.skin : Math.floor(R() * SKINS.length);
  L.one = local && R() < 0.08 ? 'yukata' : 'none';
  L.hand = hand;
  for (const k of COLOR_KEYS) L[k] = local ? pick(MUTED) : Math.floor(R() * CLOTH.length);
  L.hairC = Math.floor(R() * 8);
  L.hatC = Math.floor(R() * 8);
  L.topPat = pick(['plain', 'plain', 'plain', 'stripe', 'band']);
  L.botPat = pick(['plain', 'plain', 'stripe']);
  for (const [k, , v] of SLIDERS) L[k] = Math.max(0, v + Math.floor(R() * 5) - 2);
  return sanitizeLook(L);
}

// 停在哪一攤之後手上會多什麼：左手的東西（look.hand），或右手邊走邊咬的點心（Character 的 FOODS 編號）
const SHOP_HAND = { bakery: 'baguette', lanterns: 'lantern', tea: 'teacup', fish: 'fish', candle: 'candle', herbs: 'flower', glass: 'flask' };
const CART_HAND = { squid: 'squid', oden: 'teacup' };
const CART_FOOD = { tanghulu: 3, potato: 1, baozi: 1, takoyaki: 1 };

// ---------- 路網 ----------
// 兩塊相連的路面，接口的中點是一個節點；同一塊長方形裡的節點彼此直線相通（長方形是凸的，直線一定走得到）。
// 門口、攤位這些地點掛在它所在的那一塊上，兩點之間用 Dijkstra 找最短的一串節點，算過的記起來
class Roads {
  constructor(world) {
    this.world = world;
    this.areas = world.debug.areas;
    this.nodes = [];
    this.byArea = this.areas.map(() => []);
    const A = this.areas, link = (x, z, i, j) => {
      const n = { x, z, areas: [i, j], id: this.nodes.length };
      this.nodes.push(n);
      this.byArea[i].push(n);
      this.byArea[j].push(n);
    };
    const near = (p, q) => Math.abs(p - q) < 0.02;
    for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) {
      const a = A[i], b = A[j];
      if (near(a.x1, b.x0) || near(b.x1, a.x0)) {
        const x = near(a.x1, b.x0) ? a.x1 : a.x0, z0 = Math.max(a.z0, b.z0), z1 = Math.min(a.z1, b.z1), z = (z0 + z1) / 2;
        if (z1 - z0 > 0.7 && Math.abs(world.groundY(x - 0.15, z) - world.groundY(x + 0.15, z)) < 0.35) link(x, z, i, j);
      } else if (near(a.z1, b.z0) || near(b.z1, a.z0)) {
        const z = near(a.z1, b.z0) ? a.z1 : a.z0, x0 = Math.max(a.x0, b.x0), x1 = Math.min(a.x1, b.x1), x = (x0 + x1) / 2;
        if (x1 - x0 > 0.7 && Math.abs(world.groundY(x, z - 0.15) - world.groundY(x, z + 0.15)) < 0.35) link(x, z, i, j);
      }
    }
    this.cache = new Map();
  }

  areaOf(x, z) {
    return this.areas.findIndex((a) => x >= a.x0 && x <= a.x1 && z >= a.z0 && z <= a.z1);
  }

  // 從 p 走到 q 經過的點（含頭尾）；走不到回傳 null
  route(p, q) {
    const ap = this.areaOf(p.x, p.z), aq = this.areaOf(q.x, q.z);
    if (ap < 0 || aq < 0) return null;
    if (ap === aq) return [p, q];
    const key = `${ap}|${aq}|${p.x.toFixed(1)},${p.z.toFixed(1)}|${q.x.toFixed(1)},${q.z.toFixed(1)}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const N = this.nodes, dist = new Float64Array(N.length).fill(Infinity), prev = new Int32Array(N.length).fill(-1), done = new Uint8Array(N.length);
    for (const n of this.byArea[ap]) dist[n.id] = Math.hypot(n.x - p.x, n.z - p.z);
    let best = Infinity, last = -1;
    for (;;) {
      let u = -1;
      for (let i = 0; i < N.length; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0 || dist[u] >= best) break;
      done[u] = 1;
      const nu = N[u];
      if (nu.areas.includes(aq)) {
        const d = dist[u] + Math.hypot(q.x - nu.x, q.z - nu.z);
        if (d < best) { best = d; last = u; }
      }
      for (const ai of nu.areas) {
        const a = this.areas[ai], slow = a.lo != null ? 1.4 : 1;
        for (const v of this.byArea[ai]) {
          const d = dist[u] + Math.hypot(v.x - nu.x, v.z - nu.z) * slow;
          if (d < dist[v.id]) { dist[v.id] = d; prev[v.id] = u; }
        }
      }
    }
    let out = null;
    if (last >= 0) {
      out = [q];
      for (let u = last; u >= 0; u = prev[u]) out.push(N[u]);
      out.push(p);
      out.reverse();
    }
    this.cache.set(key, out);
    return out;
  }
}

// ---------- 一趟出門 ----------
// 回傳 { dur, people: [{ look, pts, times }], stops, handT, foodKind, foodT }。pts 是這個人的折線（已經各自偏到自己走的那一側），
// times 是走到每一點的時間；停下來的地方同一點出現兩次
function makeTrip(roads, spots, i, k, start, up, ferryIn) {
  const owl = i < OWLS;
  const world = roads.world, R = rng(hash(i, k, 11));
  const pick = (a) => a[Math.floor(R() * a.length)];
  const yOf = (p) => world.groundY(p.x, p.z);
  for (let attempt = 0; attempt < 6; attempt++) {
    const local = R() < 0.85;
    // 從哪裡來：本地人多半從自家門口，少數從碼頭（剛下漁船）；外地人從渡船（船靠著岸的時候）或長棧橋
    const harbor = () => pick(spots.harbor.filter((h) => (ferryIn ? true : h.id !== 'ferry') && (local ? h.id !== 'ferry' : h.id === 'ferry' || h.id === 'pier')));
    let from = local && R() < 0.65 ? pick(spots.doors) : harbor();
    let to = local || R() < 0.4 ? pick(spots.doors) : harbor();
    // 人潮變多時大多往上走，變少時大多往下走
    if ((yOf(to) > yOf(from)) !== up && R() < 0.75) [from, to] = [to, from];
    if (Math.hypot(to.x - from.x, to.z - from.z) < 6) continue;
    const lo = Math.min(yOf(from), yOf(to)) - 0.5, hi = Math.max(yOf(from), yOf(to)) + 0.5;
    // 路上停的地方：攤位前、推車前、看風景的地方，還有在街上隨便站著聊兩句
    const linger = roads.areas.filter((a) => a.street && a.y != null && a.y >= lo && a.y <= hi).map((a) => ({
      x: a.x0 + 1 + R() * (a.x1 - a.x0 - 2), z: a.z0 + 2.2 + R() * Math.max(0, a.z1 - a.z0 - 3), heading: R() * Math.PI * 2, kind: 'linger', dwell: 15 + R() * 25,
    }));
    const pool = [...spots.shops.map((s) => ({ ...s, kind: 'shop', dwell: 10 + R() * 15 })), ...spots.carts.map((s) => ({ ...s, kind: 'cart', dwell: 12 + R() * 8 })), ...spots.views.map((s) => ({ ...s, kind: 'view', dwell: 20 + R() * 20 })), ...linger]
      .filter((s) => { const y = yOf(s); return y >= lo && y <= hi; });
    const stops = [];
    const nStops = attempt > 2 ? 1 : owl ? 3 : R() < 0.3 ? 1 : R() < 0.6 ? 2 : 3;
    if (owl) for (const s of pool) s.dwell *= attempt > 1 ? 1.5 : 2.5;
    for (let s = 0; s < nStops && pool.length; s++) stops.push(pool.splice(Math.floor(R() * pool.length), 1)[0]);
    // 先停離出發點近的那一攤
    stops.sort((a, b) => Math.hypot(a.x - from.x, a.z - from.z) - Math.hypot(b.x - from.x, b.z - from.z));
    const legs = [from, ...stops, to];
    const path = [], waits = [];
    let ok = true;
    for (let l = 0; l < legs.length - 1; l++) {
      const r = roads.route(legs[l], legs[l + 1]);
      if (!r) { ok = false; break; }
      if (path.length) path.pop();
      path.push(...r.map((p) => ({ x: p.x, z: p.z })));
      if (l < stops.length) waits[path.length - 1] = stops[l];
    }
    if (!ok) continue;
    const speed = 0.85 + R() * 0.4, pair = R() < 0.3, lane = (R() - 0.5) * 1.6;
    // 手上拿什麼：第一個買得到東西的攤位決定左手；沒買東西、又要往燈巷以上走的，有些人自己提一盞燈籠
    let hand = 'none', handT = 0, foodKind = 0, foodT = 0;
    const people = [];
    for (let p = 0; p < (pair ? 2 : 1); p++) {
      const off = pair ? lane + (p ? 0.45 : -0.45) : lane, delay = p ? 0.6 : 0;
      const pts = [], times = [];
      let t = 0;
      for (let n = 0; n < path.length; n++) {
        const a = path[n], b = path[n + 1], prv = path[n - 1];
        // 每個轉折點沿著前後兩段的平均方向往旁邊偏，折線一路連續；頭尾是門口和攤位，不偏
        let px = a.x, pz = a.z;
        if (n > 0 && n < path.length - 1 && !waits[n]) {
          const d1 = Math.atan2(a.x - prv.x, a.z - prv.z), d2 = Math.atan2(b.x - a.x, b.z - a.z), h = d1 + wrap(d2 - d1) / 2;
          px += Math.cos(h) * off;
          pz -= Math.sin(h) * off;
          const ar = roads.areas[roads.areaOf(a.x, a.z)];
          if (ar) {
            const m = ar.lo != null ? 0.45 : 0.5;
            px = Math.min(ar.x1 - m, Math.max(ar.x0 + m, px));
            pz = Math.min(ar.z1 - m, Math.max(ar.z0 + m, pz));
          }
        }
        if (n > 0) {
          const q = pts[pts.length - 1], len = Math.hypot(px - q.x, pz - q.z), dy = Math.abs(world.groundY(px, pz) - world.groundY(q.x, q.z));
          t += len / (speed * (dy > len * 0.2 ? 0.7 : 1));
        }
        pts.push({ x: px, z: pz });
        times.push(t + delay);
        const w = waits[n];
        if (w) {
          if (p === 0) {
            if (w.kind === 'shop' && SHOP_HAND[w.id] && hand === 'none') { hand = SHOP_HAND[w.id]; handT = t + w.dwell; }
            if (w.kind === 'cart' && CART_HAND[w.id] && hand === 'none') { hand = CART_HAND[w.id]; handT = t + w.dwell; }
            if (w.kind === 'cart' && CART_FOOD[w.id] && !foodKind) { foodKind = CART_FOOD[w.id]; foodT = t + w.dwell; }
          }
          t += w.dwell;
          pts.push({ x: px + (p ? 0.5 : 0), z: pz, heading: w.heading });
          times.push(t + delay);
        }
      }
      people.push({ pts, times, local: p === 0 ? local : R() < 0.85 });
    }
    const dur = people[people.length - 1].times.at(-1) + FADE;
    if (dur > TRIP - 8) continue;
    const top = Math.max(...path.map((q) => world.groundY(q.x, q.z)));
    if (hand === 'none' && top > 8.5 && R() < 0.35) hand = 'lantern';
    else if (hand === 'none' && R() < 0.05) hand = 'umbrella';
    for (const person of people) person.look = personLook(R, person.local, person === people[0] ? hand : top > 8.5 && R() < 0.2 ? 'lantern' : 'none');
    return { dur, people, handT, foodKind, foodT };
  }
  return null;
}

// 第 tt 秒，這個人在哪裡、面向哪裡、在不在走
function where(person, tt, out) {
  const { pts, times } = person;
  if (tt <= times[0]) return Object.assign(out, { x: pts[0].x, z: pts[0].z, heading: Math.atan2(pts[1].x - pts[0].x, pts[1].z - pts[0].z), walking: false });
  for (let n = 1; n < pts.length; n++) {
    if (tt > times[n]) continue;
    const a = pts[n - 1], b = pts[n], f = (tt - times[n - 1]) / Math.max(1e-3, times[n] - times[n - 1]);
    const still = Math.abs(a.x - b.x) + Math.abs(a.z - b.z) < 0.01;
    out.x = a.x + (b.x - a.x) * f;
    out.z = a.z + (b.z - a.z) * f;
    out.walking = !still;
    out.heading = still ? b.heading ?? out.heading : Math.atan2(b.x - a.x, b.z - a.z);
    return out;
  }
  const b = pts[pts.length - 1];
  return Object.assign(out, { x: b.x, z: b.z, walking: false });
}

export class Passersby {
  constructor({ scene, world, shadowTex, coarse = false, force = null }) {
    this.world = world;
    this.spots = world.crowdSpots;
    this.roads = new Roads(world);
    this.slots = coarse ? SLOTS_LOW : SLOTS;
    this.force = force != null && force !== '' && Number.isFinite(+force) ? Math.min(1, Math.max(0, +force)) : null;
    this.busy = 0;
    this.trips = new Array(this.slots).fill(null);
    this.obstacles = world.debug.obstacles;
    this.state = new Map();   // 每個人在畫面上的小狀態：讓路的偏移、轉頭、淡入
    // 完整的角色：一開始先建好，外觀之後換
    this.pool = [];
    for (let i = 0; i < (coarse ? POOL_LOW : POOL); i++) {
      const ch = new Character(shadowTex, presetLook(i));
      ch.group.visible = false;
      scene.add(ch.group);
      this.pool.push({ ch, key: null });
    }
    // 遠處的人：身體一個形狀、頭一個形狀，各自一次畫完
    const max = this.slots * 2;
    const mat = new THREE.MeshLambertMaterial({ flatShading: true });
    this.bodies = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.25, 0.85, 6).translate(0, 0.43, 0), mat, max);
    this.heads = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.17, 0).translate(0, 1.04, 0), mat, max);
    for (const m of [this.bodies, this.heads]) {
      m.count = 0;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
    }
    // 提燈籠的人手上那盞燈
    this.glows = glowPoints(Array.from({ length: max }, () => ({ x: 0, y: -50, z: 0, color: '#ffb060', size: 0 })));
    scene.add(this.glows);
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.c = new THREE.Color();
    this.at = { x: 0, z: 0, heading: 0, walking: false };
  }

  // 第 i 組人這一趟：換趟的時候重新排
  trip(i, now) {
    const ph = hash(i, 7) * TRIP, k = Math.floor((now - ph) / TRIP), start = k * TRIP + ph;
    let tr = this.trips[i];
    if (!tr || tr.k !== k) {
      if (this.planned++ >= PLANS) return null;
      const busy = this.force ?? busyAt(start);
      const go = i < OWLS || hash(i, k, 3) < busy;
      const up = (this.force ?? busyAt(start + 1800)) >= busy;
      // 大渡船十分鐘一班，停在岸邊的那幾分鐘才有人從渡船口上下（跟 haishi.js 的時刻表一樣）
      const f = start % 600, ferryIn = f > 90 && f < 300;
      tr = this.trips[i] = { k, start, plan: go ? makeTrip(this.roads, this.spots, i, k, start, up, ferryIn) : null };
    }
    return tr;
  }

  // 避開攤位、燈柱這些東西：在裡面的話推到最近的那一邊
  clear(p) {
    for (const o of this.obstacles) {
      const hw = o.hw + 0.25, hd = o.hd + 0.25, dx = p.x - o.x, dz = p.z - o.z;
      if (Math.abs(dx) >= hw || Math.abs(dz) >= hd) continue;
      if (hw - Math.abs(dx) < hd - Math.abs(dz)) p.x = o.x + Math.sign(dx || 1) * hw;
      else p.z = o.z + Math.sign(dz || 1) * hd;
    }
  }

  update(dt, player) {
    const now = Date.now() / 1000, world = this.world, P = player.pos;
    this.busy = this.force ?? busyAt(now);
    this.planned = 0;
    const people = [];
    for (let i = 0; i < this.slots; i++) {
      const tr = this.trip(i, now), plan = tr?.plan;
      if (!plan) continue;
      const tt = now - tr.start;
      if (tt > plan.dur) continue;
      plan.people.forEach((person, p) => {
        const a = where(person, tt, this.at), y = world.groundY(a.x, a.z);
        const t0 = person.times[0], t1 = person.times.at(-1);
        const alpha = Math.min(1, Math.max(0, (tt - t0) / FADE), Math.max(0, (t1 + FADE - tt) / FADE));
        if (alpha <= 0) return;
        const d = Math.hypot(a.x - P.x, a.z - P.z);
        people.push({ key: `${i}:${tr.k}:${p}`, i, p, person, plan, tt, x: a.x, z: a.z, y, heading: a.heading, walking: a.walking, alpha, d, near: d < NEAR && Math.abs(y - P.y) < NEAR_DY });
      });
    }
    // 近的先分到完整的角色
    const near = people.filter((q) => q.near).sort((a, b) => a.d - b.d).slice(0, this.pool.length);
    const keep = new Set(near.map((q) => q.key));
    for (const e of this.pool) if (e.key && !keep.has(e.key)) { e.key = null; e.ch.group.visible = false; }
    let rebuilt = 0;
    const shown = new Set();
    for (const q of near) {
      let e = this.pool.find((x) => x.key === q.key);
      if (!e) {
        if (rebuilt >= REBUILD) continue;
        e = this.pool.find((x) => !x.key);
        if (!e) continue;
        e.ch.setLook(q.person.look);
        e.ch.hold(0);
        e.key = q.key;
        e.ch.group.visible = true;
        e.ch.group.position.set(q.x, q.y, q.z);
        e.ch.group.rotation.y = q.heading;
        rebuilt++;
      }
      this.drive(e, q, dt, P, now);
      shown.add(q.key);
    }
    // 其他人：遠處的簡單人形
    let n = 0, g = 0;
    const pos = this.glows.geometry.attributes.position, size = this.glows.geometry.attributes.aSize;
    for (const q of people) {
      const look = q.person.look;
      if (look.hand === 'lantern' && q.tt >= (q.p ? 0 : q.plan.handT)) {
        const rx = Math.cos(q.heading), rz = -Math.sin(q.heading);
        pos.setXYZ(g, q.x - rx * 0.3, q.y + 0.7, q.z - rz * 0.3);
        size.setX(g++, 1.1 * q.alpha);
      }
      if (shown.has(q.key)) continue;
      const bob = q.walking ? Math.abs(Math.sin(q.tt * 7 + q.i)) * 0.05 : 0, s = q.alpha;
      this.q.setFromAxisAngle(this.v.set(0, 1, 0), q.heading);
      this.m4.compose(this.v.set(q.x, q.y + bob, q.z), this.q, this.s.set(s, s, s));
      this.bodies.setMatrixAt(n, this.m4);
      this.heads.setMatrixAt(n, this.m4);
      this.bodies.setColorAt(n, this.c.setHex(CLOTH[look.outer !== 'none' ? look.outC : look.topC]));
      this.heads.setColorAt(n, this.c.setHex(SKINS[look.skin]));
      n++;
    }
    for (let j = g; j < size.count; j++) size.setX(j, 0);
    pos.needsUpdate = size.needsUpdate = true;
    this.bodies.count = this.heads.count = n;
    for (const m of [this.bodies, this.heads]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    // 不在畫面上的人，小狀態丟掉
    if (this.state.size > 200) for (const k of this.state.keys()) if (!shown.has(k)) this.state.delete(k);
  }

  // 一個完整的角色這一幀：位置、讓路、轉身、轉頭、手上的東西、淡入淡出
  drive(e, q, dt, P, now) {
    const ch = e.ch, world = this.world;
    let st = this.state.get(q.key);
    if (!st) this.state.set(q.key, (st = { ox: 0, oz: 0, glanceT: 0, nextGlance: 0, head: 0 }));
    // 玩家靠近：往旁邊讓一點，讓開的地方要站得住
    let wx = 0, wz = 0;
    if (q.d < DODGE) {
      const rx = Math.cos(q.heading), rz = -Math.sin(q.heading), side = (P.x - q.x) * rx + (P.z - q.z) * rz > 0 ? -1 : 1, amt = (DODGE - q.d) * 0.7;
      if (world.walkable(q.x + rx * side * amt, q.z + rz * side * amt)) { wx = rx * side * amt; wz = rz * side * amt; }
    }
    st.ox += (wx - st.ox) * Math.min(1, dt * 4);
    st.oz += (wz - st.oz) * Math.min(1, dt * 4);
    const at = { x: q.x + st.ox, z: q.z + st.oz };
    this.clear(at);
    const G = ch.group.position, moved = Math.hypot(at.x - G.x, at.z - G.z);
    G.set(at.x, world.groundY(at.x, at.z), at.z);
    ch.group.rotation.y += wrap(q.heading - ch.group.rotation.y) * Math.min(1, dt * 6);
    ch.update(dt, q.walking ? Math.min(1.5, moved / Math.max(dt, 1e-3)) : 0);
    // 手上的東西：買了才拿出來；點心邊走邊咬，咬三口就沒了
    if (ch.handMesh) ch.handMesh.visible = q.person.look.hand !== 'none' && q.tt >= (q.p ? 0 : q.plan.handT);
    if (q.p === 0 && q.plan.foodKind) {
      const bites = Math.floor((q.tt - q.plan.foodT) / 4);
      ch.setFoodCode(q.tt < q.plan.foodT || bites >= 3 ? 0 : q.plan.foodKind * 10 + bites);
    }
    // 轉頭：玩家走到面前，偶爾看一眼就轉回去；兩個人一起走的，不時轉頭看旁邊那個
    let want = 0;
    const toP = Math.atan2(P.x - at.x, P.z - at.z), front = Math.abs(wrap(toP - ch.group.rotation.y)) < 1.0;
    if (st.glanceT > 0) {
      st.glanceT -= dt;
      want = wrap(toP - ch.group.rotation.y);
    } else if (q.d < 2.5 && front && now > st.nextGlance) {
      st.nextGlance = now + 40;
      if (hash(q.i, q.p, Math.floor(now / 40)) < GLANCE) st.glanceT = 1.2;
    } else if (q.plan.people.length > 1 && hash(q.i, Math.floor(now / 6)) < 0.35) {
      want = q.p ? 0.7 : -0.7;
    }
    st.head += (Math.max(-0.9, Math.min(0.9, want)) - st.head) * Math.min(1, dt * 5);
    ch.head.rotation.y = st.head;
    // 從門口出來、走進門裡：慢慢浮現、慢慢淡掉
    ch.setGhost(q.alpha > 0.98 ? 1 : Math.round(q.alpha * 20) / 20);
  }
}
