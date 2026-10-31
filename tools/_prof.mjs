import { THREE, w, ROOT } from './haishi-env.mjs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const { Character } = await import(pathToFileURL(path.join(ROOT, 'js/_charprof.js')).href);
const { Passersby } = await import(pathToFileURL(path.join(ROOT, 'js/passersby.js')).href);
const { presetLook } = await import(pathToFileURL(path.join(ROOT, 'js/looks.js')).href);
const ps = new Passersby({ scene: new THREE.Scene(), world: w, shadowTex: null, force: 1 });
const looks = []; for (let k = 0; k < 8; k++) for (let i = 0; i < 110; i++) { ps.trips[i] = null; ps.planned = 0; ps.deadline = 1e12; const tr = ps.trip(i, Date.now() / 1000 + k * 300); for (const p of tr?.plan?.people ?? []) looks.push(p.look); }
const ch = new Character(null, presetLook(0));
for (const L of looks.slice(0, 40)) ch.setLook(L);
globalThis.__P = {};
const tot = []; 
const rows = [];
for (const L of looks) { globalThis.__P = {}; const a = performance.now(); ch.setLook(L); const d = performance.now() - a; tot.push(d); rows.push([d, { ...globalThis.__P }, L.race]); }
rows.sort((a, b) => b[0] - a[0]);
for (const [d, P, r] of rows.slice(0, 8)) console.log(d.toFixed(1), r, Object.entries(P).filter(([, v]) => v > 0.5).map(([k, v]) => k + ' ' + v.toFixed(1)).join(', '));
tot.sort((a, b) => a - b);
console.log('looks', looks.length, 'total ms', tot.reduce((s, v) => s + v, 0).toFixed(0), 'median', tot[tot.length >> 1].toFixed(2), 'p95', tot[Math.floor(tot.length * 0.95)].toFixed(2), 'max', tot.at(-1).toFixed(1));
console.log(Object.entries(globalThis.__P).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v.toFixed(0)}ms`).join('  '));
