// 訪客：不定期從西邊海上來的冒險者。搭小帆船靠在棧橋盡頭，上岸先跟長桌的海牛聊天，
// 吃點心、進屋看畫、坐一坐，最後走回船上，船開回霧裡。
// 跟動物一樣，哪一段時間有誰來、走去哪、做什麼、說什麼，都由「現在是第幾段時間」雜湊算出來，
// 每位玩家看到的一樣，不用傳任何資料。
// 要去的地方（畫、長桌的座位、海牛、鏡子、長椅）都是建好世界之後才從世界資料裡找，
// 房間格局或畫作換了，訪客自己會跟上。行程只用直線距離估時間，尋路等走到那一段才算。
// 跟玩家的互動（轉頭、打招呼、聊天）只演在自己的畫面上，位置不離開行程。
// 玩家不能穿過站在地上的訪客；小狗會跑去迎接走在草原上的訪客，雞和鴨會被他們嚇跑（見 animals.js）。
// 每位訪客合併成六個網格，最多三位；沒有訪客的時段整個模組只算一個時段編號。
import * as THREE from 'three';
import { Kit } from './props.js';
import { hull } from './harbor.js';
import { REFLECT_LAYER } from './outdoor.js';
import { ANIMAL_LAYER, LIT, GLOW, geo, hash, wrapAngle, along } from './animals.js';

const SLOT = 600;          // 每段幾秒，一段最多來一船
const CHANCE = 0.6;        // 一段有船來的機率
const BOAT_V = 3, EASE = 10;   // 船速（公尺／秒）；靠岸減速、離岸加速的距離
const HOP = 1;             // 上下船跳一下幾秒
const SAY_TIME = 3500, HEAR = 16, GREET_R = 3.2;
const DODGE = 0.7;        // 側身讓開時跟玩家留的距離
const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- 台詞 ----------
// {f} 吃的東西、{t} 畫名、{m} 媒材、{y} 年份。資料裡沒有的就不選那一句

const LINES = {
  land: ['到了到了', '終於靠岸了', '腳踩到地的感覺真好', '這裡還是一樣漂亮'],
  walk: ['先去打個招呼', '好香 是點心的味道', '慢慢走 不急', '畫廊在那邊'],
  chat: ['海牛！好久不見', '這次從西邊的海過來', '最近有新的畫嗎', '路上遇到一場暴風雨', '我帶了海那邊的故事', '你看起來氣色不錯'],
  eat: ['這{f}好好吃', '再一口就好', '{f}還是溫的', '冒險的時候都吃不到這個', '可以帶一點走嗎'],
  view: ['「{t}」……', '這幅{t}我很喜歡', '{m}的質感真好', '畫裡的光是從哪裡來的', '這顏色在我們那邊找不到', '{y}年畫的啊', '想買回去掛在營地', '站遠一點看比較好'],
  bench: ['坐一下', '腳好痠', '風好舒服', '這裡看得到海'],
  mirror: ['我今天看起來還不錯', '這件披風是不是有點舊了', '嗯 很帥'],
  leave: ['該走了', '下次再來', '海牛再見', '回船上囉'],
  greet: ['你好', '嗨', '你也是來看畫的嗎', '小學徒你好'],
  dog: ['小狗你好', '好乖好乖', '哈哈 不要舔我', '你來接我們啊'],
  talk: ['我們從西邊的海來的', '你的帽子不錯', '這裡的海牛人很親切', '下一站要去北方的雪山', '有空來我們的營地坐坐', '你知道白塔那艘黑船是誰的嗎'],
  talkView: ['你覺得這幅怎麼樣', '我看不太懂 但很喜歡'],
  talkEat: ['桌上的東西可以吃喔', '這個你吃過了嗎'],
};
// 海牛回話
const HOST_REPLIES = ['哈哈 歡迎', '你又來啦', '桌上的隨便吃', '新的畫在裡面', '路上還好嗎', '讚', '哈哈哈', '要吃自己拿'];

const FOODS = [
  { name: '麵包', build: (k) => k.ball(0.07, '#c8843f', 0, 0, 0, { sx: 1.5, sy: 0.75, sz: 0.9 }) },
  { name: '蘋果', build: (k) => { k.ball(0.055, '#c8382a', 0, 0, 0); k.box(0.008, 0.03, 0.008, '#4a3020', 0, 0.065, 0); } },
  { name: '起司', build: (k) => k.cyl(0.08, 0.08, 0.06, '#f0cc70', 0, 0, 0, {}, 3) },
];

function fill(tpl, ctx) {
  let ok = true;
  const s = tpl.replace(/\{(\w)\}/g, (_, c) => {
    const v = ctx[c];
    if (v == null || v === '') ok = false;
    return v ?? '';
  });
  return ok ? s : null;
}

// ---------- 造型 ----------
// 共用一副冒險者的身體：原點在腳底，面向 +z。頭、手、腳各自繞關節轉。W 是身體的寬度倍數

const TUNICS = ['#3d5a7a', '#7a3b2e', '#4a6a3a', '#6b4a7a', '#8a6a2f', '#2f5d62', '#7a5a4a', '#4a4a5a'];
const CLOAKS = ['#2a3a2a', '#5a2a2a', '#2a2a4a', '#4a3a2a', '#6a5a3a', '#3a2a3a'];
const LEATHER = '#5a3a24', DARK = '#2a1e18', METAL = '#a0a6ae', GOLD = '#d4a54a', WOOD = '#7a5432';
const HIP = 0.42, SHOULDER = 0.84, NECK = 0.92;

// 兩點之間的一根棍子（圓柱或方條），軸向對準 a → b
function rod(k, a, b, r, c, o = {}) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz);
  const at = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], rot = { rx: Math.acos(dy / L), ry: Math.atan2(dx, dz) };
  if (o.flat) k.box(r * 2, L, o.flat, c, ...at, rot);
  else k.cyl(r, o.r2 ?? r, L, c, ...at, rot, o.seg || 6);
}

const eyes = (k, x, y, z, r = 0.03, c = '#1a1412') => { for (const s of [-1, 1]) k.ball(r, c, s * x, y, z); };

// 頭：原點在脖子上。c 是毛色或膚色，c2 是嘴邊或花紋
const HEADS = {
  bull(k, c, c2) {
    k.ball(0.22, c, 0, 0.2, 0, { sx: 1.05 });
    k.box(0.27, 0.2, 0.2, c2, 0, 0.12, 0.18);
    for (const s of [-1, 1]) {
      k.ball(0.028, '#1a1210', s * 0.06, 0.15, 0.285);
      k.cone(0.06, 0.3, '#e8dcc0', s * 0.27, 0.33, 0, { rz: -s * 1.15 });
      k.cone(0.042, 0.2, '#f4ecd8', s * 0.41, 0.46, 0, { rz: -s * 0.25 });
      k.box(0.15, 0.06, 0.09, c, s * 0.25, 0.22, -0.03, { rz: s * 0.4 });
    }
    k.torus(0.045, 0.012, Math.PI * 2, GOLD, 0, 0.05, 0.285);
    eyes(k, 0.11, 0.26, 0.17);
    k.ball(0.08, c2, 0, 0.38, 0.06, { sy: 0.6 });
  },
  cat(k, c, c2) {
    k.ball(0.2, c, 0, 0.21, 0, { sy: 0.95 });
    k.ball(0.08, c2, 0, 0.13, 0.16, { sx: 1.3, sy: 0.8 });
    k.box(0.04, 0.025, 0.02, '#d88a9a', 0, 0.17, 0.235);
    for (const s of [-1, 1]) {
      k.cone(0.075, 0.15, c, s * 0.115, 0.37, -0.01, { rz: -s * 0.3 });
      k.cone(0.04, 0.09, '#e8b0b0', s * 0.112, 0.36, 0.02, { rz: -s * 0.3 });
      k.ball(0.036, '#8ad04a', s * 0.08, 0.23, 0.162, { sz: 0.6 });
      k.box(0.008, 0.045, 0.01, '#000000', s * 0.08, 0.23, 0.185);
      for (const dy of [0, 0.03]) rod(k, [s * 0.06, 0.13 + dy, 0.21], [s * 0.2, 0.15 + dy * 2, 0.19], 0.003, '#f4f0e8', { seg: 3 });
    }
  },
  dog(k, c, c2) {
    k.ball(0.2, c, 0, 0.21, 0);
    k.box(0.15, 0.12, 0.2, c2, 0, 0.13, 0.2);
    k.ball(0.035, '#1a1210', 0, 0.18, 0.305);
    k.box(0.06, 0.012, 0.06, '#d8707a', 0, 0.065, 0.24);
    for (const s of [-1, 1]) k.box(0.075, 0.2, 0.11, c2, s * 0.2, 0.17, -0.01, { rz: s * 0.28 });
    eyes(k, 0.075, 0.25, 0.165);
  },
  goat(k, c, c2) {
    k.ball(0.19, c, 0, 0.21, -0.02);
    for (const [x, z] of [[-0.08, 0], [0.08, 0], [0, -0.07]]) k.ball(0.09, c, x, 0.36, z);
    k.box(0.13, 0.2, 0.15, c2, 0, 0.12, 0.13);
    k.cone(0.04, 0.12, c, 0, -0.01, 0.16, { rx: Math.PI });
    for (const s of [-1, 1]) {
      k.torus(0.08, 0.032, Math.PI * 1.6, '#8a7a62', s * 0.17, 0.3, -0.02, { ry: Math.PI / 2, rz: -0.5 });
      k.box(0.13, 0.04, 0.06, c2, s * 0.2, 0.2, 0.03, { rz: -s * 0.2 });
      k.ball(0.03, '#d8b040', s * 0.075, 0.24, 0.17);
      k.box(0.03, 0.01, 0.01, '#1a1412', s * 0.075, 0.24, 0.198);
    }
  },
  // 綠皮大眼：一雙黑亮的大眼睛、管狀的嘴，頭頂一排小刺
  bigeye(k, c, c2) {
    k.ball(0.2, c, 0, 0.22, 0, { sy: 1.1 });
    for (const s of [-1, 1]) {
      k.ball(0.075, '#0e1216', s * 0.1, 0.24, 0.13, { sx: 0.85 });
      k.cone(0.06, 0.12, c, s * 0.2, 0.3, -0.02, { rz: -s * 1.2 });
    }
    k.cone(0.05, 0.14, c2, 0, 0.12, 0.22, { rx: Math.PI / 2 });
    for (let i = 0; i < 3; i++) k.cone(0.03, 0.09, c2, 0, 0.42 - i * 0.04, -0.03 - i * 0.08, { rx: -0.5 - i * 0.35 });
  },
  // 觸鬚頭：腦後垂下兩條粗觸鬚到背上，額頭一圈金飾
  tails(k, c, c2) {
    k.ball(0.19, c, 0, 0.22, 0);
    for (const s of [-1, 1]) {
      rod(k, [s * 0.08, 0.25, -0.1], [s * 0.1, -0.32, -0.2], 0.07, c, { r2: 0.03 });
      k.ball(0.04, '#f4f0e8', s * 0.075, 0.22, 0.165, { sz: 0.6 });
      k.ball(0.02, '#2a1a3a', s * 0.075, 0.22, 0.185);
    }
    k.torus(0.19, 0.014, Math.PI * 2, GOLD, 0, 0.3, 0.01, { rx: Math.PI / 2 + 0.25 });
    k.ball(0.03, c2, 0, 0.32, 0.19);
  },
  // 錘頭：細長的脖子頂著一根橫著的頭，眼睛長在兩端
  hammer(k, c, c2) {
    k.cyl(0.07, 0.1, 0.32, c, 0, 0.14, 0.02, { rx: -0.2 });
    k.ball(0.14, c, 0, 0.36, 0.05, { sx: 1.9, sy: 0.75 });
    for (const s of [-1, 1]) {
      k.ball(0.065, c2, s * 0.24, 0.37, 0.07);
      k.ball(0.045, '#e0a030', s * 0.26, 0.38, 0.11);
    }
    k.box(0.15, 0.035, 0.05, c2, 0, 0.25, 0.14);
  },
  // 鬚臉：頭往前上方拉長，嘴邊垂下四條短觸手，眼睛在兩側
  squid(k, c, c2) {
    k.ball(0.2, c, 0, 0.23, 0.02, { sy: 1.2, sz: 1.1 });
    for (const s of [-1, 1]) {
      k.ball(0.035, '#f08a2a', s * 0.15, 0.25, 0.1);
      for (const x of [0.04, 0.11]) rod(k, [s * x, 0.12, 0.15], [s * x * 1.2, -0.12, 0.2], 0.03, c2, { r2: 0.01 });
    }
  },
};

// 物種：名字、身形、頭、毛色候選、常帶的武器。外星旅人是不同星球來的
const SPECIES = {
  minotaur: { name: '牛頭人冒險者', head: 'bull', scale: 1.3, W: 1.25, skins: [['#6a4630', '#9a7058'], ['#3e2c22', '#6a5040'], ['#8a5a3a', '#b88a68']], weapons: ['greatsword', 'axe'], armor: ['plate', 'leather'], voice: { land: ['哞 靠岸'], walk: ['這門框也太矮了'], chat: ['我上個月打倒一棵會走路的樹'], eat: ['一口就沒了', '這{f}太小了吧'], view: ['看不太懂 但很有氣勢', '這幅畫很有力量'], greet: ['哞 你好'], talk: ['我的武器比你還高'] } },
  cat: { name: '貓頭人', head: 'cat', scale: 1, W: 0.95, skins: [['#d8893a', '#f4e4c8'], ['#8a8a92', '#e8e4e0'], ['#3a3036', '#c8c0c0'], ['#f0e6d8', '#ffffff']], weapons: ['dagger', 'bow', 'sword'], armor: ['cloak', 'leather'], voice: { dog: ['走開走開', '不要過來……'], land: ['腳不要弄濕……'], chat: ['有沒有魚'], eat: ['有魚嗎', '這個勉強可以'], view: ['構圖還行', '嗯……還可以', '這個藍色我喜歡'], bench: ['這位子是我的'], greet: ['喵'], talk: ['不要摸我的耳朵'] } },
  dog: { name: '狗頭人', head: 'dog', scale: 1.08, W: 1, skins: [['#c8803e', '#f2e0c4'], ['#5a4232', '#c8a888'], ['#e8dcc8', '#a07850']], weapons: ['sword', 'bow'], armor: ['leather', 'cloak', 'plate'], voice: { dog: ['同類！你好！'], land: ['到了到了到了！'], walk: ['那邊有小狗！'], chat: ['海牛！海牛！'], eat: ['好香好香', '可以再拿一個嗎'], view: ['哇 哇 哇', '好好看！'], greet: ['你好你好！'], talk: ['要一起去散步嗎'] } },
  goat: { name: '羊頭人', head: 'goat', scale: 1.1, W: 1, skins: [['#f0e8d8', '#c8a888'], ['#d8d0c0', '#8a6a52']], weapons: ['staff'], armor: ['cloak'], voice: { land: ['嗯……到了……'], chat: ['好久……不見……'], eat: ['有沒有草……沒有也沒關係'], view: ['讓我……想一想……', '這幅……很耐看……'], greet: ['咩……你好'], talk: ['慢慢來……不急……'] } },
  bigeye: { name: '大眼睛的旅人', head: 'bigeye', scale: 1, W: 0.95, skins: [['#5a9a4a', '#3a6a3a'], ['#4a8a7a', '#2a5a5a']], weapons: ['sword', 'dagger'], armor: ['leather', 'cloak'], voice: { land: ['嘰咕 到了'], chat: ['咕嚕嘎 你好 海牛'], eat: ['這個在我的星球是寶石'], view: ['在我們那邊 畫是用聞的', '嘰……很美'], greet: ['嘰咕'], talk: ['翻譯機好像壞了 嘰嘰'] } },
  tails: { name: '垂鬚的旅人', head: 'tails', scale: 1.05, W: 0.92, skins: [['#4a8ad0', '#d4a54a'], ['#d07ab0', '#6ad0c0'], ['#7ac06a', '#e05a5a']], weapons: ['staff', 'bow', 'dagger'], armor: ['cloak', 'leather'], voice: { chat: ['我又在三個港口跳過舞了'], view: ['這幅讓我想到故鄉的兩顆月亮'], talk: ['我的觸鬚聽得到音樂'] } },
  hammer: { name: '錘頭的旅人', head: 'hammer', scale: 1.15, W: 1.05, skins: [['#8a6a4a', '#c8a070'], ['#6a6a5a', '#a8a088']], weapons: ['staff', 'axe'], armor: ['cloak'], voice: { chat: ['嗡……老朋友'], eat: ['我的嘴巴在下面'], view: ['（低沉的嗡嗡聲）……真好'], greet: ['嗡'], talk: ['我們那邊的樹會唱歌'] } },
  squid: { name: '鬚臉的旅人', head: 'squid', scale: 1.1, W: 1, skins: [['#8a7aa0', '#b8a0c8'], ['#c08a7a', '#e0b0a0']], weapons: ['sword', 'staff'], armor: ['plate', 'cloak'], voice: { land: ['陸地太乾了'], eat: ['有沒有海草'], view: ['畫裡的海很像我家'], greet: ['咕嚕'], talk: ['我在水裡比較會說話'] } },
};
const KINDS = Object.keys(SPECIES);

// 一位訪客的長相：物種、毛色、衣服、盔甲、武器、背包，全由 (時段, 第幾位) 雜湊決定
function looks(k, j, taken) {
  let i = Math.floor(hash(k, j, 3) * KINDS.length);
  while (taken.has(KINDS[i])) i = (i + 1) % KINDS.length;   // 同一船不重複物種
  const kind = KINDS[i], sp = SPECIES[kind], u = (s, n) => Math.floor(hash(k, j, s) * n);
  const [c, c2] = sp.skins[u(4, sp.skins.length)];
  return {
    kind, sp, c, c2,
    tunic: TUNICS[u(5, TUNICS.length)], cloak: CLOAKS[u(6, CLOAKS.length)],
    armor: sp.armor[u(7, sp.armor.length)], weapon: sp.weapons[u(8, sp.weapons.length)], pack: hash(k, j, 9) < 0.4,
  };
}

function bodyGeo(L) {
  const W = L.sp.W, c = L.c;
  return geo((k) => {
    k.cyl(0.19 * W, 0.24 * W, 0.48, L.tunic, 0, 0.64, 0);
    k.cyl(0.24 * W, 0.29 * W, 0.2, L.tunic, 0, 0.36, 0, { color2: L.cloak });
    k.cyl(0.25 * W, 0.252 * W, 0.05, LEATHER, 0, 0.48, 0);
    k.box(0.06, 0.05, 0.02, GOLD, 0, 0.48, 0.25 * W);
    k.box(0.1, 0.1, 0.06, LEATHER, 0.2 * W, 0.41, 0.13 * W, { ry: 0.6 });
    k.cyl(0.08, 0.09, 0.1, c, 0, 0.9, 0);
    if (L.armor === 'leather') {
      k.cyl(0.205 * W, 0.25 * W, 0.34, '#6a4a30', 0, 0.68, 0, { color2: '#4a3020' });
      for (const s of [-1, 1]) k.ball(0.1, '#6a4a30', s * 0.24 * W, 0.86, 0, { sy: 0.55 });
    } else if (L.armor === 'plate') {
      k.cyl(0.205 * W, 0.25 * W, 0.3, METAL, 0, 0.71, 0, { color2: '#6a707a' });
      for (const s of [-1, 1]) k.ball(0.12, METAL, s * 0.25 * W, 0.86, 0, { sy: 0.65 });
      k.cyl(0.15, 0.17, 0.06, METAL, 0, 0.87, 0);
    } else {
      // 披風從肩上垂到膝蓋，領口一圈
      k.box(0.46 * W, 0.66, 0.03, L.cloak, 0, 0.55, -0.25 * W, { rx: 0.1 });
      k.torus(0.13, 0.05, Math.PI * 2, L.cloak, 0, 0.87, 0, { rx: Math.PI / 2 });
    }
    const back = -0.27 * W - (L.armor === 'cloak' ? 0.05 : 0);
    if (L.pack) {
      k.box(0.26 * W, 0.3, 0.14, LEATHER, 0, 0.64, back - 0.04);
      k.cyl(0.06, 0.06, 0.3 * W, '#8a7a5a', 0, 0.82, back - 0.04, { rz: Math.PI / 2 });
    }
    const wb = back - (L.pack ? 0.14 : 0.02);
    switch (L.weapon) {
      case 'sword': {
        // 左腰的劍：劍柄朝前上方
        const a = [-0.27 * W, 0.12, -0.12], b = [-0.27 * W, 0.5, 0.12];
        rod(k, a, b, 0.03, LEATHER, { flat: 0.035 });
        k.box(0.15, 0.025, 0.03, GOLD, b[0], b[1] + 0.01, b[2] + 0.01, { rx: 0.56 });
        rod(k, [b[0], b[1] + 0.02, b[2] + 0.01], [b[0], b[1] + 0.13, b[2] + 0.08], 0.017, DARK);
        k.ball(0.026, GOLD, b[0], b[1] + 0.14, b[2] + 0.09);
        break;
      }
      case 'greatsword': {
        // 背上斜背一把大劍，劍柄從右肩冒出來
        const a = [-0.22, 0.12, wb], b = [0.2, 1.0, wb];
        rod(k, a, b, 0.045, METAL, { flat: 0.02 });
        rod(k, [b[0] - 0.12, b[1] - 0.06, wb], [b[0] + 0.12, b[1] + 0.06, wb], 0.02, GOLD, { flat: 0.04 });
        rod(k, b, [b[0] + 0.07, b[1] + 0.16, wb], 0.022, DARK);
        break;
      }
      case 'axe': {
        const a = [0.2, 0.2, wb], b = [-0.18, 1.0, wb];
        rod(k, a, b, 0.022, WOOD);
        k.box(0.2, 0.16, 0.03, METAL, b[0] + 0.02, b[1] - 0.08, wb - 0.01, { rz: 0.45, color2: '#d8dce0' });
        break;
      }
      case 'bow': {
        // 背上的弓和箭筒
        const r = 0.42, a0 = -0.35 * Math.PI, arc = 0.7 * Math.PI, cx = 0.12, cy = 0.62, rz = Math.PI * 0.62;
        k.torus(r, 0.016, arc, WOOD, cx, cy, wb - 0.02, { rz: rz + a0 });
        const end = (t) => [cx + Math.cos(rz + a0 + t) * r, cy + Math.sin(rz + a0 + t) * r, wb - 0.02];
        rod(k, end(0), end(arc), 0.004, '#e8e0d0', { seg: 3 });
        const qa = [-0.08, 0.5, wb - 0.06], qb = [0.12, 0.92, wb - 0.06];
        rod(k, qa, qb, 0.06, LEATHER);
        for (let i = 0; i < 3; i++) {
          const x = qb[0] + (i - 1) * 0.03, y = qb[1] + 0.06, z = qb[2] + (i - 1) * 0.02;
          rod(k, [x - 0.02, y - 0.1, z], [x + 0.02, y + 0.06, z], 0.007, WOOD, { seg: 3 });
          k.box(0.04, 0.06, 0.006, '#f0ece0', x + 0.02, y + 0.04, z, { rz: -0.4 });
        }
        break;
      }
      case 'dagger':
        for (const s of [-1, 1]) {
          rod(k, [s * 0.22 * W, 0.28, 0.12 * W], [s * 0.24 * W, 0.46, 0.14 * W], 0.022, LEATHER, { flat: 0.02 });
          k.ball(0.022, GOLD, s * 0.245 * W, 0.53, 0.145 * W);
        }
        break;
    }
  });
}

function armGeo(L, right) {
  const W = L.sp.W, fist = L.kind === 'minotaur' ? 0.075 : 0.06;
  return geo((k) => {
    k.add(new THREE.CapsuleGeometry(0.06 * Math.sqrt(W), 0.24, 2, 6), L.armor === 'plate' ? '#7a8088' : L.tunic, 0, -0.17, 0);
    k.cyl(0.068, 0.065, 0.1, LEATHER, 0, -0.3, 0);
    k.ball(fist, L.c, 0, -0.38, 0);
    // 法杖握在右手：杖腳快碰到地，頂端一顆發亮的水晶
    if (right && L.weapon === 'staff') {
      rod(k, [0, -0.85, 0.05], [0, 0.62, 0.05], 0.022, WOOD, { r2: 0.016 });
      k.torus(0.07, 0.014, Math.PI * 2, GOLD, 0, 0.64, 0.05);
      k.add(new THREE.OctahedronGeometry(0.06, 0), '#a8e8ff', 0, 0.72, 0.05, { sy: 1.6 });
    }
  });
}

function legGeo(L) {
  return geo((k) => {
    k.box(0.13 * L.sp.W, 0.3, 0.14, '#3a2e2a', 0, -0.15, 0);
    k.box(0.15 * L.sp.W, 0.16, 0.21, DARK, 0, -0.34, 0.025, { color2: '#4a3a30' });
  });
}

const foodGeos = new Map();
function foodGeo(i) {
  if (!foodGeos.has(i)) foodGeos.set(i, geo(FOODS[i].build));
  return foodGeos.get(i);
}

// 組成骨架。geos 收在一起，訪客離開時一起丟掉
function buildRig(L, shadowMat) {
  const W = L.sp.W, root = new THREE.Group(), body = new THREE.Group(), geos = [];
  root.add(body);
  const mesh = (g, parent) => { geos.push(g); const m = new THREE.Mesh(g, LIT); parent.add(m); return m; };
  const pivot = (x, y) => { const p = new THREE.Group(); p.position.set(x, y, 0); p.rotation.order = 'YXZ'; body.add(p); return p; };
  mesh(bodyGeo(L), body);
  const head = pivot(0, NECK);
  mesh(geo((k) => HEADS[L.sp.head](k, L.c, L.c2)), head);
  const armL = pivot(-(0.25 * W + 0.04), SHOULDER), armR = pivot(0.25 * W + 0.04, SHOULDER);
  mesh(armGeo(L, false), armL);
  mesh(armGeo(L, true), armR);
  const leg = legGeo(L);
  geos.push(leg);
  const legs = [-1, 1].map((s) => { const p = pivot(s * 0.11 * W, HIP); p.add(new THREE.Mesh(leg, LIT)); return p; });
  const food = new THREE.Mesh(foodGeo(0), LIT);
  food.position.set(0, -0.42, 0.07);
  food.visible = false;
  armR.add(food);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.8 * W, 0.8 * W), shadowMat);
  geos.push(shadow.geometry);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  root.add(shadow);
  root.scale.setScalar(L.sp.scale);
  root.traverse((o) => o.layers.set(ANIMAL_LAYER));
  return { root, body, head, armL, armR, legs, food, shadow, geos, staff: L.weapon === 'staff' };
}

// ---------- 冒險者的船 ----------
// 小帆船：船身、桅杆、一面帆，船尾一盞燈。甲板在船舷下 0.28 公尺，水面再往下 0.27 公尺
const BOAT = { len: 5.4, beam: 1.9, depth: 0.8, rise: 0.55 };
const DECK_Y = -BOAT.depth * 0.35;
// 甲板上三個人站的位置（船的座標，船頭 +z），避開桅杆
const SPOTS = [[0.3, 1.7], [-0.3, -0.3], [0.28, -1.5]];
function boatModel() {
  const { len: L, beam: B, depth: D } = BOAT, o = { ao: false };
  const lit = geo((k) => {
    k.add(hull(L, B, D, { y: 0.35, w: 0.86 }), '#5a3a26', 0, 0, 0, { ...o, color2: '#8a5a3a' });
    for (const sx of [-1, 1]) k.box(0.05, 0.06, L * 0.72, '#c89a50', sx * (B / 2 - 0.03), -0.02, 0, o);
    k.cyl(0.05, 0.065, 2.9, '#4a3020', 0, 1.15, 0.7, o);
    k.box(1.8, 0.05, 0.05, '#4a3020', 0, 2.35, 0.74, o);
    k.box(1.65, 1.55, 0.025, '#e8dcc0', 0, 1.55, 0.78, { ...o, color2: '#c8b890' });
    k.box(0.36, 0.36, 0.035, '#8a3a2a', 0, 1.62, 0.78, { ...o, rz: Math.PI / 4 });
    k.box(0.36, 0.2, 0.012, '#c0392b', 0.2, 2.5, 0.7, o);
    k.box(0.45, 0.35, 0.4, '#7a5a3a', -0.35, DECK_Y + 0.175, -2.05, o);
    k.cyl(0.16, 0.16, 0.4, '#6a4a2a', 0.45, DECK_Y + 0.2, 0.2, o, 8);
    k.cyl(0.025, 0.025, 1.3, '#4a3020', 0, DECK_Y + 0.65, -2.45, o, 4);
  });
  const glow = geo((k) => k.cyl(0.07, 0.07, 0.18, '#ffd890', 0, DECK_Y + 1.25, -2.45, {}, 6));
  const g = new THREE.Group();
  g.add(new THREE.Mesh(lit, LIT), new THREE.Mesh(glow, GLOW));
  g.rotation.order = 'YXZ';
  g.traverse((c) => c.layers.enable(REFLECT_LAYER));
  return g;
}

// 船在一段時間裡的行程：從霧裡最遠那一點開進來，減速靠岸，停 moor 秒，加速離開開回霧裡
function boatTimes(route, far) {
  const curve = new THREE.CatmullRomCurve3(route, true, 'centripetal');
  const LEN = curve.getLength(), lens = curve.getLengths(route.length * 40), sFar = lens[far * 40];
  const ta = (2 * EASE) / BOAT_V, dIn = LEN - sFar;
  const tc = (dIn - EASE) / BOAT_V, tIn = tc + ta, tOut = ta + (sFar - EASE) / BOAT_V;
  const moor = SLOT - tIn - tOut - 10;
  // 這段時間第 c 秒走到航線的哪裡（0 是泊位）；回傳 null 表示在霧裡等
  const at = (c) => {
    if (c < tc) return sFar + BOAT_V * c;
    if (c < tIn) { const u = c - tc; return LEN - EASE + BOAT_V * u - (BOAT_V * u * u) / (2 * ta); }
    if (c < tIn + moor) return LEN;
    const τ = c - tIn - moor;
    if (τ < ta) return (BOAT_V * τ * τ) / (2 * ta);
    const s = EASE + BOAT_V * (τ - ta);
    return s < sFar ? s : null;
  };
  return { curve, LEN, tIn, moor, at };
}

// ---------- 一位訪客 ----------

class Visitor {
  constructor(set, k, j, n, L) {
    this.set = set;
    this.k = k;
    this.j = j;
    this.L = L;
    this.seed = k * 8 + j;
    this.name = L.sp.name;
    this.rig = buildRig(L, set.shadowMat);
    set.scene.add(this.rig.root);
    this.v = 1.05 + 0.25 * hash(k, j, 10);
    this.pos = new THREE.Vector3();
    this.heading = 0;
    this.walk = 0;
    this.phase = 0;
    this.time = 0;
    this.act = null;
    this.actW = 0;
    this.look = 0;
    this.lastLine = null;
    this.nextGreet = 0;
    this.talk = null;          // 玩家找他聊天：{ until }
    this.aboard = true;        // 在船上或正在上下船
    this.speed = 0;
    this.dodge = { x: 0, z: 0 };
    this.meadow = false;       // 走在草原上，小狗會跑過來
    this.bubble = null;
    this.hideTimer = 0;
    this.segs = set.agenda(this, n);
  }

  // 現在照行程該在哪裡、面向哪、在做什麼
  sched(c) {
    const segs = this.segs;
    if (c < segs[0].t0) return this.ride();
    let i = segs.length - 1;
    while (i > 0 && segs[i].t0 > c) i--;
    const sg = segs[i], tau = c - sg.t0;
    if (sg.kind === 'off' || sg.kind === 'on') {
      if (sg.kind === 'on' && tau >= HOP) return this.ride();
      const f = clamp01(tau / HOP), deck = this.deck(), land = this.set.dock.land[this.j];
      const [a, b] = sg.kind === 'off' ? [deck, land] : [land, deck];
      const ground = this.set.world.groundY(land.x, land.z);
      const ya = sg.kind === 'off' ? deck.y : ground, yb = sg.kind === 'off' ? ground : deck.y;
      return { x: lerp(a.x, b.x, f), z: lerp(a.z, b.z, f), y: lerp(ya, yb, f) + Math.sin(f * Math.PI) * 0.35, h: Math.atan2(b.x - a.x, b.z - a.z), act: null, sg, i, tau };
    }
    if (tau < sg.W) {
      const P = this.path(sg), v = Math.max(this.v, P.D / Math.max(0.5, sg.W - 0.3)), s = tau * v;
      if (s < P.D) { const q = along(P, s); return { x: q.x, z: q.z, h: q.h, act: null, moving: true, sg, i, tau }; }
      return { x: sg.to.x, z: sg.to.z, h: sg.h, act: null, sg, i, tau };
    }
    const ta = tau - sg.W, out = { x: sg.to.x, z: sg.to.z, h: sg.h, act: sg.act, sg, i, tau, face: sg.face };
    if (sg.seat) {
      // 挪進座位坐下，時間到了再挪出來。走到時已經有玩家坐在那個位子上，就站在旁邊（只在自己的畫面上）
      const st = sg.seat;
      sg.blocked ??= this.set.playerOn(st.i);
      const f = sg.blocked ? 0 : smooth(clamp01(Math.min(ta / 0.8, (sg.T - ta) / 0.8)));
      out.x = lerp(sg.to.x, st.x, f);
      out.z = lerp(sg.to.z, st.z, f);
      out.sit = f;
      out.lift = st.lift;
    }
    return out;
  }

  ride() {
    const p = this.deck();
    return { x: p.x, z: p.z, y: p.y, h: this.set.boat.rotation.y + (this.j === 0 ? 0 : Math.PI / 2), act: null, boat: true };
  }

  deck() {
    const [x, z] = SPOTS[this.j];
    return this.set.boat.localToWorld(new THREE.Vector3(x, DECK_Y, z));
  }

  // 這一段要走的路線，第一次走到才尋路
  path(sg) {
    if (sg.P) return sg.P;
    const a = sg.from, b = sg.to, found = this.set.world.findPath(a.x, a.z, b.x, b.z);
    const pts = [a, ...(found && found.length ? found : [b])], cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    sg.P = { pts, cum, D: cum[cum.length - 1], h: sg.h };
    return sg.P;
  }

  get shown() { return this.rig.root.visible; }

  update(dt, c, env) {
    const S = this.sched(c), world = this.set.world;
    const room = S.boat || S.y != null ? world.rooms.length - 1 : world.roomIndexAt(S.z);
    const vis = world.rooms[room].group.visible && !(S.boat && !this.set.boat.visible);
    this.rig.root.visible = vis;
    this.aboard = S.y != null;
    this.sitting = !!S.sit;
    const out = world.outdoor;
    this.meadow = vis && !this.aboard && out.door - S.z > 11 && out.inField(S.x, S.z);
    if (!vis) { this.hush(); return; }
    this.time += dt;
    const P = env.player, ox = this.pos.x, oz = this.pos.z;
    let pd = Math.hypot(P.pos.x - S.x, P.pos.z - S.z);
    // 玩家擋在路上就側身讓一下，讓開的地方要走得到（棧橋很窄）。只在自己的畫面上
    // 走路時玩家擋在前面，就提前往側邊讓：玩家偏哪一側就往另一側，那一側是水或牆就換邊
    let dx = 0, dz = 0;
    if (S.moving) {
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading), nx = fz, nz = -fx;
      const rx = P.pos.x - S.x, rz = P.pos.z - S.z, ahead = rx * fx + rz * fz, lat = rx * nx + rz * nz;
      if (ahead > -0.6 && ahead < 1.8 && Math.abs(lat) < DODGE) {
        const m = (DODGE - Math.abs(lat)) * clamp01((1.8 - ahead) / 0.8);
        let side = lat > 0 ? -1 : 1;
        if (!world.walkable(S.x + nx * side * DODGE, S.z + nz * side * DODGE)) side = -side;
        dx = nx * side * m;
        dz = nz * side * m;
      }
    }
    const kd = Math.min(1, dt * 6);
    this.dodge.x += (dx - this.dodge.x) * kd;
    this.dodge.z += (dz - this.dodge.z) * kd;
    if (world.walkable(S.x + this.dodge.x, S.z + this.dodge.z)) {
      S.x += this.dodge.x;
      S.z += this.dodge.z;
      pd = Math.hypot(P.pos.x - S.x, P.pos.z - S.z);
    }
    this.pos.set(S.x, 0, S.z);
    // 位置照真實時間算，速度也用真實經過的時間，掉幀時 dt 被截短也不會量錯
    const speed = Math.hypot(S.x - ox, S.z - oz) / Math.max(c - (this.lastC ?? c - dt), 1e-4);
    this.lastC = c;
    const moving = speed > 0.08 && speed < 8;
    this.speed = moving ? speed : 0;
    if (this.talk && env.clock > this.talk.until) this.talk = null;

    // 玩家走近時打招呼，一陣子才一次
    if (pd < GREET_R && env.clock > this.nextGreet && !S.boat) {
      this.nextGreet = env.clock + 50 + Math.random() * 30;
      if (Math.random() < 0.7) this.say(this.pickLine('greet', Math.random()));
    }

    let wantH = S.h;
    if (moving && !S.sit) wantH = Math.atan2(S.x - ox, S.z - oz);
    else if (this.talk && !S.sit && !S.boat) wantH = Math.atan2(P.pos.x - S.x, P.pos.z - S.z);
    else if (S.face) wantH = Math.atan2(S.face.x - S.x, S.face.z - S.z);
    this.heading += wrapAngle(wantH - this.heading) * Math.min(1, dt * (S.sit ? 10 : 6));

    // 玩家在附近就轉頭看他；在聊天的時候一定看
    let look = 0;
    if ((pd < 4 || this.talk) && !moving) look = Math.max(-1, Math.min(1, wrapAngle(Math.atan2(P.pos.x - S.x, P.pos.z - S.z) - this.heading)));
    this.look += (look - this.look) * Math.min(1, dt * 3);

    this.walk += ((moving ? 1 : 0) - this.walk) * Math.min(1, dt * 8);
    this.phase += dt * (moving ? Math.min(speed, 2.5) : 0) * 7 / this.L.sp.scale;
    const want = S.act;
    if (want !== this.act) {
      this.actW -= dt * 3;
      if (this.actW <= 0) { this.actW = 0; this.act = want; }
    } else this.actW = Math.min(1, this.actW + dt * 2);

    const r = this.rig, sc = this.L.sp.scale, sit = S.sit || 0;
    const ground = S.y ?? world.groundY(S.x, S.z);
    const down = sit * ((S.lift ?? 0.45) + 0.07 * sc - HIP * sc);
    r.root.position.set(S.x, ground + down, S.z);
    r.root.rotation.y = this.heading;
    r.shadow.position.y = 0.012 - down / sc;
    this.pose(sit);
    if (S.sg) this.lines(S, pd, env);
    if (this.bubble?.classList.contains('show')) this.placeBubble(env.camera);
  }

  pose(sit) {
    const r = this.rig, t = this.time, s = Math.sin(this.phase), w = this.walk;
    const W = (n) => (this.act === n ? this.actW : 0);
    const eat = W('eat'), view = W('view'), chat = W('chat');
    r.body.position.y = Math.abs(s) * 0.05 * w;
    r.body.rotation.set(0.06 * w, 0, s * 0.04 * w);
    r.body.scale.y = 1 + Math.sin(t * 2.1) * 0.012 * (1 - w);
    r.legs[0].rotation.set(s * 0.6 * w, 0, 0);
    r.legs[1].rotation.set(-s * 0.6 * w, 0, 0);
    const L = r.armL.rotation, R = r.armR.rotation;
    L.set(-s * 0.5 * w, 0, -0.12);
    R.set(r.staff ? -0.3 + s * 0.12 * w : s * 0.5 * w, 0, 0.12);
    // 坐下：腿伸到前面，手放在腿上
    for (const g of r.legs) g.rotation.x += (-1.45 - g.rotation.x) * sit;
    L.x += (-0.55 - L.x) * sit;
    if (!r.staff) R.x += (-0.55 - R.x) * sit;
    // 看畫：手背在後面，頭偏一點慢慢晃
    L.x += (0.4 - L.x) * view; L.z += (0.15 - L.z) * view;
    if (!r.staff) { R.x += (0.4 - R.x) * view; R.z += (-0.15 - R.z) * view; }
    // 聊天：比手畫腳
    R.x += (-0.7 + Math.sin(t * 3.1) * 0.35 - R.x) * chat;
    L.x += (-0.25 + Math.sin(t * 2.3 + 1) * 0.15 - L.x) * chat;
    r.body.rotation.z += Math.sin(t * 1.7) * 0.04 * chat;
    // 吃：右手拿著，隔一陣子送到嘴邊
    r.food.visible = this.act === 'eat' && this.actW > 0.3;
    if (eat) {
      const bite = Math.max(0, Math.sin(t * 1.4)) ** 6;
      R.x += (-0.95 - 1.1 * bite - R.x) * eat;
      R.y += (-0.5 * bite - R.y) * eat;
    }
    r.head.rotation.set(-0.12 * view + Math.sin(t * 0.5) * 0.05 * view + 0.2 * Math.max(0, Math.sin(t * 1.4)) ** 6 * eat, this.look, Math.sin(t * 0.37) * 0.12 * view);
  }

  // 照行程到了該說的時間就說。剛進來的人只看得到最近兩秒內的那一句，不會一口氣冒一串
  lines(S, pd, env) {
    const list = S.sg.lines;
    if (!list) return;
    let i = -1;
    while (i + 1 < list.length && list[i + 1].t <= S.tau) i++;
    if (i < 0) return;
    const key = S.i * 100 + i;
    if (key === this.lastLine) return;
    this.lastLine = key;
    const ln = list[i];
    if (S.tau - ln.t > 2 || pd > HEAR) return;
    if (ln.host) {
      const h = this.set.host;
      if (h?.group.visible && !h.bubble.classList.contains('show')) h.say(ln.text);
    } else if (!this.talk) this.say(ln.text);
  }

  // 從台詞庫抽一句：物種自己的台詞和共用的混在一起
  pickLine(kind, u, ctx = {}) {
    const own = this.L.sp.voice[kind] || [];
    const pool = [...own, ...own, ...(LINES[kind] || [])].map((s) => fill(s, ctx)).filter(Boolean);
    return pool.length ? pool[Math.floor(u * pool.length)] : null;
  }

  // 小狗跑過來迎接
  greetedBy() {
    if (Math.hypot(this.pos.x - this.set.player.pos.x, this.pos.z - this.set.player.pos.z) < HEAR) this.say(this.pickLine('dog', Math.random()));
  }

  // 玩家按「聊天」：轉過來面向玩家，照正在做的事回一句
  talkTo() {
    this.talk = { until: performance.now() / 1000 + 4 };
    const pool = this.act === 'view' ? 'talkView' : this.act === 'eat' ? 'talkEat' : null;
    const kind = pool && Math.random() < 0.5 ? pool : 'talk';
    this.say(this.pickLine(kind, Math.random()));
  }

  say(text) {
    if (!text) return;
    if (!this.bubble) {
      this.bubble = document.createElement('div');
      this.bubble.className = 'speech';
      document.body.appendChild(this.bubble);
    }
    clearTimeout(this.hideTimer);
    this.bubble.textContent = text;
    this.bubble.classList.add('show');
    this.placeBubble(this.set.camera);
    this.hideTimer = setTimeout(() => this.bubble?.classList.remove('show'), SAY_TIME);
  }

  hush() {
    clearTimeout(this.hideTimer);
    this.bubble?.classList.remove('show');
  }

  placeBubble(camera) {
    const v = this.rig.root.position.clone();
    v.y += 1.55 * this.L.sp.scale;
    v.project(camera);
    const b = this.bubble.style;
    if (v.z > 1) { b.visibility = 'hidden'; return; }
    b.visibility = '';
    b.left = ((v.x + 1) / 2) * window.innerWidth + 'px';
    b.top = ((1 - v.y) / 2) * window.innerHeight + 'px';
  }

  dispose() {
    this.hush();
    this.bubble?.remove();
    this.rig.root.removeFromParent();
    for (const g of this.rig.geos) g.dispose();
  }
}

// ---------- 全體 ----------

export class Visitors {
  constructor({ scene, world, shadowTex, player, camera, host, force = false }) {
    this.scene = scene;
    this.world = world;
    this.player = player;
    this.camera = camera;
    this.host = host;
    this.dock = world.outdoor?.dock;
    this.list = [];
    this.k = null;
    this.offset = 0;
    this.force = null;
    if (!this.dock) return;
    this.shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
    this.boatInfo = boatTimes(this.dock.route, this.dock.far);
    this.boat = boatModel();
    this.boat.visible = false;
    world.rooms[world.rooms.length - 1].group.add(this.boat);
    this.tmp = new THREE.Vector3();
    this.tan = new THREE.Vector3();
    // ?visit：除錯用，這一段一定有船，而且從快靠岸的時候開始
    if (force) {
      const now = Date.now() / 1000, k = Math.floor(now / SLOT);
      this.force = k;
      this.offset = k * SLOT + this.boatInfo.tIn - 15 - now;
    }
  }

  // ---- 行程 ----

  // 世界裡去得了的地方。每次排行程時現找，房間或畫換了就跟著換
  places() {
    const w = this.world, out = w.outdoor;
    const seats = out.seats.map((s, i) => ({ ...s, i }));
    return {
      paintings: w.paintings,
      host: out.host,
      table: out.table,
      eatSeats: seats.filter((s) => s.table),
      benches: seats.filter((s) => !s.table),
      mirror: w.mirror,
    };
  }

  // 看畫站的位置：畫前一兩公尺，同一船的人左右錯開
  viewSpot(p, j) {
    const n = p.n, tx = -n.z, tz = n.x, lat = [0, 0.75, -0.75][j];
    for (const d of [2, 1.7, 2.4, 1.4]) {
      for (const l of [lat, lat * 0.5, -lat]) {
        const x = p.wall.x + n.x * d + tx * l, z = p.wall.z + n.z * d + tz * l;
        if (this.world.walkable(x, z)) return { x, z };
      }
    }
    return this.world.findWalkable(p.wall.x + n.x * 1.6, p.wall.z + n.z * 1.6, p.wall.x + n.x * 3, p.wall.z + n.z * 3);
  }

  // 一位訪客這一趟的行程：下船 → 找海牛聊天 →（吃點心、看畫、坐一坐，順序每人不同）→ 走回船邊 → 上船
  // 時間不夠就少做幾件；有多的就每件做久一點
  agenda(vis, n) {
    const { k, j } = vis, B = this.boatInfo, pl = this.places(), w = this.world;
    const land = this.dock.land[j];
    const tOff = B.tIn + 2 + j * 2.5, tEnd = B.tIn + B.moor - 6 - (n - 1 - j) * 2.5;
    const est = (a, b) => 1.5 + (Math.hypot(a.x - b.x, a.z - b.z) * 1.2) / vis.v;
    const u = (s) => hash(k, j, s);
    const items = [];

    // 跟海牛聊天：站在海牛背對長桌的那一側，三個人分開站
    const hp = pl.host, ax = hp.x - pl.table.x, az = hp.z - pl.table.z, base = Math.atan2(ax, az) + (j - 1) * 0.75;
    const cs = w.findWalkable(hp.x + Math.sin(base) * 1.3, hp.z + Math.cos(base) * 1.3, hp.x, hp.z);
    if (cs) items.push({ kind: 'chat', act: 'chat', to: cs, h: Math.atan2(hp.x - cs.x, hp.z - cs.z), face: hp, T: 22 });

    const rest = [];
    if (pl.eatSeats.length) {
      const st = pl.eatSeats[(Math.floor(u(20) * pl.eatSeats.length) + j * 2) % pl.eatSeats.length];
      rest.push([{ kind: 'eat', act: 'eat', to: { x: st.ax, z: st.az }, seat: st, h: st.h, T: 38, food: Math.floor(u(21) * FOODS.length) }]);
    }
    // 看兩到四幅畫，照離後門的遠近排，走進去一路看過去
    const ps = pl.paintings.map((p, i) => ({ p, i, r: hash(k, j * 31 + i, 22) })).sort((a, b) => a.r - b.r);
    const m = Math.min(ps.length, 2 + Math.floor(u(23) * 3));
    const views = ps.slice(0, m).sort((a, b) => b.i - a.i).map(({ p }) => {
      const to = this.viewSpot(p, j);
      return to && { kind: 'view', act: 'view', to, h: Math.atan2(-p.n.x, -p.n.z), T: 22, p };
    }).filter(Boolean);
    if (views.length) rest.push(views);
    // 有時坐一下長椅，有時照照鏡子
    if (u(24) < 0.5 && pl.benches.length) {
      const st = pl.benches[(Math.floor(u(25) * pl.benches.length) + j) % pl.benches.length];
      rest.push([{ kind: 'bench', act: null, to: { x: st.ax, z: st.az }, seat: st, h: st.h, T: 28 }]);
    } else if (pl.mirror) {
      const mr = pl.mirror, to = w.findWalkable(mr.x + mr.n.x * 1.6, mr.z + mr.n.z * 1.6, mr.x + mr.n.x * 3, mr.z + mr.n.z * 3);
      if (to) rest.push([{ kind: 'mirror', act: 'view', to, h: Math.atan2(-mr.n.x, -mr.n.z), T: 12 }]);
    }
    for (let i = rest.length - 1; i > 0; i--) {
      const r = Math.floor(u(30 + i) * (i + 1));
      [rest[i], rest[r]] = [rest[r], rest[i]];
    }
    items.push(...rest.flat());

    let t = tOff + HOP, at = land, sumT = 0;
    const chosen = [];
    for (const it of items) {
      const W = est(at, it.to);
      if (t + W + it.T + est(it.to, land) > tEnd) continue;
      chosen.push({ ...it, W });
      t += W + it.T;
      sumT += it.T;
      at = it.to;
    }
    const f = sumT ? Math.min(1.8, 1 + (tEnd - t - est(at, land)) / sumT) : 1;

    const segs = [{ kind: 'off', t0: tOff, lines: [{ t: HOP + 0.3, text: vis.pickLine('land', u(40)) }] }];
    t = tOff + HOP;
    let from = land;
    chosen.forEach((it, i) => {
      const sg = { ...it, t0: t, T: it.T * f, from };
      sg.lines = this.script(vis, sg, i);
      segs.push(sg);
      t += sg.W + sg.T;
      from = it.to;
    });
    const W = est(from, land);
    segs.push({ kind: 'board', t0: t, W, T: 0, from, to: land, h: Math.atan2(land.x - from.x, land.z - from.z), lines: [{ t: 0.5, text: vis.pickLine('leave', u(41)) }] });
    segs.push({ kind: 'on', t0: t + W, lines: null });
    return segs;
  }

  // 一段裡要說的話：時間從這一段開始算（含走路）。聊天是一來一回，海牛隔幾秒回話
  script(vis, sg, i) {
    const { k, j } = vis, h = (s) => hash(vis.seed, i, s), out = [];
    if (sg.W > 15 && h(1) < 0.35) out.push({ t: 1, text: vis.pickLine('walk', h(2)) });
    const t0 = sg.W, food = sg.food != null ? FOODS[sg.food].name : null, d = sg.p?.data || {};
    const ctx = { f: food, t: d.title, m: d.medium, y: d.year };
    const kind = sg.kind === 'eat' ? 'eat' : sg.kind;
    if (sg.kind === 'chat') {
      for (let t = 1, n = 0; t < sg.T - 3; t += 6.5, n++) {
        out.push({ t: t0 + t, text: vis.pickLine('chat', h(10 + n)) });
        out.push({ t: t0 + t + 3, text: HOST_REPLIES[Math.floor(hash(k, j * 10 + n, 50 + i) * HOST_REPLIES.length)], host: true });
      }
    } else {
      for (let t = 2 + h(3) * 2, n = 0; t < sg.T - 2; t += 9 + h(20 + n) * 8, n++) {
        if (h(40 + n) < 0.75) out.push({ t: t0 + t, text: vis.pickLine(kind, h(60 + n), ctx) });
      }
    }
    return out.filter((l) => l.text);
  }

  // ---- 每一幀 ----

  plan(k) {
    if (k !== this.force && hash(k, 0, 0x71) >= CHANCE) return;
    const r = hash(k, 0, 2), n = r < 0.4 ? 1 : r < 0.8 ? 2 : 3, taken = new Set();
    for (let j = 0; j < n; j++) {
      const L = looks(k, j, taken);
      taken.add(L.kind);
      this.list.push(new Visitor(this, k, j, n, L));
    }
    for (const v of this.list) {
      const sg = v.segs.find((s) => s.kind === 'eat');
      if (sg) v.rig.food.geometry = foodGeo(sg.food);
    }
  }

  update(dt) {
    if (!this.dock) return;
    const now = Date.now() / 1000 + this.offset, k = Math.floor(now / SLOT), c = now - k * SLOT;
    if (k !== this.k) {
      for (const v of this.list) v.dispose();
      this.list = [];
      this.k = k;
      this.plan(k);
    }
    const B = this.boatInfo, outVis = this.world.rooms[this.world.rooms.length - 1].group.visible;
    const s = this.list.length ? B.at(c) : null;
    this.boat.visible = s != null && outVis;
    if (s != null) {
      const u = (s / B.LEN) % 1;
      B.curve.getPointAt(u, this.tmp);
      B.curve.getTangentAt(u, this.tan);
      this.boat.position.set(this.tmp.x, this.dock.sea + BOAT.rise + Math.sin(now * 0.9) * 0.04, this.tmp.z);
      this.boat.rotation.set(Math.sin(now * 0.7) * 0.012, Math.atan2(this.tan.x, this.tan.z), Math.sin(now * 0.55) * 0.025);
      this.boat.updateMatrixWorld();
    }
    if (!this.list.length) return;
    const env = { player: this.player, camera: this.camera, clock: performance.now() / 1000 };
    // 船在霧裡等的時候人也藏起來
    for (const v of this.list) {
      if (s == null) { v.rig.root.visible = false; v.hush(); continue; }
      v.update(dt, c, env);
    }
  }

  // 自己或別的玩家坐在第 i 個座位上
  playerOn(i) {
    if (this.player.sitCode - 1 === i) return true;
    if (this.mp) for (const o of this.mp.others.values()) if (o.target?.s - 1 === i) return true;
    return false;
  }

  // 第 i 個座位現在有訪客坐著，玩家就不能坐
  seatBusy(i) {
    for (const v of this.list) {
      if (!v.shown || !v.sitting) continue;
      const sg = v.segs.find((s) => s.seat?.i === i && !s.blocked);
      if (sg && Math.hypot(v.pos.x - sg.seat.x, v.pos.z - sg.seat.z) < 0.6) return true;
    }
    return false;
  }

  // 站在地上的訪客擋路：人不能穿過，但已經被擠到的人可以往外走（同乳牛）
  blocks(x, z, ox, oz) {
    for (const v of this.list) {
      if (!v.shown || v.aboard || v.sitting) continue;
      const r = 0.3 * v.L.sp.scale * v.L.sp.W, d = Math.hypot(x - v.pos.x, z - v.pos.z);
      if (d < r && d < Math.hypot(ox - v.pos.x, oz - v.pos.z)) return true;
    }
    return false;
  }

  // 「聊天」按鈕：附近最近的一位，在船上的不算
  nearest(x, z) {
    let best = null, bd = 1.8;
    for (const v of this.list) {
      if (!v.shown) continue;
      const d = Math.hypot(v.pos.x - x, v.pos.z - z);
      if (d < bd && !v.aboard) { bd = d; best = v; }
    }
    return best ? { v: best, d: bd } : null;
  }

  // 長桌主人要看哪裡：有訪客在跟他聊天時看那位
  hostFocus() {
    for (const v of this.list) if (v.shown && v.act === 'chat') return v.pos;
    return null;
  }
}
