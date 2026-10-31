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
const SEP = 0.8, SEP_PAIR = 0.45;      // 不同組的人靠近到這個距離就互相推開；同行的兩個人只要不疊在一起
const PUSH_TRIES = [[1, 0], [0.5, 0], [1, 1.1], [1, -1.1], [0.6, 2.2], [0.6, -2.2]];   // [縮放, 轉幾弧度]
const PUSH_MAX = 0.8;                // 為了讓路最多偏離時間表多遠
const GLANCE = 0.15;                 // 玩家走到面前時，轉頭看一眼的機率
const OWLS = 2;                      // 夜貓子：不管幾點都在外面晃，每一站停很久，最冷清的時候街上也不會空掉
const PLAN_MS = 3;                   // 每一幀花在排行程上的時間（毫秒），超過就留到下一幀；至少排一趟。剛進來時不會一下子卡住

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
// 本地人分四種：碼頭工、攤商、鎮民、老一輩。碼頭邊多碼頭工，山上多老一輩。種族不挑
// 外地人：背包、夏威夷衫、運動鞋，全身中性色，只有一件亮的
const LOCAL = {
  hat: ['none', 'none', 'none', 'none', 'none', 'straw', 'straw'],
  top: ['shirt', 'tee', 'tank', 'sweater', 'robe', 'shirt'],
  bottom: ['pants', 'pants', 'shorts', 'skirt', 'hakama', 'robe'],
  outer: ['none', 'none', 'none', 'haori', 'haori', 'apron', 'vest', 'mino'],
  shoes: ['geta', 'geta', 'slippers', 'slippers', 'rainboots', 'boots'],
  neck: ['none', 'none', 'none', 'towel', 'scarf'],
  back: ['none', 'none', 'none', 'none', 'pouch', 'satchel'],
};
// 布的顏色用 CLOTH 的色號。一個人一個主色（大件）、一個底色（麻、洗舊的布，夜裡燈籠照得到），點綴最多一處、只在小件上
// 藍染 5 19 24 22 25、薯莨 26 27 18、麻 28 29 23、柿澀 30、苔綠 31；點綴茜紅 32、薑黃 33
const ROLES = {
  dock: {
    main: [5, 5, 19, 24, 24, 25, 22], base: [28, 29, 25],
    look: { ...LOCAL, hat: ['none', 'none', 'straw', 'straw'], top: ['tank', 'tee', 'shirt', 'tank'], bottom: ['shorts', 'pants', 'pants'],
      outer: ['none', 'none', 'none', 'mino', 'apron', 'vest'], shoes: ['rainboots', 'rainboots', 'slippers', 'geta'], neck: ['towel', 'towel', 'none'] },
  },
  shop: {
    main: [26, 27, 27, 30, 31, 24, 5], base: [28, 29, 23],
    look: { ...LOCAL, outer: ['apron', 'apron', 'apron', 'none', 'vest', 'haori'], top: ['shirt', 'shirt', 'sweater', 'tee'] },
  },
  town: { main: [5, 19, 24, 24, 26, 27, 31, 30], base: [28, 29, 23, 25], look: LOCAL },
  elder: {
    main: [26, 26, 27, 22, 18, 5, 31], base: [29, 23, 28],
    look: { ...LOCAL, top: ['robe', 'robe', 'shirt', 'sweater'], bottom: ['hakama', 'hakama', 'robe', 'pants'],
      outer: ['haori', 'haori', 'none', 'vest'], shoes: ['geta', 'geta', 'slippers'], neck: ['none', 'none', 'scarf'] },
  },
};
// 在哪裡出沒 → 各種人的比例
const ROLE_MIX = {
  harbor: ['dock', 'dock', 'dock', 'dock', 'dock', 'dock', 'town', 'town', 'town', 'shop'],
  mid: ['town', 'town', 'town', 'town', 'town', 'shop', 'shop', 'shop', 'dock', 'elder'],
  upper: ['elder', 'elder', 'elder', 'elder', 'town', 'town', 'town', 'town', 'shop', 'shop'],
};
const ACCENT = [32, 33, 30];
const SHOE_C = [18, 26, 27, 29], BAG_C = [27, 29, 23, 18], HAND_C = [33, 32, 28, 30];
const LOCAL_HAIR = [0, 0, 1, 1, 1, 2], ELDER_HAIR = [1, 2, 4, 4], LOCAL_HAT = [2, 1, 6];
// 外地人：衣服大多中性色，挑一件用亮色
const PLAIN = [21, 22, 18, 23, 29, 26, 0];
const BRIGHT = [8, 9, 11, 12, 13, 14, 15, 20, 3, 6];
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
const COLOR_KEYS = ['topC', 'topC2', 'botC', 'botC2', 'outC', 'outC2', 'oneC', 'oneC2', 'shoeC', 'neckC', 'backC', 'handC'];

// zone：harbor 走到碼頭的、upper 走到燈巷以上的、其他 mid
function personLook(R, local, hand, zone) {
  const pick = (a) => a[Math.floor(R() * a.length)];
  const race = RACES[Math.floor(R() * RACES.length)], L = presetLook(0);
  const role = local ? ROLES[pick(ROLE_MIX[zone])] : null;
  for (const [k, v] of Object.entries(role ? role.look : OUTSIDE)) L[k] = pick(v);
  for (const [k, v] of Object.entries(FACE)) L[k] = pick(v);
  L.race = race.id;
  L.skin = R() < 0.6 && race.skin != null ? race.skin : Math.floor(R() * SKINS.length);
  L.one = local && R() < 0.08 ? 'yukata' : 'none';
  L.hand = hand;
  if (role) {
    const main = pick(role.main), base = pick(role.base);
    let accent = R() < 0.4 ? pick(ACCENT) : -1;   // 這個人身上唯一的點綴，用掉就沒了
    const spend = (fallback) => { const c = accent >= 0 ? accent : fallback; accent = -1; return c; };
    if (L.outer !== 'none') Object.assign(L, { outC: main, outC2: base, topC: base, topC2: main, botC: R() < 0.6 ? main : pick(role.base) });
    else Object.assign(L, { outC: main, outC2: base, topC: main, topC2: base, botC: base });
    L.botC2 = L.botC === main ? base : main;
    Object.assign(L, { oneC: main, oneC2: base, shoeC: pick(SHOE_C), backC: pick(BAG_C), handC: pick(HAND_C) });
    L.topPat = pick(['plain', 'plain', 'plain', 'stripe', 'band']);
    L.botPat = pick(['plain', 'plain', 'stripe']);
    if (L.topPat === 'band') L.topC2 = spend(L.topC2);
    L.neckC = L.neck === 'scarf' ? spend(main) : spend(base);
    L.hairC = pick(role === ROLES.elder ? ELDER_HAIR : LOCAL_HAIR);
    L.hatC = pick(LOCAL_HAT);
  } else {
    for (const k of COLOR_KEYS) L[k] = pick(PLAIN);
    // 夏威夷衫本身就是那件亮的；其他人挑上衣、外套或背包其中一件
    const loud = L.top === 'hawaii' ? 'topC' : pick(L.outer !== 'none' ? ['topC', 'outC', 'backC'] : ['topC', 'backC', 'backC']);
    L[loud] = pick(BRIGHT);
    L.handC = pick(HAND_C);
    L.hairC = Math.floor(R() * 8);
    L.hatC = Math.floor(R() * 8);
    L.topPat = pick(['plain', 'plain', 'stripe', 'dot']);
    L.botPat = pick(['plain', 'plain', 'stripe']);
  }
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
    this.bends = new Map();
  }

  // 基本路線上兩個固定的點之間怎麼繞，算過就記起來
  detour(a, b) {
    const key = `${a.x.toFixed(2)},${a.z.toFixed(2)}>${b.x.toFixed(2)},${b.z.toFixed(2)}`;
    let d = this.bends.get(key);
    if (!d) {
      if (this.bends.size > 4000) this.bends.clear();
      this.bends.set(key, (d = detour(this.world, a, b)));
    }
    return d;
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

// ---------- 站位 ----------
// 停下來的地方不是一個點，是客人面向的方向上排開的幾個站位：前排四個、後排三個（離櫃台遠一點）。
// 每組人停站時隨機挑一個，同行的兩個人左右各偏 0.3；站位站不住（被東西擋著、在邊上）就往中間收，最後回到原本那個點
const STAND_FRONT = [-0.9, -0.3, 0.3, 0.9], STAND_BACK = [-0.6, 0, 0.6];
function standAt(world, w, slot, p, pair) {
  const f = w.heading ?? 0;
  // 先試挑到的站位，站不住就換下一個，七個都不行才往中間收
  for (const s of [1, 0.5, 0]) for (let o = 0; o < 7; o++) {
    const sl = (slot + o) % 7, row = sl < 4 ? 0 : 1;
    const lat = (row ? STAND_BACK[sl - 4] : STAND_FRONT[sl]) + (pair ? (p ? 0.3 : -0.3) : 0), dep = row ? -0.9 : 0;
    const x = w.x + (Math.cos(f) * lat + Math.sin(f) * dep) * s, z = w.z + (-Math.sin(f) * lat + Math.cos(f) * dep) * s;
    if (world.walkable(x, z)) return { x, z };
    if (s === 0) break;
  }
  return { x: w.x, z: w.z };
}
// 出發點和終點（門口、棧橋、船邊）也散開一點，一群人同時從同一個點冒出來會疊在一起
function scatter(world, p, R, rad) {
  const a = R() * Math.PI * 2, rr = Math.sqrt(R()) * rad;
  for (const s of [1, 0.5]) {
    const x = p.x + Math.cos(a) * rr * s, z = p.z + Math.sin(a) * rr * s;
    if (world.walkable(x, z)) return { x, z };
  }
  return p;
}

// 從 a 走到 b 一路都站得住嗎（頭尾不算，攤位前的站位本來就貼著東西）
function segClear(world, a, b) {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.25);
  for (let i = 1; i < n; i++) if (!world.walkable(a.x + ((b.x - a.x) * i) / n, a.z + ((b.z - a.z) * i) / n)) return false;
  return true;
}

// 從 a 到 b 被擋住時繞過去的點：先在中點往兩側試幾個距離，兩半都走得通就用這一個轉折（大多是擦到攤位、燈柱、轉角）；
// 都不行才用尋路（full），尋路比較貴
const BENDS = [0.4, -0.4, 0.8, -0.8, 1.3, -1.3, 2, -2];
function detour(world, a, b, full = true) {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  if (len > 0.01) {
    const nx = -(b.z - a.z) / len, nz = (b.x - a.x) / len, mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    for (const s of BENDS) {
      const m = { x: mx + nx * s, z: mz + nz * s };
      if (world.walkable(m.x, m.z) && segClear(world, a, m) && segClear(world, m, b)) return [m];
    }
  }
  if (!full) return [];
  const d = world.findPath(a.x, a.z, b.x, b.z);
  return d && d.length > 1 ? d.slice(0, -1).map((m) => ({ x: m.x, z: m.z })) : [];
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
    for (let s = 0; s < nStops && pool.length; s++) {
      const w = pool.splice(Math.floor(R() * pool.length), 1)[0];
      w.slot = R() < 0.65 ? Math.floor(R() * 4) : 4 + Math.floor(R() * 3);
      stops.push(w);
    }
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
    // 基本路線（路網的節點、攤位、門口）上被擋住的段，先補上繞過去的點；每個人再從這條線各自偏開
    const base = [];
    for (let n = 0; n < path.length; n++) {
      const q = { x: path[n].x, z: path[n].z, w: waits[n] }, a = base[base.length - 1];
      if (a && !segClear(world, a, q)) base.push(...roads.detour(a, q));
      base.push(q);
    }
    // 一律往自己行進方向的同一側偏：走相反方向的人自然分在兩邊。走得快的靠內側（偏得少），慢的靠外側，超車才不會穿過去
    const speed = 0.85 + R() * 0.4, pair = R() < 0.3, lane = 0.3 + ((1.25 - speed) / 0.4) * 0.7;
    // 手上拿什麼：第一個買得到東西的攤位決定左手；沒買東西、又要往燈巷以上走的，有些人自己提一盞燈籠
    let hand = 'none', handT = 0, foodKind = 0, foodT = 0;
    const people = [];
    for (let p = 0; p < (pair ? 2 : 1); p++) {
      const off = lane + (p ? 0.55 : 0), delay = p ? 0.4 + R() * 1.0 : 0, sp = speed * (p ? 0.96 + R() * 0.08 : 1), dwellK = p ? 0.9 + R() * 0.2 : 1;
      // 第一步：每個折點往自己那一側偏（頭尾是門口和攤位，另外散開、站位），偏過去站不住就少偏一點
      const raw = [];
      for (let n = 0; n < base.length; n++) {
        const a = base[n], b = base[n + 1], prv = base[n - 1], w = a.w;
        let px = a.x, pz = a.z;
        if (w) ({ x: px, z: pz } = standAt(world, w, w.slot, p, pair));
        else if (n === 0 || n === base.length - 1) ({ x: px, z: pz } = scatter(world, { x: px, z: pz }, R, legs[n ? legs.length - 1 : 0].id ? 1.1 : 0.3));
        else {
          const d1 = Math.atan2(a.x - prv.x, a.z - prv.z), d2 = Math.atan2(b.x - a.x, b.z - a.z), h = d1 + wrap(d2 - d1) / 2;
          const ar = roads.areas[roads.areaOf(a.x, a.z)], m = ar && ar.lo != null ? 0.45 : 0.5;
          for (const s of [1, 0.6, 0.3]) {
            let x = a.x + Math.cos(h) * off * s, z = a.z - Math.sin(h) * off * s;
            if (ar) { x = Math.min(ar.x1 - m, Math.max(ar.x0 + m, x)); z = Math.min(ar.z1 - m, Math.max(ar.z0 + m, z)); }
            if (world.walkable(x, z)) { px = x; pz = z; break; }
          }
        }
        raw.push({ x: px, z: pz, w });
      }
      // 第二步：偏開以後又擦到攤位、燈柱、房角的段，在中間加一個轉折繞過去（不然走到障礙物上會被推到邊邊，黏在那裡滑）
      const seq = [];
      for (const r of raw) {
        const a = seq[seq.length - 1];
        if (a && !segClear(world, a, r)) seq.push(...detour(world, a, r));
        seq.push(r);
      }
      // 第三步：照走的距離排時間，停站的地方同一點出現兩次
      const pts = [], times = [];
      let t = 0;
      for (let n = 0; n < seq.length; n++) {
        const { x: px, z: pz, w } = seq[n];
        if (n > 0) {
          const q = pts[pts.length - 1], len = Math.hypot(px - q.x, pz - q.z), dy = Math.abs(world.groundY(px, pz) - world.groundY(q.x, q.z));
          t += len / (sp * (dy > len * 0.2 ? 0.7 : 1));
        }
        pts.push({ x: px, z: pz });
        times.push(t + delay);
        if (w) {
          if (p === 0) {
            if (w.kind === 'shop' && SHOP_HAND[w.id] && hand === 'none') { hand = SHOP_HAND[w.id]; handT = t + w.dwell; }
            if (w.kind === 'cart' && CART_HAND[w.id] && hand === 'none') { hand = CART_HAND[w.id]; handT = t + w.dwell; }
            if (w.kind === 'cart' && CART_FOOD[w.id] && !foodKind) { foodKind = CART_FOOD[w.id]; foodT = t + w.dwell; }
          }
          t += w.dwell * dwellK;
          pts.push({ x: px, z: pz, heading: w.heading });
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
    const zone = spots.harbor.includes(from) || spots.harbor.includes(to) ? 'harbor' : top > 8.5 ? 'upper' : 'mid';
    for (const person of people) person.look = personLook(R, person.local, person === people[0] ? hand : top > 8.5 && R() < 0.2 ? 'lantern' : 'none', zone);
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
    this.planned = 0;
    this.deadline = 0;
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
      if (this.planned++ > 0 && performance.now() > this.deadline) return null;
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
    this.deadline = performance.now() + PLAN_MS;
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
        people.push({ key: `${i}:${tr.k}:${p}`, i, p, person, plan, tt, x: a.x, z: a.z, y, heading: a.heading, walking: a.walking, alpha, d, fx: a.x, fz: a.z, fy: y, jit: (hash(i, p, tr.k, 5) - 0.5) * 0.7, near: d < NEAR && Math.abs(y - P.y) < NEAR_DY });
      });
    }
    // 所有人（不只近處的）互相推開、算好這一幀站的位置 fx、fz；每個人的偏移跟著編號走，變成近處的角色也不會跳
    this.separate(people);
    for (const q of people) this.settle(q, dt, P);
    this.last = people;   // 量測工具用
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
        // 步伐、呼吸、帽子晃動的相位各自隨機，一群人不會手腳一起擺
        e.ch.phase = hash(q.i, q.p, 21) * Math.PI * 2;
        e.ch.time = hash(q.i, q.p, 22) * 60;
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
        pos.setXYZ(g, q.fx - rx * 0.3, q.fy + 0.7, q.fz - rz * 0.3);
        size.setX(g++, 1.1 * q.alpha);
      }
      if (shown.has(q.key)) continue;
      const bob = q.walking ? Math.abs(Math.sin(q.tt * 7 + q.i)) * 0.05 : 0, s = q.alpha;
      this.q.setFromAxisAngle(this.v.set(0, 1, 0), q.heading);
      this.m4.compose(this.v.set(q.fx, q.fy + bob, q.fz), this.q, this.s.set(s, s, s));
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
    if (this.state.size > 300) {
      const live = new Set(people.map((q) => q.key));
      for (const k of this.state.keys()) if (!live.has(k)) this.state.delete(k);
    }
  }

  stateOf(key) {
    let st = this.state.get(key);
    if (!st) this.state.set(key, (st = { ox: 0, oz: 0, sx: 0, sz: 0, glanceT: 0, nextGlance: 0, head: 0 }));
    return st;
  }

  // 所有的人互相推開：每一對靠得太近就沿著連線各退一點，只算在自己的畫面上，不動時間表。
  // 一個在走、一個站著，走的人全讓；兩個都在走或都站著，各讓一半。推開的量放在 st.sx、st.sz，drive 再慢慢追上去
  separate(people) {
    for (const q of people) { const st = this.stateOf(q.key); st.sx = st.sz = 0; }
    for (let a = 0; a < people.length; a++) {
      const A = people[a], sa = this.state.get(A.key);
      for (let b = a + 1; b < people.length; b++) {
        const B = people[b], R = A.i === B.i ? SEP_PAIR : SEP;
        let dx = A.x - B.x, dz = A.z - B.z;
        if (dx > R || dx < -R || dz > R || dz < -R || Math.abs(A.y - B.y) > 1.5) continue;
        let d = Math.hypot(dx, dz);
        if (d >= R) continue;
        // 剛好站在同一個點：用兩人編號算一個固定的方向，大家看到的都一樣，不會抖
        if (d < 0.02) {
          const ang = hash(Math.min(A.i, B.i), Math.max(A.i, B.i), A.i === B.i ? A.p + B.p : 9) * Math.PI * 2, flip = A.i === B.i ? (A.p < B.p ? 1 : -1) : A.i < B.i ? 1 : -1;
          dx = Math.cos(ang) * flip;
          dz = Math.sin(ang) * flip;
          d = 1;
        }
        const over = R - Math.min(d, R), ux = dx / d, uz = dz / d, wa = A.walking, wb = B.walking;
        const ka = wa === wb ? 0.5 : wa ? 1 : 0, kb = wa === wb ? 0.5 : wb ? 1 : 0, sb = this.state.get(B.key);
        sa.sx += ux * over * ka; sa.sz += uz * over * ka;
        sb.sx -= ux * over * kb; sb.sz -= uz * over * kb;
      }
    }
  }

  // 這個人這一幀實際站在哪：時間表的位置加上讓開的偏移（玩家靠近、跟別人互推），偏移追著目標慢慢變
  settle(q, dt, P) {
    const st = this.stateOf(q.key), world = this.world;
    // 要讓開多少：玩家靠近往旁邊讓一點，加上跟別人互推的量；總量有上限，讓開的地方要站得住，站不住就少讓一點
    let tx = st.sx, tz = st.sz;
    if (q.d < DODGE) {
      const rx = Math.cos(q.heading), rz = -Math.sin(q.heading), side = (P.x - q.x) * rx + (P.z - q.z) * rz > 0 ? -1 : 1, amt = (DODGE - q.d) * 0.7;
      tx += rx * side * amt;
      tz += rz * side * amt;
    }
    const tl = Math.hypot(tx, tz);
    if (tl > PUSH_MAX) { tx *= PUSH_MAX / tl; tz *= PUSH_MAX / tl; }
    if (tl > 0.01) {
      // 這個方向站不住就少讓一點，再不行就斜著、橫著讓；都不行才不動
      let ok = false;
      for (const [k, a] of PUSH_TRIES) {
        const c = Math.cos(a) * k, s = Math.sin(a) * k, x = tx * c - tz * s, z = tx * s + tz * c;
        if (world.walkable(q.x + x, q.z + z)) { tx = x; tz = z; ok = true; break; }
      }
      if (!ok) tx = tz = 0;
    }
    // 讓開的時候動作快一點，回到原位慢一點，不會一下推開一下彈回來
    const rate = Math.hypot(tx, tz) >= Math.hypot(st.ox, st.oz) ? 7 : 2;
    st.ox += (tx - st.ox) * Math.min(1, dt * rate);
    st.oz += (tz - st.oz) * Math.min(1, dt * rate);
    const at = { x: q.x + st.ox, z: q.z + st.oz };
    this.clear(at);
    q.fx = at.x;
    q.fz = at.z;
    q.fy = world.groundY(at.x, at.z);
  }

  // 一個完整的角色這一幀：位置、轉身、轉頭、手上的東西、淡入淡出
  drive(e, q, dt, P, now) {
    const ch = e.ch;
    const st = this.stateOf(q.key);
    const at = { x: q.fx, z: q.fz };
    const G = ch.group.position, moved = Math.hypot(at.x - G.x, at.z - G.z);
    G.set(at.x, q.fy, at.z);
    const face = q.walking ? q.heading : q.heading + q.jit + Math.sin(now * 0.4 + q.i * 1.7) * 0.12;
    ch.group.rotation.y += wrap(face - ch.group.rotation.y) * Math.min(1, dt * 6);
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
