// 畫面上的 HTML 介面：作品資訊、換裝、房間名稱、平面清單。
import { ROBES, HATS, SCARVES } from './character.js';

const $ = (s) => document.querySelector(s);

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function priceText(p) {
  if (p.price == null || p.price === '') return '';
  return 'NT$ ' + Number(p.price).toLocaleString('zh-TW');
}

function metaLine(p) {
  const size = p.width && p.height ? `${p.width} × ${p.height} cm` : '';
  return [p.year, p.medium, size].filter(Boolean).map(esc).join('<span class="dot">·</span>');
}

// 依作品狀態決定按鈕：可購買 / 洽詢 / 已預訂 / 已售出
function actionHTML(p, contact) {
  if (p.status === 'sold') return '<span class="btn disabled">已售出</span>';
  if (p.status === 'reserved') return '<span class="btn disabled">已預訂</span>';
  if (p.buyUrl) return `<a class="btn primary" href="${esc(p.buyUrl)}" target="_blank" rel="noopener">購買</a>`;
  if (contact) return `<a class="btn primary" href="${esc(contact)}" target="_blank" rel="noopener">洽詢</a>`;
  return '';
}

export class UI {
  constructor(gallery) {
    this.gallery = gallery;
    this.sheet = $('#sheet');
    this.dress = $('#dress');
    this.toastEl = $('#toast');
    this.list = $('#list');
    this.onGoTo = null;
    this.onSheet = null;
    this.onClose = null;
    $('#sheet-close').addEventListener('click', () => { this.hidePainting(); this.onClose?.(); });
    $('#dress-close').addEventListener('click', () => { this.hideDress(); this.onClose?.(); });
    $('#sheet-thumb').addEventListener('click', () => this.openViewer($('#sheet-img').src));
    $('#viewer-close').addEventListener('click', () => this.closeViewer());
    this.bindViewer();
    $('#list-btn').addEventListener('click', () => this.toggleList(true));
    $('#list-close').addEventListener('click', () => this.toggleList(false));
  }

  showPainting(p, url) {
    const d = p.data || p;
    $('#sheet-img').src = url;
    $('#sheet-img').alt = d.title || '';
    $('#sheet-title').textContent = d.title || '';
    $('#sheet-meta').innerHTML = metaLine(d);
    $('#sheet-note').textContent = d.note || '';
    const price = d.status === 'sold' ? '' : priceText(d);
    $('#sheet-price').textContent = price;
    $('#sheet-action').innerHTML = actionHTML(d, this.gallery.contact);
    this.sheet.classList.add('open');
    this.onSheet?.(true);
  }

  hidePainting() {
    if (!this.sheetOpen) return;
    this.sheet.classList.remove('open');
    this.onSheet?.(false);
  }

  get sheetOpen() {
    return this.sheet.classList.contains('open');
  }

  // 目前打開的抽屜，主程式用它的高度挪畫面
  get panel() {
    return [this.sheet, this.dress].find((el) => el.classList.contains('open')) || null;
  }

  // 換裝：三排色塊，點了馬上換。onPick(部位, 色號)
  showDress(outfit, onPick) {
    const parts = [['長袍', ROBES], ['帽子', HATS], ['圍巾', SCARVES]];
    const hex = (c) => '#' + c.toString(16).padStart(6, '0');
    const rows = $('#dress-rows');
    rows.innerHTML = parts.map(([name, list], i) => `
      <div class="dress-row">
        <span>${name}</span>
        <div class="swatches">${list.map((c, k) => `<button data-part="${i}" data-k="${k}" class="${outfit[i] === k ? 'on' : ''}" style="background:${hex(c)}" aria-label="${name}第 ${k + 1} 色"></button>`).join('')}</div>
      </div>`).join('');
    rows.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      const part = +b.dataset.part;
      rows.querySelectorAll(`button[data-part="${part}"]`).forEach((x) => x.classList.toggle('on', x === b));
      onPick(part, +b.dataset.k);
    }));
    this.dress.classList.add('open');
    this.onSheet?.(true);
  }

  hideDress() {
    if (!this.dress.classList.contains('open')) return;
    this.dress.classList.remove('open');
    this.onSheet?.(false);
  }

  // 全螢幕看大圖：雙指縮放、拖曳移動、點兩下切換放大
  openViewer(src) {
    const img = $('#viewer-img');
    img.src = src;
    this.zoom = { s: 1, x: 0, y: 0 };
    this.applyZoom();
    $('#viewer').classList.add('open');
  }

  closeViewer() {
    $('#viewer').classList.remove('open');
  }

  applyZoom() {
    const z = this.zoom;
    $('#viewer-img').style.transform = `translate(${z.x}px, ${z.y}px) scale(${z.s})`;
  }

  bindViewer() {
    const v = $('#viewer'), pts = new Map();
    let pinch = null, lastTap = 0;
    v.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      v.setPointerCapture(e.pointerId);
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: this.zoom.s };
      } else if (performance.now() - lastTap < 300) {
        this.zoom = this.zoom.s > 1 ? { s: 1, x: 0, y: 0 } : { s: 2.5, x: 0, y: 0 };
        this.applyZoom();
      }
      lastTap = performance.now();
    });
    v.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (pinch && pts.size === 2) {
        const [a, b] = [...pts.values()];
        this.zoom.s = Math.min(6, Math.max(1, pinch.s * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d));
      } else if (this.zoom.s > 1) {
        this.zoom.x += dx;
        this.zoom.y += dy;
      }
      this.applyZoom();
    });
    const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
    v.addEventListener('pointerup', up);
    v.addEventListener('pointercancel', up);
    v.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom.s = Math.min(6, Math.max(1, this.zoom.s * (1 - e.deltaY * 0.002)));
      if (this.zoom.s === 1) { this.zoom.x = 0; this.zoom.y = 0; }
      this.applyZoom();
    }, { passive: false });
  }

  online(n) {
    const el = $('#online');
    el.hidden = false;
    el.textContent = `${n} 人在線`;
  }

  // 表情按鈕：點一下展開，選了就收起來
  bindEmotes(list, onPick) {
    const box = $('#emote'), bar = $('#emote-bar');
    bar.innerHTML = list.map((e) => `<button aria-label="${esc(e)}">${esc(e)}</button>`).join('');
    bar.querySelectorAll('button').forEach((b, i) => b.addEventListener('click', () => {
      box.classList.remove('open');
      onPick(list[i]);
    }));
    $('#emote-btn').addEventListener('click', () => box.classList.toggle('open'));
    box.hidden = false;
  }

  toast(title, sub) {
    const el = this.toastEl;
    el.innerHTML = `<div class="t1">${esc(title)}</div>${sub ? `<div class="t2">${esc(sub)}</div>` : ''}`;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  hint(text, ms = 5000) {
    const el = $('#hint');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => el.classList.remove('show'), ms);
  }

  hideHint() {
    $('#hint').classList.remove('show');
  }

  // 平面清單：舊手機或不想走動的人，直接看全部作品
  buildList(canWalk) {
    const body = $('#list-body');
    body.innerHTML = this.gallery.rooms.map((r, ri) => `
      <section>
        <h2>${esc(r.name)}${r.subtitle ? `<small>${esc(r.subtitle)}</small>` : ''}</h2>
        ${(r.paintings || []).map((p, pi) => `
          <article class="card">
            <img loading="lazy" src="rooms/${esc(r.id)}/${esc(p.thumb || p.image)}" alt="${esc(p.title)}">
            <div class="info">
              <h3>${esc(p.title)}</h3>
              <p class="meta">${metaLine(p)}</p>
              ${p.note ? `<p class="note">${esc(p.note)}</p>` : ''}
              <p class="price">${p.status === 'sold' ? '' : esc(priceText(p))}</p>
              <div class="actions">
                ${actionHTML(p, this.gallery.contact)}
                ${canWalk ? `<button class="btn" data-room="${ri}" data-p="${pi}">前往</button>` : ''}
              </div>
            </div>
          </article>`).join('')}
      </section>`).join('');
    body.querySelectorAll('button[data-room]').forEach((b) => {
      b.addEventListener('click', () => {
        this.toggleList(false);
        this.onGoTo?.(+b.dataset.room, +b.dataset.p);
      });
    });
  }

  toggleList(open) {
    this.list.classList.toggle('open', open);
  }

  loading(text) {
    const el = $('#loading');
    if (text == null) el.classList.add('done');
    else el.querySelector('.msg').textContent = text;
  }
}
