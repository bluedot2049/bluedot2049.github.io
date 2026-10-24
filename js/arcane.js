// 房子外觀的魔法裝飾：屋脊上的觀星塔和渾天儀、角樓、山牆的煉金玫瑰窗、牆上的發光符文、
// 陽台地上的圓陣、牆上的銅管、漂浮的水晶和燒瓶、窗口飄出的光點。會動的東西在 update(t) 裡轉。
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { Kit, newBucket } from './props.js';

const GOLD = '#d4a54a', COPPER = '#b8733a', BRASS = '#a8844a';
const SLATE = '#4e3e4c', SLATE2 = '#6a5468', TOWER = '#bba88c', TOWER2 = '#d8c4a0';
const pr = () => Math.min(window.devicePixelRatio, 2);

// ---------- 煉金符號 ----------

// 七金屬的行星符號：0 太陽(金) 1 月(銀) 2 水星(汞) 3 金星(銅) 4 火星(鐵) 5 木星(錫) 6 土星(鉛)
// 用路徑畫，不靠字型，每台裝置看起來都一樣
function glyph(g, i, cx, cy, s) {
  const circle = (x, y, r) => { g.moveTo(x + r, y); g.arc(x, y, r, 0, Math.PI * 2); };
  const line = (x1, y1, x2, y2) => { g.moveTo(cx + x1 * s, cy + y1 * s); g.lineTo(cx + x2 * s, cy + y2 * s); };
  g.beginPath();
  if (i === 0) {
    circle(cx, cy, s * 0.6);
    circle(cx, cy, s * 0.08);
  } else if (i === 1) {
    g.moveTo(cx + 0.3 * s, cy - 0.52 * s);
    g.arc(cx, cy, 0.6 * s, -Math.PI / 3, Math.PI / 3, true);
    g.arc(cx + 0.42 * s, cy, 0.534 * s, 1.797, Math.PI * 2 - 1.797, false);
  } else if (i === 2) {
    circle(cx, cy - 0.05 * s, 0.3 * s);
    g.moveTo(cx + 0.3 * s * Math.cos(0.2), cy - 0.72 * s + 0.3 * s * Math.sin(0.2));
    g.arc(cx, cy - 0.72 * s, 0.3 * s, 0.2, Math.PI - 0.2);
    line(0, 0.25, 0, 0.85);
    line(-0.22, 0.56, 0.22, 0.56);
  } else if (i === 3) {
    circle(cx, cy - 0.25 * s, 0.36 * s);
    line(0, 0.11, 0, 0.85);
    line(-0.25, 0.5, 0.25, 0.5);
  } else if (i === 4) {
    circle(cx - 0.12 * s, cy + 0.12 * s, 0.4 * s);
    line(0.163, -0.163, 0.62, -0.62);
    line(0.62, -0.62, 0.3, -0.62);
    line(0.62, -0.62, 0.62, -0.3);
  } else if (i === 5) {
    g.moveTo(cx - 0.5 * s, cy - 0.4 * s);
    g.bezierCurveTo(cx - 0.45 * s, cy - 0.85 * s, cx + 0.05 * s, cy - 0.8 * s, cx - 0.05 * s, cy - 0.35 * s);
    g.lineTo(cx - 0.5 * s, cy + 0.25 * s);
    line(-0.55, 0.25, 0.55, 0.25);
    line(0.25, -0.7, 0.25, 0.75);
  } else {
    line(-0.2, -0.8, -0.2, 0.2);
    line(-0.45, -0.5, 0.05, -0.5);
    g.moveTo(cx - 0.2 * s, cy - 0.05 * s);
    g.bezierCurveTo(cx + 0.1 * s, cy - 0.35 * s, cx + 0.55 * s, cy - 0.2 * s, cx + 0.35 * s, cy + 0.25 * s);
    g.quadraticCurveTo(cx + 0.2 * s, cy + 0.6 * s, cx + 0.45 * s, cy + 0.8 * s);
  }
  g.stroke();
}

function goldPen(g, w, blur) {
  g.strokeStyle = '#ffe2a4';
  g.fillStyle = '#ffe2a4';
  g.lineWidth = w;
  g.lineCap = g.lineJoin = 'round';
  g.shadowColor = '#ffa838';
  g.shadowBlur = blur;
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// 七個符號排成一列，每格外面圍一圈
function runeAtlas() {
  return canvasTexture(7 * 128, 128, (g) => {
    goldPen(g, 6, 12);
    for (let i = 0; i < 7; i++) {
      const cx = i * 128 + 64;
      glyph(g, i, cx, 64, 34);
      g.lineWidth = 3;
      g.beginPath();
      g.arc(cx, 64, 54, 0, Math.PI * 2);
      g.stroke();
      for (let j = 0; j < 4; j++) {
        const a = j * Math.PI / 2 + Math.PI / 4;
        g.beginPath();
        g.arc(cx + Math.cos(a) * 54, 64 + Math.sin(a) * 54, 3, 0, Math.PI * 2);
        g.fill();
      }
      g.lineWidth = 6;
    }
  });
}

// 陽台地上的大圓陣：外環刻七個符號，裡面是圓、三角、圓、方、圓一層套一層
function circleTexture() {
  return canvasTexture(1024, 1024, (g) => {
    const c = 512;
    const ring = (r, w) => { g.lineWidth = w; g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.stroke(); };
    const poly = (n, r, rot, w) => {
      g.lineWidth = w;
      g.beginPath();
      for (let i = 0; i <= n; i++) {
        const a = rot + (i / n) * Math.PI * 2;
        g[i ? 'lineTo' : 'moveTo'](c + Math.cos(a) * r, c + Math.sin(a) * r);
      }
      g.stroke();
    };
    goldPen(g, 4, 16);
    ring(492, 6);
    ring(466, 3);
    for (let i = 0; i < 84; i++) {
      const a = (i / 84) * Math.PI * 2, r1 = i % 12 === 0 ? 466 : 478;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
      g.lineTo(c + Math.cos(a) * 492, c + Math.sin(a) * 492);
      g.stroke();
    }
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i / 7) * Math.PI * 2;
      g.lineWidth = 5;
      glyph(g, i, c + Math.cos(a) * 428, c + Math.sin(a) * 428, 24);
      const b = a + Math.PI / 7;
      g.beginPath();
      g.arc(c + Math.cos(b) * 428, c + Math.sin(b) * 428, 5, 0, Math.PI * 2);
      g.fill();
    }
    ring(392, 5);
    poly(3, 392, -Math.PI / 2, 5);
    g.globalAlpha = 0.45;
    poly(3, 392, Math.PI / 2, 3);
    g.globalAlpha = 1;
    ring(196, 4);
    poly(4, 196, Math.PI / 4, 4);
    ring(98, 3);
    ring(14, 6);
  });
}

// 玫瑰窗：外圈十二片彩色玻璃，裡面是畫廊圖示的圓包三角，鉛條是深色的線
function roseTexture() {
  return canvasTexture(512, 512, (g) => {
    const c = 256, R = 250;
    g.save();
    g.beginPath();
    g.arc(c, c, R, 0, Math.PI * 2);
    g.clip();
    const panes = ['#c8203a', '#e8a030', '#2a4ab8', '#2a8a5a', '#8a3ab8', '#e8c040'];
    for (let i = 0; i < 12; i++) {
      g.fillStyle = panes[i % panes.length];
      g.beginPath();
      g.moveTo(c, c);
      g.arc(c, c, R, (i / 12) * Math.PI * 2, ((i + 1) / 12) * Math.PI * 2);
      g.fill();
    }
    const glow = g.createRadialGradient(c, c, 10, c, c, 165);
    glow.addColorStop(0, '#fff2c0');
    glow.addColorStop(1, '#f09a3a');
    g.fillStyle = glow;
    g.beginPath();
    g.arc(c, c, 165, 0, Math.PI * 2);
    g.fill();
    const tri = [0, 1, 2].map((i) => [c + Math.cos(-Math.PI / 2 + i * 2.0944) * 165, c + Math.sin(-Math.PI / 2 + i * 2.0944) * 165]);
    g.fillStyle = '#b8283a';
    g.beginPath();
    tri.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, y));
    g.closePath();
    g.fill();
    g.fillStyle = '#ffd870';
    g.beginPath();
    g.arc(c, c, 82, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#2a1810';
    g.lineWidth = 9;
    for (const r of [R - 4, 165, 82]) { g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.stroke(); }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.beginPath();
      g.moveTo(c + Math.cos(a) * 165, c + Math.sin(a) * 165);
      g.lineTo(c + Math.cos(a) * R, c + Math.sin(a) * R);
      g.stroke();
    }
    g.beginPath();
    tri.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, y));
    g.closePath();
    g.stroke();
    g.restore();
  });
}

// 會呼吸的金光：每塊符文各自的節奏，用加法混色疊在牆上
function glowMaterial(map, uTime) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime, map: { value: map } },
    vertexShader: `
      uniform float uTime; attribute float aPhase;
      varying vec2 vUv; varying float vB;
      void main() {
        vUv = uv;
        vB = 0.3 + 0.7 * (0.5 + 0.5 * sin(uTime * 0.8 + aPhase));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D map; varying vec2 vUv; varying float vB;
      void main() {
        vec4 c = texture2D(map, vUv);
        gl_FragColor = vec4(c.rgb, c.a * vB);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

// 一組符文牌：list 每項 { i 第幾個符號, x, y, z, ry, s 邊長 }
function runePlates(list, map, uTime) {
  const geos = list.map(({ i, x, y, z, ry, s = 0.5 }, n) => {
    const g = new THREE.PlaneGeometry(s, s);
    const uv = g.attributes.uv;
    for (let j = 0; j < uv.count; j++) uv.setX(j, (i + uv.getX(j)) / 7);
    g.rotateY(ry);
    g.translate(x, y, z);
    g.setAttribute('aPhase', new THREE.BufferAttribute(new Float32Array(uv.count).fill(n * 1.7), 1));
    return g;
  });
  const m = new THREE.Mesh(mergeGeometries(geos), glowMaterial(map, uTime));
  m.renderOrder = 2;
  return m;
}

// ---------- 建築 ----------

// 屋脊上的觀星塔：八角石塔、發光的窄窗、垛口，塔頂立一根銅柱撐著渾天儀
function tower(k, x, z, y0, y1) {
  const h = y1 - y0;
  k.cyl(0.9, 0.95, h, TOWER, x, y0 + h / 2, z, { ry: Math.PI / 8, color2: TOWER2 }, 8);
  for (const y of [y0 + h * 0.45, y1 - 0.05]) k.cyl(0.98, 0.98, 0.12, '#5a3a24', x, y, z, { ry: Math.PI / 8 }, 8);
  const ap = 0.95 * Math.cos(Math.PI / 8);
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const sx = Math.sin(a), sz = Math.cos(a);
    k.box(0.16, 0.62, 0.04, '#ffcf8a', x + sx * (ap - 0.02), y1 - 1.0, z + sz * (ap - 0.02), { ry: a, glow: true, color2: '#ff9a5a' });
    k.box(0.28, 0.08, 0.1, '#5a3a24', x + sx * ap, y1 - 0.66, z + sz * ap, { ry: a });
    k.light(x + sx * (ap + 0.05), y1 - 1.0, z + sz * (ap + 0.05), '#ffc070', 1.2);
  }
  // 塔身下段一扇小圓窗朝草原
  k.add(new THREE.CircleGeometry(0.16, 12), '#ffd890', x, y0 + h * 0.3, z - ap - 0.01, { ry: Math.PI, glow: true });
  k.cyl(1.12, 0.92, 0.25, '#9a8a7c', x, y1 + 0.125, z, { ry: Math.PI / 8 }, 8);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    k.box(0.26, 0.3, 0.16, '#a8988a', x + Math.sin(a) * 1.0, y1 + 0.4, z + Math.cos(a) * 1.0, { ry: a });
  }
  k.cyl(0.05, 0.07, 1.25, BRASS, x, y1 + 0.85, z, {}, 6);
}

// 角樓：圓柱塔身、尖錐屋頂，尖頂掛一彎金色新月
function turret(k, x, z, y0, y1) {
  const r = 0.72, h = y1 - y0;
  k.cyl(r, r + 0.04, h, '#cdb894', x, y0 + h / 2, z, { color2: '#dcc7a4' }, 10);
  for (const y of [0.05, 2.5, y1]) k.cyl(r + 0.06, r + 0.06, 0.12, '#5a3a24', x, y, z, {}, 10);
  for (const [a, y] of [[Math.PI, 1.3], [-Math.PI / 2, 1.3], [-Math.PI * 0.75, 3.4], [Math.PI * 0.75, 3.4]]) {
    const sx = Math.sin(a), sz = Math.cos(a);
    k.box(0.15, 0.5, 0.04, '#ffcf8a', x + sx * (r + 0.01), y, z + sz * (r + 0.01), { ry: a, glow: true, color2: '#ff9a5a' });
    k.box(0.26, 0.06, 0.1, '#5a3a24', x + sx * (r + 0.02), y + 0.29, z + sz * (r + 0.02), { ry: a });
    k.light(x + sx * (r + 0.08), y, z + sz * (r + 0.08), '#ffc070', 1.0);
  }
  k.cyl(r + 0.2, r + 0.2, 0.1, SLATE, x, y1 + 0.05, z, {}, 10);
  k.cone(r + 0.2, 2.6, SLATE, x, y1 + 1.4, z, { color2: SLATE2 });
  k.cyl(0.02, 0.03, 0.6, GOLD, x, y1 + 2.95, z, {}, 5);
  k.ball(0.07, GOLD, x, y1 + 2.8, z);
  k.torus(0.13, 0.025, Math.PI * 1.2, '#ffe2a0', x, y1 + 3.3, z, { rz: -Math.PI * 0.1, ry: Math.PI / 2, glow: true });
  k.light(x, y1 + 3.3, z, '#ffe0a0', 1.0);
}

// 煉金工坊的銅管：兩根沿外牆爬上屋簷，接頭、壓力錶、閥門輪
function pipes(k, x, z, top) {
  for (const [dx, r] of [[0, 0.06], [0.24, 0.045]]) {
    const px = x + dx;
    k.cyl(r, r, top, COPPER, px, top / 2, z - 0.1, { color2: '#d8955a' }, 8);
    for (let y = 0.4; y < top; y += 0.9) k.cyl(r + 0.02, r + 0.02, 0.06, '#8a5228', px, y, z - 0.1, {}, 8);
    k.torus(0.12, r, Math.PI / 2, COPPER, px, top, z - 0.22, { ry: Math.PI / 2, rz: Math.PI / 2 });
  }
  // 壓力錶
  k.cyl(0.12, 0.12, 0.05, BRASS, x - 0.18, 1.7, z - 0.12, { rx: Math.PI / 2 }, 14);
  k.add(new THREE.CircleGeometry(0.095, 14), '#f4ecd0', x - 0.18, 1.7, z - 0.15, { ry: Math.PI, glow: true });
  k.box(0.012, 0.075, 0.01, '#3a2018', x - 0.17, 1.71, z - 0.155, { rz: 0.8 });
  k.box(0.14, 0.03, 0.03, COPPER, x - 0.07, 1.7, z - 0.1);
  // 閥門輪
  k.torus(0.13, 0.02, Math.PI * 2, '#9a2a20', x + 0.24, 1.25, z - 0.2, {});
  for (const a of [0, Math.PI / 3, -Math.PI / 3]) k.box(0.26, 0.018, 0.018, '#9a2a20', x + 0.24, 1.25, z - 0.2, { rz: a });
}

// ---------- 會動的東西 ----------

// 渾天儀：三圈金環套著，各自繞不同的軸轉，中間一顆光球，外面繞著三顆小石頭
function armillary(x, y, z, glowPoints) {
  const root = new THREE.Group();
  root.position.set(x, y, z);
  const brass = new THREE.MeshLambertMaterial({ color: 0xd4a54a, emissive: 0x3a2808 });
  const ring = (r, t = 0.035) => new THREE.Mesh(new THREE.TorusGeometry(r, t, 6, 40), brass);
  const outer = new THREE.Group(), mid = new THREE.Group(), inner = new THREE.Group();
  const meridian = ring(0.68);
  meridian.rotation.y = Math.PI / 2;
  outer.add(ring(0.78), mid);
  mid.add(meridian, inner);
  const eq = ring(0.58, 0.05);
  eq.rotation.x = Math.PI / 2;
  inner.add(eq);
  const ecl = ring(0.86, 0.025);
  ecl.rotation.set(Math.PI / 2 - 0.41, 0, 0);
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 2), new THREE.MeshBasicMaterial({ color: 0xfff0c0 }));
  root.add(outer, ecl, orb, glowPoints([{ x: 0, y: 0, z: 0, color: '#ffd890', size: 3.2 }]));
  const stoneMat = new THREE.MeshLambertMaterial({ color: 0x8a7c9c, flatShading: true });
  const stones = [0, 1, 2].map((i) => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07 + i * 0.02, 0), stoneMat);
    root.add(m);
    return m;
  });
  return {
    root,
    update(t) {
      outer.rotation.y = t * 0.22;
      mid.rotation.x = t * 0.31;
      inner.rotation.z = t * 0.17;
      ecl.rotation.z = -t * 0.08;
      stones.forEach((m, i) => {
        const a = t * (0.35 + i * 0.12) + i * 2.1, r = 1.15 + i * 0.18;
        m.position.set(Math.cos(a) * r, Math.sin(t * 0.7 + i) * 0.15 + (i - 1) * 0.12, Math.sin(a) * r);
        m.rotation.set(t * 0.9, t * 0.6 + i, 0);
      });
    },
  };
}

// 漂浮的水晶、燒瓶、石塊：上下浮動、慢慢自轉，光暈跟著走
function floaters(list, glowPoints) {
  const group = new THREE.Group();
  const glass = new THREE.MeshLambertMaterial({ color: 0xd8eef2, transparent: true, opacity: 0.4, depthWrite: false });
  const stoneMat = new THREE.MeshLambertMaterial({ color: 0x8c7e8e, flatShading: true });
  const items = list.map(({ kind, x, y, z, color }, i) => {
    const o = new THREE.Group();
    if (kind === 'crystal') {
      const c = new THREE.Color(color);
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.13), new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0.55, transparent: true, opacity: 0.88 }));
      m.scale.y = 1.9;
      o.add(m);
    } else if (kind === 'flask') {
      const liquid = new THREE.Mesh(new THREE.IcosahedronGeometry(0.095, 1), new THREE.MeshBasicMaterial({ color }));
      liquid.position.y = -0.02;
      const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 2), glass);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.16, 8, 1, true), glass);
      neck.position.y = 0.17;
      const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.05, 8), new THREE.MeshLambertMaterial({ color: 0x8a5a30 }));
      cork.position.y = 0.27;
      o.add(liquid, body, neck, cork);
    } else {
      o.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.12 + (i % 3) * 0.04, 0), stoneMat));
    }
    o.position.set(x, y, z);
    group.add(o);
    return { o, x, y, z, ph: i * 1.37, spin: 0.25 + (i % 4) * 0.1 };
  });
  const lit = list.map((f, i) => ({ ...f, i })).filter((f) => f.kind !== 'stone');
  const pts = glowPoints(lit.map((f) => ({ x: f.x, y: f.y, z: f.z, color: f.color, size: f.kind === 'flask' ? 0.7 : 0.9 })));
  group.add(pts);
  const pos = pts.geometry.attributes.position;
  return {
    group,
    update(t) {
      for (const it of items) {
        it.o.position.y = it.y + Math.sin(t * 0.6 + it.ph) * 0.14;
        it.o.rotation.set(Math.sin(t * 0.4 + it.ph) * 0.15, t * it.spin + it.ph, Math.cos(t * 0.33 + it.ph) * 0.12);
      }
      lit.forEach((f, j) => pos.setY(j, items[f.i].o.position.y));
      pos.needsUpdate = true;
    },
  };
}

// 窗口、門口、玫瑰窗飄出來的光點，往上飄、慢慢淡掉
function motes(sources, uTime) {
  const n = sources.length * 6, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), ph = new Float32Array(n);
  const palette = ['#ffe0a0', '#ffd27a', '#a8f0e0', '#f0b0e8'].map((c) => new THREE.Color(c));
  for (let i = 0; i < n; i++) {
    const s = sources[i % sources.length];
    pos.set([s.x + (Math.random() - 0.5) * s.w, s.y + (Math.random() - 0.5) * s.h, s.z], i * 3);
    const c = palette[i % palette.length];
    col.set([c.r, c.g, c.b], i * 3);
    ph[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime, uSize: { value: 34 * pr() } },
    vertexShader: `
      uniform float uTime; uniform float uSize;
      attribute vec3 aColor; attribute float aPhase;
      varying vec3 vC; varying float vA;
      void main() {
        float t = fract(uTime * 0.07 + aPhase);
        vec3 p = position + vec3(sin(aPhase * 31.0 + t * 5.0) * 0.35, t * 2.8, -t * 1.4);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uSize * (1.0 - t * 0.5) / -mv.z;
        gl_Position = projectionMatrix * mv;
        vC = aColor;
        vA = sin(t * 3.14159) * (0.6 + 0.4 * sin(uTime * 3.0 + aPhase * 40.0));
      }`,
    fragmentShader: `
      varying vec3 vC; varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = pow(max(0.0, 1.0 - d), 2.0) * vA;
        gl_FragColor = vec4(vC * a, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const p = new THREE.Points(geo, mat);
  p.frustumCulled = false;
  return p;
}

// ---------- 組起來 ----------

// d：房子和陽台的尺寸。shell 裡的東西跟房子外殼一起藏，group 裡的留在陽台
export function buildArcane({ shell, group, h, R, z0, Z, d }) {
  const { BW, EAVE, RIDGE, YB, TW, TD, SW, G } = d;
  const k = new Kit(R), bucket = newBucket();
  const atlas = runeAtlas();

  const tw = { x: 0, z: z0 + 2.6, top: RIDGE + 2.6 };
  tower(k, tw.x, tw.z, EAVE + 0.6, tw.top);
  turret(k, -(BW + 0.35), z0 + 0.9, YB, EAVE + 0.9);
  pipes(k, 4.55, z0, EAVE - 0.1);

  // 山牆的玫瑰窗和石框
  const roseY = EAVE + 0.8;
  const rose = new THREE.Mesh(new THREE.CircleGeometry(0.55, 40), new THREE.MeshBasicMaterial({ map: roseTexture(), transparent: true }));
  rose.position.set(0, roseY, z0 - 0.025);
  rose.rotation.y = Math.PI;
  shell.add(rose);
  k.torus(0.58, 0.07, Math.PI * 2, '#cdbb98', 0, roseY, z0 - 0.03, {});
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    k.box(0.1, 0.1, 0.1, '#b8a88a', Math.cos(a) * 0.66, roseY + Math.sin(a) * 0.66, z0 - 0.05, { rz: a + Math.PI / 4 });
  }
  k.light(0, roseY, z0 - 0.2, '#ffb070', 2.6);

  k.emit(bucket, 0, 0, 0);
  for (const o of h.bucketObjects(bucket)) shell.add(o);

  // 後牆一排符文，陽台石牆外側一圈符文
  shell.add(runePlates([-3.6, -2.4, -1.2, 0, 1.2, 2.4, 3.6].map((x, i) => ({ i, x, y: 3.3, z: z0 - 0.02, ry: Math.PI, s: 0.42 })), atlas, h.uTime));
  const wall = [];
  [-5.1, -3.75, -2.4, 2.4, 3.75, 5.1].forEach((x, i) => wall.push({ i: i % 7, x, y: -0.75, z: Z(TD) - 0.02, ry: Math.PI }));
  for (const sx of [-1, 1]) for (const [j, rel] of [[2, 2.2], [4, 4.8]]) wall.push({ i: (j + (sx > 0 ? 1 : 0)) % 7, x: sx * (TW + 0.02), y: -0.75, z: Z(rel), ry: sx * Math.PI / 2 });
  group.add(runePlates(wall, atlas, h.uTime));

  // 陽台中央的圓陣，慢慢轉
  const circle = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), glowMaterial(circleTexture(), h.uTime));
  circle.geometry.setAttribute('aPhase', new THREE.BufferAttribute(new Float32Array(4).fill(0), 1));
  circle.rotation.x = -Math.PI / 2;
  circle.position.set(0, 0.012, Z(3.6));
  circle.renderOrder = 2;
  group.add(circle);

  const sphere = armillary(tw.x, tw.top + 1.5, tw.z, h.glowPoints);
  shell.add(sphere.root);

  const float = floaters([
    { kind: 'crystal', x: -4.4, y: 4.7, z: z0 - 0.7, color: '#7ae8d8' },
    { kind: 'crystal', x: 4.0, y: 5.1, z: z0 - 0.9, color: '#f08ac8' },
    { kind: 'stone', x: -2.1, y: 6.3, z: z0 - 0.9 },
    { kind: 'crystal', x: 2.3, y: 6.8, z: z0 - 0.6, color: '#b08af0' },
    { kind: 'stone', x: -1.2, y: 8.2, z: z0 + 1.2 },
    { kind: 'flask', x: -1.8, y: 3.3, z: Z(2.0), color: '#7af0a0' },
    { kind: 'crystal', x: 2.0, y: 3.5, z: Z(3.0), color: '#ffd060' },
    { kind: 'stone', x: 0.5, y: 3.7, z: Z(5.2) },
    { kind: 'flask', x: -4.9, y: 3.1, z: Z(6.4), color: '#ff7ab8' },
    { kind: 'crystal', x: 4.7, y: 3.2, z: Z(4.3), color: '#7ab0ff' },
    { kind: 'flask', x: 1.1, y: 3.0, z: Z(6.6), color: '#ffb050' },
  ], h.glowPoints);
  group.add(float.group);

  group.add(motes([
    { x: -3.3, y: 1.55, z: z0 - 0.1, w: 0.9, h: 1.0 },
    { x: 3.3, y: 1.55, z: z0 - 0.1, w: 0.9, h: 1.0 },
    { x: 0, y: 1.3, z: z0 - 0.1, w: 1.0, h: 1.4 },
    { x: 0, y: roseY, z: z0 - 0.1, w: 0.8, h: 0.8 },
    { x: tw.x, y: tw.top - 1.0, z: tw.z - 0.9, w: 0.3, h: 0.5 },
  ], h.uTime));

  return {
    update(t) {
      sphere.update(t);
      float.update(t);
      circle.rotation.z = t * 0.03;
    },
  };
}
