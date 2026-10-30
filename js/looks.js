// 捏角色的資料：種族、五官、髮型、帽子、衣服用代號，顏色和滑桿用整數，自己畫的臉是一串壓縮過的格子。
// 存在瀏覽器裡，也透過在線名單傳給別人，所以讀進來的資料一律先過 sanitizeLook。
// 清單只能往後加，不要改代號或調換顏色的順序，舊存檔和別人的畫面才對得上。

export const ROBES = [0x2f5d62, 0x7a3b2e, 0x3d5a2a, 0x5b3f78, 0x8a6a2f, 0x2a3f6b, 0x6b2a4a, 0x4a4a52];
export const HAT_COLORS = [0x4a2f66, 0x2c3e50, 0x6b3a1f, 0x1f5a4a, 0x2b1f3d, 0x7a2a3a, 0x2f4a3a, 0x8a2a2a];
export const SCARVES = [0xc0392b, 0xe0b44c, 0xd9d2c0, 0xe58a3a, 0x4fa3a5, 0xe27a9a, 0x9ad0e0, 0x6fbf73];
export const HAIR_COLORS = [0x5a3a22, 0x1a1412, 0x8a5a2a, 0xd8b060, 0xe8e4dc, 0xc83a2a, 0x4a8ad0, 0xd07ab0];
export const SKINS = [
  0xf1c9a5, 0xe0a87e, 0xb87a52, 0x7a4a30, 0xf0e8d8, 0x8a8a92, 0x3a3036, 0xd8893a,
  0xc8a060, 0x5a9a4a, 0x4a8a7a, 0x4a8ad0, 0x8a7aa0, 0xd07ab0, 0xc83a2a, 0xe8d040,
];
// 衣服、鞋子、配件共用的顏色。前 8 個是舊版的長袍色，接著 8 個是舊版的圍巾色，舊存檔的色號才換得過來
export const CLOTH = [
  ...ROBES, ...SCARVES,
  0xf4f2ec, 0x1e1c1e, 0x3a2414, 0x3a5a8a, 0xf0c830, 0x8a8a90, 0x1f2a4a, 0xb8a070,
];
const WHITE = 16, BOOT = 18;

// 種族。head 是 heads.js 的造型；own 表示頭上本來就有五官，選了「原本」就不另外貼
// ey 眼睛高度、ex 眼睛離中線多遠、fs 五官大小，都從脖子算；top 帽子戴多高、hs 帽子大小；skin 預設膚色
export const RACES = [
  { id: 'human', name: '人', head: 'human', ey: 0.2, ex: 0.07, top: 0.33, hs: 1, skin: 0, hair: true },
  { id: 'cat', name: '貓', head: 'cat', own: true, ey: 0.23, ex: 0.08, top: 0.33, hs: 1, skin: 7 },
  { id: 'dog', name: '狗', head: 'dog', own: true, ey: 0.25, ex: 0.075, top: 0.34, hs: 1, skin: 2 },
  { id: 'bull', name: '牛', head: 'bull', own: true, ey: 0.26, ex: 0.11, top: 0.35, hs: 1.1, skin: 3 },
  { id: 'goat', name: '羊', head: 'goat', own: true, ey: 0.24, ex: 0.075, top: 0.37, hs: 1, skin: 4 },
  { id: 'fox', name: '狐狸', head: 'fox', own: true, ey: 0.25, ex: 0.075, top: 0.33, hs: 0.95, skin: 7 },
  { id: 'bear', name: '熊', head: 'bear', own: true, ey: 0.26, ex: 0.075, top: 0.35, hs: 1.05, skin: 3 },
  { id: 'rabbit', name: '兔子', head: 'rabbit', own: true, ey: 0.24, ex: 0.085, top: 0.33, hs: 0.95, skin: 4 },
  { id: 'frog', name: '青蛙', head: 'frog', own: true, ey: 0.3, ex: 0.12, top: 0.26, hs: 1.15, skin: 9 },
  { id: 'lizard', name: '蜥蜴', head: 'lizard', own: true, ey: 0.26, ex: 0.11, top: 0.31, hs: 0.95, skin: 10 },
  { id: 'mushroom', name: '蘑菇', head: 'mushroom', own: true, ey: 0.18, ex: 0.055, top: 0.47, hs: 0.8, skin: 14 },
  { id: 'pigeon', name: '鴿子', head: 'pigeon', own: true, ey: 0.245, ex: 0.13, top: 0.32, hs: 0.95, skin: 5 },
  { id: 'bigeye', name: '大眼睛', head: 'bigeye', own: true, ey: 0.24, ex: 0.1, top: 0.36, hs: 1, skin: 9 },
  { id: 'tails', name: '垂鬚', head: 'tails', own: true, ey: 0.22, ex: 0.075, top: 0.34, hs: 0.95, skin: 11 },
  { id: 'hammer', name: '錘頭', head: 'hammer', own: true, ey: 0.37, ex: 0.24, top: 0.39, hs: 0.85, skin: 2 },
  { id: 'squid', name: '鬚臉', head: 'squid', own: true, ey: 0.25, ex: 0.15, top: 0.4, hs: 1, skin: 12 },
  { id: 'alien', name: '小灰人', head: 'alien', own: true, ey: 0.22, ex: 0.085, top: 0.44, hs: 1.05, skin: 5, odd: true },
  { id: 'egg', name: '蛋頭', head: 'egg', ey: 0.29, ex: 0.07, top: 0.47, hs: 0.9, odd: true },
  { id: 'toast', name: '吐司', head: 'toast', ey: 0.27, ex: 0.08, top: 0.44, hs: 1, odd: true },
  { id: 'boba', name: '珍奶', head: 'boba', ey: 0.27, ex: 0.075, top: 0.44, hs: 1, odd: true },
  { id: 'onigiri', name: '飯糰', head: 'onigiri', ey: 0.27, ex: 0.055, fs: 0.8, top: 0.38, hs: 0.8, odd: true },
  { id: 'potato', name: '馬鈴薯', head: 'potato', ey: 0.24, ex: 0.07, top: 0.38, hs: 1, odd: true },
  { id: 'tv', name: '電視', head: 'tv', ey: 0.28, ex: 0.08, top: 0.42, hs: 1.15, ink: '#b8f0d8', odd: true },
  { id: 'box', name: '紙箱', head: 'box', ey: 0.25, ex: 0.09, top: 0.4, hs: 1.2, odd: true },
  { id: 'robot', name: '機器人', head: 'robot', ey: 0.23, ex: 0.08, top: 0.36, hs: 1.05, odd: true },
  { id: 'snowman', name: '雪人', head: 'snowman', ey: 0.25, ex: 0.07, top: 0.36, hs: 1, odd: true },
];
const RACE_BY_ID = new Map(RACES.map((r) => [r.id, r]));
export const raceOf = (L) => RACE_BY_ID.get(L.race) || RACES[0];

// 選項：[代號, 名字]。第一個是預設
export const OPTIONS = {
  eyes: [['base', '原本'], ['dot', '豆豆'], ['big', '大眼'], ['line', '瞇瞇'], ['sleepy', '死魚'], ['cross', '鬥雞'], ['one', '獨眼'], ['three', '三隻'], ['none', '沒有']],
  brows: [['none', '沒有'], ['thick', '粗眉'], ['uni', '一字眉'], ['angry', '生氣'], ['sad', '八字']],
  nose: [['none', '沒有'], ['ball', '圓圓'], ['big', '大鼻子'], ['pig', '豬鼻'], ['long', '長鼻子']],
  mouth: [['none', '沒有'], ['smile', '笑'], ['open', '張嘴'], ['teeth', '暴牙'], ['pout', '嘟嘴'], ['flat', '一字'], ['wry', '歪嘴'], ['tongue', '吐舌']],
  mark: [['base', '原本'], ['none', '沒有'], ['blush', '腮紅'], ['stache', '八字鬍'], ['beard', '大鬍子'], ['mole', '痣'], ['freckle', '雀斑'], ['bandaid', 'OK 繃']],
  glasses: [['none', '沒有'], ['round', '圓眼鏡'], ['shades', '墨鏡'], ['mono', '單片'], ['groucho', '搞笑眼鏡'], ['3d', '3D 眼鏡']],
  hair: [['short', '短髮'], ['bald', '光頭'], ['comb', '地中海'], ['afro', '爆炸頭'], ['spiky', '刺蝟'], ['long', '長髮'], ['buns', '包包頭']],
  hat: [['wizard', '尖帽'], ['none', '不戴'], ['crown', '皇冠'], ['propeller', '竹蜻蜓'], ['chef', '廚師帽'], ['straw', '斗笠'], ['cone', '三角錐'], ['party', '派對帽'], ['sprout', '豆芽']],
  // 衣服分層：上衣、下身、外套、鞋子各選各的；連身裝穿上去會蓋掉上衣、下身和外套
  top: [['robe', '袍子'], ['shirt', '襯衫'], ['tee', 'T 恤'], ['hoodie', '帽 T'], ['sweater', '毛衣'], ['hawaii', '夏威夷衫'], ['tank', '吊嘎'], ['pe', '運動服'], ['armor', '盔甲'], ['smock', '畫家罩衫']],
  topPat: [['plain', '素面'], ['stripe', '條紋'], ['dot', '點點'], ['band', '一條線']],
  bottom: [['robe', '長袍下擺'], ['pants', '長褲'], ['track', '運動褲'], ['shorts', '短褲'], ['skirt', '裙子'], ['tutu', '蓬蓬裙'], ['overalls', '吊帶褲'], ['bloomers', '燈籠褲'], ['hakama', '袴']],
  botPat: [['plain', '素面'], ['stripe', '條紋'], ['dot', '點點'], ['band', '一條線']],
  outer: [['none', '不穿'], ['cape', '披風'], ['cloak', '斗篷'], ['vest', '背心'], ['blazer', '西裝外套'], ['raincoat', '雨衣'], ['apron', '圍裙'], ['haori', '羽織'], ['mino', '蓑衣']],
  shoes: [['boots', '靴子'], ['bare', '赤腳'], ['sneakers', '運動鞋'], ['slippers', '藍白拖'], ['rainboots', '雨鞋'], ['heels', '高跟鞋'], ['ballet', '芭蕾舞鞋'], ['clown', '小丑鞋'], ['geta', '木屐'], ['odd', '只有一隻']],
  one: [['none', '不穿'], ['dino', '恐龍裝'], ['panda', '熊貓裝'], ['banana', '香蕉裝'], ['astronaut', '太空衣'], ['yukata', '浴衣']],
  neck: [['scarf', '圍巾'], ['none', '沒有'], ['tie', '領帶'], ['bowtie', '領結'], ['necklace', '項鍊'], ['lei', '花環'], ['bell', '鈴鐺'], ['towel', '毛巾']],
  back: [['pouch', '腰包'], ['none', '沒有'], ['backpack', '背包'], ['schoolbag', '書包'], ['satchel', '郵差包'], ['guitar', '吉他'], ['sword', '大劍'], ['quiver', '箭筒'], ['wingA', '天使翅膀'], ['wingB', '蝙蝠翅膀'], ['wingC', '蝴蝶翅膀'], ['tail', '尾巴'], ['shell', '龜殼']],
  // 左手拿的東西。右手留著拿點心，之後探索世界撿東西也用右手
  hand: [['none', '空手'], ['staff', '法杖'], ['umbrella', '雨傘'], ['balloon', '氣球'], ['book', '魔法書'], ['flower', '花'], ['boba', '珍奶'], ['chicken', '雞排'], ['selfie', '自拍棒'], ['spatula', '鍋鏟'],
    ['lantern', '燈籠'], ['candle', '蠟燭'], ['fish', '魚'], ['brush', '大畫筆'], ['flask', '燒瓶'], ['frame', '畫框'], ['scope', '望遠鏡'], ['baguette', '法國麵包'], ['teacup', '茶杯'], ['squid', '烤魷魚']],
};
export const optionName = (k, id) => OPTIONS[k]?.find(([v]) => v === id)?.[1] ?? id;
// 顏色：存的是色號
const COUNTS = {
  skin: SKINS.length, hairC: HAIR_COLORS.length, hatC: HAT_COLORS.length,
  topC: CLOTH.length, topC2: CLOTH.length, botC: CLOTH.length, botC2: CLOTH.length, outC: CLOTH.length, outC2: CLOTH.length,
  oneC: CLOTH.length, oneC2: CLOTH.length, shoeC: CLOTH.length, neckC: CLOTH.length, backC: CLOTH.length, handC: CLOTH.length,
};

// ---------- 海市攤販送的東西 ----------
// 不在這張表裡的，鏡子裡一開始就有。表裡的要去海市跟那一攤聊天才拿得到，記在這台裝置的瀏覽器裡
export const GIFTS = {
  tailor: { who: '裁縫', line: '這幾件你拿去穿穿看', items: [['one', 'yukata'], ['outer', 'haori'], ['bottom', 'hakama'], ['shoes', 'geta']] },
  junk: { who: '舊貨攤', line: '嘰咕 這兩個送你 不能退喔', items: [['back', 'shell'], ['shoes', 'odd']] },
  herbs: { who: '藥草攤', line: '呱 這件蓑衣給你 下雨穿', items: [['outer', 'mino']] },
  pigment: { who: '顏料攤', line: '這件沾到顏料了 送你啦', items: [['top', 'smock'], ['hand', 'brush']] },
  lanterns: { who: '燈籠師傅', line: '拿一盞走 晚上比較好走', items: [['hand', 'lantern']] },
  candle: { who: '蠟燭店', line: '這根送你 小心火', items: [['hand', 'candle']] },
  fish: { who: '魚販', line: '這隻送你 拿好 會滑', items: [['hand', 'fish']] },
  glass: { who: '玻璃師傅', line: '吹歪的 拿去玩', items: [['hand', 'flask']] },
  frames: { who: '木工', line: '哞 這個框多做了一個', items: [['hand', 'frame']] },
  maps: { who: '航海圖店', line: '咕咕 望遠鏡借你 不用還', items: [['hand', 'scope']] },
  bakery: { who: '麵包師傅', line: '這條烤太長了 拿去', items: [['hand', 'baguette']] },
  tea: { who: '茶攤', line: '杯子帶走沒關係', items: [['hand', 'teacup']] },
  squid: { who: '烤魷魚', line: '這串請你', items: [['hand', 'squid']] },
};
const LOCKS = new Map();
for (const [v, g] of Object.entries(GIFTS)) for (const [k, id] of g.items) LOCKS.set(k + ':' + id, v);
export const lockedBy = (k, id) => LOCKS.get(k + ':' + id);

export function unlockedSet() {
  try {
    const a = JSON.parse(localStorage.getItem('unlocked'));
    return new Set(Array.isArray(a) ? a : []);
  } catch {
    return new Set();
  }
}

// 收下禮物，回傳這次有沒有拿到新東西
export function unlock(items) {
  const set = unlockedSet(), n = set.size;
  for (const [k, id] of items) set.add(k + ':' + id);
  try { localStorage.setItem('unlocked', JSON.stringify([...set])); } catch {}
  return set.size > n;
}

export const isOpen = (k, id, set) => !LOCKS.has(k + ':' + id) || set.has(k + ':' + id);
// 帽子顏色只套在這幾種帽子上，其他帽子有自己的顏色
export const TINTED_HATS = ['wizard', 'propeller', 'party'];

// 滑桿：0 到 10，[代號, 名字, 預設]
export const SLIDERS = [['head', '頭的大小', 5], ['tall', '身高', 5], ['fat', '胖瘦', 5], ['eyeSize', '眼睛大小', 5], ['eyeGap', '眼距', 5], ['eyeOdd', '大小眼', 0], ['faceY', '五官高低', 5]];
const SLIDER_MAX = 10;

// 滑桿換成實際的倍數。中間是原本的樣子，兩頭故意拉得很誇張
const spread = (v, lo, hi) => (v < 5 ? 1 - (1 - lo) * (5 - v) / 5 : 1 + (hi - 1) * (v - 5) / 5);
export function sizes(L) {
  return {
    H: spread(L.tall, 0.65, 1.4),
    W: spread(L.fat, 0.55, 1.7),
    hs: spread(L.head, 0.45, 1.8),
    es: spread(L.eyeSize, 0.4, 2.4),
    eg: spread(L.eyeGap, 0.35, 1.9),
    odd: L.eyeOdd / SLIDER_MAX,
    fy: (L.faceY - 5) * 0.018,
  };
}

// ---------- 自己畫的臉 ----------
// 64 × 64 格，每格是 FACE_INK 的色號，0 是透明。傳送時壓成「色號字母 + 連續幾格」，例如 a300b2a12

export const FACE = 64;
export const FACE_INK = ['', '#1a1412', '#ffffff', '#c8382a', '#f29a8a', '#e8c030', '#4a9a4a', '#3a6ac8', '#7a4a2a'];
const INK_CHARS = 'abcdefghi';
const FACE_MAX_LEN = 12000;

export function encodeFace(cells) {
  if (!cells.some((v) => v)) return '';
  let s = '';
  for (let i = 0; i < cells.length;) {
    let j = i + 1;
    while (j < cells.length && cells[j] === cells[i]) j++;
    s += INK_CHARS[cells[i]] + (j - i > 1 ? j - i : '');
    i = j;
  }
  return s;
}

// 格式不對、格數對不上都當作沒畫
export function decodeFace(s) {
  if (typeof s !== 'string' || !s || s.length > FACE_MAX_LEN) return null;
  const cells = new Uint8Array(FACE * FACE);
  let n = 0;
  const re = /([a-i])(\d{0,4})/y;
  for (re.lastIndex = 0; re.lastIndex < s.length;) {
    const m = re.exec(s);
    if (!m) return null;
    const run = m[2] ? +m[2] : 1;
    if (run < 1 || n + run > cells.length) return null;
    cells.fill(INK_CHARS.indexOf(m[1]), n, n + run);
    n += run;
  }
  return n === cells.length ? cells : null;
}

// ---------- 整份外觀 ----------

// 第 i 套預設：一般的小學徒，長袍、帽子、圍巾各取第 i 色
export function presetLook(i = 0) {
  const L = { race: 'human', skin: 0 };
  for (const k in OPTIONS) L[k] = OPTIONS[k][0][0];
  const c = i % ROBES.length;
  Object.assign(L, {
    hairC: 0, hatC: c, topC: c, topC2: WHITE, botC: c, botC2: WHITE, outC: (c + 1) % ROBES.length, outC2: WHITE,
    oneC: 15, oneC2: WHITE, shoeC: BOOT, neckC: ROBES.length + c, backC: BOOT, handC: 8,
  });
  for (const [k, , v] of SLIDERS) L[k] = v;
  L.face = '';
  L.keep = 0;
  return L;
}

export const randomPreset = () => presetLook(Math.floor(Math.random() * ROBES.length));

// 舊版的衣服是一整套，加上長袍和圍巾兩個色號（圍巾第 8 號是不圍）。換成分層的樣子
function fromClothes(L, clothes, robe, scarf) {
  const r = Number.isInteger(robe) && robe >= 0 && robe < ROBES.length ? robe : L.topC;
  const neckOn = scarf !== SCARVES.length;
  if (Number.isInteger(scarf) && scarf >= 0 && scarf < SCARVES.length) L.neckC = ROBES.length + scarf;
  Object.assign(L, { top: 'robe', bottom: 'robe', outer: 'none', shoes: 'boots', one: 'none', neck: neckOn ? 'scarf' : 'none', back: 'pouch', topC: r, botC: r, outC: r });
  switch (clothes) {
    case 'suit': Object.assign(L, { top: 'shirt', topC: WHITE, bottom: 'pants', outer: 'blazer', neck: neckOn ? 'tie' : 'none', back: 'none' }); break;
    case 'tank': Object.assign(L, { top: 'tank', topC: WHITE, bottom: 'shorts', shoes: 'slippers', neck: neckOn ? 'towel' : 'none', back: 'none' }); break;
    case 'tutu': Object.assign(L, { top: 'tank', bottom: 'tutu', shoes: 'ballet', back: 'none' }); break;
  }
}

// 外來的資料：認得的欄位才收，其他用預設。欄位順序固定，lookKey 才能拿來比對
export function sanitizeLook(o) {
  const src = o && typeof o === 'object' ? o : {};
  const L = presetLook(0);
  if (RACE_BY_ID.has(src.race)) L.race = src.race;
  for (const k in OPTIONS) if (OPTIONS[k].some(([id]) => id === src[k])) L[k] = src[k];
  for (const k in COUNTS) if (Number.isInteger(src[k]) && src[k] >= 0 && src[k] < COUNTS[k]) L[k] = src[k];
  for (const [k] of SLIDERS) if (Number.isInteger(src[k]) && src[k] >= 0 && src[k] <= SLIDER_MAX) L[k] = src[k];
  if (decodeFace(src.face)) L.face = src.face;
  L.keep = src.keep === 1 ? 1 : 0;
  // 舊版存檔、舊網頁送來的、攤販的設定還用 clothes、robe、scarf
  if ('clothes' in src || 'robe' in src) fromClothes(L, src.clothes, src.robe, src.scarf);
  return L;
}

export const lookKey = (L) => JSON.stringify(L);

// 舊版只存長袍、帽子、圍巾三個色號
export function lookFromOutfit(o) {
  if (!Array.isArray(o) || o.length !== 3 || !o.every((v) => Number.isInteger(v) && v >= 0 && v < ROBES.length)) return null;
  const L = presetLook(0);
  L.hatC = o[1];
  fromClothes(L, 'robe', o[0], o[2]);
  return L;
}

// 給還沒更新的舊網頁看的三個色號：長袍、帽子、圍巾
const toOld = (c, base) => (c >= base && c < base + ROBES.length ? c - base : 0);
export const toOutfit = (L) => [toOld(L.topC, 0), L.hatC, toOld(L.neckC, ROBES.length)];

// 骰子：種族、五官、衣服、顏色、比例全部亂抽，還沒拿到的東西不抽。自己畫的臉留著
export function randomLook(prev, set = new Set()) {
  const R = (n) => Math.floor(Math.random() * n);
  const race = RACES[R(RACES.length)];
  const L = { ...prev, race: race.id, skin: Math.random() < 0.6 ? race.skin ?? R(SKINS.length) : R(SKINS.length) };
  for (const k in OPTIONS) {
    const open = OPTIONS[k].filter(([id]) => isOpen(k, id, set));
    L[k] = open[R(open.length)][0];
  }
  // 連身裝會蓋掉其他衣服，少抽一點
  if (Math.random() < 0.75) L.one = 'none';
  for (const k in COUNTS) if (k !== 'skin') L[k] = R(COUNTS[k]);
  // 比例大多落在中間附近，偶爾才抽到誇張的
  for (const [k, , v] of SLIDERS) L[k] = Math.random() < 0.35 ? R(SLIDER_MAX + 1) : Math.max(0, Math.min(SLIDER_MAX, v + R(5) - 2));
  return L;
}
