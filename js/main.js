import * as THREE from 'three';
import { buildWorld } from './world.js';
import { Player } from './player.js';
import { Character } from './character.js';
import { UI } from './ui.js';
import { bindJoystick } from './joystick.js';
import * as TX from './textures.js';

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
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('dragstart', (e) => { if (e.target.tagName === 'IMG') e.preventDefault(); });

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

  const coarse = matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: window.devicePixelRatio < 2, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarse ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.getElementById('stage').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1c130d);
  scene.fog = new THREE.Fog(0x1c130d, 16, 38);
  scene.add(new THREE.HemisphereLight(0xfff0dc, 0x6a4a34, 1.9));
  const sun = new THREE.DirectionalLight(0xffcf98, 1.3);
  sun.position.set(4, 8, 3);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 80);

  const world = buildWorld(scene, gallery);
  const character = new Character(TX.shadowTexture());
  scene.add(character.group);
  let lastInput = performance.now();

  const player = new Player(camera, renderer.domElement, world, character, {
    onInput(kind) {
      lastInput = performance.now();
      ui.hidePainting();
      ui.hideHint();
    },
    onArrivePainting(p) {
      ui.showPainting(p, p.url);
    },
    onRoomChange(i) {
      world.setCurrentRoom(i);
      const r = world.rooms[i].data;
      ui.toast(r.name, r.subtitle);
    },
  });
  scene.add(player.marker);

  ui.buildList(true);
  ui.onGoTo = (ri, pi) => {
    const p = world.rooms[ri]?.paintings[pi];
    if (!p) return;
    const plan = player.planFocus(p);
    player.teleport(plan.stand.x, plan.stand.z);
    player.pending = plan;
    player.arrive();
    lastInput = performance.now();
  };
  ui.onClose = () => player.exitFocus();

  // 手機操作：搖桿走路，靠近畫作時出現「看畫」按鈕
  if (coarse) document.body.classList.add('touch');
  bindJoystick(document.getElementById('joy'), document.getElementById('joy-knob'), (x, y) => player.setJoystick(x, y));
  const actionBtn = document.getElementById('action-btn');
  actionBtn.addEventListener('click', () => player.action());
  let nearP = null;
  function updateAction() {
    const p = player.nearbyPainting();
    if (p === nearP) return;
    nearP = p;
    actionBtn.classList.toggle('show', !!p);
    if (p) document.getElementById('action-title').textContent = p.data.title || '';
  }

  // 作品面板打開時挪動畫面中心，畫才不會被擋住：電腦往左，手機往上
  let sheetOpen = false;
  function applyViewOffset() {
    const w = window.innerWidth, h = window.innerHeight;
    if (!sheetOpen) camera.clearViewOffset();
    else if (w >= 900) camera.setViewOffset(w, h, 200, 0, w, h);
    else camera.setViewOffset(w, h, 0, Math.round(ui.sheet.offsetHeight / 2), w, h);
  }
  ui.onSheet = (open) => {
    sheetOpen = open;
    document.body.classList.toggle('panel-open', open);
    applyViewOffset();
    lastInput = performance.now();
  };

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    applyViewOffset();
    lastInput = performance.now();
  });

  if (params.has('debug')) window.__g = { player, world, camera, ui, renderer };

  ui.loading(null);
  ui.hint(coarse ? '左下搖桿或點地面走路　拖曳轉視角' : '點地面或 WASD 走路　拖曳轉視角　Enter 看畫', 6000);

  // 沒在動的時候降到約 30fps，省電
  const clock = new THREE.Clock();
  let frame = 0;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    player.update(dt);
    if (frame % 6 === 0) updateAction();
    world.update(clock.elapsedTime, player.camPos, player.fadeTarget());
    frame++;
    const idle = !player.moving && performance.now() - lastInput > 2000;
    if (idle && frame % 2) return;
    renderer.render(scene, camera);
  });
}

start();
