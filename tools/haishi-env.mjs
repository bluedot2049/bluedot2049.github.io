// 海市的測試環境：在 Node 裡把海市建出來（不開瀏覽器），給 check-haishi.mjs、check-crowd.mjs 共用
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THREE_URL = pathToFileURL(path.join(ROOT, 'vendor/three.module.min.js')).href;
register(`data:text/javascript,export async function resolve(s, c, n) { return s === 'three' ? { url: ${JSON.stringify(THREE_URL)}, shortCircuit: true } : n(s, c); }`);

// 建海市時會畫招牌、字的貼圖，給它一個什麼都不做的畫布
const ctx = new Proxy({}, {
  get: (t, k) => {
    if (k in t) return t[k];
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'getImageData' || k === 'createImageData') return (x, y, w = 1, h = 1) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)) });
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
    return typeof k === 'string' ? () => {} : undefined;
  },
  set: (t, k, v) => { t[k] = v; return true; },
});
const el = () => ({ width: 64, height: 64, style: {}, getContext: () => ctx, addEventListener() {}, appendChild() {}, classList: { add() {}, remove() {}, contains: () => false } });
Object.assign(globalThis, {
  window: globalThis, devicePixelRatio: 1, innerWidth: 800, innerHeight: 600,
  document: { createElement: el, body: el(), addEventListener() {} },
  matchMedia: () => ({ matches: false }),
  Path2D: class {},
});

export const THREE = await import('three');
const { buildHaishi } = await import(pathToFileURL(path.join(ROOT, 'js/haishi.js')).href);
export const w = buildHaishi(new THREE.Scene());
