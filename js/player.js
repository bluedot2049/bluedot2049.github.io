// 第三人稱操作：點地面讓角色走過去、拖曳繞著角色轉鏡頭、雙指或滾輪縮放、點畫作走到畫前。
// 電腦另外支援 WASD / 方向鍵。
import * as THREE from 'three';

const SPEED = 2.6;
const DRAG_THRESHOLD = 8;
const DIST_MIN = 4, DIST_MAX = 14;
// 俯角往下拉到 PITCH_LOW 時鏡頭已經貼近地面，再往下拉就改成抬頭往上看，一路看到天頂
const PITCH_MIN = -1.55, PITCH_LOW = -0.08, PITCH_MAX = 1.25, PITCH_DEFAULT = 0.8;
const ZENITH = 1.52;
const SWIPE_MIN = 40;

const defaultDist = () => (window.innerWidth < window.innerHeight ? 11 : 8.5);

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function isShown(o) {
  for (; o; o = o.parent) if (!o.visible) return false;
  return true;
}

export class Player {
  constructor(camera, dom, world, character, events) {
    this.camera = camera;
    this.dom = dom;
    this.world = world;
    this.character = character;
    this.events = events;           // { onArrivePainting, onArriveMirror, onJump, onSit(seat), onFood, onPet(animal), onExit(exit), onRoomChange, onInput(kind) }
    this.pos = new THREE.Vector3(0, 0, -2);
    this.heading = Math.PI;
    this.path = [];
    this.pending = null;            // 正要走去看的畫或鏡子
    this.focus = null;              // 正在看的畫或鏡子
    this.camYaw = 0;
    this.camPitch = PITCH_DEFAULT;
    this.camDist = defaultDist();
    this.distMax = world.camDistMax ?? DIST_MAX;   // 海市可以拉得比較遠，看得到整座山城
    this.zoomGoal = null;           // 慢慢推到這個距離和俯角，見 zoomTo
    this.aim = null;                // 有給就繞著這一點看，不看角色（剛到海市的遠景）
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.headPos = new THREE.Vector3();
    this.keys = new Set();
    this.joy = { x: 0, y: 0 };      // 虛擬搖桿，-1 ~ 1
    this.mouseRun = false;          // 滑鼠左右鍵同時按著：往鏡頭前方走
    this.goal = null;
    this.room = -1;
    this.speed = 0;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.layers.enable(1);   // 動物在圖層 1
    this.animals = null;            // 主程式建好動物後填進來
    this.marker = this.makeMarker();
    this.markerT = 1;
    this.moving = true;
    this.paused = false;            // 攝影模式：不接輸入，鏡頭交給 photo.js
    this.desiredCamera(this.camPos, this.camLook);
    this.bind();
  }

  makeMarker() {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.27, 32),
      new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.03;
    return m;
  }

  bind() {
    const el = this.dom;
    const pts = new Map();
    let pinch = null, multi = false;
    // 第二顆鍵按下或放開時不會再觸發 pointerdown/up，只會來一次 pointermove，所以每個事件都看 buttons
    const chord = (e) => { if (e.pointerType === 'mouse') this.mouseRun = (e.buttons & 3) === 3; };

    el.addEventListener('pointerdown', (e) => {
      if (this.paused) return;
      // 右鍵按下就直接當成拖曳轉鏡頭，不會觸發走路
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, drag: e.button === 2, mouse: e.pointerType === 'mouse' });
      el.setPointerCapture(e.pointerId);
      chord(e);
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), base: this.camDist };
        multi = true;
      }
    });
    el.addEventListener('pointermove', (e) => {
      chord(e);
      const p = pts.get(e.pointerId);
      if (!p && e.pointerType === 'mouse' && !this.paused) this.hover(e.clientX, e.clientY);
      if (!p || this.paused) return;
      if (this.mouseRun) p.drag = true;   // 同按兩鍵時照樣可以拖曳轉向，放開也不算點地面
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (pinch && pts.size >= 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.camDist = THREE.MathUtils.clamp(pinch.base * (pinch.d / Math.max(d, 1)), DIST_MIN, this.distMax);
        this.zoomGoal = null;
        this.events.onInput('drag');
        return;
      }
      if (!p.drag && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > DRAG_THRESHOLD) {
        p.drag = true;
        // 觸控看畫時，左右滑是切換作品，不轉鏡頭
        p.swipe = this.focus?.kind === 'painting' && !p.mouse && Math.abs(e.clientX - p.sx) > Math.abs(e.clientY - p.sy);
      }
      if (p.drag && !multi && !p.swipe) this.orbit(dx, dy, p.mouse);
      el.classList.toggle('dragging', p.drag && p.mouse);
    });
    const up = (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      pts.delete(e.pointerId);
      chord(e);
      el.classList.remove('dragging');
      if (e.type === 'pointercancel') this.mouseRun = false;
      if (this.paused) { pts.clear(); pinch = null; multi = false; return; }
      if (e.type === 'pointerup' && !p.drag && !multi) this.tap(e.clientX, e.clientY);
      if (e.type === 'pointerup' && p.swipe && !multi && Math.abs(e.clientX - p.sx) > SWIPE_MIN) this.switchPainting(e.clientX < p.sx ? 1 : -1);
      if (pts.size < 2) pinch = null;
      if (pts.size === 0) multi = false;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => {
      if (this.paused) return;
      e.preventDefault();
      this.camDist = THREE.MathUtils.clamp(this.camDist * (1 + e.deltaY * 0.001), DIST_MIN, this.distMax);
      this.zoomGoal = null;
      this.events.onInput('drag');
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
      // 捏角色面板裡的按鈕和滑桿自己吃鍵盤，不拿來走路
      if (this.paused || e.target.closest?.('#dress')) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        this.action();
        return;
      }
      if (e.key === ' ') {
        e.preventDefault();
        this.jump();
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        this.recenter();
        return;
      }
      if (e.key === 'c' || e.key === 'C') {
        this.toggleSit();
        return;
      }
      this.keys.add(e.key.toLowerCase());
      this.events.onInput('key');
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseRun = false; });
  }

  orbit(dx, dy, mouse = false) {
    this.exitView();
    const k = (mouse ? 9 : 5.5) / Math.max(this.dom.clientWidth, this.dom.clientHeight);
    const s = mouse ? 1 : -1;   // 觸控是手指拖著畫面走，方向跟滑鼠相反
    this.camYaw -= dx * k * s;
    this.camPitch = THREE.MathUtils.clamp(this.camPitch + dy * k * s, PITCH_MIN, PITCH_MAX);
    this.events.onInput('drag');
  }

  pick(cx, cy) {
    const rect = this.dom.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.intersectObjects(this.world.raycastTargets, false).find((h) => isShown(h.object) && !h.object.userData.ghost);
  }

  // 滑鼠停在畫、鏡子、動物上時，游標換成可點的樣子。射線不用每次移動都打，隔 0.1 秒看一次就夠
  hover(cx, cy) {
    const now = performance.now();
    if (now - (this.hoverT || 0) < 100) return;
    this.hoverT = now;
    const u = this.pick(cx, cy)?.object.userData;
    this.dom.classList.toggle('hot', !!(u && (u.painting || u.mirror || u.animal)));
  }

  tap(cx, cy) {
    const hit = this.pick(cx, cy);
    if (!hit) return;
    this.events.onInput('tap');
    if (hit.object.userData.painting) return this.goToPainting(hit.object.userData.painting);
    if (hit.object.userData.mirror) return this.goToMirror();
    if (hit.object.userData.animal) return this.goToAnimal(hit.object.userData.animal);
    const t =this.world.findWalkable(hit.point.x, hit.point.z, this.pos.x, this.pos.z);
    if (!t) return;
    this.exitFocus();
    this.pending = null;
    this.walkTo(t.x, t.z);
    this.marker.position.set(t.x, this.world.groundY(t.x, t.z) + 0.03, t.z);
    this.markerT = 0;
  }

  // 依螢幕比例算出看畫的鏡頭距離，以及角色站的位置（盡量站在鏡頭後面，不擋畫）
  planFocus(p) {
    const W = window.innerWidth, H = window.innerHeight, desk = W >= 900;
    const visW = desk ? (W - 400) / W : 1, visH = desk ? 1 : 0.58;
    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const fd = Math.max(1.6, (p.h * 1.6) / 2 / (tanV * visH), (p.w * 1.4) / 2 / (tanV * (W / H) * visW));
    const n = p.n, t = new THREE.Vector3(-n.z, 0, n.x);
    let stand = null;
    for (let depth = fd + 0.6; depth >= 1.0 && !stand; depth -= 0.25) {
      const lats = depth >= fd + 0.3 ? [0, 0.6, -0.6] : [1.4, -1.4, 1.9, -1.9];
      for (const lat of lats) {
        const x = p.wall.x + n.x * depth + t.x * lat, z = p.wall.z + n.z * depth + t.z * lat;
        if (this.world.walkable(x, z)) { stand = { x, z }; break; }
      }
    }
    if (!stand) stand = this.world.findWalkable(p.wall.x + n.x * 1.5, p.wall.z + n.z * 1.5, this.pos.x, this.pos.z) || { x: this.pos.x, z: this.pos.z };
    return {
      kind: 'painting', p, n, stand,
      camPos: new THREE.Vector3(p.wall.x + n.x * fd, p.cy, p.wall.z + n.z * fd),
      look: p.center.clone(),
      fadeTarget: p.center.clone().addScaledVector(n, 0.3),
    };
  }

  // 照鏡子：站在鏡前，鏡頭從鏡子的位置看回來，看得到自己的正面
  // 距離依螢幕比例算，手機下方被面板蓋住的部分要扣掉，全身才看得到
  planMirror() {
    const m = this.world.mirror, n = m.n;
    const visH = window.innerWidth >= 900 ? 1 : 0.6;
    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const d = 0.35 + Math.max(1.8, Math.max(2.0, this.character.dims.topY * 1.3) / 2 / (tanV * visH));
    const stand = this.world.findWalkable(m.x + n.x * d, m.z + n.z * d, this.pos.x, this.pos.z) || { x: this.pos.x, z: this.pos.z };
    return {
      kind: 'mirror', n, stand,
      camPos: new THREE.Vector3(m.x + n.x * 0.35, 1.05, m.z + n.z * 0.35),
      look: new THREE.Vector3(stand.x, 0.85, stand.z),
      fadeTarget: new THREE.Vector3(stand.x, 0, stand.z),
    };
  }

  // 捏角色時的取景：body 從鏡子看全身，face 湊到臉前面。visH 是畫面沒被面板蓋住的比例
  // 角色變高、頭變大時重算一次，頭頂不會跑出畫面
  frameMirror(mode, visH) {
    const f = this.focus, m = this.world.mirror;
    if (f?.kind !== 'mirror') return;
    const dims = this.character.dims, n = f.n, p = this.pos;
    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * visH;
    const gap = Math.max(0.9, (p.x - m.x) * n.x + (p.z - m.z) * n.z);
    if (mode === 'face') {
      const d = THREE.MathUtils.clamp((dims.headH * 1.7) / 2 / tanV, 0.7, gap - 0.3);
      const y = p.y + dims.faceY + dims.headH * 0.18;
      f.camPos = new THREE.Vector3(p.x - n.x * d, y, p.z - n.z * d);
      f.look = new THREE.Vector3(p.x, y, p.z);
    } else {
      // 鏡頭稍微往下看，鏡子前面地上的書堆、箱子比較不會擋住
      const half = (gap - 0.35) * tanV, y = p.y + Math.max(dims.topY * 0.5, dims.topY + 0.15 - half);
      f.camPos = new THREE.Vector3(m.x + n.x * 0.35, y + 0.45, m.z + n.z * 0.35);
      f.look = new THREE.Vector3(p.x, y, p.z);
    }
  }

  goToPainting(p) {
    this.goTo(this.planFocus(p));
  }

  goToMirror() {
    if (this.world.mirror) this.goTo(this.planMirror());
  }

  // 摸動物：牠先停下來轉向自己，走到牠面前再伸手
  goToAnimal(a) {
    a.waitFor(this);
    this.goTo(a.planPet(this));
  }

  goTo(plan) {
    this.exitFocus();
    this.pending = plan;
    if (Math.hypot(this.pos.x - plan.stand.x, this.pos.z - plan.stand.z) < 0.25) {
      this.path = [];
      this.arrive();
    } else {
      this.walkTo(plan.stand.x, plan.stand.z);
    }
  }

  // 瞬移到畫前直接看（清單「前往」、左右滑切換都用這個）
  showPainting(p) {
    const plan = this.planFocus(p);
    this.teleport(plan.stand.x, plan.stand.z);
    this.pending = plan;
    this.arrive();
  }

  // 看畫時換到前一幅或後一幅，順序同 gallery.json，到頭就停
  switchPainting(dir) {
    if (this.focus?.kind !== 'painting') return;
    const list = this.world.paintings, i = list.indexOf(this.focus.p) + dir;
    if (i >= 0 && i < list.length) this.showPainting(list[i]);
  }

  // 鏡頭慢慢推到 dist、pitch，不給就是預設的距離和俯角。手動縮放會打斷
  zoomTo(dist = defaultDist(), pitch = PITCH_DEFAULT) {
    this.zoomGoal = { dist, pitch };
  }

  // 鏡頭轉回角色背後，俯角和距離恢復預設
  recenter() {
    this.events.onInput('tap');
    this.exitView();
    this.camYaw = this.heading + Math.PI;
    this.camPitch = PITCH_DEFAULT;
    this.camDist = defaultDist();
  }

  // 用尋路找出繞過家具的路線
  walkTo(x, z) {
    this.goal = { x, z };
    const path = this.world.findPath(this.pos.x, this.pos.z, x, z);
    this.path = path ? path.map((p) => new THREE.Vector2(p.x, p.z)) : [];
    if (!path && this.pending) this.pending = null;
  }

  setJoystick(x, y) {
    this.joy.x = x;
    this.joy.y = y;
    if (x || y) this.events.onInput('joy');
  }

  // 附近有畫、角色在畫的正面時，回傳那幅畫（給「看畫」按鈕用）
  nearbyPainting() {
    if (this.focus || this.pending) return null;
    let best = null, bd = 3.4;
    for (const p of this.world.paintings) {
      if (Math.abs(p.room.index - this.room) > 1) continue;
      const dx = this.pos.x - p.wall.x, dz = this.pos.z - p.wall.z;
      const front = dx * p.n.x + dz * p.n.z;
      const d = Math.hypot(dx, dz);
      if (front > 0.4 && d < bd) { bd = d; best = p; }
    }
    return best;
  }

  // 坐下：先走到座位旁邊，再挪進座位、轉向，最後才坐下去。鏡頭不動，維持使用者原本的視角
  planSeat(i) {
    const st = this.world.outdoor.seats[i];
    return { kind: 'seat', seat: i, n: { x: -Math.sin(st.h), z: -Math.cos(st.h) }, stand: { x: st.ax, z: st.az } };
  }

  get sitting() {
    return this.focus?.kind === 'seat' || this.focus?.kind === 'ground';
  }

  // 傳給別人的坐姿：0 沒坐、-1 坐在地上、i + 1 坐在第 i 個座位
  get sitCode() {
    if (this.focus?.kind === 'seat') return this.focus.seat + 1;
    return this.focus?.kind === 'ground' ? -1 : 0;
  }

  // 「坐」按鈕和 C 鍵：坐著就站起來；旁邊有座位就坐座位，沒有就原地坐在地上
  toggleSit() {
    this.events.onInput('tap');
    if (this.sitting) return this.exitFocus();
    if (this.character.airborne) return;
    const t = this.actionTarget();
    if (t?.kind === 'seat') return this.goTo(this.planSeat(t.p));
    this.exitFocus();
    this.stop();
    this.focus = { kind: 'ground', n: { x: -Math.sin(this.heading), z: -Math.cos(this.heading) } };
    this.character.lift = 0.02;
    this.character.sitting = true;
    this.events.onSit?.(true);
  }

  // 動作按鈕現在該做什麼：看畫、照鏡子、坐下、拿點心、摸動物、跟訪客聊天、搭船、吃一口、起來。回傳 { kind, p? } 或 null
  actionTarget() {
    const ch = this.character;
    if (this.sitting) {
      if (ch.food) return { kind: 'eat' };
      return { kind: this.focus.kind === 'seat' && this.world.outdoor.seats[this.focus.seat].table ? 'table' : 'stand' };
    }
    if (this.focus || this.pending) return null;
    const x = this.pos.x, z = this.pos.z, list = [];
    const p = this.nearbyPainting();
    if (p) list.push({ kind: 'painting', p, d: Math.hypot(x - p.wall.x, z - p.wall.z) });
    const m = this.world.mirror;
    if (m) {
      const dx = x - m.x, dz = z - m.z, d = Math.hypot(dx, dz);
      if (dx * m.n.x + dz * m.n.z > 0.3 && d < 3) list.push({ kind: 'mirror', d });
    }
    const out = this.world.outdoor;
    if (out && this.room === this.world.rooms.length - 1) {
      out.seats.forEach((st, i) => {
        if (this.visitors?.seatBusy(i)) return;
        const d = Math.min(Math.hypot(x - st.x, z - st.z), Math.hypot(x - st.ax, z - st.az));
        if (d < 1.3) list.push({ kind: 'seat', p: i, d });
      });
      const t = out.table, d = Math.hypot(Math.max(0, Math.abs(x - t.x) - t.hw), Math.max(0, Math.abs(z - t.z) - t.hd));
      if (d < 1.5) list.push({ kind: 'table', d: d + 0.2 });
    }
    const an = this.animals?.nearest(x, z);
    if (an) list.push({ kind: 'pet', p: an.a, d: an.d });
    const vi = this.visitors?.nearest(x, z);
    if (vi) list.push({ kind: 'talk', p: vi.v, d: vi.d });
    for (const ex of this.world.exits || []) {
      const d = Math.hypot(x - ex.x, z - ex.z);
      if (d < ex.r) list.push({ kind: 'exit', p: ex, d });
    }
    if (list.length) return list.reduce((a, b) => (b.d < a.d ? b : a));
    return ch.food ? { kind: 'eat' } : null;
  }

  action() {
    const t = this.actionTarget();
    if (!t) return;
    this.events.onInput('tap');
    const ch = this.character;
    switch (t.kind) {
      case 'painting': this.goToPainting(t.p); break;
      case 'mirror': this.goToMirror(); break;
      case 'seat': this.goTo(this.planSeat(t.p)); break;
      case 'pet': this.goToAnimal(t.p); break;
      case 'talk': t.p.talkTo(); break;
      case 'exit': this.events.onExit?.(t.p); break;
      case 'stand': this.exitFocus(); break;
      case 'table':
        ch.hold(1 + Math.floor(Math.random() * 5));
        this.events.onFood?.();
        break;
      case 'eat':
        ch.bite();
        this.events.onFood?.();
        break;
    }
  }

  jump() {
    if (this.sitting) this.exitFocus();
    if (this.character.sitP > 0) return;   // 還在站起來的途中
    if (!this.character.jump()) return;
    this.events.onInput('key');
    this.events.onJump?.();
    this.animals?.startle(this.pos.x, this.pos.z);
  }

  arrive() {
    const plan = this.pending;
    if (!plan) return;
    this.pending = null;
    this.focus = plan;
    if (plan.kind === 'mirror') this.events.onArriveMirror?.();
    else if (plan.kind === 'seat') this.events.onSit?.(true);   // 真正坐下去要等挪進座位，見 update
    else if (plan.kind === 'pet') {
      if (!plan.a.within(this)) { this.focus = null; return; }   // 走到時牠已經跑掉了
      this.character.pet(plan.a.spec.high);
      plan.a.pettedBy(this.pos);
      this.events.onPet?.(plan.a);
    } else this.events.onArrivePainting(plan.p);
  }

  exitFocus() {
    if (!this.focus) return;
    const wasSitting = this.sitting, n = this.focus.n, hadView = !!this.focus.camPos;
    this.focus = null;
    // 鏡頭退到角色背後、面向剛才的畫或鏡子。看畫時鏡頭在角色和畫之間，照原方位拉遠會跑到牆後
    if (hadView) this.camYaw = Math.atan2(n.x, n.z);
    if (wasSitting) {
      this.character.sitting = false;
      this.events.onSit?.(false);
    }
  }

  // 只離開看畫、照鏡子這種會接管鏡頭的狀態；坐著時轉鏡頭不會站起來
  exitView() {
    if (this.focus?.camPos) this.exitFocus();
  }

  stop() {
    this.path = [];
    this.pending = null;
    this.goal = null;
  }

  teleport(x, z) {
    this.exitFocus();
    this.pos.set(x, 0, z);
    this.stop();
  }

  // 換區域抵達時站到指定位置、面向 heading，鏡頭直接到位，不從別處滑過來
  place(x, z, heading) {
    this.teleport(x, z);
    this.pos.y = this.world.groundY(x, z);
    this.heading = heading;
    this.camYaw = heading + Math.PI;
    this.desiredCamera(this.camPos, this.camLook);
  }

  fadeTarget() {
    return this.focus?.fadeTarget || this.pos;
  }

  desiredCamera(outPos, outLook) {
    if (this.focus?.camPos) {
      outPos.copy(this.focus.camPos);
      outLook.copy(this.focus.look);
      return;
    }
    // 注視點放在角色前方一點，直式螢幕上角色才會落在畫面下方，前方留出空間
    const ahead = window.innerWidth < window.innerHeight ? 1.8 : 0.8;
    if (this.aim) outLook.copy(this.aim);
    else outLook.set(this.pos.x - Math.sin(this.camYaw) * ahead, this.pos.y + 0.9, this.pos.z - Math.cos(this.camYaw) * ahead);
    const pitch = Math.max(this.camPitch, PITCH_LOW), c = Math.cos(pitch);
    outPos.set(
      outLook.x + Math.sin(this.camYaw) * c * this.camDist,
      outLook.y + Math.sin(pitch) * this.camDist,
      outLook.z + Math.cos(this.camYaw) * c * this.camDist
    );
    // 角色和鏡頭之間隔著山坡或石台時，鏡頭沿原方向往前移（海市）。房子不推鏡頭，是淡掉
    if (this.world.camClip) {
      const head = this.headPos.set(this.pos.x, this.pos.y + 1.2, this.pos.z), clip = this.world.camClip(head, outPos);
      if (clip < 1) outPos.lerpVectors(head, outPos, Math.max(clip, 0.15));
    }
    // 鏡頭不鑽進地面，也不退進樹林裡
    outPos.y = Math.max(outPos.y, this.world.camFloor(outPos.x, outPos.z) + 0.3);
    // 再往下拉的部分換成抬頭：鏡頭位置不動，視線往上轉，最多接近正上方
    const extra = PITCH_LOW - this.camPitch;
    if (extra > 0) {
      const dx = outLook.x - outPos.x, dy = outLook.y - outPos.y, dz = outLook.z - outPos.z;
      const h = Math.hypot(dx, dz) || 1e-4, len = Math.hypot(h, dy);
      const e = Math.min(ZENITH, Math.atan2(dy, h) + extra);
      outLook.set(outPos.x + (dx / h) * Math.cos(e) * len, outPos.y + Math.sin(e) * len, outPos.z + (dz / h) * Math.cos(e) * len);
    }
  }

  // 移動並處理碰撞：先試原方向，再沿牆滑，手動操作時再試左右偏轉的方向繞過家具角
  tryMove(vx, vz, deflect) {
    const w = this.world, ox = this.pos.x, oz = this.pos.z;
    const stuck = !w.walkable(ox, oz);   // 已經卡在家具裡（例如瞬移進去），允許往任何方向脫困
    const go = (x, z) => {
      if (stuck || (w.walkable(x, z) && !this.animals?.blocks(x, z, ox, oz) && !this.visitors?.blocks(x, z, ox, oz))) { this.pos.x = x; this.pos.z = z; return true; }
      return false;
    };
    if (go(ox + vx, oz + vz)) return true;
    if (Math.abs(vx) > 1e-5 && go(ox + vx, oz)) return true;
    if (Math.abs(vz) > 1e-5 && go(ox, oz + vz)) return true;
    if (!deflect) return false;
    for (const a of [0.5, -0.5, 1.0, -1.0, 1.57, -1.57]) {
      const c = Math.cos(a), s = Math.sin(a), f = 0.85;
      if (go(ox + (vx * c - vz * s) * f, oz + (vx * s + vz * c) * f)) return true;
    }
    return false;
  }

  update(dt) {
    let vx = 0, vz = 0;
    const k = this.keys;
    const fwd = (k.has('w') || k.has('arrowup') || this.mouseRun ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    const side = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    const turn = (k.has('q') ? 1 : 0) - (k.has('e') ? 1 : 0);
    if (turn) { this.exitView(); this.camYaw += turn * 1.8 * dt; }

    // 鍵盤和搖桿都換算成相對鏡頭的方向
    let mf = fwd, ms = side, mag = fwd || side ? 1 : 0;
    const jm = Math.hypot(this.joy.x, this.joy.y);
    if (jm > 0.15) { mf = -this.joy.y; ms = this.joy.x; mag = Math.min(1, (jm - 0.15) / 0.75); }
    const manual = mag > 0;

    if (manual) {
      this.stop();
      this.exitFocus();
    }
    const rising = !this.character.sitting && this.character.sitP > 0.25;   // 站起來的途中先別走
    if (manual && !rising) {
      const sy = Math.sin(this.camYaw), cy = Math.cos(this.camYaw);
      vx = -sy * mf + cy * ms;
      vz = -cy * mf - sy * ms;
      const len = Math.hypot(vx, vz) || 1;
      vx = (vx / len) * SPEED * mag * dt;
      vz = (vz / len) * SPEED * mag * dt;
    } else if (this.path.length && !rising) {
      const t = this.path[0];
      const dx = t.x - this.pos.x, dz = t.y - this.pos.z;
      const dist = Math.hypot(dx, dz), step = SPEED * dt;
      if (dist <= step) {
        vx = dx; vz = dz;
        this.path.shift();
        if (!this.path.length) this.arrive();
      } else {
        vx = (dx / dist) * step;
        vz = (dz / dist) * step;
      }
    }

    const w = this.world;
    const ox = this.pos.x, oz = this.pos.z;
    if (vx || vz) {
      if (!this.tryMove(vx, vz, manual) && this.path.length) {
        // 照路線走卻被擋住：重新算一次路，還是不行就停下
        const g = this.goal, pend = this.pending;
        if (g && !this.repathed) {
          this.repathed = true;
          this.walkTo(g.x, g.z);
          this.pending = pend;
        } else this.stop();
      } else this.repathed = false;
    }
    const mx = this.pos.x - ox, mz = this.pos.z - oz;
    this.speed = Math.hypot(mx, mz) / Math.max(dt, 1e-4);
    // 到了座位旁邊：挪進座位、轉向，對準了才坐下去（挪動不算走路）
    if (this.focus?.kind === 'seat') {
      const st = w.outdoor.seats[this.focus.seat], k = Math.min(1, dt * 4);
      this.pos.x += (st.x - this.pos.x) * k;
      this.pos.z += (st.z - this.pos.z) * k;
      const ch = this.character;
      if (!ch.sitting && Math.hypot(st.x - this.pos.x, st.z - this.pos.z) < 0.08 && Math.abs(wrapAngle(st.h - this.heading)) < 0.2) {
        ch.lift = st.lift;
        ch.sitting = true;
      }
    }
    this.pos.y = w.groundY(this.pos.x, this.pos.z);

    // 角色轉向：走路時面向前進方向，看畫或照鏡子時面向它
    let want = null;
    if (this.speed > 0.05) want = Math.atan2(mx, mz);
    else if (this.focus) want = Math.atan2(-this.focus.n.x, -this.focus.n.z);
    if (want !== null) this.heading += wrapAngle(want - this.heading) * Math.min(1, dt * 10);

    const ch = this.character;
    if (this.focus?.kind === 'pet' && !ch.act) this.exitFocus();   // 摸完了
    ch.group.position.copy(this.pos);
    ch.group.rotation.y = this.heading;
    ch.update(dt, this.speed);

    let settling = false;
    const zg = this.zoomGoal;
    if (zg) {
      const f = Math.min(1, dt * 1.3);
      this.camDist += (zg.dist - this.camDist) * f;
      this.camPitch += (zg.pitch - this.camPitch) * f;
      if (Math.abs(zg.dist - this.camDist) < 0.02 && Math.abs(zg.pitch - this.camPitch) < 0.002) this.zoomGoal = null;
      settling = true;
    }
    if (!this.paused) {
      const dPos = new THREE.Vector3(), dLook = new THREE.Vector3();
      this.desiredCamera(dPos, dLook);
      const f = 1 - Math.exp(-dt * (this.focus?.camPos ? 3.2 : 5));
      this.camPos.lerp(dPos, f);
      this.camLook.lerp(dLook, f);
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(this.camLook);
      settling = settling || this.camPos.distanceToSquared(dPos) > 1e-4 || this.camLook.distanceToSquared(dLook) > 1e-4;
    }

    this.moving = this.speed > 0.05 || settling || turn !== 0 || ch.busy;
    if (this.markerT < 1) {
      this.markerT = Math.min(1, this.markerT + dt * 1.4);
      this.marker.material.opacity = (1 - this.markerT) * 0.9;
      const s = 1 + this.markerT * 1.2;
      this.marker.scale.set(s, s, s);
      this.moving = true;
    }

    const room = w.roomIndexAt(this.pos.z);
    if (room !== this.room) {
      this.room = room;
      this.events.onRoomChange(room);
    }
  }
}
