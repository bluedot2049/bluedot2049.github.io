// 紙燈籠：Claude 在畫廊裡的樣子。米白的紙身，裡面透一點暖光，臉只有兩個墨點。
// 浮在地上一點點，不走路。說話的時候，身上兩側會一個字一個字寫出來，說完慢慢淡掉。
// 面向本地 +z。紙身是一個網格，墨（眼睛和字）畫在外面薄薄一層，只有在變的時候才重畫。
import * as THREE from 'three';
import { drawGlyph } from './glyphs.js';

const H = 0.56;             // 紙身高
const R = 0.25;             // 紙身最胖的半徑
const MOUTH = 0.085;        // 上下開口的半徑，蓋子蓋在這裡
const FLOAT = 0.42;         // 紙身底部離地多高
const SEG = 16;             // 一圈幾摺
const INK = '#1d1915', PAPER = '#efe7d3', SEAL = '#b4432f';
const TW = 1024, TH = 384;  // 墨那一層的貼圖：橫的繞一圈，直的由上到下

const CHAR = 40;                            // 字的大小（貼圖上的像素）
const ROWS = 6;                             // 一行寫幾個字
const COLS = [0.33, 0.67, 0.22, 0.78];      // 字寫在哪幾行（繞一圈的位置，0.5 是正面）
const CHAR_GAP = 0.16;                      // 每隔幾秒寫一個字
const HOLD = 2.6;                           // 寫完停多久才開始淡

// 紙身的外形：上下收口，中間鼓起來
function profile() {
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    pts.push(new THREE.Vector2(MOUTH + (R - MOUTH) * Math.sin(Math.PI * t) ** 0.7, t * H));
  }
  return pts;
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

// 紙：底色、一點纖維、橫的竹骨。另外一張是透光的亮度，中間亮、靠近竹骨暗
function paperTextures() {
  const [c, g] = canvas(512, 256);
  g.fillStyle = PAPER;
  g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(120,100,70,${0.03 + Math.random() * 0.05})`;
    g.fillRect(Math.random() * 512, Math.random() * 256, 1 + Math.random() * 6, 1);
  }
  const [e, eg] = canvas(512, 256);
  const grad = eg.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#000');
  grad.addColorStop(0.5, '#fff');
  grad.addColorStop(1, '#000');
  eg.fillStyle = grad;
  eg.fillRect(0, 0, 512, 256);
  for (let i = 1; i < 9; i++) {
    const y = (i / 9) * 256;
    g.fillStyle = 'rgba(110,90,60,0.35)';
    g.fillRect(0, y - 1, 512, 2);
    eg.fillStyle = 'rgba(0,0,0,0.55)';
    eg.fillRect(0, y - 2, 512, 4);
  }
  return [new THREE.CanvasTexture(c), new THREE.CanvasTexture(e)].map((t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

// 一個墨點：圓頭，往右下帶一點筆尾
function dot(g, x, y, r) {
  g.beginPath();
  g.ellipse(x, y, r * 0.85, r, -0.2, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(x - r * 0.3, y + r * 0.6);
  g.quadraticCurveTo(x + r * 0.4, y + r * 1.3, x + r * 0.5, y + r * 1.5);
  g.quadraticCurveTo(x + r * 0.6, y + r * 0.8, x + r * 0.6, y + r * 0.2);
  g.fill();
}

export class Lantern {
  constructor(shadowTex = null) {
    this.group = new THREE.Group();
    this.body = new THREE.Group();
    this.body.position.y = FLOAT;
    this.group.add(this.body);

    const geo = new THREE.LatheGeometry(profile(), SEG, Math.PI);   // 從背後開始繞，接縫在背面
    const [paper, light] = paperTextures();
    this.paperMat = new THREE.MeshLambertMaterial({
      map: paper, emissive: 0xffa64d, emissiveMap: light, emissiveIntensity: 0.55, flatShading: true,
    });
    this.body.add(new THREE.Mesh(geo, this.paperMat));

    // 墨那一層：比紙大一點點，眼睛和字畫在這裡
    [this.ink, this.inkG] = canvas(TW, TH);
    this.inkTex = new THREE.CanvasTexture(this.ink);
    this.inkTex.colorSpace = THREE.SRGBColorSpace;
    const inkMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: this.inkTex, transparent: true, depthWrite: false }));
    inkMesh.scale.setScalar(1.006);
    inkMesh.renderOrder = 1;
    this.body.add(inkMesh);

    // 上下的木蓋、頂上的小環、底下一束朱紅的穗
    const wood = new THREE.MeshLambertMaterial({ color: 0x2b2420, flatShading: true });
    for (const [y, r0, r1] of [[0, MOUTH + 0.012, MOUTH + 0.02], [H, MOUTH + 0.02, MOUTH + 0.012]]) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, 0.035, SEG), wood);
      cap.position.y = y;
      this.body.add(cap);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.008, 5, 12), wood);
    ring.position.y = H + 0.05;
    this.body.add(ring);
    this.tassel = new THREE.Group();
    this.tassel.position.y = -0.018;
    const red = new THREE.MeshLambertMaterial({ color: SEAL, flatShading: true });
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), red);
    knot.position.y = -0.03;
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.05, 4), red);
    cord.position.y = -0.005;
    const fringe = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.09, 6), red);
    fringe.position.y = -0.085;
    fringe.rotation.x = Math.PI;
    this.tassel.add(cord, knot, fringe);
    this.body.add(this.tassel);

    if (shadowTex) {
      this.shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(0.62, 0.62),
        new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.55 })
      );
      this.shadow.rotation.x = -Math.PI / 2;
      this.shadow.position.y = 0.012;
      this.group.add(this.shadow);
    }

    this.t = Math.random() * 10;
    this.blinkAt = 2 + Math.random() * 3;
    this.blink = 0;           // 大於 0 是正在眨眼
    this.chars = [];          // 正在寫的字
    this.writeT = 0;          // 從開始寫到現在幾秒
    this.fadeT = 0;           // 寫完以後過了幾秒
    this.glow = 0;            // 說話時亮一點
    this.dirty = true;
    this.lastDraw = 0;
  }

  // 說一句話：字一個一個寫在身上，太長的只寫前面
  say(text) {
    this.chars = [...text].filter((c) => /[\p{L}\p{N}]/u.test(c)).slice(0, ROWS * COLS.length);
    this.writeT = 0;
    this.fadeT = 0;
    this.dirty = true;
  }

  get speaking() {
    return this.chars.length > 0 && this.fadeT < HOLD;
  }

  draw() {
    const g = this.inkG;
    g.clearRect(0, 0, TW, TH);
    g.fillStyle = INK;

    // 眼睛：正面中間偏上。眨眼時變成一條短短的橫筆
    const ey = TH * 0.42, ex = TW * 0.047, r = 15;
    for (const s of [-1, 1]) {
      const x = TW * 0.5 + s * ex;
      if (this.blink > 0) {
        g.beginPath();
        g.ellipse(x, ey + 4, r * 1.1, 3.5, 0, 0, Math.PI * 2);
        g.fill();
      } else dot(g, x, ey, r);
    }

    // 字：直著寫，先寫正面兩側，再往後繞
    const fade = this.fadeT > HOLD ? Math.max(0, 1 - (this.fadeT - HOLD) / 1.4) : 1;
    const top = TH * 0.17, step = (TH * 0.7) / ROWS;
    this.chars.forEach((ch, i) => {
      const a = Math.min(1, (this.writeT - i * CHAR_GAP) / 0.25) * fade;
      if (a <= 0) return;
      g.globalAlpha = a * 0.9;
      drawGlyph(g, ch, COLS[Math.floor(i / ROWS)] * TW, top + (i % ROWS + 0.5) * step, CHAR, INK, { brush: 0.7 });
    });
    g.globalAlpha = 1;
    this.inkTex.needsUpdate = true;
  }

  update(dt) {
    this.t += dt;
    const t = this.t;

    // 慢慢浮上浮下，輕輕晃；穗晚一點跟著擺
    this.body.position.y = FLOAT + Math.sin(t * 1.3) * 0.03;
    this.body.rotation.z = Math.sin(t * 0.9) * 0.04;
    this.body.rotation.x = Math.sin(t * 0.7 + 1) * 0.03;
    this.tassel.rotation.z = -Math.sin(t * 0.9 - 0.6) * 0.18;
    this.tassel.rotation.x = -Math.sin(t * 0.7 + 0.4) * 0.12;
    if (this.shadow) this.shadow.scale.setScalar(1 - Math.sin(t * 1.3) * 0.06);

    this.blinkAt -= dt;
    if (this.blinkAt <= 0) {
      this.blink = 0.13;
      this.blinkAt = 2.5 + Math.random() * 4;
      this.dirty = true;
    }
    if (this.blink > 0) {
      this.blink -= dt;
      if (this.blink <= 0) this.dirty = true;
    }

    if (this.chars.length) {
      this.writeT += dt;
      if (this.writeT > this.chars.length * CHAR_GAP + 0.25) this.fadeT += dt;
      if (this.fadeT > HOLD + 1.4) this.chars = [];
      this.dirty = true;
    }

    // 說話時燈亮一點，像在呼吸
    this.glow += ((this.speaking ? 1 : 0) - this.glow) * Math.min(1, dt * 3);
    this.paperMat.emissiveIntensity = 0.55 + this.glow * (0.25 + Math.sin(t * 5) * 0.08);

    // 墨一秒最多重畫二十次
    if (this.dirty && t - this.lastDraw > 0.05) {
      this.draw();
      this.dirty = false;
      this.lastDraw = t;
    }
  }
}
