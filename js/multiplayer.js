// 多人同遊：透過 Supabase Realtime 互傳位置和表情。gallery.json 沒填 realtime 就不啟用。
// 其他訪客用不同配色的學徒顯示，不取名、不聊天。
import * as THREE from 'three';
import { Character, OTHER_COLORS } from './character.js';

const SEND_MOVING = 200;    // 走動時每 0.2 秒送一次位置
const SEND_IDLE = 8000;     // 站著不動時偶爾報一次，確認還在
const STALE = 20000;        // 這麼久沒消息就當作離開
const MAX_SHOWN = 10;       // 只畫最近的幾位，手機才跑得動
const EMOTE_GAP = 800;      // 自己送表情的最短間隔
const EMOTE_TIME = 2;       // 表情在頭上停留的秒數
export const EMOTES = ['❤️', '✨', '👏', '😮', '👋'];

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`讀不到 ${src}`));
    document.head.appendChild(s);
  });
}

// 同一個人每次都是同一組顏色
function colorsFor(id) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return OTHER_COLORS[Math.abs(h) % OTHER_COLORS.length];
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
  constructor(scene, shadowTex, player, cfg, events) {
    this.scene = scene;
    this.shadowTex = shadowTex;
    this.player = player;
    this.cfg = cfg;
    this.events = events;           // { onCount(n), onReady() }
    this.id = Math.random().toString(36).slice(2, 10);
    this.others = new Map();        // id -> { ch, pos, target, heading, seen, speed }
    this.fx = [];                   // 正在飄的表情
    this.active = false;
    this.last = null;
    this.lastSent = 0;
    this.lastEmote = 0;
  }

  async connect() {
    await loadScript('vendor/supabase.js');
    const client = window.supabase.createClient(this.cfg.url, this.cfg.key, { auth: { persistSession: false } });
    const ch = client.channel(this.cfg.channel || 'gallery', {
      config: { broadcast: { self: false }, presence: { key: this.id } },
    });
    ch.on('broadcast', { event: 'pos' }, ({ payload }) => this.onPos(payload))
      .on('broadcast', { event: 'emote' }, ({ payload }) => this.onEmote(payload))
      .on('presence', { event: 'sync' }, () => this.events.onCount(Object.keys(ch.presenceState()).length))
      // 有人進來就馬上報一次位置，對方才不用等
      .on('presence', { event: 'join' }, () => { this.last = null; })
      .on('presence', { event: 'leave' }, ({ key }) => this.remove(key))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this.active = true;
          this.last = null;
          ch.track({});
          this.events.onReady();
        } else {
          this.active = false;
        }
      });
    this.channel = ch;
  }

  send(now) {
    const p = this.player;
    const st = { x: +p.pos.x.toFixed(2), z: +p.pos.z.toFixed(2), h: +p.heading.toFixed(2), r: p.room };
    const l = this.last;
    const changed = !l || Math.abs(st.x - l.x) > 0.02 || Math.abs(st.z - l.z) > 0.02 || Math.abs(wrapAngle(st.h - l.h)) > 0.05 || st.r !== l.r;
    if (now - this.lastSent < (changed ? SEND_MOVING : SEND_IDLE)) return;
    this.channel.send({ type: 'broadcast', event: 'pos', payload: { id: this.id, ...st } });
    this.last = st;
    this.lastSent = now;
  }

  onPos(m) {
    if (!m || m.id === this.id) return;
    let o = this.others.get(m.id);
    if (!o) {
      const ch = new Character(this.shadowTex, colorsFor(m.id));
      this.scene.add(ch.group);
      o = { ch, pos: new THREE.Vector3(m.x, 0, m.z), heading: m.h, speed: 0 };
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
  }

  onEmote(m) {
    const o = m && this.others.get(m.id);
    if (o && o.ch.group.visible && EMOTES.includes(m.e)) this.pop(o.ch.group, m.e);
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
      g.position.copy(o.pos);
      g.rotation.y = o.heading;
      o.ch.update(dt, o.speed);
      if (o.speed > 0.05) moving = true;
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
