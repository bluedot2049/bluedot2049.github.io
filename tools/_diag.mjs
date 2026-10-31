import { THREE, w, ROOT } from './haishi-env.mjs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const { Passersby } = await import(pathToFileURL(path.join(ROOT, 'js/passersby.js')).href);
const T = {}, wrap = (o, k, name) => { const f = o[k].bind(o); o[k] = (...a) => { const s = performance.now(); const r = f(...a); T[name] = (T[name] || 0) + performance.now() - s; return r; }; };
const realNow = Date.now, worst = [];
for (const hour of [8, 13]) for (const spot of [{ x: -2, y: 6.8, z: -14 }, { x: 0, y: 0, z: 8 }, { x: -6, y: 9.2, z: -24 }]) {
  const ps = new Passersby({ scene: new THREE.Scene(), world: w, shadowTex: null });
  wrap(ps, 'trip', 'plan'); wrap(ps, 'separate', 'sep'); for (const e of ps.pool) { wrap(e.ch, 'setLook', 'setLook'); }
  const base = Date.UTC(2026, 10, 1, (hour - 8 + 24) % 24, 0, 0);
  for (let f = 0; f < 1800; f++) {
    Date.now = () => base + f * 33;
    for (const k in T) T[k] = 0;
    const a = performance.now(); ps.update(1 / 30, { pos: spot }); const d = performance.now() - a;
    if (f > 60 && d > 5) worst.push([d.toFixed(1), JSON.stringify(Object.fromEntries(Object.entries(T).map(([k, v]) => [k, +v.toFixed(1)])))]);
  }
}
Date.now = realNow;
worst.sort((a, b) => b[0] - a[0]);
console.log(worst.slice(0, 10).map((x) => x.join(' ')).join('\n'), '\n', worst.length, 'frames >5ms of', 6 * 1740);
