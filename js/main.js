import * as THREE from 'three';
import { buildWorld } from './world.js';
import { Player } from './player.js';
import { buildShots } from './shots.js';
import { Character } from './character.js';
import { sanitizeLook, lookFromOutfit, randomPreset, optionName } from './looks.js';
import { Creator, FACE_TABS } from './creator.js';
import { Manatee, TABLE_LINES } from './manatee.js';
import { Animals, ANIMAL_LAYER } from './animals.js';
import { Visitors } from './visitors.js';
import { layoutBubbles } from './bubbles.js';
import { UI, panelW } from './ui.js';
import { bindJoystick } from './joystick.js';
import { Multiplayer, EMOTES } from './multiplayer.js';
import * as TX from './textures.js';
import { Ambience } from './ambience.js';
import { HORIZON, SUN_DIR, MEADOW_NAME, REFLECT_LAYER } from './outdoor.js';
import { Quality } from './quality.js';
import { createPostFX } from './postfx.js';
import { PhotoMode } from './photo.js';
import { Vendors } from './vendors.js';
import { lens, LensPass } from './lens.js';

async function loadJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`讀不到 ${url}`);
  return res.json();
}

// gallery.json 決定房間順序，每間房的內容在 rooms/<id>/room.json
async function loadGallery() {
  const g = await loadJSON('gallery.json');
  const rooms = await Promise.all(g.order.map(async (id) => ({ id, ...(await loadJSON(`rooms/${id}/room.json`)) })));
  return { ...g, rooms };
}

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

// 關掉右鍵選單和圖片拖曳，避免操作時跳出「另存圖片」
// 拍好的照片要能長按存起來，那裡不擋
document.addEventListener('contextmenu', (e) => { if (!e.target.closest('#ph-media')) e.preventDefault(); });
// iOS 不一定遵守 touch-action，拖搖桿時會把整頁往下拉；只留抽屜、清單和攝影模式的選項列可以捲動
// 萬一頁面已經被放大，就不擋，讓人能用雙指縮回來
document.addEventListener('touchmove', (e) => {
  if (window.visualViewport && window.visualViewport.scale > 1.01) return;
  if (!e.target.closest('#sheet, #dress, #list, #ph-bar')) e.preventDefault();
}, { passive: false });
// iOS 的雙指縮放整頁
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dragstart', (e) => { if (e.target.tagName === 'IMG' && !e.target.closest('#ph-media')) e.preventDefault(); });

// 自己捏的樣子存在這台裝置上，下次來還是同一個。舊版只存了三個色號，照著換過來。第一次來隨機配一套顏色
function loadLook() {
  try {
    const raw = localStorage.getItem('look');
    if (raw) return sanitizeLook(JSON.parse(raw));
    const old = lookFromOutfit(JSON.parse(localStorage.getItem('outfit')));
    if (old) return old;
  } catch {}
  const L = randomPreset();
  saveLook(L);
  return L;
}

function saveLook(L) {
  try { localStorage.setItem('look', JSON.stringify(L)); } catch {}
}

async function precompile(renderer, scene, camera) {
  const hidden = [];
  scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
  const rt = new THREE.WebGLRenderTarget(1, 1);
  const jobs = [];
  try {
    jobs.push(renderer.compileAsync(scene, camera));
    renderer.setRenderTarget(rt);
    jobs.push(renderer.compileAsync(scene, camera));
  } catch (e) {
    console.warn('預先編譯著色器失敗：', e);
  } finally {
    renderer.setRenderTarget(null);
    for (const o of hidden) o.visible = false;
  }
  await Promise.all(jobs).catch(() => {});
  rt.dispose();
}

async function start() {
  let gallery;
  try {
    gallery = await loadGallery();
  } catch (e) {
    document.querySelector('#loading .msg').textContent = '載入失敗：' + e.message;
    return;
  }
  document.title = gallery.title || document.title;
  const ui = new UI(gallery);
  const params = new URLSearchParams(location.search);

  if (params.has('flat') || !hasWebGL()) {
    ui.buildList(false);
    document.body.classList.add('flat');
    ui.toggleList(true);
    ui.loading(null);
    return;
  }

  // 世界分成幾個區域，一次只建一個。?z=haishi 是海市，沒有寫就是畫廊。
  // 換區域時整頁重新載入：瀏覽器一定會把上一個區域的記憶體收回去，手機才撐得住
  const zone = params.get('z') === 'haishi' ? 'haishi' : 'gallery';
  const town = zone === 'haishi';
  // 背景音樂：畫廊走進「歡迎光臨煉金畫廊」那間才開始放，往後的房間和戶外一路放著；海市一上岸就放
  const bgm = town ? { src: 'assets/audio/haishi.m4a', from: 'haishi' } : { src: 'assets/audio/gallery.m4a', from: '02-nigredo' };

  const coarse = matchMedia('(pointer: coarse)').matches;
  const quality = new Quality(coarse, params);
  // 有後製時由 SMAA 處理鋸齒，瀏覽器的多重取樣用不到。手機實際只畫 1 到 2 倍解析度，邊緣一樣會鋸齒，也要開
  const renderer = new THREE.WebGLRenderer({ antialias: !quality.post, powerPreference: 'high-performance' });
  renderer.setPixelRatio(quality.dpr);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.getElementById('stage').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1c130d);
  scene.fog = new THREE.Fog(0x1c130d, 16, 38);
  const hemi = new THREE.HemisphereLight(0xfff0dc, 0x6a4a34, 1.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffcf98, 1.3);
  sun.position.set(4, 8, 3);
  scene.add(sun);
  // 燈也要在反射的圖層上，不然反射裡的山坡是黑的
  hemi.layers.enable(REFLECT_LAYER);
  sun.layers.enable(REFLECT_LAYER);

  const world = town ? (await import('./haishi.js')).buildHaishi(scene, { coarse }) : buildWorld(scene, gallery);
  // 海市換上高度霧：鎮子和山坡從近處就開始往夜色裡退。?debug 時右上角可以即時調，?grade=0 看原本的霧
  if (town && params.get('grade') !== '0') {
    const { installGrade, gradePanel } = await import('./grade.js');
    installGrade();
    if (params.has('debug')) gradePanel();
  }

  // 室內和戶外的光線、霧。走出後門時在兩組之間漸變。海市只有一組
  const ENV = (town ? [world.env, world.env] : [
    { bg: 0x241a1c, near: 16, far: 38, sky: 0xfff0dc, ground: 0x70524a, hi: 1.9, sun: 0xffcf98, si: 1.3, dir: new THREE.Vector3(4, 8, 3) },
    { bg: HORIZON, near: 28, far: 170, sky: 0xffc4b8, ground: 0x8c6e5c, hi: 1.6, sun: 0xffa868, si: 1.9, dir: SUN_DIR.clone().multiplyScalar(-1).setY(0.45).multiplyScalar(10) },
  ]).map((e) => ({ ...e, bg: new THREE.Color(e.bg), sky: new THREE.Color(e.sky), ground: new THREE.Color(e.ground), sun: new THREE.Color(e.sun) }));
  let envT = -1;
  function applyEnv(t) {
    if (Math.abs(t - envT) < 0.002) return;
    envT = t;
    const [a, b] = ENV;
    scene.background.copy(a.bg).lerp(b.bg, t);
    scene.fog.color.copy(scene.background);
    scene.fog.near = a.near + (b.near - a.near) * t;
    scene.fog.far = a.far + (b.far - a.far) * t;
    hemi.color.copy(a.sky).lerp(b.sky, t);
    hemi.groundColor.copy(a.ground).lerp(b.ground, t);
    hemi.intensity = a.hi + (b.hi - a.hi) * t;
    sun.color.copy(a.sun).lerp(b.sun, t);
    sun.intensity = a.si + (b.si - a.si) * t;
    sun.position.copy(a.dir).lerp(b.dir, t);
  }

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 400);
  camera.layers.enable(ANIMAL_LAYER);   // 動物只在圖層 1；海面反射的鏡頭只看 REFLECT_LAYER

  if (town) applyEnv(0);
  const shadowTex = TX.shadowTexture();
  let look = loadLook();
  const character = new Character(shadowTex, look);
  scene.add(character.group);
  // 前廳的胖頭頭人：擋住一小塊地面，玩家靠近時會轉過來面對
  let manatee = null;
  if (!town) {
    const spot = world.findWalkable(1.9, -3.4, 0, -2) || { x: 1.9, z: -3.4 };
    manatee = new Manatee(shadowTex, spot.x, spot.z);
    scene.add(manatee.group);
    world.rooms[0].obstacles.push({ x: spot.x, z: spot.z, hw: 0.4, hd: 0.4, rot: 0 });
  }
  // 陽台長桌的主人，也是一隻胖頭頭人
  const host = world.outdoor ? new Manatee(shadowTex, world.outdoor.host.x, world.outdoor.host.z, TABLE_LINES) : null;
  if (host) scene.add(host.group);
  const ambience = new Ambience();
  let lastInput = performance.now();
  let swipeHinted = false;
  let mp = null;
  let place = null;   // 戶外現在在哪裡：null 是陽台，否則是草原或棧橋盡頭的地名
  let sitHinted = false;

  // 捏角色：每改一下就套到角色身上、存起來、告訴別人，鏡頭照目前那一頁取景
  let dressTab = 'race';
  const visH = () => (panelW() || !ui.panel ? 1 : 1 - ui.panel.offsetHeight / window.innerHeight);
  const frameMirror = () => player.frameMirror(FACE_TABS.includes(dressTab) ? 'face' : 'body', visH());
  const creator = new Creator({
    onChange(L) {
      look = L;
      character.setLook(L);
      saveLook(L);
      mp?.setLook(L);
      frameMirror();
      lastInput = performance.now();
    },
    onTab(t) {
      dressTab = t;
      frameMirror();
    },
    onPaint(cells) {
      character.paintFace(cells);
      lastInput = performance.now();
    },
  });

  const player = new Player(camera, renderer.domElement, world, character, {
    onInput(kind) {
      lastInput = performance.now();
      ui.hidePainting();
      ui.hideDress();
      ui.hideHint();
    },
    onArriveMirror() {
      ui.showDress();
      creator.open(look);
    },
    onJump() {
      mp?.jump();
    },
    onSit(on) {
      mp?.sendNow();
      if (on && !sitHinted) {
        sitHinted = true;
        ui.hint(coarse ? '推搖桿或點地面就會站起來' : '走動或點地面就會站起來', 4000);
      }
    },
    onFood() {
      mp?.sendNow();
      lastInput = performance.now();
    },
    onPet(a) {
      mp?.pet(a.index);
      lastInput = performance.now();
    },
    onExit(ex) {
      travel(ex.to);
    },
    onDirector(on) {
      showDirector(on);
      directorBtn.classList.remove('clap');
      void directorBtn.offsetWidth;
      if (on) directorBtn.classList.add('clap');
      try { localStorage.setItem('director', on ? '1' : '0'); } catch {}
      ui.hint(on ? '導演運鏡　鏡頭跟著你走' : '自由鏡頭　視角自己轉', 2000);
      lastInput = performance.now();
    },
    onArrivePainting(p) {
      ui.showPainting(p, p.url);
      if (coarse && !swipeHinted) {
        swipeHinted = true;
        ui.hint('左右滑動切換作品', 4000);
      }
    },
    onRoomChange(i) {
      world.setCurrentRoom(i);
      quality.pause();
      const r = world.rooms[i].data;
      ui.toast(r.name, r.subtitle);
      place = null;
      if (i >= world.rooms.findIndex((room) => room.id === bgm.from)) ambience.music(bgm.src);
    },
  });
  scene.add(player.marker);
  // 動物和不定期搭船來看畫的冒險者在畫廊那一區，海市有攤販
  let animals = null, visitors = null, vendors = null, passers = null;
  if (!town) {
    animals = new Animals({ world, shadowTex, player, camera, ambience });
    visitors = new Visitors({ scene, world, shadowTex, player, camera, host, animals, force: params.get('visit') });
    animals.visitors = visitors;
  } else {
    // 信差站的攤販：聊完直接進攝影模式拍明信片
    vendors = new Vendors({
      scene, shadowTex, spots: world.shops,
      onPostcard: () => photo.enter({ postcard: true }),
      // 攤販送東西：記在這台裝置上，回畫廊照鏡子就能穿戴
      onGift: (g) => ui.toast('收到' + g.items.map(([k, id]) => optionName(k, id)).join('、'), '回畫廊照鏡子就能穿上'),
    });
    // 不說話的路人：人多人少跟著台灣時間走，跟一般夜市反過來。?crowd=0.8 可以指定人潮
    const { Passersby } = await import('./passersby.js');
    passers = new Passersby({ scene, world, shadowTex, coarse, force: params.get('crowd') });
    vendors.setQuiet(() => passers.busy < 0.2);
  }
  const crowd = visitors || vendors;
  player.animals = animals;
  player.visitors = crowd;

  // 渡海：載入畫面換成小船，蓋住畫面後整頁換到另一個區域。from 記住從哪裡來，到了站在對應的碼頭
  let traveling = false;
  function travel(to, extra = {}) {
    if (traveling) return;
    traveling = true;
    const q = new URLSearchParams(location.search);
    for (const k of ['z', 'from', 'go']) q.delete(k);
    if (to !== 'gallery') q.set('z', to);
    q.set('from', zone);
    for (const [k, v] of Object.entries(extra)) q.set(k, v);
    const el = document.getElementById('loading');
    el.querySelector('.msg').textContent = to === 'gallery' ? '渡海　回畫廊' : '渡海　往海市';
    el.classList.add('crossing');
    el.classList.remove('done');
    mp?.sendNow();
    setTimeout(() => location.replace(`${location.pathname}?${q}`), 850);
  }

  ui.buildList(true);
  ui.onGoTo = (ri, pi) => {
    // 在海市點清單裡的畫：搭船回畫廊，到了直接站到那幅畫前面
    if (town) return travel('gallery', { go: `${ri}.${pi}` });
    const p = world.rooms[ri]?.paintings[pi];
    if (!p) return;
    player.showPainting(p);
    lastInput = performance.now();
  };
  ui.onClose = () => player.exitFocus();
  // 導演運鏡：預設打開，記住上次的選擇。畫廊房間小，轉得慢一點
  const directorBtn = document.getElementById('director-btn');
  function showDirector(on) {
    directorBtn.classList.toggle('on', on);
    directorBtn.setAttribute('aria-pressed', on);
  }
  try { player.director = localStorage.getItem('director') !== '0'; } catch {}
  player.directorLag = town ? 1 : 1.6;
  if (town) player.shots = buildShots(world.debug.areas);
  player.debug = params.has('debug');
  showDirector(player.director);
  directorBtn.addEventListener('click', () => player.toggleDirector());

  // 手機操作：搖桿走路，靠近畫作或鏡子時出現按鈕
  if (coarse) document.body.classList.add('touch');
  // 搖桿放哪一邊：直拿在右，單手拇指推；橫拿在左，跟一般雙手拿的遊戲一樣。換邊鈕把兩個方向都反過來，記住選擇
  if (coarse) {
    const land = matchMedia('(orientation: landscape)');
    let swap = false;
    try { swap = localStorage.getItem('joySwap') === '1'; } catch {}
    const placeJoy = () => document.body.classList.toggle('joy-left', land.matches !== swap);
    placeJoy();
    land.addEventListener('change', placeJoy);
    document.getElementById('swap-btn').addEventListener('click', () => {
      swap = !swap;
      try { localStorage.setItem('joySwap', swap ? '1' : '0'); } catch {}
      placeJoy();
    });
  }
  bindJoystick(document.getElementById('joy'), document.getElementById('joy-knob'), (x, y) => (photo.active ? photo.setJoystick(x, y) : player.setJoystick(x, y)));
  document.getElementById('jump-btn').addEventListener('pointerdown', (e) => { e.preventDefault(); player.jump(); });
  const sitBtn = document.getElementById('sit-btn');
  sitBtn.addEventListener('click', () => player.toggleSit());
  const actionBtn = document.getElementById('action-btn');
  actionBtn.addEventListener('click', () => player.action());
  const actionLabel = actionBtn.querySelector('.a1');
  const LABELS = { painting: '看畫', mirror: '照鏡子', seat: '坐下', table: '拿點心', pet: '摸摸', talk: '聊天', exit: '搭船', eat: '吃一口', stand: '起來' };
  let nearKey = null;
  function updateAction() {
    const t = player.actionTarget();
    const key = t ? (t.kind === 'painting' || t.kind === 'pet' || t.kind === 'talk' || t.kind === 'exit' ? t.p : t.kind) : null;
    const sitting = player.sitCode !== 0;
    if (sitting !== document.body.classList.contains('sitting')) {
      document.body.classList.toggle('sitting', sitting);
      sitBtn.textContent = sitting ? '起' : '坐';
      sitBtn.setAttribute('aria-label', sitting ? '站起來' : '坐下');
    }
    if (key === nearKey) return;
    nearKey = key;
    actionBtn.classList.toggle('show', !!t);
    if (!t) return;
    actionLabel.textContent = (t.kind === 'talk' && t.p.actionLabel) || LABELS[t.kind];
    actionBtn.setAttribute('aria-label', actionLabel.textContent);
    document.getElementById('action-title').textContent = t.kind === 'painting' ? t.p.data.title || '' : t.kind === 'pet' || t.kind === 'talk' ? t.p.name : t.kind === 'exit' ? t.p.title : '';
  }

  // 聲音開關：戶外的風聲和動物叫聲共用，室內也有貓，所以一直都在
  const soundBtn = document.getElementById('sound-btn');
  const soundLabel = () => {
    const text = ambience.muted ? '開啟聲音' : '靜音';
    soundBtn.classList.toggle('muted', ambience.muted);
    soundBtn.setAttribute('aria-label', text);
    soundBtn.title = text;
  };
  soundLabel();
  soundBtn.hidden = false;
  soundBtn.addEventListener('click', () => { ambience.setMuted(!ambience.muted); soundLabel(); });

  // 作品或換裝面板打開時挪動畫面中心，畫和角色才不會被擋住：側欄往左，底部抽屜往上
  function applyViewOffset() {
    const w = window.innerWidth, h = window.innerHeight, panel = ui.panel, pw = panelW();
    if (!panel) camera.clearViewOffset();
    else if (pw) camera.setViewOffset(w, h, pw / 2, 0, w, h);
    else camera.setViewOffset(w, h, 0, Math.round(panel.offsetHeight / 2), w, h);
  }
  ui.onSheet = (open) => {
    document.body.classList.toggle('panel-open', !!ui.panel);
    applyViewOffset();
    lastInput = performance.now();
  };

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    fx?.setSize(window.innerWidth, window.innerHeight);
    applyViewOffset();
    quality.pause();
    lastInput = performance.now();
  });

  // 對胖頭用驚訝表情，附近的胖頭會回話
  function sendEmote(e) {
    mp.emote(e);
    if (e !== '😮') return;
    manatee?.startled(player.pos.x, player.pos.z);
    if (host?.group.visible) host.startled(player.pos.x, player.pos.z);
  }

  // 多人同遊：gallery.json 有填 realtime 才連線，連不上就當單人。每個區域各用一個頻道，只看得到同一區的人
  const rt = gallery.realtime;
  if (rt?.url && rt?.key) {
    let ready = false;
    mp = new Multiplayer(scene, shadowTex, player, town ? { ...rt, channel: `${rt.channel || 'gallery'}-${zone}` } : rt, {
      onCount: (n) => ui.online(n),
      onReady() {
        if (ready) return;
        ready = true;
        ui.bindEmotes(EMOTES, sendEmote);
      },
      // 別人摸了動物：那位訪客的學徒也做出摸的動作
      onPet(o, i) {
        const a = animals?.remotePet(i, o);
        if (a) o.ch.pet(a.spec.high);
      },
      onJump(o) {
        animals?.startle(o.pos.x, o.pos.z);
      },
    }, look);
    mp.claude = params.get('as') === 'claude';   // 開發時我進站拍照：在場的人看到的是燈籠
    mp.connect().catch((e) => console.warn('多人連線失敗：', e));
    if (visitors) visitors.mp = mp;
    // 電腦：數字鍵 1–5 送表情
    window.addEventListener('keydown', (e) => {
      const i = e.key.length === 1 ? '12345'.indexOf(e.key) : -1;
      if (i >= 0) sendEmote(EMOTES[i]);
    });
  }

  // 後製和著色器預先編譯同時進行；載不到就照原本的畫法
  let fx = null;
  // 攝影模式的魚眼：有後製就接在後製最後面，沒有就自己先畫進一張圖再彎
  const lensPass = new LensPass();
  // 魚眼的中間是放大過的：有後製的電腦預覽時多畫 1.4 倍（最多 2 倍），中間比較不糊
  let boost = 1;
  const lensBoost = () => {
    const b = lens.on && fx ? Math.max(1, Math.min(1.4, 2 / quality.dpr)) : 1;
    if (b === boost) return;
    boost = b;
    renderer.setPixelRatio(quality.dpr * b);
    renderer.setSize(window.innerWidth, window.innerHeight);
    fx?.setSize(window.innerWidth, window.innerHeight);
  };
  const draw = (dt) => {
    if (fx) fx.render(dt);
    else if (lens.on) lensPass.renderScene(renderer, scene, camera);
    else renderer.render(scene, camera);
  };

  // 攝影模式：右上角相機按鈕或 P 鍵進出
  const photo = new PhotoMode({
    renderer, scene, camera, player, world, character, ambience, ui, coarse,
    title: gallery.title || '煉金畫廊',
    render: draw,
    lensPass,
    resizeFX: (w, h) => fx?.setSize(w, h),
  });
  document.getElementById('photo-btn').addEventListener('click', () => photo.enter());

  if (params.has('debug')) window.__g = { player, world, camera, ui, renderer, mp, animals, visitors, vendors, passers, quality, host, photo };
  const fxJob = quality.post ? createPostFX(renderer, scene, camera, lensPass).catch((e) => { console.warn('後製載入失敗：', e); return null; }) : null;
  // 跑不動自動降級：先關後製，再降解析度
  quality.onChange = (q) => {
    if (!q.post && fx) { fx.dispose(); fx = null; }
    renderer.setPixelRatio(q.dpr * boost);
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  document.addEventListener('visibilitychange', () => quality.pause());

  // 趁載入畫面先把所有著色器編好。不然第一次走出後門要一口氣編幾十個，
  // Windows 的瀏覽器編得特別慢，畫面會凍住一兩秒。
  // 藏起來的房間、戶外、海面先全部打開；海面倒影畫進貼圖時用的是另一組著色器，也一起編
  await precompile(renderer, scene, camera);
  if (fxJob) {
    fx = await fxJob;
    fx?.render(0);   // 後製的著色器也趁載入畫面先編好
  }
  const stats = params.has('debug') ? debugStats(renderer, quality) : null;

  // 抵達：海市從碼頭開始；從海市搭船回畫廊，站在小划船往草原走幾步的地方，面向草原
  const ferry = world.exits[0];
  if (town) {
    // 鏡頭在角色背後的海上，低低地往上看整座山城：角色在右下，城中在畫面中間偏左上。
    // 直式螢幕窄，角色放在中間偏下，城中在上面。角色沿棧橋往岸上走，鏡頭跟著慢慢換到角色背後（見 player.startIntro）
    player.place(world.spawn.x, world.spawn.z, world.spawn.heading);
    const mid = [0, 9, -20];   // 城中
    player.startIntro({
      wide: { dist: 18, at: { x: 0.42, y: -0.5 }, mark: mid, markAt: { x: -0.18, y: 0.2 } },
      tall: { dist: 24, at: { x: 0.12, y: -0.45 }, mark: mid, markAt: { x: -0.08, y: 0.25 } },
      low: { dist: 11, at: { x: 0.38, y: -0.3 }, mark: mid, markAt: { x: -0.25, y: 0.3 } },   // 手機橫拿太矮，角色拉近一點才不會淹在燈籠裡
    });
    // 測試用：?view=x,z,面向(度),鏡頭距離,俯角(度)，直接站到那裡看，不看開場的遠景
    const view = params.get('view')?.split(',').map(Number);
    if (view?.length >= 2 && view.every(Number.isFinite)) {
      player.intro = null;
      player.camDist = view[3] ?? player.camDist;
      player.camPitch = ((view[4] ?? 20) * Math.PI) / 180;
      player.place(view[0], view[1], ((view[2] ?? 180) * Math.PI) / 180);
    }
  }
  else if (params.get('from') === 'haishi' && ferry) {
    // 鏡頭退到棧橋尾端的海面上、貼著水面低低地看：角色在左下，大樹在右上，小屋在大樹後面遠遠的
    // 角色沿棧橋往草原走，鏡頭照走過的距離換到跟拍（跟海市開場同一套，見 player.startIntro）
    player.place(ferry.x, ferry.z + 1.8, 0);
    const tree = world.outdoor.landmark;
    player.startIntro({
      wide: { dist: 10, at: { x: -0.42, y: -0.5 }, mark: tree, markAt: { x: 0.3, y: 0.15 } },
      tall: { dist: 13, at: { x: -0.1, y: -0.45 }, mark: tree, markAt: { x: 0.12, y: 0.2 } },
    });
  }
  const go = params.get('go')?.split('.').map(Number);
  if (go && !town) ui.onGoTo(go[0], go[1]);
  // 抵達用的參數用過就拿掉，重新整理時不會又跑去同一個地方
  if (params.has('from') || params.has('go')) {
    const q = new URLSearchParams(location.search);
    q.delete('from');
    q.delete('go');
    const s = q.toString();
    history.replaceState(null, '', s ? `${location.pathname}?${s}` : location.pathname);
  }

  ui.loading(null);
  if (params.has('photo')) photo.enter();
  else ui.hint(coarse ? `${document.body.classList.contains('joy-left') ? '左' : '右'}下搖桿或點地面走路　拖曳轉視角` : `點地面或 WASD 走路　拖曳轉視角　空白鍵跳躍　C 坐下${town ? '' : '　Enter 看畫'}`, 6000);

  // 照鏡子時：太靠近玩家或擋在鏡頭與玩家之間的訪客與其他玩家淡成半透明
  let mirrorFading = false;
  function updateMirrorFade(dt) {
    const isMirror = player.focus?.kind === 'mirror';
    if (!isMirror && !mirrorFading) return false;

    const cam = player.focus?.camPos;
    const px = player.pos.x, pz = player.pos.z;
    const cx = cam?.x ?? 0, cz = cam?.z ?? 0;
    const dx = isMirror && cam ? px - cx : 0, dz = isMirror && cam ? pz - cz : 0;
    const l2 = dx * dx + dz * dz;

    let busy = false;
    let anyFaded = false;

    const check = (obj, x, z) => {
      let target = 1.0;
      if (isMirror && cam) {
        // 先做粗篩：超出 4m 方框就跳過計算
        if (Math.abs(x - px) < 4 && Math.abs(z - pz) < 4) {
          const dP = Math.hypot(x - px, z - pz);
          const dC = Math.hypot(x - cx, z - cz);
          let dL = 999;
          if (l2 > 0) {
            const t = Math.max(0, Math.min(1, ((x - cx) * dx + (z - cz) * dz) / l2));
            dL = Math.hypot(x - (cx + t * dx), z - (cz + t * dz));
          }
          if (dL < 0.95 || dP < 1.8 || dC < 1.1) {
            target = 0.18;
            anyFaded = true;
          }
        }
      }

      const cur = obj._ghostAlpha ?? 1.0;
      if (Math.abs(cur - target) > 0.005) {
        const next = cur + (target - cur) * Math.min(1, dt * 10);
        obj._ghostAlpha = next;
        obj.setGhost(next);
        busy = true;
        if (next < 0.99) anyFaded = true;
      } else if (cur !== target) {
        obj._ghostAlpha = target;
        obj.setGhost(target);
        if (target < 0.99) anyFaded = true;
      } else if (cur < 0.99) {
        anyFaded = true;
      }
    };

    if (crowd?.list) {
      for (const v of crowd.list) {
        if (v.shown && !v.aboard) check(v, v.pos.x, v.pos.z);
        else if (v._ghostAlpha && v._ghostAlpha < 1.0) check(v, v.pos.x, v.pos.z);
      }
    }
    if (mp?.others) {
      for (const [, o] of mp.others) {
        if (o.ch.group.visible) check(o.ch, o.pos.x, o.pos.z);
        else if (o.ch._ghostAlpha && o.ch._ghostAlpha < 1.0) check(o.ch, o.pos.x, o.pos.z);
      }
    }

    mirrorFading = anyFaded || busy;
    return busy;
  }

  // 沒在動的時候降到約 30fps，省電
  const clock = new THREE.Clock();
  let frame = 0;
  // 某一幀出錯只記一次，迴圈照跑。不然 three.js 不會排下一幀，整個畫面停住、也不再送位置，別人會當你離開了
  let crashed = false;
  renderer.setAnimationLoop(() => {
    try {
      tick();
    } catch (e) {
      if (!crashed) console.error(e);
      crashed = true;
    }
  });
  function tick() {
    const dt = Math.min(clock.getDelta(), 0.05);
    player.update(dt);
    photo.update(dt);
    animals?.update(dt);
    visitors?.update(dt);
    vendors?.update(dt, player, camera);
    passers?.update(dt, player);
    manatee?.update(dt, player.pos.x, player.pos.z, camera);
    const othersMoving = mp ? mp.update(dt, performance.now()) : false;
    const fading = updateMirrorFade(dt);
    if (host) {
      host.group.visible = world.rooms[world.rooms.length - 1].group.visible;
      if (host.group.visible) host.update(dt, player.pos.x, player.pos.z, camera, visitors.hostFocus());
      else host.hush();
    }
    layoutBubbles();
    if (frame % 6 === 0) updateAction();
    // 攝影模式時，光線、聲音、牆跟著鏡頭走
    const view = photo.active ? photo.pos : player.pos;
    if (world.outdoor) {
      const t = world.outdoor.outdoorness(view.z);
      applyEnv(t);
      ambience.setLevel(t);
      const meadow = player.room === world.rooms.length - 1 && world.outdoor.inMeadow(player.pos.z);
      const spot = meadow ? world.outdoor.placeAt(player.pos.x, player.pos.z) : null;
      if (spot !== place && !photo.active) {
        // 從棧橋盡頭走回草原時不再報一次「原野」
        const back = place && spot === MEADOW_NAME;
        place = spot;
        const r = spot || world.rooms[player.room].data;
        if (!back) ui.toast(r.name, r.subtitle);
      }
    } else if (world.placeAt && !photo.active) {
      // 海市的石階和各層街道各有名字，走進去時報一次
      const spot = world.placeAt(player.pos.x, player.pos.z);
      if (spot && spot !== place) {
        place = spot;
        ui.toast(spot.name, spot.subtitle);
      }
    }
    if (photo.active) world.update(clock.elapsedTime, photo.pos, photo.fadeTarget(), camera, true);
    else world.update(clock.elapsedTime, player.camPos, player.fadeTarget(), camera);
    frame++;
    const idle = !photo.active && !player.moving && !othersMoving && !fading && performance.now() - lastInput > 2000;
    if (idle && frame % 2) return;
    if (!idle) quality.sample(dt);
    if (stats) renderer.info.reset();
    lensBoost();
    draw(dt);
    photo.afterRender();
    stats?.(dt);
  }
}

// ?debug 時左上角顯示幀率、draw call、三角形數和目前的畫質
function debugStats(renderer, quality) {
  renderer.info.autoReset = false;
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99;padding:4px 8px;font:11px/1.5 monospace;color:#cfe;background:#000a;white-space:pre;pointer-events:none';
  document.body.appendChild(el);
  let n = 0, sum = 0;
  return (dt) => {
    n++;
    sum += dt;
    if (sum < 0.5) return;
    const r = renderer.info.render;
    el.textContent = `${Math.round(n / sum)} fps  ${quality.level} ${quality.dpr}x
${r.calls} calls  ${(r.triangles / 1000).toFixed(1)}k tris
${quality.gpu}`;
    n = sum = 0;
  };
}

start();
