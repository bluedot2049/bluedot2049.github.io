// 多人同遊：透過 Supabase Realtime 互傳位置和表情。gallery.json 沒填 realtime 就不啟用。
// 其他訪客的學徒用對方自己選的配色，不取名、不聊天。
import * as THREE from 'three';
import { Character, isOutfit, isFood, presetOutfit, ROBES } from './character.js';

const SEND_MOVING = 200;    // 走動時每 0.2 秒送一次位置
const SEND_IDLE = 8000;     // 站著不動時偶爾報一次，確認還在
const STALE = 20000;        // 這麼久沒消息就當作離開
const MAX_SHOWN = 10;       // 只畫最近的幾位，手機才跑得動
const MAX_TRACKED = 30;     // 最多同時追蹤幾位，防止有人灌假身分拖垮大家的手機
const MAX_UNVERIFIED = 5;   // 在線名單還沒認可的新面孔，同時最多放行幾位（名單同步要幾秒）
const UNVERIFIED_TTL = 10000; // 超過這麼久還沒被認可就丟掉
const COORD_LIMIT = 200;    // 畫廊遠小於這個範圍，超過的座標一律當作亂送
const EMOTE_GAP = 800;      // 自己送表情的最短間隔
const JUMP_GAP = 400;       // 自己送跳躍的最短間隔
const PET_GAP = 1500;       // 自己送摸動物的最短間隔
const OUTFIT_DELAY = 1000;  // 換裝停手這麼久才送出，連點色塊不會一直送
const EMOTE_TIME = 2;       // 表情在頭上停留的秒數
export const EMOTES = ['❤️', '✨', '👏', '😮', '👋'];

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

const isId = (v) => typeof v === 'string' && /^[a-z0-9]{1,16}$/.test(v);
const isNum = (v, lim) => typeof v === 'number' && Math.abs(v) <= lim;   // NaN 比較結果為 false，一併擋掉

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`讀不到 ${src}`));
    document.head.appendChild(s);
  });
}

// 還沒收到對方的配色前，先用代號算一套，收到後再換
function fallbackOutfit(id) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return presetOutfit(Math.abs(h) % ROBES.length);
}

// 在線名單裡對方最新的配色
function outfitIn(metas) {
  const o = Array.isArray(metas) ? metas[metas.length - 1]?.o : null;
  return isOutfit(o) ? o : null;
}

const emojiTextures = new Map();
function emojiTexture(e) {
  if (!emojiTextures.has(e)) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.font = '96px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(e, 64, 72);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    emojiTextures.set(e, t);
  }
  return emojiTextures.get(e);
}

function dispose(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) o.material.dispose();   // 貼圖（影子、表情）是共用的，不跟著丟
  });
}

export class Multiplayer {
  constructor(scene, shadowTex, player, cfg, events, outfit) {
    this.scene = scene;
    this.shadowTex = shadowTex;
    this.player = player;
    this.cfg = cfg;
    this.events = events;           // { onCount(n), onReady(), onPet(other, i), onJump(other) }
    this.id = Math.random().toString(36).slice(2, 10);
    this.others = new Map();        // id -> { ch, pos, target, heading, seen, speed }
    this.present = new Set();       // 目前在線上的訪客 id（來自 presence）
    this.outfits = new Map();       // id -> 配色（來自 presence）
    this.outfit = outfit;
    this.fx = [];                   // 正在飄的表情
    this.active = false;
    this.last = null;
    this.lastSent = 0;
    this.lastEmote = 0;
    this.lastJump = 0;
    this.lastPet = 0;
  }

  async connect() {
    await loadScript('vendor/supabase.js');
    const client = window.supabase.createClient(this.cfg.url, this.cfg.key, { auth: { persistSession: false } });
    const ch = client.channel(this.cfg.channel || 'gallery', {
      config: { broadcast: { self: false }, presence: { key: this.id } },
    });
    ch.on('broadcast', { event: 'pos' }, ({ payload }) => this.onPos(payload))
      .on('broadcast', { event: 'emote' }, ({ payload }) => this.onEmote(payload))
      .on('broadcast', { event: 'jump' }, ({ payload }) => this.onJump(payload))
      .on('broadcast', { event: 'pet' }, ({ payload }) => this.onPet(payload))
      .on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState();
        this.present = new Set(Object.keys(state));
        this.outfits.clear();
        for (const [id, metas] of Object.entries(state)) {
          const o = outfitIn(metas);
          if (o) this.outfits.set(id, o);
        }
        for (const [id, o] of this.others) {
          const want = this.outfits.get(id);
          if (want && want.join() !== o.ch.outfit.join()) o.ch.setOutfit(want);
        }
        this.events.onCount(this.present.size);
      })
      // 有人進來就馬上報一次位置，對方才不用等
      .on('presence', { event: 'join' }, ({ key }) => { this.present.add(key); this.last = null; })
      // 換裝重新登記時也會先收到一次離開，那個人還有其他登記就不算走了
      .on('presence', { event: 'leave' }, ({ key, currentPresences }) => {
        if (currentPresences?.length) return;
        this.present.delete(key);
        this.remove(key);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this.active = true;
          this.last = null;
          ch.track({ o: this.outfit });
          this.events.onReady();
        } else {
          this.active = false;
        }
      });
    this.channel = ch;
  }

  // 坐下、拿點心這類狀態改變時，下一幀就送，不等節流
  sendNow() {
    this.last = null;
    this.lastSent = 0;
  }

  send(now) {
    const p = this.player;
    // s：0 沒坐、-1 坐在地上、i + 1 坐在第 i 個座位；f：手上的點心
    const st = { x: +p.pos.x.toFixed(2), z: +p.pos.z.toFixed(2), h: +p.heading.toFixed(2), r: p.room, s: p.sitCode, f: p.character.foodCode };
    const l = this.last;
    const changed = !l || Math.abs(st.x - l.x) > 0.02 || Math.abs(st.z - l.z) > 0.02 || Math.abs(wrapAngle(st.h - l.h)) > 0.05 || st.r !== l.r || st.s !== l.s || st.f !== l.f;
    if (now - this.lastSent < (changed ? SEND_MOVING : SEND_IDLE)) return;
    this.channel.send({ type: 'broadcast', event: 'pos', payload: { id: this.id, ...st } });
    this.last = st;
    this.lastSent = now;
  }

  onPos(m) {
    // 頻道是公開的，任何人都能亂送，所以內容和身分都要先過濾
    if (!m || !isId(m.id) || m.id === this.id) return;
    if (!isNum(m.x, COORD_LIMIT) || !isNum(m.z, COORD_LIMIT) || !isNum(m.h, 100) || !isNum(m.r, 100)) return;
    // 舊版網頁不會送這兩項，當作沒坐、空手
    const seats = this.player.world.outdoor?.seats || [];
    m.s = Number.isInteger(m.s) && m.s >= -1 && m.s <= seats.length ? m.s : 0;
    m.f = isFood(m.f) ? m.f : 0;
    let o = this.others.get(m.id);
    if (!o) {
      if (this.others.size >= MAX_TRACKED) return;
      // 在線名單同步比訊息慢，新來的人先暫時放行，但名額很少，認可不了就丟掉
      if (!this.present.has(m.id) && [...this.others.values()].filter((x) => !x.verified).length >= MAX_UNVERIFIED) return;
      const ch = new Character(this.shadowTex, this.outfits.get(m.id) || fallbackOutfit(m.id));
      this.scene.add(ch.group);
      o = { ch, pos: new THREE.Vector3(m.x, 0, m.z), heading: m.h, speed: 0, verified: this.present.has(m.id), born: performance.now() };
      this.others.set(m.id, o);
    }
    o.target = m;
    o.seen = performance.now();
  }

  remove(id) {
    const o = this.others.get(id);
    if (!o) return;
    this.scene.remove(o.ch.group);
    dispose(o.ch.group);
    this.others.delete(id);
  }

  emote(e) {
    const now = performance.now();
    if (!this.active || now - this.lastEmote < EMOTE_GAP) return;
    this.lastEmote = now;
    this.channel.send({ type: 'broadcast', event: 'emote', payload: { id: this.id, e } });
    this.pop(this.player.character.group, e);
    this.player.character.emote(e);
  }

  onEmote(m) {
    const o = m && isId(m.id) ? this.others.get(m.id) : null;
    if (o && o.ch.group.visible && EMOTES.includes(m.e)) {
      this.pop(o.ch.group, m.e);
      o.ch.emote(m.e);
    }
  }

  // 只送「跳了」這件事，高度由各自的畫面照同樣的重力算
  jump() {
    const now = performance.now();
    if (!this.active || now - this.lastJump < JUMP_GAP) return;
    this.lastJump = now;
    this.channel.send({ type: 'broadcast', event: 'jump', payload: { id: this.id } });
  }

  onJump(m) {
    const o = m && isId(m.id) ? this.others.get(m.id) : null;
    if (o && o.ch.group.visible) {
      o.ch.jump();
      this.events.onJump?.(o);
    }
  }

  // 動物的行程每台算出來都一樣，摸了哪一隻只要傳編號
  pet(i) {
    const now = performance.now();
    if (!this.active || now - this.lastPet < PET_GAP) return;
    this.lastPet = now;
    this.channel.send({ type: 'broadcast', event: 'pet', payload: { id: this.id, a: i } });
  }

  onPet(m) {
    const o = m && isId(m.id) ? this.others.get(m.id) : null;
    if (o && o.ch.group.visible && Number.isInteger(m.a)) this.events.onPet?.(o, m.a);
  }

  setOutfit(o) {
    this.outfit = o.slice();
    clearTimeout(this.outfitTimer);
    this.outfitTimer = setTimeout(() => { if (this.active) this.channel.track({ o: this.outfit }); }, OUTFIT_DELAY);
  }

  // 頭上冒出表情，往上飄再淡出
  pop(group, e) {
    if (this.fx.filter((f) => f.group === group).length >= 3) return;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(e), transparent: true, depthWrite: false }));
    s.position.y = 1.85;
    group.add(s);
    this.fx.push({ s, group, t: 0 });
  }

  // 回傳畫面上是否還有東西在動，主迴圈用來決定要不要降幀
  update(dt, now) {
    if (this.active) this.send(now);
    const me = this.player;
    let moving = this.fx.length > 0;

    const near = [];
    for (const [id, o] of this.others) {
      if (now - o.seen > STALE) { this.remove(id); continue; }
      if (!o.verified) {
        if (this.present.has(id)) o.verified = true;
        else if (now - o.born > UNVERIFIED_TTL) { this.remove(id); continue; }
      }
      const t = o.target;
      if (Math.abs(t.r - me.room) <= 1) near.push([Math.hypot(t.x - me.pos.x, t.z - me.pos.z), o]);
      else o.ch.group.visible = false;
    }
    near.sort((a, b) => a[0] - b[0]);

    near.forEach(([, o], i) => {
      const g = o.ch.group;
      g.visible = i < MAX_SHOWN;
      const t = o.target;
      // 離太遠（對方瞬移）就直接跳過去，否則平滑跟上
      if (!g.visible || Math.hypot(t.x - o.pos.x, t.z - o.pos.z) > 4) o.pos.set(t.x, 0, t.z);
      if (!g.visible) return;
      const ox = o.pos.x, oz = o.pos.z, k = 1 - Math.exp(-dt * 6);
      o.pos.x += (t.x - o.pos.x) * k;
      o.pos.z += (t.z - o.pos.z) * k;
      o.speed = Math.hypot(o.pos.x - ox, o.pos.z - oz) / Math.max(dt, 1e-4);
      o.heading += wrapAngle(t.h - o.heading) * Math.min(1, dt * 8);
      const world = this.player.world, seat = t.s > 0 ? world.outdoor.seats[t.s - 1] : null;
      o.pos.y = world.groundY(o.pos.x, o.pos.z);
      o.ch.sitting = t.s !== 0;
      if (t.s) o.ch.lift = seat ? seat.lift : 0.02;
      if (t.f !== o.ch.foodCode) o.ch.setFoodCode(t.f);
      g.position.copy(o.pos);
      g.rotation.y = o.heading;
      o.ch.update(dt, t.s ? 0 : o.speed);
      if (o.speed > 0.05 || o.ch.busy) moving = true;
    });

    for (const f of this.fx) {
      f.t += dt;
      const t = f.t;
      f.s.position.y = 1.85 + t * 0.3;
      const sc = 0.45 * Math.min(1, t * 6);
      f.s.scale.set(sc, sc, sc);
      f.s.material.opacity = t < EMOTE_TIME - 0.5 ? 1 : Math.max(0, (EMOTE_TIME - t) / 0.5);
      if (t >= EMOTE_TIME) {
        f.group.remove(f.s);
        f.s.material.dispose();
      }
    }
    this.fx = this.fx.filter((f) => f.t < EMOTE_TIME);
    return moving;
  }
}
