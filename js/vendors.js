// 海市的攤販：站在櫃台後面，有人走近會打招呼、轉過來看，按「聊天」會講一句，同一句不會連著講。
// 有幾攤第一次聊天會送東西（looks.js 的 GIFTS），送了之後回畫廊照鏡子就能穿戴。
// 介面跟 visitors.js 一樣（nearest、blocks、list），玩家的動作按鈕和照鏡子時的半透明直接沿用。
// 角色只在玩家附近、同一層附近時才畫，攤販多也不會拖慢手機
import { Character } from './character.js';
import { sanitizeLook, presetLook, RACES, GIFTS, unlock, unlockedSet, isOpen } from './looks.js';
import { bend } from './lens.js';

const SAY_TIME = 3800, GREET_DIST = 3.2, TALK_DIST = 2.4, SHOW_DIST = 22, SHOW_DY = 3.5;

// id 對應 haishi.js 的 SHOPS。look 只寫跟預設不一樣的地方
export const VENDORS = {
  post: {
    name: '信差', race: 'dog', look: { hat: 'none', top: 'shirt', topC: 16, bottom: 'pants', botC: 1, outer: 'blazer', outC: 1, neck: 'tie', back: 'satchel', backC: 2 }, postcard: true,
    greet: ['要寄信嗎', '有東西要寄嗎'],
    lines: ['拍一張照片 我幫你寄', '明信片一張 寄哪裡都可以', '今天信好多 腳好痠', '畫廊那邊的信也是我送的', '寄給朋友吧 他們會很開心'],
  },
  fish: {
    name: '魚販', race: 'tails', look: { hat: 'straw', top: 'tank', topC: 16, bottom: 'shorts', botC: 5, outer: 'apron', outC: 19, shoes: 'rainboots', shoeC: 20, neck: 'towel', neckC: 16, back: 'none' },
    greet: ['今天的魚很新鮮喔', '來看看'],
    lines: ['早上剛撈的', '這隻很大吧', '烏賊要不要', '漁夫都把魚賣給我', '不要摸啦 會滑', '收攤前會便宜一點'],
  },
  pigment: {
    name: '顏料攤', race: 'mushroom', look: { hat: 'none', top: 'smock', topC: 10, botC: 5, hand: 'brush', handC: 11 },
    greet: ['要買顏料嗎', '看一下嘛'],
    lines: ['這個藍是石頭磨的', '朱砂很貴喔 一點點就好', '畫廊那邊也跟我買', '磨一罐要磨很久', '白的最好用 什麼都要加一點', '手不要沾到 洗不掉'],
  },
  bakery: {
    name: '麵包師傅', race: 'bear', look: { hat: 'chef', robe: 4 },
    greet: ['剛出爐的', '好香對不對'],
    lines: ['長桌上的麵包是我烤的', '今天烤太多了', '你看起來很餓', '最後一個了 要不要', '早上四點就起來揉麵', '海牛每次都買一大袋'],
  },
  candle: {
    name: '蠟燭店', race: 'rabbit', look: { hat: 'none', robe: 6 },
    greet: ['小心火喔', '慢慢看'],
    lines: ['這根可以燒一整晚', '有香味的在這邊', '燈籠裡的蠟燭也是我做的', '風大的時候生意很好', '不要吹 這個不能吹', '顏色是我自己調的'],
  },
  tea: {
    name: '茶攤', race: 'goat', look: { hat: 'straw', robe: 2 },
    greet: ['喝杯茶再走', '累了吧'],
    lines: ['爬上來很喘吧', '這是山上的草泡的', '慢慢喝 不急', '上面還有很多層喔', '喝完再上去', '我每天都看人爬樓梯'],
  },
  tailor: {
    name: '裁縫', race: 'fox', look: { hat: 'wizard', hatC: 5, top: 'shirt', topC: 16, outer: 'haori', outC: 3, outC2: 9, bottom: 'hakama', botC: 22, botC2: 9, shoes: 'geta', shoeC: 8, neck: 'none', back: 'none' },
    greet: ['要做衣服嗎', '進來看看'],
    lines: ['你這件袍子不錯', '帽子歪了啦', '這塊布是霧港來的', '袖子是不是太長', '畫廊那面鏡子 我也常去照', '顏色多選幾個也可以'],
  },
  junk: {
    name: '舊貨攤', race: 'bigeye', look: { hat: 'cone', top: 'tank', topC: 16, bottom: 'shorts', botC: 7, shoes: 'odd', neck: 'none', back: 'shell' },
    greet: ['嘰咕 看看', '什麼都有喔'],
    lines: ['這個瓶子裡有信', '靴子 只有一隻', '不知道是什麼 但很便宜', '船上撿到的', '嘰咕 不能退喔', '這個好像會動'],
  },
  herbs: {
    name: '藥草攤', race: 'frog', look: { hat: 'sprout', topC: 2, botC: 2, outer: 'mino', shoes: 'geta', shoeC: 2 },
    greet: ['呱 要什麼草', '聞聞看'],
    lines: ['這個治暈船', '泡澡用的', '不要吃那個 那是要燒的', '山上採的 很新鮮', '呱 這個很苦', '睡不著喝這個'],
  },
  lanterns: {
    name: '燈籠師傅', race: 'cat', look: { hat: 'wizard', hatC: 7, topC: 6, botC: 6, neckC: 14, hand: 'lantern' },
    greet: ['喜歡燈籠嗎', '這條巷子的燈都是我做的'],
    lines: ['紙要糊三層', '紅的最多人買', '掛高一點比較好看', '晚上全部點起來很漂亮', '做壞的都在後面', '貓不怕火啦'],
  },
  glass: {
    name: '玻璃師傅', race: 'lizard', look: { hat: 'none', clothes: 'suit', robe: 0 },
    greet: ['裡面很熱喔', '小心燙'],
    lines: ['燒瓶要吹很薄', '畫廊裡那些瓶瓶罐罐是我吹的', '我不怕熱', '這顆是失敗的 給你看', '火不能停', '顏色是加礦石'],
  },
  frames: {
    name: '木工', race: 'bull', look: { hat: 'none', clothes: 'tank', robe: 1 },
    greet: ['哞 要框嗎', '木頭很香吧'],
    lines: ['畫廊的框都是我做的', '這塊木頭放了十年', '角要對準 不然會歪', '哞 木屑不要踩', '金色的要另外上', '大幅的框很重'],
  },
  maps: {
    name: '航海圖店', race: 'pigeon', look: { hat: 'propeller', robe: 5 },
    greet: ['要去哪裡', '看地圖嗎'],
    lines: ['這張是星圖', '西邊那顆星你看過嗎', '有人把地圖拿反過', '白塔在這裡', '船長都來我這裡買', '咕咕 地圖不要摺'],
  },
  // 小吃推車，id 對應 haishi.js 的 CARTS
  squid: {
    name: '烤魷魚', race: 'hammer', look: { hat: 'none', clothes: 'tank', robe: 1 },
    greet: ['烤魷魚喔', '好香吧'],
    lines: ['一串 剛烤好的', '要辣的嗎', '醬要多刷一點嗎', '煙很大 站旁邊一點', '魚販那邊早上拿的', '烤焦的我自己吃'],
  },
  oden: {
    name: '關東煮', race: 'onigiri', look: { hat: 'none', robe: 2 },
    greet: ['來碗熱的', '自己夾喔'],
    lines: ['蘿蔔最入味', '湯可以續', '這鍋從下午煮到現在', '晚上風大 吃這個剛好', '竹籤放杯子裡就好', '不要問我是不是飯糰'],
  },
  takoyaki: {
    name: '章魚燒', race: 'egg', look: { hat: 'chef', robe: 4 },
    greet: ['章魚燒 一盒六顆', '等一下 在翻'],
    lines: ['裡面很燙 小心', '柴魚會跳喔', '翻這個要練很久', '章魚是一大塊的', '美乃滋要多嗎', '我不會被翻啦'],
  },
  tanghulu: {
    name: '糖葫蘆', race: 'boba', look: { hat: 'party', robe: 6 },
    greet: ['要不要糖葫蘆', '一支就好'],
    lines: ['紅的是山楂 很酸', '番茄的也有', '糖剛熬好 很脆', '黏到手很正常', '小朋友都挑草莓的', '咬下去會碎 用手接著'],
  },
  baozi: {
    name: '包子', race: 'snowman', look: { hat: 'none', robe: 0 },
    greet: ['包子 剛蒸好', '肉包還有'],
    lines: ['好熱 我快化了', '蒸籠我來掀', '菜包賣完了', '一顆很大 兩顆會飽', '燙嘴喔 吹一下', '每天站在蒸籠旁邊 很拚的'],
  },
  potato: {
    name: '烤番薯', race: 'potato', look: { hat: 'straw', robe: 3 },
    greet: ['番薯 熱的', '來一條'],
    lines: ['不要看我 看番薯', '這個很甜 會流蜜', '石頭甕慢慢烤的', '我們不是親戚', '剝皮小心燙', '冷的時候最好賣'],
  },
};

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

class Vendor {
  constructor(scene, shadowTex, spot, spec, i, onPostcard, onGift) {
    const race = RACES.find((r) => r.id === spec.race) || RACES[0];
    const look = sanitizeLook({ ...presetLook(i), race: race.id, skin: race.skin ?? 0, ...spec.look });
    this.ch = new Character(shadowTex, look);
    this.group = this.ch.group;
    this.group.position.set(spot.x, spot.y, spot.z);
    this.group.rotation.y = this.base = this.heading = spot.heading;
    scene.add(this.group);
    this.pos = this.group.position;
    this.name = spec.name;
    this.spec = spec;
    this.aboard = false;
    this.actionLabel = spec.postcard ? '寄明信片' : null;
    this.onPostcard = onPostcard;
    this.onGift = onGift;
    this.gift = GIFTS[spot.id] || null;
    this.greeted = false;
    this.bag = [];
    this.bubble = document.createElement('div');
    this.bubble.className = 'speech';
    document.body.appendChild(this.bubble);
    this.hideTimer = 0;
  }

  get shown() { return this.group.visible; }
  setGhost(a) { this.ch.setGhost(a); }

  say(text) {
    clearTimeout(this.hideTimer);
    this.bubble.textContent = text;
    this.bubble.classList.add('show');
    this.hideTimer = setTimeout(() => this.bubble.classList.remove('show'), SAY_TIME);
  }

  hush() {
    clearTimeout(this.hideTimer);
    this.bubble.classList.remove('show');
  }

  // 台詞洗一輪才重來，同一句不會連著講。有東西要送的話，第一次聊天先送
  talkTo() {
    const g = this.gift;
    if (g && !g.items.every(([k, id]) => isOpen(k, id, unlockedSet()))) {
      unlock(g.items);
      this.say(g.line);
      this.onGift?.(g);
      return;
    }
    if (!this.bag.length) this.bag = [...this.spec.lines].sort(() => Math.random() - 0.5);
    this.say(this.bag.pop());
    if (this.spec.postcard) setTimeout(() => this.onPostcard?.(), 1200);
  }

  update(dt, px, py, pz, camera) {
    const dx = px - this.pos.x, dz = pz - this.pos.z, d = Math.hypot(dx, dz);
    const show = d < SHOW_DIST && Math.abs(py - this.pos.y) < SHOW_DY;
    if (show !== this.group.visible) {
      this.group.visible = show;
      if (!show) { this.hush(); this.greeted = false; }
    }
    if (!show) return;
    if (d < GREET_DIST && !this.greeted) {
      this.greeted = true;
      this.say(pick(this.spec.greet));
    } else if (d > GREET_DIST + 3) this.greeted = false;
    // 有人靠近就轉過去看，但不會轉身背對櫃台
    const want = d < 6 ? this.base + Math.max(-1.1, Math.min(1.1, wrap(Math.atan2(dx, dz) - this.base))) : this.base;
    this.heading += wrap(want - this.heading) * Math.min(1, dt * 3);
    this.group.rotation.y = this.heading;
    this.ch.update(dt, 0);
    if (this.bubble.classList.contains('show')) this.placeBubble(camera);
  }

  placeBubble(camera) {
    const v = this.pos.clone();
    v.y += 1.75;
    bend(v.project(camera));
    const b = this.bubble.style;
    if (v.z > 1) { b.visibility = 'hidden'; return; }
    b.visibility = '';
    b.left = ((v.x + 1) / 2) * window.innerWidth + 'px';
    b.top = ((1 - v.y) / 2) * window.innerHeight + 'px';
  }
}

export class Vendors {
  // spots：haishi.js 算好的攤販位置 [{ id, x, y, z, heading }]
  constructor({ scene, shadowTex, spots, onPostcard, onGift }) {
    this.list = spots.filter((s) => VENDORS[s.id]).map((s, i) => new Vendor(scene, shadowTex, s, VENDORS[s.id], i, onPostcard, onGift));
    this.mp = null;
  }

  nearest(x, z) {
    let best = null, bd = TALK_DIST;
    for (const v of this.list) {
      if (!v.shown) continue;
      const d = Math.hypot(v.pos.x - x, v.pos.z - z);
      if (d < bd) { bd = d; best = v; }
    }
    return best ? { v: best, d: bd } : null;
  }

  // 攤販站在櫃台後面，櫃台本身已經擋住了
  blocks() { return false; }
  seatBusy() { return false; }
  hostFocus() { return null; }

  update(dt, player, camera) {
    const p = player.pos;
    for (const v of this.list) v.update(dt, p.x, p.y, p.z, camera);
  }
}
