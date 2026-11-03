# 寂靜軌道 · Silent Orbits — Preset Spec

> 給 AI 閱讀的概念說明。目標是重現一段「宇宙感、神秘、無節拍」的生成式 ambient，可用於音樂生成模型、程式合成（Web Audio / SuperCollider / Max / DAW），或作為作曲提示。
> 與〈星盤夜讀〉同一套寫法：概念 → 參數 → 和聲 → 聲層 → 視覺 → 一行提示。

## 1. 一句話概念

在一顆恆星的軌道系統外圍漂流。沒有鼓，也沒有拍子。音樂由七顆行星的公轉驅動：每顆行星經過子午線時就敲響自己的音高。它們的週期彼此沒有公倍數，所以旋律永遠不會重複。

**關鍵詞**：cosmic, vast, weightless, mysterious, slow, crystalline, beatless, generative, phasing
**避免**：鼓組和固定拍子、科幻電影式的轟鳴、明顯的旋律主題、小調的悲傷感、過亮的高頻

**方法來源**：Brian Eno 式的不同步循環（incommensurable loops）。用物理週期取代音樂小節。

## 2. 預設參數

```json
{
  "preset_name": "寂靜軌道 / Silent Orbits",
  "key": "A",
  "mode": "Lydian",
  "tempo": "none (beatless)",
  "time_drift": 0.65,
  "chord_duration_sec": 26,
  "mix": {
    "deep_drone":    0.34,
    "nebula_pad":    0.60,
    "planet_bells":  0.59,
    "solar_wind":    0.55,
    "pulsar":        0.72,
    "radio_whistlers_chorus": 0.54,
    "signals":       0.58
  },
  "mix_curve": "gain = value^2 × 1.3",
  "reverb_sec": 9,
  "echo_sec": 1.1
}
```

`time_drift` 是整體時間倍率，範圍 0.5–2.0。它同時改變和弦長度（26 秒 ÷ drift）和行星週期。本 preset 設為 0.65，所以一切比原速慢約三分之一：和弦每 40 秒換一次，最快的行星約 9.4 秒繞一圈。

**這組混音的性格**：深空低鳴偏弱，脈衝星是最突出的一層，電波和訊號也被推到前景。整體像「在一艘安靜的探測船裡監聽宇宙」：和聲是背景，各種來自遠方的訊號才是主角。

## 3. 和聲

A 音的低鳴持續不斷（pedal），上方的和弦每 26 秒換一次，前後交疊 10 秒，聽起來像星雲緩慢變形。

| 順序 | 和弦 | 聲部 (MIDI) | 色彩 |
|---|---|---|---|
| 1 | Amaj9♯11 | 57 61 64 68 71 75 | Lydian 本體，♯11 帶來懸浮感 |
| 2 | F♯m11 | 54 57 61 64 68 71 | 變暗、變遠 |
| 3 | Dmaj9♯11 | 50 57 61 64 66 68 | 疊在 A 低鳴上，形成寬闊的空間感 |
| 4 | E6/9 | 52 59 61 66 68 71 | 疊在 A 上相當於 Amaj13，微亮，再回到 1 |

行星的音高全部取自 A 大調五聲音階（A B C♯ E F♯ G♯），對四個和弦都協和，所以隨機重疊也不會刺耳。

## 4. 各聲部

**深空 Deep drone**
- 頻率：27.5Hz、55Hz、55.17Hz（與 55Hz 產生約每 6 秒一次的緩慢拍頻）、82.41Hz（五度），再加 110Hz 的三角波。
- lowpass 約 260Hz，以 0.031Hz 的 LFO 擺動 ±140Hz。
- 音量以 0.05Hz 的 LFO 呼吸起伏（約 20 秒一次）。

**星雲 Nebula pad**
- 每個音由兩個鋸齒波（各 detune ±7 cents）加一個正弦波組成。
- 起音 7–10 秒，釋音 10 秒；每個音隨機放在不同的聲像位置。
- 整體 lowpass 850Hz，以 0.037Hz 的 LFO 擺動 ±420Hz。

**行星 Planet bells（旋律來源）**

| 行星 | 音高 | 公轉週期 (秒) |
|---|---|---|
| 1 | A5 (81) | 6.1 |
| 2 | E5 (76) | 8.3 |
| 3 | B5 (83) | 10.7 |
| 4 | C♯5 (73) | 13.9 |
| 5 | E6 (88) | 17.3 |
| 6 | B4 (71) | 22.9 |
| 7 | F♯5 (78) | 29.3 |

- 音色：玻璃、水晶質感。泛音比例為 1×、2.76×、5.4×（非諧波），再加一個 1.003× 的微 detune 產生閃爍。
- 起音 20ms，衰減 6–7 秒。
- 混響送出量 0.9，另外送進 1.1 秒的回聲（feedback 0.5）。
- 力度在 0.05–0.085 之間隨機；聲像依軌道半徑左右交錯。

**太陽風 Solar wind**
- 兩條移動的帶通噪音：
  - 700Hz、Q 2.5，以 0.021Hz 的 LFO 擺動。
  - 1900Hz、Q 6，以 0.057Hz 的三角波 LFO 擺動。
- 再加一層 90Hz 以下的低頻轟鳴。

**脈衝星 Pulsar**
- 每 0.714 秒（1.40Hz）一次訊號。
- 強度依「波束」包絡起伏：sin²(2πt/80)，約每 80 秒掃過一次，時有時無。
- 每一下由三個部分組成：
  1. **星際色散**：真實的脈衝星訊號穿過星際電漿時，高頻先到、低頻後到。這裡用一個 90ms 的下滑音模擬，從 4200Hz 滑到 420Hz。
  2. **金屬餘韻**：極弱的 FM 金屬共鳴。載波 1318.5Hz（E6），調變比 1.414，調變指數從 900 衰減到 20，持續約 0.5 秒。
  3. **低頻悶擊**：從 90Hz 落到 48Hz。
- 聲像緩慢左右游移；FM 餘韻放在相反的一側。

**電波 Radio：哨聲 Whistlers 與黎明合唱 Chorus**
- 每 14–44 秒觸發一次，二選一：
- **電離層哨聲回聲列（60%）**：閃電的無線電波沿地磁線在南北半球之間來回彈跳。
  - 第一聲從 5–7.6kHz 指數下滑到 650–1150Hz，長 1.6–2.8 秒。
  - 後面跟 0–2 個回聲，每一個都更長（+45%）、更弱（×0.55），並換到另一側聲道。
  - 伴隨一層跟著下滑的帶通噪音。
- **黎明合唱（40%）**：磁層中真實存在、聽起來像鳥鳴的電磁波。
  - 6–15 個短促的上揚音（0.12–0.3 秒），從 1.3–2.2kHz 往上滑 1.6–2.4 倍。
  - 間隔不規則。

**訊號 Signals（新層，最神秘的部分）**
- 每 30–75 秒（除以 drift）出現一個事件，三選一：
- **倒放的鐘聲（40%）**
  - 隨機挑一顆行星的音高，有一半機率降八度。
  - 音量在 3–5.5 秒內從無聲以指數曲線漲起，然後戛然而止。
  - 殘響會在停止之後繼續，所以聽起來像時間倒流。
- **質數信標（32%）**
  - 一個不明來源的 880Hz 載波（加一個 2.01 倍的泛音），經過 1150Hz 的帶通濾波，聽起來像短波收音機。
  - 依序發出 2、3、5、7、11、13 下嗶聲，每次 3–6 組，組間停頓 0.75 秒。
  - 整段音高漸漸下降 45 cents，像訊號源正在遠離（都卜勒效應）。
  - 背景有一層靜電雜訊。
  - 這個靈感來自電影《接觸未來》（Contact）：用質數證明訊號來自智慧生命。
- **引力波啁啾（28%）**
  - 模擬兩個黑洞互相繞轉、最後合併的訊號，就像 LIGO 偵測到的那種。
  - 頻率依 (距合併時間)^-3/8 上升，2.8 秒內從 28Hz 升到約 210Hz。
  - 音量同時增強，最後是 0.3 秒的「鈴宕」（ringdown）衰減。
  - 用三角波加一個高八度正弦，讓小喇叭也聽得見。

**浮現與消失 Presence（深空、星雲各自獨立）**
- 兩層音量都在 mixer 設定值之下，再乘上一個隨機的「存在感」倍率，讓聲音有時浮現、有時退場。
- 每次的新目標值：
  - 28% 機率是 0（完全消失）。
  - 27% 機率是 0.25–0.5（變淡）。
  - 45% 機率是 0.7–1.0（浮現）。
- 轉換時間：每次漂移 14–32 秒，用指數曲線過渡，聽不出切換點。
- 停留時間：消失時停留 12–37 秒，其他狀態停留 18–58 秒。
- 規則：兩層不會同時消失。如果一層已經是 0，另一層抽到 0 時會改成 0.6。
- 以上時間都會除以 `time_drift`。
- 開始播放後，深空約 25–45 秒、星雲約 35–60 秒才第一次變化。

**全域**
- 9 秒的生成式殘響。
- 輕度壓縮（ratio 2.5）。
- 總輸出 lowpass 9kHz。

## 5. 視覺概念（可選）

傾斜視角的太陽系儀（orrery）：
- 中央是一顆暖色恆星，隨 drone 呼吸發光。
- 七條淡冰藍色的橢圓軌道，行星依前後深度決定大小與亮度，旁邊標出各自的音名。
- 一條虛線子午線從恆星指向觀者；行星經過時，以漣漪標示響聲。
- 太陽風是從恆星向外漂散的微粒。
- 哨聲是從天空上方落下的弧線。
- 右上角的脈衝星會隨訊號閃爍十字光芒。
- 引力波合併的瞬間，三道光環從恆星快速向外擴散。
- 倒放鐘聲時，一道光環會向對應的行星收縮，在聲音停止時正好收攏。
- 質數信標出現時，左下角會像接收日誌一樣逐一印出點數：SIGNAL 2 · 3 · 5 …

**配色**：虛空黑 #06070c、星光暖金 #e8b878、冰藍 #8fc3d4、星白 #e4e2ea。

## 6. 給文字轉音樂模型的一行提示

> Beatless generative cosmic ambient in A Lydian, deep 55 Hz drone with slow beating, evolving detuned nebula pads (drone and pads independently swell, thin out and vanish for long stretches, never both silent at once) drifting through Amaj9♯11 – F♯m11 – Dmaj9♯11 – E6/9 every 40 seconds, sparse crystalline glass bells on the A major pentatonic triggered by phasing loops of different lengths, long 9-second reverb and soft echo, filtered solar-wind noise, prominent pulsar clicks with dispersion sweeps fading in and out, ionospheric whistler echo trains and magnetospheric dawn chorus, rare reversed bell swells that stop dead, a distant radio beacon beeping prime numbers through static, and a gravitational-wave chirp from merging black holes, weightless, vast, mysterious, no drums, no melody hook, instrumental.
