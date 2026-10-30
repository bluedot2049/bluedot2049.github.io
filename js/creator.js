// 捏角色的面板：在鏡子前打開。分成種族、臉、頭、衣服、配件、畫臉六頁，點了馬上套到角色身上。
// 衣服和配件底下再分小頁。海市攤販送的東西還沒拿到前是鎖著的，點了會說去哪一攤拿。
// 畫臉是 64 × 64 的格子，畫的途中直接更新角色臉上的貼圖，放開手才存起來、傳給別人。
import { RACES, OPTIONS, SLIDERS, SKINS, HAT_COLORS, HAIR_COLORS, CLOTH, GIFTS, TINTED_HATS, FACE, FACE_INK, raceOf, randomLook, presetLook, sanitizeLook, encodeFace, decodeFace, unlockedSet, isOpen, lockedBy, optionName } from './looks.js';
import { faceMap } from './character.js';

const TABS = [['race', '種族'], ['face', '臉'], ['head', '頭'], ['clothes', '衣服'], ['acc', '配件'], ['draw', '畫臉']];
const SUBS = {
  clothes: [['top', '上衣'], ['bottom', '下身'], ['outer', '外套'], ['shoes', '鞋子'], ['one', '連身'], ['closet', '衣櫃']],
  acc: [['neck', '脖子'], ['back', '背上'], ['hand', '左手']],
};
const CLOSET = 3;
function loadCloset() {
  try {
    const a = JSON.parse(localStorage.getItem('closet'));
    return Array.isArray(a) ? a.slice(0, CLOSET) : [];
  } catch {
    return [];
  }
}
// 這幾頁鏡頭湊近看臉，其他頁看全身
export const FACE_TABS = ['face', 'head', 'draw'];
const PAD = 256;           // 畫布像素，一格 4 像素
const UNDO = 30;
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const row = (title, inner) => `<div class="dress-row"><span>${title}</span>${inner}</div>`;

export class Creator {
  constructor(events) {
    this.events = events;   // { onChange(look), onTab(tab), onPaint(cells) }
    this.body = document.getElementById('dress-body');
    this.tabs = document.getElementById('dress-tabs');
    this.tab = 'race';
    this.sub = { clothes: 'top', acc: 'neck' };
    this.hint = null;
    this.unlocked = unlockedSet();
    this.ink = 1;
    this.brush = 1;
    this.sym = true;
    this.undo = [];
    this.tabs.innerHTML = TABS.map(([id, name]) => `<button data-tab="${id}">${name}</button>`).join('');
    this.tabs.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) this.show(b.dataset.tab);
    });
    document.getElementById('dress-dice').addEventListener('click', () => this.set(randomLook(this.look, this.unlocked), true));
    // 重來：回到一般的小學徒，衣服顏色和畫好的臉留著
    document.getElementById('dress-reset').addEventListener('click', () => {
      const L = presetLook(this.look.topC < 8 ? this.look.topC : 0);
      L.face = this.look.face;
      this.set(L, true);
    });
    this.body.addEventListener('click', (e) => this.onClick(e));
    this.body.addEventListener('input', (e) => {
      const el = e.target;
      if (el.type === 'range') this.set({ ...this.look, [el.dataset.k]: +el.value }, false);
    });
  }

  open(look) {
    this.unlocked = unlockedSet();   // 可能剛從海市回來
    this.hint = null;
    this.look = { ...look };
    this.cells = decodeFace(look.face) || new Uint8Array(FACE * FACE);
    this.undo = [];
    this.show(this.tab);
  }

  set(L, rerender) {
    this.look = L;
    if (rerender) {
      this.cells = decodeFace(L.face) || new Uint8Array(FACE * FACE);
      this.render();
    }
    this.events.onChange(L);
  }

  show(tab) {
    this.tab = tab;
    this.hint = null;
    this.tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    this.render();
    this.body.scrollTop = 0;
    this.events.onTab(tab);
  }

  render() {
    const L = this.look, race = raceOf(L);
    // 還沒拿到的選項畫成虛線框，點了只說要去哪裡拿
    const chips = (k, title, list = OPTIONS[k]) => row(title, `<div class="chips">${list.map(([id, name]) => isOpen(k, id, this.unlocked)
      ? `<button data-k="${k}" data-v="${id}" class="${L[k] === id ? 'on' : ''}">${name}</button>`
      : `<button class="locked" data-lock="${lockedBy(k, id)}" data-hk="${k}">${name}</button>`).join('')}</div>`
      + (this.hint?.k === k ? `<p class="dress-hint">${this.hint.text}</p>` : ''));
    const cloth = (k, title) => swatches(k, title, CLOTH);
    const swatches = (k, title, list, extra = '') => row(title, `<div class="swatches">${list.map((c, i) =>
      `<button data-k="${k}" data-n="${i}" class="${L[k] === i ? 'on' : ''}" style="background:${hex(c)}" aria-label="${title}第 ${i + 1} 色"></button>`).join('')}${extra}</div>`);
    const slider = (k) => {
      const [, name] = SLIDERS.find(([id]) => id === k);
      return row(name, `<input type="range" min="0" max="10" step="1" data-k="${k}" value="${L[k]}" aria-label="${name}">`);
    };
    const races = (odd) => RACES.filter((r) => !!r.odd === odd).map((r) => [r.id, r.name]);
    let html = '';
    switch (this.tab) {
      case 'race':
        html = chips('race', '人和動物', races(false)) + chips('race', '其他', races(true)) + swatches('skin', '膚色', SKINS)
          + slider('tall') + slider('fat');
        break;
      case 'face':
        if (L.face && !L.keep) html += `<p class="dress-note">畫了臉，原本的五官先收起來了<button data-act="keep">叫回來</button></p>`;
        html += chips('eyes', '眼睛') + slider('eyeSize') + slider('eyeGap') + slider('eyeOdd') + slider('faceY')
          + chips('brows', '眉毛') + chips('nose', '鼻子') + chips('mouth', '嘴巴') + chips('mark', '臉上') + chips('glasses', '眼鏡');
        break;
      case 'head':
        html = slider('head');
        if (race.hair) html += chips('hair', '頭髮') + swatches('hairC', '髮色', HAIR_COLORS);
        html += chips('hat', '帽子');
        if (TINTED_HATS.includes(L.hat)) html += swatches('hatC', '帽子顏色', HAT_COLORS);
        break;
      case 'clothes': case 'acc': {
        const sub = this.sub[this.tab];
        html = `<div class="chips subtabs">${SUBS[this.tab].map(([id, name]) => `<button data-sub="${id}" class="${sub === id ? 'on' : ''}">${name}</button>`).join('')}</div>`;
        const covered = L.one !== 'none' && ['top', 'bottom', 'outer'].includes(sub);
        if (covered) html += `<p class="dress-note">穿著${optionName('one', L.one)}，這一層先收起來了<button data-act="unone">脫掉</button></p>`;
        switch (sub) {
          case 'top': html += chips('top', '上衣') + cloth('topC', '顏色') + cloth('topC2', '第二個顏色') + chips('topPat', '花紋'); break;
          case 'bottom': html += chips('bottom', '下身') + cloth('botC', '顏色') + cloth('botC2', '第二個顏色') + chips('botPat', '花紋'); break;
          case 'outer': html += chips('outer', '外套') + (L.outer !== 'none' ? cloth('outC', '顏色') + cloth('outC2', '第二個顏色') : ''); break;
          case 'shoes': html += chips('shoes', '鞋子') + (L.shoes !== 'bare' ? cloth('shoeC', '顏色') : ''); break;
          case 'one': html += chips('one', '連身裝') + (L.one !== 'none' ? cloth('oneC', '顏色') + cloth('oneC2', '第二個顏色') : ''); break;
          case 'closet': html += this.closetHTML(); break;
          case 'neck': html += chips('neck', '脖子') + (L.neck !== 'none' ? cloth('neckC', '顏色') : ''); break;
          case 'back': html += chips('back', '背上') + (L.back !== 'none' ? cloth('backC', '顏色') : ''); break;
          case 'hand': html += chips('hand', '左手') + (L.hand !== 'none' ? cloth('handC', '顏色') : ''); break;
        }
        break;
      }
      case 'draw':
        html = `<div class="pad">
          <canvas id="pad" width="${PAD}" height="${PAD}" aria-label="畫臉"></canvas>
          <div class="pad-tools">
            <div class="inks">${FACE_INK.map((c, i) => i
              ? `<button data-ink="${i}" style="background:${c}" aria-label="第 ${i} 色"></button>`
              : '<button data-ink="0" class="eraser" aria-label="橡皮擦">擦</button>').join('')}</div>
            <div class="chips sizes">${['細', '中', '粗'].map((n, i) => `<button data-brush="${i}">${n}</button>`).join('')}</div>
            <div class="chips">
              <button data-act="sym">左右對稱</button>
              <button data-act="undo">復原</button>
              <button data-act="clear">清掉</button>
              <button data-act="keep">留著五官</button>
            </div>
          </div>
        </div>`;
        break;
    }
    const top = this.body.scrollTop;
    this.body.innerHTML = html;
    this.body.scrollTop = top;
    if (this.tab === 'draw') this.bindPad(race);
  }

  // 衣櫃：三格，存整個人的樣子，一鍵換回來
  closetHTML() {
    const slots = loadCloset();
    return '<p class="dress-note">把現在的樣子存起來，之後一鍵換回來</p>' + Array.from({ length: CLOSET }, (_, i) => {
      const s = slots[i] ? sanitizeLook(slots[i]) : null;
      const what = s ? `${raceOf(s).name}・${s.one !== 'none' ? optionName('one', s.one) : optionName('top', s.top) + '配' + optionName('bottom', s.bottom)}` : '空的';
      return `<div class="closet-slot"><span>第 ${i + 1} 套<small>${what}</small></span>
        <button data-act="wear" data-i="${i}" ${s ? '' : 'disabled'}>穿上</button><button data-act="store" data-i="${i}">存進來</button></div>`;
    }).join('');
  }

  onClick(e) {
    const b = e.target.closest('button');
    if (!b) return;
    const L = this.look, k = b.dataset.k;
    if (b.dataset.sub) {
      this.sub[this.tab] = b.dataset.sub;
      this.hint = null;
      this.render();
      return;
    }
    if (b.dataset.lock) {
      const g = GIFTS[b.dataset.lock];
      this.hint = { k: b.dataset.hk, text: `這個要去海市找${g.who}拿` };
      this.render();
      return;
    }
    if (k) {
      this.hint = null;
      const next = { ...L, [k]: b.dataset.v ?? +b.dataset.n };
      // 換種族時膚色跟著換成那個種族常見的顏色
      if (k === 'race') next.skin = raceOf(next).skin ?? L.skin;
      this.set(next, true);
      return;
    }
    if (b.dataset.ink) this.ink = +b.dataset.ink;
    else if (b.dataset.brush) this.brush = +b.dataset.brush;
    else switch (b.dataset.act) {
      case 'keep': this.set({ ...L, keep: L.keep ? 0 : 1 }, true); return;
      case 'unone': this.set({ ...L, one: 'none' }, true); return;
      case 'wear': {
        const s = loadCloset()[+b.dataset.i];
        if (s) this.set(sanitizeLook(s), true);
        return;
      }
      case 'store': {
        const slots = loadCloset();
        slots[+b.dataset.i] = L;
        try { localStorage.setItem('closet', JSON.stringify(slots)); } catch {}
        this.render();
        return;
      }
      case 'sym': this.sym = !this.sym; break;
      case 'undo':
        if (this.undo.length) {
          this.cells = this.undo.pop();
          this.refresh();
          this.commit();
        }
        break;
      case 'clear':
        this.snapshot();
        this.cells = new Uint8Array(FACE * FACE);
        this.refresh();
        this.commit();
        break;
    }
    this.markTools();
  }

  // ---------- 畫臉 ----------

  bindPad(race) {
    const cv = this.pad = document.getElementById('pad');
    this.guide = this.makeGuide(race);
    let last = null;
    const cell = (e) => {
      const r = cv.getBoundingClientRect();
      return [Math.floor(((e.clientX - r.left) / r.width) * FACE), Math.floor(((e.clientY - r.top) / r.height) * FACE)];
    };
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      this.snapshot();
      last = cell(e);
      this.stroke(last, last);
    });
    cv.addEventListener('pointermove', (e) => {
      if (!last) return;
      const p = cell(e);
      this.stroke(last, p);
      last = p;
    });
    const end = () => {
      if (!last) return;
      last = null;
      this.commit();
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    this.markTools();
    this.drawPad();
  }

  markTools() {
    if (this.tab !== 'draw') return;
    const q = (s) => this.body.querySelectorAll(s);
    q('[data-ink]').forEach((b) => b.classList.toggle('on', +b.dataset.ink === this.ink));
    q('[data-brush]').forEach((b) => b.classList.toggle('on', +b.dataset.brush === this.brush));
    q('[data-act="sym"]').forEach((b) => b.classList.toggle('on', this.sym));
    q('[data-act="keep"]').forEach((b) => b.classList.toggle('on', !!this.look.keep));
    q('[data-act="undo"]').forEach((b) => b.classList.toggle('off', !this.undo.length));
  }

  snapshot() {
    this.undo.push(this.cells.slice());
    if (this.undo.length > UNDO) this.undo.shift();
  }

  // 從 a 到 b 連成一條線，筆刷是圓的；開了左右對稱就同時畫在另一邊
  stroke(a, b) {
    const r = this.brush, c = this.cells, n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), 1);
    const dot = (x, y) => { if (x >= 0 && x < FACE && y >= 0 && y < FACE) c[y * FACE + x] = this.ink; };
    for (let s = 0; s <= n; s++) {
      const x = Math.round(a[0] + ((b[0] - a[0]) * s) / n), y = Math.round(a[1] + ((b[1] - a[1]) * s) / n);
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r + r) continue;
          dot(x + dx, y + dy);
          if (this.sym) dot(FACE - 1 - x - dx, y + dy);
        }
      }
    }
    this.refresh();
  }

  refresh() {
    this.drawPad();
    this.events.onPaint(this.cells);
    this.markTools();
  }

  commit() {
    this.look = { ...this.look, face: encodeFace(this.cells) };
    this.events.onChange(this.look);
  }

  // 底圖：這個種族的頭從正面看的樣子，越前面越亮，再標出眼睛原本的位置
  makeGuide(race) {
    const m = faceMap(race), N1 = m.N1;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < m.z.length; i++) if (m.hit[i]) { lo = Math.min(lo, m.z[i]); hi = Math.max(hi, m.z[i]); }
    const c = document.createElement('canvas');
    c.width = c.height = N1;
    const g = c.getContext('2d'), img = g.createImageData(N1, N1);
    for (let i = 0; i < m.z.length; i++) {
      if (!m.hit[i]) continue;
      const t = hi > lo ? (m.z[i] - lo) / (hi - lo) : 1;
      img.data.set([122 + 110 * t, 101 + 111 * t, 80 + 96 * t, 255], i * 4);
    }
    g.putImageData(img, 0, 0);
    const toPad = (x, y) => [((x + m.R) / (2 * m.R)) * PAD, ((m.cy + m.R - y) / (2 * m.R)) * PAD];
    return { img: c, eyes: [-1, 1].map((s) => toPad(s * race.ex, race.ey)) };
  }

  drawPad() {
    const g = this.pad.getContext('2d'), u = PAD / FACE;
    g.fillStyle = '#2a1e16';
    g.fillRect(0, 0, PAD, PAD);
    g.imageSmoothingEnabled = true;
    g.drawImage(this.guide.img, 0, 0, PAD, PAD);
    g.strokeStyle = 'rgba(42, 30, 22, .35)';
    g.lineWidth = 1.5;
    for (const [x, y] of this.guide.eyes) {
      g.beginPath();
      g.arc(x, y, 7, 0, Math.PI * 2);
      g.stroke();
    }
    for (let v = 1; v < FACE_INK.length; v++) {
      g.fillStyle = FACE_INK[v];
      for (let i = 0; i < this.cells.length; i++) if (this.cells[i] === v) g.fillRect((i % FACE) * u, Math.floor(i / FACE) * u, u, u);
    }
  }
}
