"""漢字註冊表（Glyph Registry）

定義漢字庫，將每個 Unicode 字符映射到其組裝後的圖元序列。
既包含原本「煉金畫廊」的 4 個經典字形，也展示了透過模組化自動生長出的豐富漢字。
"""
from typing import Dict, List, Tuple, Any
from .primitives import bar, wing, dot, ring, T
from .layouts import combine
from .ids import compose
from .optics import optical
from .places import PLACE_GLYPHS
from .buttons import BUTTON_GLYPHS
from .components import (
    RAD_FIRE_LEFT, BODY_JIAN, RAD_GUANG, BODY_LANG_FULL,
    COMP_SUN, COMP_MOON, COMP_WOOD, COMP_EARTH, COMP_WATER, COMP_GATE, COMP_LIGHT,
)

GLYPH_REGISTRY: Dict[str, List[Tuple[str, Any]]] = {}

# 字標四字：要和 tools/wordmark.py 產生的字標一致，不做光學修正、不套橫細豎粗
LOCKED = set('煉金画廊')

# 1. 經典字標四字（100% 保持原生手刻美學座標）
GLYPH_REGISTRY['煉'] = combine(RAD_FIRE_LEFT, BODY_JIAN)

GLYPH_REGISTRY['金'] = [                                      # 豎筆從屋頂尖貫到底當中軸，兩點是菱形
    bar((2, 42), (50, 5), (98, 42)),
    bar((50, 5), (50, 90)),
    bar((28, 38), (72, 38)),
    bar((20, 58), (80, 58)),
    dot(32, 74, 5), dot(68, 74, 5),
    wing(6, 92, 90),
]

GLYPH_REGISTRY['画'] = [
    wing(5, 93, 8),
    bar((10, 28), (10, 88), (90, 88), (90, 28)),
    ring(50, 48, 21),
    bar((50, 27), (50, 69)),
    bar((29, 48), (71, 48)),
]

GLYPH_REGISTRY['廊'] = combine(RAD_GUANG, BODY_LANG_FULL)

# 2. 擴充核心漢字（畫廊與煉金術主題）；合體字用結構式組，規則見 ids.py
GLYPH_REGISTRY['術'] = compose('⿲彳朮亍')    # 煉金術之術
GLYPH_REGISTRY['秘'] = compose('⿰禾必')      # 神秘之秘
GLYPH_REGISTRY['境'] = compose('⿰土竟')      # 秘境之境
GLYPH_REGISTRY['室'] = compose('⿱宀至')      # 展室之室
GLYPH_REGISTRY['門'] = COMP_GATE                              # 畫廊之門
GLYPH_REGISTRY['日'] = COMP_SUN                               # 太陽 / 陽金
GLYPH_REGISTRY['月'] = COMP_MOON                              # 太陰 / 秘銀
GLYPH_REGISTRY['明'] = compose('⿰日月')      # 日月生輝
GLYPH_REGISTRY['木'] = COMP_WOOD                              # 五行之木
GLYPH_REGISTRY['土'] = COMP_EARTH                             # 五行之土
GLYPH_REGISTRY['水'] = COMP_WATER                             # 五行之水
GLYPH_REGISTRY['光'] = COMP_LIGHT                             # 金色之光
GLYPH_REGISTRY['火'] = [                                      # 獨體之火
    bar((18, 32), (28, 44)),
    bar((82, 32), (72, 44)),
    bar((50, 6), (50, 60), (22, 92)),
    bar((50, 60), (78, 92)),
]
GLYPH_REGISTRY['郎'] = compose('⿰良阝')
GLYPH_REGISTRY['林'] = compose('⿰木木')
GLYPH_REGISTRY['浪'] = compose('⿰氵良')

# 3. 煉金術符號（可直接在字體中以 Unicode 輸入）
GLYPH_REGISTRY['⊕'] = [
    ring(50, 50, 36),
    bar((50, 14), (50, 86)),
    bar((14, 50), (86, 50)),
]

GLYPH_REGISTRY['☉'] = [
    ring(50, 50, 36),
    dot(50, 50, 6.0),
]

GLYPH_REGISTRY['☽'] = [                                      # 一筆封閉繞完，兩個尖角交給 mitre 切平
    bar((56, 12), (32, 28), (24, 50), (32, 72), (56, 88), (46, 68), (44, 50), (46, 32), (56, 12)),
]

# 4. 地名用字：房間、地點名稱跳出來時用，見 places.py
GLYPH_REGISTRY.update(PLACE_GLYPHS)
GLYPH_REGISTRY['畫'] = GLYPH_REGISTRY['画']   # 跟字標一樣寫成「画」
LOCKED.add('畫')
GLYPH_REGISTRY.update(BUTTON_GLYPHS)           # 按鈕上的字，見 buttons.py

# 5. 光學修正：漢字整組調勻（墨量、字面、重心），規則見 optics.py
for _ch, _prims in GLYPH_REGISTRY.items():
    if _ch not in LOCKED and 0x4E00 <= ord(_ch) <= 0x9FFF:
        GLYPH_REGISTRY[_ch] = optical(_prims)
