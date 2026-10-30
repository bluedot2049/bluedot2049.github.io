// 攝影模式：鏡頭離開角色自由飛，拍高解析照片或錄影，拍完可以分享或下載。
// 取景框、色調、暗角、顆粒、落款在畫面上看到的樣子，就是存下來的樣子：
// 照片另外用 setViewOffset 把取景框那一塊重畫成大圖；錄影每一幀把畫面裁進一張 2D 畫布再交給 MediaRecorder。
// 角色留在原地照常動，表情、坐下都會出現在畫面裡；對話框是 HTML，拍的時候照著位置畫進去。
// 變焦從望遠一路拉到廣角，再往上就慢慢彎成魚眼；怎麼彎、怎麼畫在 lens.js。
import * as THREE from 'three';
import { lens, fitSource } from './lens.js';
import { makePostcard } from './postcard.js';

const ASPECTS = [
  { label: '螢幕', r: 0 },
  { label: '16:9', r: 16 / 9 },
  { label: '9:16', r: 9 / 16 },
  { label: '1:1', r: 1 },
  { label: '4:5', r: 4 / 5 },
  { label: '寬銀幕', r: 2.39 },
];
// filter 是 CSS 的寫法，畫面上直接套在 canvas，存檔時給 2D 畫布的 ctx.filter（Safari 17 以前不支援，就存成原色）
const LOOKS = [
  { label: '原樣', filter: '', vig: 0.32, grain: 0 },
  { label: '暖陽', filter: 'sepia(.18) saturate(1.15) contrast(1.05) brightness(1.03)', vig: 0.3, grain: 0 },
  { label: '底片', filter: 'contrast(.9) saturate(.78) sepia(.12) brightness(1.05)', vig: 0.22, grain: 0.07 },
  { label: '濃郁', filter: 'saturate(1.35) contrast(1.12)', vig: 0.36, grain: 0 },
  { label: '黑白', filter: 'grayscale(1) contrast(1.15) brightness(1.03)', vig: 0.4, grain: 0.06 },
  { label: '舊照', filter: 'sepia(.7) contrast(1.06) brightness(.98)', vig: 0.5, grain: 0.08 },
];
// 運鏡只在錄影時動，選好了等按下錄影才開始
const MOVES = ['手動', '推近', '環繞', '升起', '橫移', '搖鏡'];
// 視角（度）：100 以下是一般鏡頭，再往上拉就慢慢彎成魚眼，拉到 FOV_MAX 是完全的魚眼
const FOV_MIN = 12, FISH = 100, FOV_MAX = 140;
const CORNER = THREE.MathUtils.degToRad(78);   // 魚眼開到底時取景框角落的角度，對角 156°
const LENSES = [['魚眼', FOV_MAX], ['廣角', 96], ['標準', 50], ['望遠', 16]];
const SPEED = 3;
const MAX_REC = 60;   // 錄影最長秒數
const KEY = 'photo';

// 等效全片幅焦距，給變焦時顯示用
const focal = (fov) => Math.round(12 / Math.tan(THREE.MathUtils.degToRad(fov / 2)));
const pad2 = (n) => String(n).padStart(2, '0');
function stamp() {
  const d = new Date();
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}

function noiseTile() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d'), img = ctx.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 錄影格式：能錄 mp4 就錄 mp4（IG、LINE 都收），不行才用 webm
function pickMime() {
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return null;
  const list = ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return list.find((m) => MediaRecorder.isTypeSupported?.(m)) || null;
}

export class PhotoMode {
  // render(dt)：照目前的設定畫一幀（有後製就走後製）；resizeFX(w, h)：後製跟著換尺寸
  constructor({ renderer, camera, player, world, character, ambience, ui, title, coarse, render, resizeFX }) {
    Object.assign(this, { renderer, camera, player, world, character, ambience, ui, title, coarse, render, resizeFX });
    this.active = false;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;          // 實際的方向，平滑追著 aim
    this.aimYaw = 0; this.aimPitch = 0;
    this.fov = 50;                          // 要變到的視角；cur 是目前的，平滑追著 fov
    this.cur = 50;
    this.menu = null;                       // 打開中的選單
    this.keys = new Set();
    this.joy = { x: 0, y: 0 };
    this.lift = 0;                          // 手機的升、降按鈕
    this.room = -1;
    this.pivot = null;                      // 環繞的中心
    this.rec = null;
    this.mime = pickMime();
    this.noise = noiseTile();
    this.frame = { x: 0, y: 0, w: 1, h: 1 };
    this.result = null;                     // 剛拍好的 { blob, url, name, video }
    const s = this.load();
    this.aspect = s.aspect; this.look = s.look; this.move = 0;
    this.grid = s.grid; this.self = s.self; this.talk = s.talk; this.sig = s.sig;
    this.$ = (q) => document.querySelector(q);
    this.bindUI();
    this.bindInput();
  }

  load() {
    const d = { aspect: 0, look: 0, grid: false, self: true, talk: true, sig: true };
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && typeof s === 'object') {
        for (const k of Object.keys(d)) if (typeof s[k] === typeof d[k]) d[k] = s[k];
        d.aspect = Math.min(Math.max(0, d.aspect | 0), ASPECTS.length - 1);
        d.look = Math.min(Math.max(0, d.look | 0), LOOKS.length - 1);
      }
    } catch {}
    return d;
  }

  save() {
    const { aspect, look, grid, self, talk, sig } = this;
    try { localStorage.setItem(KEY, JSON.stringify({ aspect, look, grid, self, talk, sig })); } catch {}
  }

  // ───────── 進出 ─────────

  // postcard：從海市的信差站進來，拍好的照片做成明信片
  enter({ postcard = false } = {}) {
    if (this.active) return;
    this.postcard = postcard;
    const p = this.player, cam = this.camera;
    this.ui.hidePainting();
    this.ui.hideDress();
    p.exitView();
    p.stop();
    p.setJoystick(0, 0);
    p.keys.clear();
    p.paused = true;
    cam.clearViewOffset();
    this.pos.copy(cam.position);
    this.vel.set(0, 0, 0);
    const dir = cam.getWorldDirection(new THREE.Vector3());
    this.yaw = this.aimYaw = Math.atan2(-dir.x, -dir.z);
    this.pitch = this.aimPitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
    this.fov = this.cur = cam.fov;
    this.room = -1;
    this.active = true;
    document.body.classList.add('photo');
    this.$('#photo').hidden = false;
    this.showControls(true);
    this.refresh();
    if (postcard) this.ui.hint('拍一張做成明信片，拍好就能寄出去', 6000);
    else this.ui.hint(this.coarse ? '拖曳轉頭　雙指變焦　點畫面收起按鈕' : 'WASD 移動　E / Q 升降　Shift 加速　拖曳轉頭　滾輪變焦　空白鍵拍照　H 收起按鈕', 6000);
  }

  exit() {
    if (!this.active) return;
    if (this.rec) this.stopRecording();
    this.closeResult();
    this.closeMenu();
    this.active = false;
    this.postcard = false;
    lens.on = false;
    this.keys.clear();
    this.joy.x = this.joy.y = 0;
    this.lift = 0;
    document.body.classList.remove('photo', 'photo-bare', 'photo-hush');
    this.$('#photo').hidden = true;
    this.renderer.domElement.style.filter = '';
    this.character.group.visible = true;
    this.player.marker.visible = true;
    this.camera.fov = 50;
    this.camera.updateProjectionMatrix();
    this.player.paused = false;
    this.world.setCurrentRoom(this.player.room);
    this.ui.hideHint();
  }

  toggle() { this.active ? this.exit() : this.enter(); }

  // ───────── 介面 ─────────

  bindUI() {
    // 每個鈕點開是一排選項；「顯示」是幾個開關，可以連著點，點選單外面才收
    // lock：錄影中不能換（比例會改掉影片大小，運鏡錄到一半換會跳）
    const chips = this.$('#ph-chips');
    this.chips = [
      { k: 'aspect', label: '比例', lock: true, opts: ASPECTS.map((a) => a.label), get: () => this.aspect, set: (i) => { this.aspect = i; } },
      { k: 'look', label: '色調', opts: LOOKS.map((l) => l.label), get: () => this.look, set: (i) => { this.look = i; } },
      { k: 'move', label: '運鏡', lock: true, opts: MOVES, get: () => this.move, set: (i) => { this.move = i; }, note: '按下錄影才開始動' },
      { k: 'show', label: '顯示', toggles: [['self', '自己入鏡'], ['talk', '對話框'], ['sig', '落款'], ['grid', '格線']] },
    ];
    chips.innerHTML = this.chips.map((c) => `<button class="ph-chip" data-k="${c.k}"><span>${c.label}</span><b></b></button>`).join('');
    for (const c of this.chips) {
      c.el = chips.querySelector(`[data-k="${c.k}"]`);
      c.b = c.el.querySelector('b');
      c.el.addEventListener('click', () => (this.menu === c ? this.closeMenu() : this.openMenu(c)));
    }
    const menu = this.$('#ph-menu');
    menu.addEventListener('click', (e) => {
      const btn = e.target.closest('button'), c = this.menu;
      if (!btn || !c) return;
      if (btn.dataset.t) {
        const k = btn.dataset.t;
        this[k] = !this[k];
        btn.classList.toggle('on', this[k]);
      } else {
        c.set(+btn.dataset.i);
        this.closeMenu();
      }
      this.save();
      this.refresh();
    });
    // 點選單以外的地方就收起來；點在畫面上的那一下不算收按鈕
    document.addEventListener('pointerdown', (e) => {
      this.swallowTap = false;
      if (!this.menu || menu.contains(e.target) || this.menu.el.contains(e.target)) return;
      this.closeMenu();
      this.swallowTap = true;
    }, true);

    const lensBar = this.$('#ph-lens');
    lensBar.innerHTML = LENSES.map(([label], i) => `<button data-i="${i}">${label}</button>`).join('');
    lensBar.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (btn) this.zoom(LENSES[+btn.dataset.i][1]);
    });
    this.$('#ph-exit').addEventListener('click', () => this.exit());
    this.$('#ph-shutter').addEventListener('click', () => this.shoot());
    const recBtn = this.$('#ph-record');
    if (this.mime) recBtn.addEventListener('click', () => (this.rec ? this.stopRecording() : this.startRecording()));
    else recBtn.hidden = true;
    for (const [id, v] of [['#ph-up', 1], ['#ph-down', -1]]) {
      const b = this.$(id);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); this.lift = v; });
      const off = () => { if (this.lift === v) this.lift = 0; };
      b.addEventListener('pointerup', off);
      b.addEventListener('pointercancel', off);
    }
    this.$('#ph-share').addEventListener('click', () => this.share());
    this.$('#ph-save').addEventListener('click', () => this.download());
    this.$('#ph-again').addEventListener('click', () => this.closeResult());
    this.$('#ph-frame .grain').style.backgroundImage = `url(${this.noise.toDataURL()})`;
    window.addEventListener('resize', () => this.active && this.refresh());
  }

  refresh() {
    for (const c of this.chips) {
      c.b.textContent = c.opts ? c.opts[c.get()] : '';
      c.el.classList.toggle('off', !!(c.lock && this.rec));
    }
    this.markLens();
    const look = LOOKS[this.look];
    this.renderer.domElement.style.filter = look.filter;
    this.character.group.visible = this.self;
    this.player.marker.visible = this.self;
    document.body.classList.toggle('photo-hush', !this.talk);
    const fr = this.$('#ph-frame');
    fr.classList.toggle('grid', this.grid);
    fr.classList.toggle('masked', ASPECTS[this.aspect].r > 0);
    fr.style.setProperty('--vig', look.vig);
    fr.querySelector('.grain').style.opacity = look.grain;
    this.layoutFrame();
  }

  // 取景框：照比例放到最大，置中
  layoutFrame() {
    const W = window.innerWidth, H = window.innerHeight, r = ASPECTS[this.aspect].r;
    let w = W, h = H;
    if (r) {
      if (W / H > r) w = Math.round(H * r);
      else h = Math.round(W / r);
    }
    const f = (this.frame = { x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w, h });
    const el = this.$('#ph-frame');
    Object.assign(el.style, { left: f.x + 'px', top: f.y + 'px', width: w + 'px', height: h + 'px' });
    const sig = el.querySelector('.sig');
    this.sigSize = Math.max(11, Math.round(Math.min(w, h) * 0.028));
    sig.hidden = !this.sig;
    Object.assign(sig.style, { height: this.sigSize * 1.1 + 'px', right: this.sigSize * 1.3 + 'px', bottom: this.sigSize * 1.1 + 'px' });
  }

  showControls(on) {
    if (!on) this.closeMenu();
    document.body.classList.toggle('photo-bare', !on);
  }

  // 選單開在按鈕旁邊：按鈕在畫面下半就往上開，不然往下開
  openMenu(c) {
    if (c.lock && this.rec) return;
    const m = this.$('#ph-menu');
    this.menu = c;
    m.classList.toggle('toggles', !!c.toggles);
    m.innerHTML = c.toggles
      ? c.toggles.map(([k, label]) => `<button data-t="${k}" class="${this[k] ? 'on' : ''}">${label}</button>`).join('')
      : c.opts.map((label, i) => `<button data-i="${i}" class="${i === c.get() ? 'on' : ''}">${label}</button>`).join('') + (c.note ? `<p>${c.note}</p>` : '');
    m.hidden = false;
    const r = c.el.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight;
    const left = Math.max(12, Math.min(r.left, W - m.offsetWidth - 12));
    const below = r.top < H / 2;
    Object.assign(m.style, { left: left + 'px', top: below ? r.bottom + 8 + 'px' : '', bottom: below ? '' : H - r.top + 8 + 'px' });
    for (const x of this.chips) x.el.classList.toggle('open', x === c);
  }

  closeMenu() {
    if (!this.menu) return;
    this.menu = null;
    this.$('#ph-menu').hidden = true;
    for (const x of this.chips) x.el.classList.remove('open');
  }

  // 錄影開始時決定環繞的中心：角色在前方不遠就繞著角色，不然繞著畫面中央前方六公尺的點
  aimPivot() {
    this.pivot = null;
    if (MOVES[this.move] !== '環繞') return;
    const ch = this.player.pos, fw = this.forward(new THREE.Vector3());
    const to = new THREE.Vector3(ch.x - this.pos.x, ch.y + 0.9 - this.pos.y, ch.z - this.pos.z);
    const d = to.length();
    this.pivot = this.self && d < 25 && to.dot(fw) > d * 0.5
      ? new THREE.Vector3(ch.x, ch.y + 0.9, ch.z)
      : this.pos.clone().addScaledVector(fw, 6);
  }

  // ───────── 操作 ─────────

  bindInput() {
    const el = this.renderer.domElement;
    const pts = new Map();
    let pinch = null, multi = false;
    el.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      el.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, drag: false, mouse: e.pointerType === 'mouse', quiet: this.swallowTap });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), fov: this.fov };
        multi = true;
      }
    });
    el.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!this.active || !p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (pinch && pts.size >= 2) {
        const [a, b] = [...pts.values()];
        this.zoom(pinch.fov * (pinch.d / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y))));
        return;
      }
      if (!p.drag && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 8) p.drag = true;
      if (!p.drag || multi) return;
      // 方向跟走路時轉鏡頭一樣：滑鼠拖到哪就往哪看，觸控是手指拖著畫面走
      const s = p.mouse ? 1 : -1;
      const k = ((p.mouse ? 3.2 : 2.8) / Math.max(window.innerWidth, window.innerHeight)) * (this.fov / 50);
      this.aimYaw -= dx * k * s;
      this.aimPitch = THREE.MathUtils.clamp(this.aimPitch - dy * k * s, -1.5, 1.5);
    });
    const up = (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      pts.delete(e.pointerId);
      // 點一下畫面：收起或叫回按鈕
      if (this.active && e.type === 'pointerup' && !p.drag && !p.quiet && !multi && !this.result) this.showControls(document.body.classList.contains('photo-bare'));
      if (pts.size < 2) pinch = null;
      if (pts.size === 0) multi = false;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => {
      if (!this.active) return;
      e.preventDefault();
      this.zoom(this.fov * (1 + e.deltaY * 0.001));
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'p' || e.key === 'P') {
        if (!this.result) this.toggle();
        return;
      }
      if (!this.active) return;
      if (this.result) {
        if (e.key === 'Escape') this.closeResult();
        return;
      }
      if (e.key === 'Escape') return this.menu ? this.closeMenu() : this.exit();
      if (e.key === ' ') {
        e.preventDefault();
        if (!e.repeat) this.shoot();
        return;
      }
      if (e.key === 'h' || e.key === 'H') return this.showControls(document.body.classList.contains('photo-bare'));
      this.keys.add(e.key.toLowerCase());
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => { this.keys.clear(); this.lift = 0; });
  }

  setJoystick(x, y) {
    this.joy.x = x;
    this.joy.y = y;
  }

  zoom(fov) {
    this.fov = THREE.MathUtils.clamp(fov, FOV_MIN, FOV_MAX);
    const el = this.$('#ph-zoom');
    el.textContent = this.fov > FISH ? `魚眼 ${Math.round(THREE.MathUtils.radToDeg(this.fish(this.fov).c * 2))}°` : focal(this.fov) + 'mm';
    el.classList.add('show');
    clearTimeout(this.zoomTimer);
    this.zoomTimer = setTimeout(() => el.classList.remove('show'), 900);
    this.markLens();
  }

  // 鏡頭鈕亮哪一顆：彎了就是魚眼，不然看離哪一顆最近
  markLens() {
    let at = 0;
    if (this.fov <= FISH) {
      let best = Infinity;
      for (let i = 1; i < LENSES.length; i++) {
        const d = Math.abs(Math.log(this.fov / LENSES[i][1]));
        if (d < best) { best = d; at = i; }
      }
    }
    this.$('#ph-lens').querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', i === at));
  }

  // 魚眼的形狀（v 超過 FISH 時）：k 彎的程度，c 取景框角落的角度，fo 成像的焦距（CSS 像素）
  // 剛超過 FISH 時跟一般鏡頭開到 FISH 一模一樣，越往上越彎、角落越斜，中間不會跳
  fish(v) {
    const t = (v - FISH) / (FOV_MAX - FISH), k = Math.max(1 - t, 1e-3);
    const fr = this.frame, rc = Math.hypot(fr.w, fr.h) / 2;
    const c0 = Math.atan(Math.tan(THREE.MathUtils.degToRad(FISH / 2)) * rc / (window.innerHeight / 2));
    const c = c0 + Math.max(0, CORNER - c0) * t;
    return { k, c, fo: rc * k / Math.tan(k * c) };
  }

  // 照目前的視角擺好鏡頭：一般鏡頭直接設 fov；魚眼的話鏡頭負責畫原圖，視角要廣到整個螢幕彎回去的地方
  applyLens() {
    const cam = this.camera, W = window.innerWidth, H = window.innerHeight;
    if (this.cur <= FISH) {
      lens.on = false;
      cam.fov = this.cur;
    } else {
      const { k, fo } = this.fish(this.cur);
      Object.assign(lens, { on: true, k, fo, w: W, h: H });
      lens.fs = fitSource(W, H);
      cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(H / 2 / lens.fs));
    }
    cam.updateProjectionMatrix();
  }

  forward(out) {
    const c = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * c, Math.sin(this.pitch), -Math.cos(this.yaw) * c);
  }

  // 每幀在 player.update 之後呼叫，鏡頭交給這裡擺
  update(dt) {
    if (!this.active) return;
    const k = this.keys;
    let f = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    let s = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    let u = (k.has('e') ? 1 : 0) - (k.has('q') ? 1 : 0) + this.lift;
    const jm = Math.hypot(this.joy.x, this.joy.y);
    if (jm > 0.12) { f = -this.joy.y; s = this.joy.x; }
    const fast = k.has('shift') ? 3 : 1;
    // 平平地往前後左右走，不跟著抬頭低頭往天上飛；升降另外按
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const want = new THREE.Vector3(-sy * f + cy * s, u, -cy * f - sy * s);
    if (want.lengthSq() > 1) want.normalize();
    want.multiplyScalar(SPEED * fast);
    // 起步和停下都慢慢來，錄起來才不會一頓一頓
    this.vel.lerp(want, 1 - Math.exp(-dt * 3.5));
    this.pos.addScaledVector(this.vel, dt);

    const mv = this.rec ? MOVES[this.move] : '手動';
    if (mv === '推近') this.pos.addScaledVector(this.forward(new THREE.Vector3()), 0.55 * dt);
    else if (mv === '升起') this.pos.y += 0.35 * dt;
    else if (mv === '橫移') { this.pos.x += cy * 0.6 * dt; this.pos.z -= sy * 0.6 * dt; }
    else if (mv === '搖鏡') this.aimYaw -= 0.1 * dt;
    else if (mv === '環繞' && this.pivot) {
      // 鏡頭和視線一起繞中心轉，構圖不變
      const a = 0.16 * dt, c = Math.cos(a), n = Math.sin(a);
      const dx = this.pos.x - this.pivot.x, dz = this.pos.z - this.pivot.z;
      this.pos.x = this.pivot.x + dx * c + dz * n;
      this.pos.z = this.pivot.z - dx * n + dz * c;
      this.aimYaw += a;
      this.yaw += a;
    }

    // 不鑽進地面和樹林，也不飛離角色太遠
    const ch = this.player.pos, R = 120;
    const hx = this.pos.x - ch.x, hz = this.pos.z - ch.z, hd = Math.hypot(hx, hz);
    if (hd > R) { this.pos.x = ch.x + (hx / hd) * R; this.pos.z = ch.z + (hz / hd) * R; }
    this.pos.y = THREE.MathUtils.clamp(this.pos.y, this.world.camFloor(this.pos.x, this.pos.z) + 0.2, 60);

    const t = 1 - Math.exp(-dt * 12);
    this.yaw += (this.aimYaw - this.yaw) * t;
    this.pitch += (this.aimPitch - this.pitch) * t;
    const cam = this.camera;
    cam.position.copy(this.pos);
    cam.lookAt(this.pos.clone().add(this.forward(new THREE.Vector3())));
    this.cur = Math.abs(this.fov - this.cur) > 0.01 ? this.cur + (this.fov - this.cur) * t : this.fov;
    this.applyLens();

    // 鏡頭飛進哪一間，就畫哪一間附近的房間
    const room = this.world.roomIndexAt(this.pos.z);
    if (room !== this.room) {
      this.room = room;
      this.world.setCurrentRoom(room);
    }
  }

  // 牆要不要降下來：自己入鏡時跟走路一樣顧著角色，不入鏡就只看鏡頭在哪
  fadeTarget() {
    return this.self ? this.player.pos : this.pos;
  }

  // ───────── 合成：畫面 → 2D 畫布 ─────────

  // 把剛畫好的 3D 畫面（src 的 sx..sh 那一塊）加上色調、對話框、暗角、顆粒和落款，畫進 ctx（W × H）
  // k：取景框裡 1 個 CSS 像素對應輸出幾個像素
  compose(ctx, src, sx, sy, sw, sh, W, H, k, grainShift) {
    const look = LOOKS[this.look];
    ctx.save();
    ctx.filter = look.filter || 'none';
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, W, H);
    ctx.restore();
    if (this.talk) this.drawBubbles(ctx, k);
    if (look.vig > 0) {
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(W * 0.75, H * 0.7);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0.55, 'rgba(20,10,4,0)');
      g.addColorStop(1, `rgba(20,10,4,${look.vig})`);
      ctx.fillStyle = g;
      ctx.fillRect(-2, -2, 4, 4);
      ctx.restore();
    }
    if (look.grain > 0) {
      ctx.save();
      const pat = ctx.createPattern(this.noise, 'repeat');
      pat.setTransform?.(new DOMMatrix().translateSelf(grainShift * 128, grainShift * 77).scaleSelf(k));
      ctx.globalAlpha = look.grain;
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    if (this.sig) this.drawSig(ctx, W, H, k);
  }

  // 落款：畫廊的毛筆字，位置大小和取景框裡的一樣
  drawSig(ctx, W, H, k) {
    const img = this.$('#ph-frame .sig');
    if (!img.naturalWidth) return;
    const h = this.sigSize * 1.1 * k, w = h * img.naturalWidth / img.naturalHeight;
    ctx.save();
    ctx.globalAlpha = 0.82;
    ctx.drawImage(img, W - this.sigSize * 1.3 * k - w, H - this.sigSize * 1.1 * k - h, w, h);
    ctx.restore();
  }

  // 對話框：照 DOM 上每個字的位置畫，換行和字距都跟畫面一樣
  drawBubbles(ctx, k) {
    const fr = this.frame;
    const map = (x, y) => [(x - fr.x) * k, (y - fr.y) * k];
    for (const el of document.querySelectorAll('.speech.show')) {
      if (el.style.visibility === 'hidden') continue;
      const cs = getComputedStyle(el), op = parseFloat(cs.opacity);
      if (!(op > 0.02)) continue;
      const r = el.getBoundingClientRect();
      if (r.right < fr.x || r.left > fr.x + fr.w || r.bottom < fr.y - 20 || r.top > fr.y + fr.h) continue;
      const s = r.width / el.offsetWidth;   // 跳出來的動畫中途是縮小的
      const [x, y] = map(r.left, r.top), w = r.width * k, h = r.height * k, u = s * k;
      ctx.save();
      ctx.globalAlpha = op;
      roundRect(ctx, x, y, w, h, 18 * u);
      ctx.fillStyle = cs.backgroundColor;
      ctx.fill();
      ctx.lineWidth = u;
      ctx.strokeStyle = cs.borderTopColor;
      ctx.stroke();
      const cx = x + w / 2;
      ctx.beginPath();
      ctx.moveTo(cx - 8 * u, y + h - 0.5 * u); ctx.lineTo(cx + 8 * u, y + h - 0.5 * u); ctx.lineTo(cx, y + h + 11 * u);
      ctx.fillStyle = cs.borderTopColor;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - 7 * u, y + h - 1.5 * u); ctx.lineTo(cx + 7 * u, y + h - 1.5 * u); ctx.lineTo(cx, y + h + 9 * u);
      ctx.fillStyle = cs.backgroundColor;
      ctx.fill();
      ctx.font = `${cs.fontWeight} ${parseFloat(cs.fontSize) * u}px ${cs.fontFamily}`;
      ctx.fillStyle = cs.color;
      ctx.textBaseline = 'middle';
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), range = document.createRange();
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n.data;
        for (let i = 0; i < text.length; i++) {
          if (text[i] === ' ' || text[i] === '\n') continue;
          range.setStart(n, i);
          range.setEnd(n, i + 1);
          const cr = range.getBoundingClientRect();
          if (!cr.width) continue;
          const [tx, ty] = map(cr.left, cr.top + cr.height / 2);
          ctx.fillText(text[i], tx, ty);
        }
      }
      ctx.restore();
    }
  }

  // ───────── 拍照 ─────────

  flash() {
    const el = this.$('#ph-frame');
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }

  shoot() {
    if (!this.active || this.result) return;
    const fr = this.frame, r = this.renderer, cam = this.camera;
    const W = window.innerWidth, H = window.innerHeight;
    // 長邊：電腦 3840、手機 2560，不超過顯示卡能畫的大小
    const gl = r.getContext();
    const cap = Math.min(this.coarse ? 2560 : 3840, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), r.capabilities.maxTextureSize);
    const k = cap / Math.max(fr.w, fr.h);
    const outW = Math.round(fr.w * k), outH = Math.round(fr.h * k);
    const out = document.createElement('canvas');
    out.width = outW;
    out.height = outH;
    const ctx = out.getContext('2d');
    const dpr = r.getPixelRatio();
    try {
      r.setPixelRatio(1);
      r.setSize(outW, outH, false);
      this.resizeFX(outW, outH);
      if (lens.on) {
        // 魚眼要以取景框的中心彎，不能裁：原圖只畫取景框彎回去需要的範圍（取景框本來就在正中間）
        Object.assign(lens, { w: fr.w, h: fr.h, fs: fitSource(fr.w, fr.h) });
        cam.aspect = fr.w / fr.h;
        cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(fr.h / 2 / lens.fs));
        cam.updateProjectionMatrix();
      } else cam.setViewOffset(W, H, fr.x, fr.y, fr.w, fr.h);
      this.render(0);
      // 畫完馬上拷走，不然下一幀之前 WebGL 會把畫面清掉
      this.compose(ctx, r.domElement, 0, 0, outW, outH, outW, outH, k, Math.random());
    } finally {
      cam.clearViewOffset();
      cam.aspect = W / H;
      this.applyLens();
      r.setPixelRatio(dpr);
      r.setSize(W, H, false);
      this.resizeFX(W, H);
      this.render(0);
    }
    this.flash();
    const card = this.postcard ? makePostcard(out) : out;
    card.toBlob((blob) => {
      if (blob) this.showResult(blob, `${this.postcard ? '海市明信片' : '煉金畫廊'}-${stamp()}.jpg`, false);
    }, 'image/jpeg', 0.92);
  }

  // ───────── 錄影 ─────────

  startRecording() {
    if (this.rec || !this.mime) return;
    const fr = this.frame;
    // 長邊：電腦 1920、手機 1280；H.264 要偶數
    const long = this.coarse ? 1280 : 1920, k = long / Math.max(fr.w, fr.h);
    const even = (v) => Math.max(2, Math.round(v / 2) * 2);
    const c = document.createElement('canvas');
    c.width = even(fr.w * k);
    c.height = even(fr.h * k);
    const fps = this.coarse ? 30 : 60;
    const stream = c.captureStream(fps);
    // 環境聲和動物叫聲一起錄進去；靜音時錄到的就是安靜的
    const a = this.ambience;
    let tap = null;
    if (a.ctx && a.master) {
      try {
        tap = a.ctx.createMediaStreamDestination();
        a.master.connect(tap);
        a.sfx.connect(tap);
        a.hold = true;
        a.ctx.resume().catch(() => {});
        for (const t of tap.stream.getAudioTracks()) stream.addTrack(t);
      } catch { tap = null; }
    }
    let mr;
    try {
      mr = new MediaRecorder(stream, { mimeType: this.mime, videoBitsPerSecond: Math.min(16e6, c.width * c.height * fps * 0.1) });
    } catch (e) {
      console.warn('錄影失敗：', e);
      this.ui.hint('這個瀏覽器沒辦法錄影', 3000);
      return;
    }
    const chunks = [];
    mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    mr.onstop = () => {
      if (tap) {
        try { a.master.disconnect(tap); a.sfx.disconnect(tap); } catch {}
        a.hold = false;
        a.apply();
      }
      for (const t of stream.getTracks()) t.stop();
      const type = this.mime.split(';')[0];
      const blob = new Blob(chunks, { type });
      // 錄到一半離開攝影模式就不留了
      if (blob.size && this.active) this.showResult(blob, `煉金畫廊-${stamp()}.${type === 'video/mp4' ? 'mp4' : 'webm'}`, true);
    };
    mr.start(1000);
    this.closeMenu();
    this.aimPivot();
    this.rec ={ mr, canvas: c, ctx: c.getContext('2d'), k, start: performance.now(), shift: 0 };
    document.body.classList.add('photo-rec');
    this.$('#ph-rec').hidden = false;
    this.refresh();
  }

  stopRecording() {
    const rec = this.rec;
    if (!rec) return;
    this.rec = null;
    if (rec.mr.state !== 'inactive') rec.mr.stop();
    document.body.classList.remove('photo-rec');
    this.$('#ph-rec').hidden = true;
    this.refresh();
  }

  // 每次畫完一幀呼叫：錄影中就把取景框那一塊拷進錄影的畫布
  afterRender() {
    const rec = this.rec;
    if (!rec) return;
    const src = this.renderer.domElement, fr = this.frame;
    const px = src.width / window.innerWidth;
    rec.shift = (rec.shift + 0.37) % 1;
    this.compose(rec.ctx, src, fr.x * px, fr.y * px, fr.w * px, fr.h * px, rec.canvas.width, rec.canvas.height, rec.k, rec.shift);
    const sec = (performance.now() - rec.start) / 1000;
    const label = `${pad2(Math.floor(sec / 60))}:${pad2(Math.floor(sec % 60))}`;
    if (label !== rec.label) {
      rec.label = label;
      this.$('#ph-rec span').textContent = label;
    }
    if (sec >= MAX_REC) this.stopRecording();
  }

  // ───────── 拍好之後 ─────────

  showResult(blob, name, video) {
    this.closeResult();
    const url = URL.createObjectURL(blob);
    this.result = { blob, url, name, video };
    const box = this.$('#ph-media');
    box.innerHTML = '';
    const m = document.createElement(video ? 'video' : 'img');
    m.src = url;
    if (video) Object.assign(m, { controls: true, loop: true, playsInline: true, autoplay: true, muted: true });
    box.appendChild(m);
    const file = new File([blob], name, { type: blob.type });
    this.$('#ph-share').hidden = !navigator.canShare?.({ files: [file] });
    this.$('#ph-tip').textContent = this.postcard ? '按分享，選要寄給誰' : video ? '' : this.coarse ? '也可以長按照片存起來' : '';
    this.$('#ph-result').hidden = false;
  }

  closeResult() {
    if (!this.result) return;
    URL.revokeObjectURL(this.result.url);
    this.result = null;
    this.$('#ph-media').innerHTML = '';
    this.$('#ph-result').hidden = true;
  }

  async share() {
    const r = this.result;
    if (!r) return;
    try {
      await navigator.share({ files: [new File([r.blob], r.name, { type: r.blob.type })], title: this.postcard ? '從海市寄來的明信片' : this.title });
    } catch (e) {
      if (e.name !== 'AbortError') this.download();
    }
  }

  download() {
    const r = this.result;
    if (!r) return;
    const a = document.createElement('a');
    a.href = r.url;
    a.download = r.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}
