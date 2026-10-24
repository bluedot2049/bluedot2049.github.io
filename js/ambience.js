// 戶外的風聲和鳥叫，全部用 Web Audio 現場合成，不下載音檔。
// 瀏覽器規定要等使用者點過畫面才能出聲，所以第一次點擊或按鍵時才建立。
const GUST_EVERY = 1.6;   // 每隔幾秒換一次風勢

export class Ambience {
  constructor() {
    this.ctx = null;
    this.level = 0;          // 0 室內、1 戶外
    try { this.muted = localStorage.getItem('muted') === '1'; } catch { this.muted = false; }
    const unlock = () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      this.start();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', () => this.apply());
  }

  start() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || this.ctx) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    // 風：兩秒的粉紅雜訊循環播放，經過帶通濾波，濾波頻率和音量隨陣風起伏
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + w * 0.029591;
      b1 = 0.985 * b1 + w * 0.032534;
      b2 = 0.95 * b2 + w * 0.048056;
      d[i] = (b0 + b1 + b2 + w * 0.05) * 0.9;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 420;
    this.windFilter.Q.value = 0.7;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.5;
    src.connect(this.windFilter).connect(this.windGain).connect(this.master);
    src.start();

    this.gustTimer = setInterval(() => this.gust(), GUST_EVERY * 1000);
    this.scheduleBird();
    this.apply();
  }

  gust() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime, g = Math.random();
    this.windGain.gain.setTargetAtTime(0.25 + g * 0.55, t, GUST_EVERY / 2);
    this.windFilter.frequency.setTargetAtTime(300 + g * 500, t, GUST_EVERY / 2);
  }

  // 每隔幾秒，隨機一個方向傳來一串鳥叫
  scheduleBird() {
    this.birdTimer = setTimeout(() => {
      if (this.ctx?.state === 'running' && this.level > 0.5) this.bird();
      this.scheduleBird();
    }, 2500 + Math.random() * 6000);
  }

  bird() {
    const ctx = this.ctx, t0 = ctx.currentTime;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const out = ctx.createGain();
    out.gain.value = 0.05 + Math.random() * 0.05;
    if (pan) { pan.pan.value = Math.random() * 1.6 - 0.8; out.connect(pan).connect(this.master); } else out.connect(this.master);
    const base = 2600 + Math.random() * 1600, notes = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < notes; i++) {
      const t = t0 + i * (0.11 + Math.random() * 0.05), dur = 0.06 + Math.random() * 0.05;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(base * (0.9 + Math.random() * 0.2), t);
      o.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.4), t + dur);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(1, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + dur + 0.02);
    }
  }

  // 室內外的比例。有變化才更新，室內完全安靜時暫停音訊省電
  setLevel(v) {
    if (v === this.level || (Math.abs(v - this.level) < 0.01 && v > 0 && v < 1)) return;
    this.level = v;
    this.apply();
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('muted', m ? '1' : '0'); } catch {}
    if (!m) this.start();
    this.apply();
  }

  apply() {
    const ctx = this.ctx;
    if (!ctx) return;
    const v = this.muted || document.hidden ? 0 : this.level * 0.6;
    if (v > 0 && ctx.state === 'suspended') ctx.resume();
    this.master.gain.setTargetAtTime(v, ctx.currentTime, 0.4);
    clearTimeout(this.sleepTimer);
    if (v === 0) this.sleepTimer = setTimeout(() => { if (ctx.state === 'running') ctx.suspend(); }, 1500);
  }
}
