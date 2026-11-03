# 夢見ヶ丘站 · Yumemigaoka Station — Preset Spec

> 給 AI 閱讀的概念說明。目標是重現一段「超現實、櫻花、夢境中的鄉間車站」氛圍的 lo-fi，可用於音樂生成模型、程式合成（Web Audio / SuperCollider / DAW），或作為作曲提示。
> 與〈星盤夜讀〉〈寂靜軌道〉同一套寫法：概念 → 參數 → 和聲 → 聲層 → 視覺 → 一行提示。

## 1. 一句話概念

春夜，一座只在夢裡存在的小站「夢見ヶ丘」。上一站是「きのう（昨天）」，下一站是「あした（明天）」。櫻花不停飄落，有幾片往上飄；站上的時鐘倒著走。列車從不停靠，只是每隔一陣子呼嘯而過。

**核心設計：列車本身就是鼓組。** 車輪壓過鐵軌接縫的「喀噹、咕咚」（ガタンゴトン）就是節拍。列車接近時，節奏從遠方的悶聲慢慢清晰；通過時最飽滿；離開時漸漸消失。列車不在的時候，整首歌就變成沒有拍子的夢境間奏。

**關鍵詞**：surreal, nostalgic, dreamy, spring night, Japanese rural station, warped memory, gentle, bittersweet
**避免**：都市的嘈雜、清晰可辨的日語人聲、刻板的「和風」五聲音階旋律、過亮的高頻、恐怖片氛圍

## 2. 預設參數

```json
{
  "preset_name": "夢見ヶ丘站 / Yumemigaoka Station",
  "key": "D♭",
  "mode": "Major (city-pop-flavoured extended chords)",
  "tempo_bpm": 70,
  "time_signature": "4/4",
  "swing": 0.28,
  "loop_length_bars": 8,
  "train_cycle_sec": { "absent": 34, "approach": 16, "pass": 26, "leave": 14, "total": 90 },
  "mix": {
    "dream_rhodes_bass": 0.60,
    "departure_melody":  0.55,
    "train_rhythm":      0.60,
    "crossing_bell":     0.00,
    "announcements":     0.40,
    "petals_breeze":     0.50,
    "bush_warbler":      0.45
  },
  "mix_curve": "gain = value^2 × 1.3"
}
```

**這組混音的性格**：平交道鈴聲預設關閉（畫面上的紅燈仍會閃爍）。列車接近時沒有警示聲，只有節奏從遠方慢慢浮出來，更安靜，也更像夢。想要完整的「車站感」時，再把平交道推回約 0.4。

## 3. 和聲

每個和弦持續 2 小節，4 個和弦構成 8 小節循環。

| 小節 | 和弦 | 低音 | 上方聲部 (MIDI) | 色彩 |
|---|---|---|---|---|
| 1–2 | D♭maj9 | D♭2 (37) | 53 56 60 63 | 溫暖、懷舊 |
| 3–4 | Fm9 | F2 (41) | 51 55 56 60 | 淡淡的感傷 |
| 5–6 | B♭m9 | B♭1 (34) | 49 53 56 60 | 柔軟、低垂 |
| 7–8 | G♭maj7♯11 | G♭2 (42) | 49 53 58 60 | ♯11 帶來懸浮感，像夢要醒 |

旋律與櫻花音用的音池是 D♭ 大調五聲音階加上 C：D♭ E♭ F A♭ B♭ C。

## 4. 各聲部

**和聲 Dream Rhodes · Bass**
- 電鋼琴：sine 加 triangle（輕微 detune），加一個快速衰減的八度泛音。lowpass 從 2100Hz 掃到 600Hz。
- 每 2 小節撥一次完整和弦（每音間隔 30ms）；第 2 小節後半再輕輕補一次上方三音。
- 低音：sine，lowpass 420Hz，在第 1 拍和第 3 拍後半各下一次。

**夢的磁帶 Dream tape（全域效果，作用在鋼琴與廣播系統上）**
- 比一般 lo-fi 更深的 wow（0.27Hz，延遲時間 ±3.2ms），加上 flutter（6.1Hz）。
- **夢境滑落**：每 40–90 秒，磁帶會突然變慢，延遲時間從 20ms 拉到 100ms，所有音高往下彎約四分之三個半音，再慢慢恢復。畫面也會跟著微微傾斜。

**發車旋律 Departure melody**
- 模仿日本車站的發車旋律（発車メロディ）：開場時隨機生成一段 10 音的短句。
  - 節奏（以 8 分音符為單位）：1 1 1 1 2 1 1 2 2 4。
  - 最後一音一定落在 D♭。
- 音色：三角波加八度正弦，短促的鐘琴感。
- 經過「月台廣播喇叭」處理：highpass 380Hz → lowpass 3400Hz → 輕度飽和失真（tanh）→ 大量殘響與 0.62 秒回聲。
- **褪色的記憶**：同一段旋律每播一次，就慢 3.5%、低 18 cents。播完 6 次後換成一段新的旋律，像換了一座車站。
- 每個列車週期在「列車不在」的階段開始時播放一次。

**列車 Rail joints · Rumble（節奏來源）**

| 步 (16 分) | 聲音 | 擬聲 |
|---|---|---|
| 0 | 低頻悶擊 92Hz → 50Hz | ガ (ga) |
| 2 | 金屬撞擊（2.4kHz 噪音加 3.15kHz 正弦） | タン (tan) |
| 8 | 低頻悶擊 70Hz → 38Hz | ゴ (go) |
| 10 | 較輕的金屬撞擊 | トン (ton) |
| 4, 12 | 刷子小鼓（1.8kHz 帶通噪音） | — |
| 偶數步 | 極輕的 hi-hat | — |

- 另有持續的車體低鳴（140Hz 以下）和中頻噪音。
- 所有列車聲音都經過同一組濾波器、音量和聲像，依週期移動：

| 階段 | 時長 | 音量 | lowpass | 聲像 |
|---|---|---|---|---|
| 不在 absent | 34s | 0 | — | — |
| 接近 approach | 16s | 0 → 0.3 | 350 → 1400Hz | 右 0.75 |
| 通過 pass | 26s | 1.0 | 6500Hz | 從右 0.75 移到左 −0.75 |
| 離開 leave | 14s | → 0 | → 300Hz | 左 −0.75 |

- 通過前 1.2 秒有一道呼嘯的風切聲：帶通從 300Hz 掃到 2200Hz 再落到 400Hz。

**平交道 Crossing bell**
- 兩個交替的金屬鈴聲（760Hz 與 705Hz），泛音比例為 1×、2.4×、3.9×，偏右聲道。
- 從列車接近時開始響，到通過結束後 3 秒停止。
- **超現實處理**：響的過程中，間隔從 0.42 秒慢慢拉長到 0.56 秒，音高下沉 120 cents，像夢裡的時間在變慢。

**廣播 Announcements**
- 先是兩聲提示音（ピンポン）：F5 → D♭5。
- 接著是一段聽不清內容的「播報」：
  - 用鋸齒波加三個共振峰濾波器，合成日語的五個母音 a、i、u、e、o。
  - 母音和子音（短噪音）隨機排列，2–3 個句子，每句 6–13 個音節。
  - 句尾音高下降，模仿播報的語調，但永遠拼不出真正的字。
- 經過和發車旋律相同的月台喇叭處理。
- 每個週期在列車接近前 6 秒播放（相當於「まもなく…」的時機）。

**櫻花 Petals · Breeze**
- 每 0.5–3.5 秒落下一片「花瓣」：極輕的高音鐘聲（D♭6–C7），帶 1.003× 的微 detune，殘響很深，聲像隨機。
- 背景是穿過樹枝的微風：帶通噪音，中心頻率與音量都緩慢起伏。

**黃鶯 Bush warbler（ウグイス）**
- 每 22–62 秒出現一次，二選一：
  - **70%：「ホーーホケキョ」**。先是約 0.9 秒、帶顫音的上揚長音（940 → 1120Hz），再接 ホ（1500）、ケ（2100）、キョ（1700 → 2500Hz 上滑）。
  - **30%：「谷渡り」**。6–11 聲急促的 ケキョケキョ，在 1950Hz 與 2350Hz 之間交替。
- 每次的整體音高隨機 ±10%。

**全域**
- 5.5 秒殘響（像開闊的夜間月台）。
- 輕度壓縮。
- 總輸出 lowpass 8kHz。

## 5. 視覺概念（可選）

夜間月台的正面視角：
- **天空**：從深夜藍漸層到地平線的暮紫，有零星星點。一輪過大的、透著櫻花粉的滿月。
- **櫻花樹**：左上與右上的花冠由粉色圓團組成；花瓣持續飄落，約 14% 往上飄（顏色偏白）。每響一聲花瓣鐘，就有一片花瓣發光。
- **駅名標**：月台中央的站名牌，白底，上方平假名「ゆめみがおか」，中央大字「夢見ヶ丘」，下方羅馬拼音。底部粉色帶寫著「◀ きのう Kinō」與「Ashita あした ▶」。
- **時鐘**：左側柱上的月台時鐘，指針倒著走。
- **平交道**：右側黃色 X 標誌，兩盞紅燈隨鈴聲交替亮起。
- **月台**：白色邊線，加上黃色點字導盲磚。
- **列車**：
  - 接近時，右側出現逐漸變亮的車頭燈光暈。
  - 通過時，一列窗戶透著暖光的車廂從右滑到左，帶粉色腰帶線，花瓣被風捲得更快。
  - 離開時，左側剩下兩盞漸暗的紅色尾燈。
- **發車標（LED 告示板）**：琥珀色點陣字，欄位為「種別 普通 / 行先 明日 / 通過まで 倒數 / 2番線」。狀態列依階段顯示：
  - 不在：ただいま 夢の途中です
  - 接近：まもなく 電車が通過します
  - 通過：通過電車に ご注意ください
  - 離開：次の電車は 明日 行きです

**配色**：夜藍 #121626、暮紫 #3b2c46、櫻粉 #f3b6c8、深櫻 #d97f9c、號誌紅 #e5544f、LED 琥珀 #ffa63d、站牌白 #f4f1ea、導盲磚黃 #d9b43c。
**字體**：站名與介面用黑體（Noto Sans TC）；告示板用點陣字（DotGothic16）。

## 6. 給文字轉音樂模型的一行提示

> Surreal dreamy lo-fi at 70 BPM in D♭ major, warm warbling Rhodes on D♭maj9 – Fm9 – B♭m9 – G♭maj7♯11, the beat is a passing train (ga-tan go-ton rail-joint rhythm with soft brushes) that fades in from the distance, rushes past left to right and fades away every 90 seconds leaving beatless interludes, a Japanese station departure-melody chime through a small PA speaker that gets slower and flatter each time like a fading memory, unintelligible soft train announcements, falling cherry-blossom bell plinks, spring breeze, a distant uguisu bush warbler, occasional tape slowdowns, nostalgic spring night, instrumental.
