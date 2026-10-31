import { THREE, w, ROOT } from './haishi-env.mjs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
let fp = 0, fpn = 0, wk = 0, wkn = 0;
const of = w.findPath; w.findPath = (...a) => { const s = performance.now(); const r = of(...a); fp += performance.now() - s; fpn++; return r; };
const ow = w.walkable; w.walkable = (...a) => { const s = performance.now(); const r = ow(...a); wk += performance.now() - s; wkn++; return r; };
const { Passersby } = await import(pathToFileURL(path.join(ROOT, 'js/passersby.js')).href);
const ps = new Passersby({ scene: new THREE.Scene(), world: w, shadowTex: null, force: 1 });
fp = wk = fpn = wkn = 0;
let tot = 0;
const base = Date.UTC(2026, 10, 1, 0, 0, 0) / 1000;
for (let k = 0; k < 10; k++) for (let i = 0; i < 110; i++) { ps.planned = 0; ps.deadline = 1e12; ps.trips[i] = null; const a = performance.now(); ps.trip(i, base + k * 300 + 5); tot += performance.now() - a; }
console.log('plans 1100 total', tot.toFixed(0), 'ms; findPath', fpn, 'calls', fp.toFixed(0), 'ms; walkable', wkn, 'calls', wk.toFixed(0), 'ms');
