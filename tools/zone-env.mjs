// 在 Node 裡把一個區域建出來（不開瀏覽器）：zone-print.mjs（每一區的指紋）、lines.mjs（台詞整理）用；海市的 check-haishi、check-crowd 走 haishi-env.mjs（同一套假的 DOM）。
//   import { installDom, buildZone, ROOT } from './zone-env.mjs';
//   installDom();                                  // 假的 document、canvas、localStorage…，要在 import 任何 js/ 之前
//   const { THREE, Z, scene, w } = await buildZone('ting');   // Z 是 zone-ting.js，w 是 build 回傳的 world
// 建的時候 renderer、quality 都是 null：遮雨圖這種要顯示卡的直接略過（rain.js 自己會），畫質照電腦
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THREE_URL = pathToFileURL(path.join(ROOT, 'vendor/three.module.min.js')).href;
let installed = false;

export function installDom() {
  if (installed) return;
  installed = true;
  register(`data:text/javascript,export async function resolve(s, c, n) { return s === 'three' ? { url: ${JSON.stringify(THREE_URL)}, shortCircuit: true } : n(s, c); }`);
  // 建區域時會畫招牌、字的貼圖，給它一個什麼都不做的畫布
  const ctx = new Proxy({}, {
    get: (t, k) => {
      if (k in t) return t[k];
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'getImageData') return (x, y, w = 1, h = 1) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h });
      if (k === 'createImageData') return (w = 1, h = 1) => ({ data: new Uint8ClampedArray(Math.max(1, (w.width ?? w) * (w.height ?? h) * 4)), width: w.width ?? w, height: w.height ?? h });
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop() {} });
      return typeof k === 'string' ? () => {} : undefined;
    },
    set: (t, k, v) => { t[k] = v; return true; },
  });
  const el = () => ({
    width: 64, height: 64, style: {}, dataset: {}, children: [], getContext: () => ctx, addEventListener() {}, removeEventListener() {}, appendChild() {}, remove() {},
    setAttribute() {}, querySelector: () => null, querySelectorAll: () => [], toDataURL: () => '', getBoundingClientRect: () => ({ left: 0, top: 0, width: 64, height: 64 }),
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  });
  const storage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };
  Object.assign(globalThis, {
    window: globalThis, devicePixelRatio: 1, innerWidth: 800, innerHeight: 600,
    document: { createElement: el, createElementNS: el, body: el(), head: el(), documentElement: el(), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {}, hidden: false },
    location: { search: '', pathname: '/', origin: 'http://localhost', href: 'http://localhost/', hash: '', replace() {} },
    history: { replaceState() {} },
    localStorage: storage, sessionStorage: storage,
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    requestAnimationFrame: (f) => setTimeout(() => f(performance.now()), 16), cancelAnimationFrame: clearTimeout,
    Path2D: class {}, Image: class { set src(v) {} addEventListener() {} },
    OffscreenCanvas: class { constructor() { return el(); } },
  });
  if (!globalThis.navigator?.userAgent) Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node', maxTouchPoints: 0, storage: null }, configurable: true });
}

export async function buildZone(name) {
  installDom();
  const THREE = await import('three');
  const Z = await import(pathToFileURL(path.join(ROOT, `js/zones/${name}/zone-${name}.js`)).href);
  const scene = new THREE.Scene();
  // 畫廊：gallery.json 決定房間順序，每間房的內容在 rooms/<id>/room.json（跟 main.js 的 loadGallery 一樣）
  let gallery = null;
  if (name === 'gallery') {
    const g = JSON.parse(fs.readFileSync(path.join(ROOT, 'gallery.json'), 'utf8'));
    const room = (id) => ({ id, ...JSON.parse(fs.readFileSync(path.join(ROOT, `rooms/${id}/room.json`), 'utf8')) });
    gallery = { ...g, rooms: g.order.map(room), cellar: g.cellar ? room(g.cellar) : null };
  }
  const w = Z.build(scene, { gallery, coarse: false, params: new URLSearchParams(''), renderer: null, quality: null });
  return { THREE, Z, scene, w };
}
