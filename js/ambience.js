// 戶外的風聲、草葉沙沙聲和鳥叫，還有動物的叫聲，全部用 Web Audio 現場合成，不下載音檔。
// 瀏覽器規定要等使用者點過畫面才能出聲，所以第一次點擊或按鍵時才建立。
// 低頻壓掉、音量放輕、起伏放慢，聽起來是貼耳的空氣聲而不是轟轟的風
const GUST_EVERY = 4;   // 每隔幾秒換一次風勢

// 背景音樂是唯一要下載的音檔，每個區域一首
const BGM_VOL = 0.16;      // 室內的音量，當背景就好
const BGM_OUTDOOR = 0.5;   // 到戶外剩幾成，讓風聲鳥叫出來
const BGM_FADE = 6;        // 開始播和切回分頁時淡入幾秒

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
  // 呼、呼——：貓頭鷹低低的兩聲，第二聲長一點、尾巴往下掉
  hoot(ctx, out, t, p) {
    let tt = t;
    for (const d of [0.22, 0.6]) {
      const o = osc(ctx, 'sine', tt, d, [[0, 360 * p], [d * 0.3, 390 * p], [d, 330 * p]]);
      lfo(ctx, tt, d, 7, 6 * p, o.frequency);
      o.connect(biquad(ctx, 'lowpass', 900)).connect(envelope(ctx, tt, 0.05, d, 1.4)).connect(out);
      tt += d + 0.16;
    }
    return tt - t;
  },
  // 土撥鼠平常細細地吱一兩聲
  chirp(ctx, out, t, p) {
    const n = 1 + (Math.random() < 0.5);
    let tt = t;
    for (let i = 0; i < n; i++) {
      const d = 0.06;
      osc(ctx, 'sine', tt, d, [[0, 1900 * p], [d, 2500 * p]]).connect(envelope(ctx, tt, 0.008, d)).connect(out);
      tt += d + 0.1;
    }
    return tt - t;
  },
  // 土撥鼠示警：又尖又短的哨音，一口氣兩三聲
  whistle(ctx, out, t, p) {
    const n = 2 + (Math.random() < 0.5);
    let tt = t;
    for (let i = 0; i < n; i++) {
      const d = 0.13;
      osc(ctx, 'sine', tt, d, [[0, 3000 * p], [0.03, 3200 * p], [d, 2300 * p]]).connect(envelope(ctx, tt, 0.006, d, 1.2)).connect(out);
      tt += d + 0.14;
    }
    return tt - t;
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

// 0.1 秒的無聲 WAV（8kHz、8 位元、單聲道）。長度不能是零，Safari 會當成壞檔不播
function silentWav() {
  const n = 800, v = new DataView(new ArrayBuffer(44 + n));
  const tag = (o, s) => { for (let i = 0; i < 4; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  tag(0, 'RIFF'); v.setUint32(4, 36 + n, true); tag(8, 'WAVE');
  tag(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  tag(36, 'data'); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
  return URL.createObjectURL(new Blob([v], { type: 'audio/wav' }));
}

export class Ambience {
  constructor() {
    this.ctx = null;
    this.level = 0;          // 0 室內、1 戶外
    this.voiceUntil = 0;     // 動物叫聲播到什麼時候（performance.now），播完才能暫停音訊
    this.hold = false;       // 錄影中不暫停音訊
    this.bgmSrc = null;      // 背景音樂的網址，還沒點過畫面就先記著
    this.bgm = null;
    try { this.muted = localStorage.getItem('muted') === '1'; } catch { this.muted = false; }
    // 手機要在 touchend / click 這類「放開」的手勢裡才算使用者操作（iOS 的 pointerdown 不算），所以全部都聽。
    // 一直留著不拿掉：iOS 切到別的 App 回來會變成 interrupted，Safari 也不一定讓手勢以外的 resume() 生效，
    // 都要等下一次點畫面才救得回來
    const events = ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click', 'keydown'];
    const unlock = () => {
      this.start();
      const ctx = this.ctx;
      if (!ctx) return;
      // 靜音鍵開著時 iOS 會擋 Web Audio，播一段無聲的 <audio> 把音訊切到媒體通道
      try {
        if (!this.keepAlive) {
          const a = document.createElement('audio');
          a.setAttribute('playsinline', '');
          a.loop = true;
          a.src = silentWav();
          this.keepAlive = a;
        }
        if (this.keepAlive.paused) this.keepAlive.play().catch(() => {});
      } catch {}
      // iOS 只讓手勢裡的 play() 生效，背景音樂沒播起來就趁這次再試
      if (this.bgm?.paused && !this.muted && !document.hidden) this.apply();
      if (ctx.state === 'running') return;
      // 室內安靜時是故意暫停的，不用叫醒
      if (this.quiet && performance.now() > this.voiceUntil) return;
      ctx.resume().catch(() => {});
      // 播一個無聲的 buffer，部分舊版 iOS 要這樣才會解鎖
      try {
        const s = ctx.createBufferSource();
        s.buffer = ctx.createBuffer(1, 1, 22050);
        s.connect(ctx.destination);
        s.start(0);
      } catch {}
    };
    for (const e of events) window.addEventListener(e, unlock, true);
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
    this.windFilter = filter('lowpass', 1200, 0.5);
    this.windGain = gain(0.08);
    noise(0, filter('highpass', 450), filter('highpass', 450), this.windFilter, this.windGain);
    // 草葉：很輕的高頻沙沙聲，風大一點時跟著冒出來
    this.leafGain = gain(0.01);
    noise(2.7, filter('bandpass', 4200, 0.9), this.leafGain);

    // 鳥叫走一段短短的回聲，像在空曠的地方
    this.birdBus = gain(1);
    const echo = ctx.createDelay(1), fb = gain(0.28), wet = filter('lowpass', 2800);
    echo.delayTime.value = 0.19;
    this.birdBus.connect(filter('lowpass', 6500)).connect(this.master);
    this.birdBus.connect(echo).connect(wet).connect(fb).connect(echo);
    wet.connect(gain(0.6)).connect(this.master);

    this.gustTimer = setInterval(() => this.gust(), GUST_EVERY * 1000);
    this.scheduleBird();
    if (this.bgmSrc) this.startMusic();
    this.apply();
  }

  // 背景音樂從這裡開始放，之後一直放到離開這個區域
  music(src) {
    if (this.bgmSrc) return;
    this.bgmSrc = src;
    if (this.ctx) {
      this.startMusic();
      this.apply();
    }
  }

  // 用 <audio> 邊下載邊播，再接進 AudioContext 調音量（iOS 不理 audio.volume）。
  // 不用 decodeAudioData：四分鐘的立體聲整首解開要將近 100 MB 記憶體，手機撐不住。
  // 走 sfx 那條：靜音和錄影都跟著動物叫聲一起處理
  startMusic() {
    if (this.bgm || navigator.connection?.saveData) return;   // 手機開了省流量就不抓
    const ctx = this.ctx, a = document.createElement('audio');
    a.loop = true;
    a.setAttribute('playsinline', '');
    a.src = this.bgmSrc;
    this.bgm = a;
    this.bgmGain = ctx.createGain();
    this.bgmGain.gain.value = 0;
    ctx.createMediaElementSource(a).connect(this.bgmGain).connect(this.sfx);
  }

  gust() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime, g = Math.random(), tc = GUST_EVERY * 0.7;
    this.windGain.gain.setTargetAtTime(0.04 + g * 0.08, t, tc);
    this.windFilter.frequency.setTargetAtTime(1000 + g * 1000, t, tc);
    this.leafGain.gain.setTargetAtTime(0.01 + g * g * 0.015, t, tc);
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
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
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
    const live = v > 0 || (this.bgm && !off);
    if (live && ctx.state !== 'running') ctx.resume().catch(() => {});
    const t = ctx.currentTime;
    this.master.gain.setTargetAtTime(v, t, 0.4);
    this.sfx.gain.setTargetAtTime(off ? 0 : 1, t, 0.05);
    if (this.bgm) {
      const a = this.bgm, g = this.bgmGain.gain;
      if (off) {
        // 靜音或切到別的分頁就停下來，不再下載
        a.pause();
        g.cancelScheduledValues(t);
        g.setValueAtTime(0, t);
      } else {
        if (a.paused) {
          a.play().catch(() => {});
          this.bgmFadeUntil = t + BGM_FADE;
        }
        // 淡入中途走到戶外也照原本的速度淡，不會突然跳大聲
        const vol = BGM_VOL * (1 - this.level * (1 - BGM_OUTDOOR));
        g.setTargetAtTime(vol, t, t < this.bgmFadeUntil ? BGM_FADE / 3 : 0.8);
      }
    }
    this.quiet = !live;
    clearTimeout(this.sleepTimer);
    if (this.quiet) this.sleepSoon();
  }

  // 環境聲是零的時候，等叫聲播完再暫停
  sleepSoon() {
    clearTimeout(this.sleepTimer);
    const ctx = this.ctx;
    this.sleepTimer = setTimeout(() => {
      if (!this.quiet || this.hold || ctx.state !== 'running') return;   // hold：錄影中，聲音要一直接著
      if (performance.now() < this.voiceUntil) this.sleepSoon();
      else ctx.suspend();
    }, Math.max(1500, this.voiceUntil - performance.now()));
  }
}
