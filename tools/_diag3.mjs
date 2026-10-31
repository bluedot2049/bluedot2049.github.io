import { THREE, w, ROOT } from './haishi-env.mjs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const cat = {}; const of = w.findPath;
w.findPath = (ax, az, bx, bz) => { const k = `a${w.walkable(ax, az) ? 'ok' : 'X'} b${w.walkable(bx, bz) ? 'ok' : 'X'} len${Math.min(20, Math.round(Math.hypot(bx - ax, bz - az) / 5) * 5)}`; cat[k] = (cat[k] || 0) + 1; return of(ax, az, bx, bz); };
const { Passersby } = await import(pathToFileURL(path.join(ROOT, 'js/passersby.js')).href);
const ps = new Passersby({ scene: new THREE.Scene(), world: w, shadowTex: null, force: 1 });
const base = Date.UTC(2026, 10, 1, 0, 0, 0) / 1000;
for (let k = 0; k < 6; k++) for (let i = 0; i < 110; i++) { ps.planned = 0; ps.deadline = 1e12; ps.trips[i] = null; ps.trip(i, base + k * 300 + 5); }
console.log(Object.entries(cat).sort((a, b) => b[1] - a[1]));
