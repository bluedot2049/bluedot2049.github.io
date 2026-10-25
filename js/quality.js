// 畫質分級：先看裝置猜一個等級，開始走動後再量實際的幀時間，太慢就一步步降。
// low：解析度 1x、不加後製　mid：解析度最多 1.5x、不加後製（手機預設）　high：最多 2x，加環境光遮蔽、泛光、抗鋸齒
// 網址加 ?q=low / ?q=mid / ?q=high 可以強制指定，方便測試

const LEVELS = ['low', 'mid', 'high'];
const KEY = 'quality';
const KEEP_DAYS = 7;   // 上次降過級就沿用，一週後再重新判斷，換了瀏覽器或驅動更新還有機會升回來

function gpuName() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl ? gl.getParameter(gl.RENDERER) : '';
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return String(name || '');
  } catch {
    return '';
  }
}

function guess(coarse) {
  const gpu = gpuName();
  const mem = navigator.deviceMemory || 8;
  const cores = navigator.hardwareConcurrency || 4;
  // 軟體繪圖或很舊的手機晶片
  if (/swiftshader|llvmpipe|basic render|mali-[4t]|adreno \(tm\) [1-5]\d\d|powervr sgx/i.test(gpu)) return { level: 'low', gpu };
  // Safari 不給記憶體大小，核心數也不準，iPhone 只看 GPU 名稱，不然全部會被當成低階機
  if (coarse) return { level: navigator.deviceMemory && (mem <= 3 || cores <= 4) ? 'low' : 'mid', gpu };
  // 電腦的內顯（Iris 以外）先給 mid，獨顯和 Apple 晶片給 high
  if (/intel.*(hd|uhd) graphics/i.test(gpu) || mem <= 4) return { level: 'mid', gpu };
  return { level: 'high', gpu };
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && LEVELS.includes(s.level) && Date.now() - s.at < KEEP_DAYS * 864e5) return s.level;
  } catch {}
  return null;
}

function save(level) {
  try { localStorage.setItem(KEY, JSON.stringify({ level, at: Date.now() })); } catch {}
}

export class Quality {
  constructor(coarse, params) {
    const forced = params.get('q');
    const g = guess(coarse);
    this.gpu = g.gpu;
    this.forced = LEVELS.includes(forced);
    const saved = load();
    // 存下來的等級只會比猜的低（是降級留下的），不會讓手機一開始就跑 high
    let level = this.forced ? forced : g.level;
    if (!this.forced && saved && LEVELS.indexOf(saved) < LEVELS.indexOf(level)) level = saved;
    this.level = level;
    this.maxDpr = Math.min(window.devicePixelRatio, { low: 1, mid: 1.5, high: 2 }[level]);
    this.dpr = this.maxDpr;
    this.samples = [];
    this.skipUntil = 0;
    this.onChange = null;
  }

  get post() { return this.level === 'high'; }

  // 換房間、走出後門、分頁切回來時會卡一下，那幾秒不算
  pause(ms = 1500) {
    this.skipUntil = performance.now() + ms;
    this.samples.length = 0;
  }

  // 每畫一幀呼叫一次（閒置降到 30fps 時不呼叫）。取中位數，偶爾一兩幀卡頓不會誤判
  sample(dt) {
    if (this.forced || performance.now() < this.skipUntil) return;
    this.samples.push(dt);
    if (this.samples.length < 90) return;
    const s = this.samples.sort((a, b) => a - b), mid = s[s.length >> 1];
    this.samples.length = 0;
    if (mid > 1 / 40) this.stepDown();
  }

  // 先關後製，再降解析度，最低到 1x
  stepDown() {
    if (this.level === 'high') {
      this.level = 'mid';
      this.dpr = Math.min(this.dpr, 1.5);
    } else if (this.dpr > 1) {
      this.dpr = Math.max(1, this.dpr - 0.25);
      if (this.dpr === 1) this.level = 'low';
    } else {
      return;
    }
    save(this.level);
    this.pause(2000);
    this.onChange?.(this);
  }
}
