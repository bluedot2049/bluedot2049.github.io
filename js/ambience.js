// 戶外的風聲、草葉沙沙聲、遠處的海浪和鳥叫，還有動物的叫聲，全部用 Web Audio 現場合成，不下載音檔。
// 瀏覽器規定要等使用者點過畫面才能出聲，所以第一次點擊或按鍵時才建立。
// 低頻壓掉、音量放輕、起伏放慢，聽起來是貼耳的空氣聲而不是轟轟的風
const GUST_EVERY = 4;   // 每隔幾秒換一次風勢

// ---------- 動物叫聲 ----------
// 每個叫聲排好振盪器、濾波器、音量包絡後回傳長度（秒）。p 是音高倍率，同種動物各叫各的高低

function envelope(ctx, t, attack, dur, peak = 1) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.setValueAtTime(peak, t + Math.max(attack, dur * 0.6));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  return g;
}

// pts：[[離開始幾秒, 頻率], ...]，頻率在兩點之間直線滑過去
function osc(ctx, type, t, dur, pts) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(pts[0][1], t);
  for (const [dt, f] of pts.slice(1)) o.frequency.linearRampToValueAtTime(f, t + dt);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}

function biquad(ctx, type, freq, Q = 1) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = Q;
  return f;
}

function lfo(ctx, t, dur, rate, depth, param) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.value = rate;
  g.gain.value = depth;
  o.connect(g).connect(param);
  o.start(t);
  o.stop(t + dur + 0.05);
}

const VOICES = {
  // 哞——：低沉的鋸齒波，共振峰從閉著嘴的「m」慢慢打開成「o」
  moo(ctx, out, t, p) {
    const d = 1.3 + Math.random() * 0.5;
    const o = osc(ctx, 'sawtooth', t, d, [[0, 92 * p], [0.3, 128 * p], [d * 0.7, 116 * p], [d, 78 * p]]);
    lfo(ctx, t, d, 5.5, 3 * p, o.frequency);
    const bp = biquad(ctx, 'bandpass', 320, 2.2);
    bp.frequency.setValueAtTime(320, t);
    bp.frequency.linearRampToValueAtTime(820, t + 0.35);
    bp.frequency.linearRampToValueAtTime(480, t + d);
    o.connect(bp).connect(envelope(ctx, t, 0.18, d, 1.6)).connect(out);
    return d;
  },
  // 咯咯咯，偶爾最後拉一聲高的
  cluck(ctx, out, t, p) {
    const n = 2 + Math.floor(Math.random() * 3);
    let tt = t;
    for (let i = 0; i < n; i++) {
      const long = i === n - 1 && Math.random() < 0.5, d = long ? 0.22 : 0.07;
      const o = osc(ctx, 'square', tt, d, [[0, (long ? 520 : 430) * p], [d, (long ? 760 : 300) * p]]);
      o.connect(biquad(ctx, 'bandpass', 1100 * p, 2.5)).connect(envelope(ctx, tt, 0.006, d)).connect(out);
      tt += d + 0.07 + Math.random() * 0.06;
    }
    return tt - t;
  },
  // 呱：鼻音很重的鋸齒波
  quack(ctx, out, t, p) {
    const n = 1 + Math.floor(Math.random() * 3);
    let tt = t;
    for (let i = 0; i < n; i++) {
      const d = 0.13 + Math.random() * 0.05;
      const o = osc(ctx, 'sawtooth', tt, d, [[0, 250 * p], [d * 0.3, 270 * p], [d, 185 * p]]);
      o.connect(biquad(ctx, 'bandpass', 1250, 4)).connect(envelope(ctx, tt, 0.01, d, 2)).connect(out);
      tt += d + 0.09;
    }
    return tt - t;
  },
  // 小鴨啾啾
  peep(ctx, out, t, p) {
    const n = 2 + Math.floor(Math.random() * 2);
    let tt = t;
    for (let i = 0; i < n; i++) {
      const d = 0.07;
      osc(ctx, 'sine', tt, d, [[0, 4200 * p], [d, 3300 * p]]).connect(envelope(ctx, tt, 0.01, d)).connect(out);
      tt += d + 0.08;
    }
    return tt - t;
  },
  // 汪：短促的鋸齒波加一點氣音
  bark(ctx, out, t, p, noise) {
    const n = Math.random() < 0.6 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const tt = t + i * 0.22, d = 0.14;
      osc(ctx, 'sawtooth', tt, d, [[0, 380 * p], [0.04, 420 * p], [d, 210 * p]])
        .connect(biquad(ctx, 'lowpass', 1600)).connect(envelope(ctx, tt, 0.005, d, 1.4)).connect(out);
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.connect(biquad(ctx, 'bandpass', 900)).connect(envelope(ctx, tt, 0.003, 0.08, 1.2)).connect(out);
      src.start(tt, Math.random() * 7);
      src.stop(tt + 0.1);
    }
    return n * 0.22;
  },
  // 喵——：音高先揚後抑，共振峰從「咪」張開成「嗷」
  meow(ctx, out, t, p) {
    const d = 0.55 + Math.random() * 0.25;
    const o = osc(ctx, 'sawtooth', t, d, [[0, 480 * p], [d * 0.3, 760 * p], [d, 540 * p]]);
    const bp = biquad(ctx, 'bandpass', 900, 3);
    bp.frequency.setValueAtTime(900, t);
    bp.frequency.linearRampToValueAtTime(2300, t + d * 0.3);
    bp.frequency.linearRampToValueAtTime(1100, t + d);
    o.connect(bp).connect(envelope(ctx, t, 0.06, d, 1.6)).connect(out);
    return d;
  },
  // 呼嚕：低頻雜訊一秒抖二十幾下
  purr(ctx, out, t, p, noise) {
    const d = 2.6, am = ctx.createGain();
    am.gain.value = 0.5;
    lfo(ctx, t, d, 23, 0.5, am.gain);
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    src.connect(biquad(ctx, 'lowpass', 260)).connect(am);
    osc(ctx, 'sawtooth', t, d, [[0, 46 * p]]).connect(biquad(ctx, 'lowpass', 180)).connect(am);
    am.connect(envelope(ctx, t, 0.3, d, 2.5)).connect(out);
    src.start(t, Math.random() * 5);
    src.stop(t + d + 0.05);
    return d;
  },
};

export class Ambience {
  constructor() {
    this.ctx = null;
    this.level = 0;          // 0 室內、1 戶外
    this.voiceUntil = 0;     // 動物叫聲播到什麼時候（performance.now），播完才能暫停音訊
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
    // 動物叫聲另走一條，不跟著室內外的比例變小，室內的貓叫也聽得到
    this.sfx = ctx.createGain();
    this.sfx.connect(ctx.destination);

    // 八秒的立體聲粉紅雜訊，左右聲道各自生成，聽起來有寬度；夠長就聽不出循環
    const len = ctx.sampleRate * 8, buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.997 * b0 + w * 0.029591;
        b1 = 0.985 * b1 + w * 0.032534;
        b2 = 0.95 * b2 + w * 0.048056;
        d[i] = (b0 + b1 + b2 + w * 0.05) * 0.9;
      }
    }
    this.noise = buf;
    // 每個聲音從雜訊的不同位置開始播，彼此不會同步
    const noise = (offset, ...nodes) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      let n = src;
      for (const x of nodes) n = n.connect(x);
      n.connect(this.master);
      src.start(0, offset);
    };
    const filter = (type, freq, Q = 0.7) => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = Q;
      return f;
    };
    const gain = (v) => { const g = ctx.createGain(); g.gain.value = v; return g; };

    // 風：兩級高通把 450Hz 以下整個切乾淨（單級切不乾淨，會留下轟聲），只留柔和的氣流，低通跟著風勢開合
    this.windFilter = filter('lowpass', 2000, 0.5);
    this.windGain = gain(0.18);
    noise(0, filter('highpass', 450), filter('highpass', 450), this.windFilter, this.windGain);
    // 草葉：很輕的高頻沙沙聲，風大一點時跟著冒出來
    this.leafGain = gain(0.02);
    noise(2.7, filter('bandpass', 4200, 0.9), this.leafGain);
    // 海浪：慢慢湧上來再退下去，濾波器跟著打開、關上
    // 一樣切掉低頻，浪聲是「唰——」的水聲，不是低沉的轟隆
    this.waveFilter = filter('lowpass', 700, 0.4);
    this.waveGain = gain(0);
    noise(5.3, filter('highpass', 380), filter('highpass', 380), this.waveFilter, this.waveGain);

    // 鳥叫走一段短短的回聲，像在空曠的地方
    this.birdBus = gain(1);
    const echo = ctx.createDelay(1), fb = gain(0.28), wet = filter('lowpass', 2800);
    echo.delayTime.value = 0.19;
    this.birdBus.connect(filter('lowpass', 6500)).connect(this.master);
    this.birdBus.connect(echo).connect(wet).connect(fb).connect(echo);
    wet.connect(gain(0.6)).connect(this.master);

    this.gustTimer = setInterval(() => this.gust(), GUST_EVERY * 1000);
    this.scheduleWave();
    this.scheduleBird();
    this.apply();
  }

  gust() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime, g = Math.random(), tc = GUST_EVERY * 0.7;
    this.windGain.gain.setTargetAtTime(0.1 + g * 0.16, t, tc);
    this.windFilter.frequency.setTargetAtTime(1500 + g * 1500, t, tc);
    this.leafGain.gain.setTargetAtTime(0.01 + g * g * 0.035, t, tc);
  }

  // 一道浪：三秒湧上、四五秒退下，間隔七到十一秒
  scheduleWave() {
    this.waveTimer = setTimeout(() => {
      if (this.ctx?.state === 'running' && this.level > 0.5) this.wave();
      this.scheduleWave();
    }, 7000 + Math.random() * 4000);
  }

  wave() {
    const t = this.ctx.currentTime, peak = 0.045 + Math.random() * 0.03, up = 2.5 + Math.random();
    const g = this.waveGain.gain, f = this.waveFilter.frequency;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(peak, t + up);
    g.setTargetAtTime(0.006, t + up, 1.6);
    f.cancelScheduledValues(t);
    f.setValueAtTime(f.value, t);
    f.linearRampToValueAtTime(1500 + Math.random() * 500, t + up);
    f.setTargetAtTime(700, t + up, 1.8);
  }

  // 每隔幾秒，隨機一個方向傳來一串鳥叫
  scheduleBird() {
    this.birdTimer = setTimeout(() => {
      if (this.ctx?.state === 'running' && this.level > 0.5) this.bird();
      this.scheduleBird();
    }, 4000 + Math.random() * 8000);
  }

  bird() {
    const ctx = this.ctx, t0 = ctx.currentTime;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const out = ctx.createGain();
    out.gain.value = 0.02 + Math.random() * 0.03;
    if (pan) { pan.pan.value = Math.random() * 1.6 - 0.8; out.connect(pan).connect(this.birdBus); } else out.connect(this.birdBus);
    const base = 2600 + Math.random() * 1600, notes = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < notes; i++) {
      const t = t0 + i * (0.11 + Math.random() * 0.05), dur = 0.06 + Math.random() * 0.05;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(base * (0.9 + Math.random() * 0.2), t);
      o.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.4), t + dur);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(1, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + dur + 0.02);
    }
  }

  // 動物叫聲：vol 已經照距離算好，pan 是左右
  voice(kind, vol, pan = 0, pitch = 1) {
    const ctx = this.ctx;
    if (!ctx || this.muted || document.hidden || !VOICES[kind] || vol < 0.002) return;
    if (ctx.state === 'suspended') ctx.resume();
    const out = ctx.createGain();
    out.gain.value = vol;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      out.connect(p).connect(this.sfx);
    } else out.connect(this.sfx);
    const dur = VOICES[kind](ctx, out, ctx.currentTime + 0.03, pitch, this.noise);
    this.voiceUntil = Math.max(this.voiceUntil, performance.now() + dur * 1000 + 300);
    if (this.quiet) this.sleepSoon();
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
    const off = this.muted || document.hidden, v = off ? 0 : this.level * 0.7;
    if (v > 0 && ctx.state === 'suspended') ctx.resume();
    this.master.gain.setTargetAtTime(v, ctx.currentTime, 0.4);
    this.sfx.gain.setTargetAtTime(off ? 0 : 1, ctx.currentTime, 0.05);
    this.quiet = v === 0;
    clearTimeout(this.sleepTimer);
    if (this.quiet) this.sleepSoon();
  }

  // 環境聲是零的時候，等叫聲播完再暫停
  sleepSoon() {
    clearTimeout(this.sleepTimer);
    const ctx = this.ctx;
    this.sleepTimer = setTimeout(() => {
      if (!this.quiet || ctx.state !== 'running') return;
      if (performance.now() < this.voiceUntil) this.sleepSoon();
      else ctx.suspend();
    }, Math.max(1500, this.voiceUntil - performance.now()));
  }
}
