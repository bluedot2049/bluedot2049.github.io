"""按鈕上的字：手機的「跳」「坐」印章（css/hud.css 的 .seal）。坐的那顆照姿勢換字：站著「坐」、坐在地上「躺」、躺著或坐椅子「起」（main.js）

字小（約 16–20px），用 Text 字重。寫法跟 places.py 一樣：左右結構用 compose，其他整字畫。
"""
from typing import Any, Dict, List, Tuple

from .primitives import bar, wing
from .ids import compose
from .parts import h, v

BUTTON_GLYPHS: Dict[str, List[Tuple[str, Any]]] = {}
G = BUTTON_GLYPHS

G['跳'] = compose('⿰足兆')
G['躺'] = compose('⿰身尚')

# 上面兩個人（捺收成點），土的豎從兩人中間穿上來
G['坐'] = [bar((32, 8), (10, 46)), bar((23, 28), (36, 44)),
          bar((80, 8), (64, 42)), bar((74, 26), (90, 44)),
          v(50, 2, 92), h(18, 82, 64), wing(4, 96, 92)]

# 走字旁的捺拉長托住己；捺是這個字的主筆
G['起'] = [h(10, 38, 10), v(24, 2, 34), h(4, 42, 34),
          v(24, 44, 81), h(24, 40, 57), bar((10, 46), (10, 70), (2, 92)),
          bar((12, 70), (32, 90), (98, 92), end='wing'),
          bar((56, 12), (88, 12), (88, 40), (58, 40), (58, 68), (96, 68), end='hook_up')]
