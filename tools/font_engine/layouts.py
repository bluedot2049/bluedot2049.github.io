"""漢字結構佈局器（Layout Engine）

支援漢字基礎構字結構：
  - 左右結構（⿰）：left_right
  - 左中右結構（⿲）：left_mid_right
  - 上下結構（⿱）：top_bottom
  - 上中下結構（⿳）：top_mid_bottom
  - 半包圍結構（⿸）：semi_enclose_top_left
  - 全包圍結構（⿴）：full_enclose
  - 自由放置與變換：place, fit, combine
"""
from typing import List, Tuple, Any
from .primitives import transform, bbox

def combine(*parts: List[Tuple[str, Any]]) -> List[Tuple[str, Any]]:
    """將多個部件組裝成一個單一字形圖元清單"""
    result = []
    for p in parts:
        result.extend(p)
    return result

def place(
    comp: List[Tuple[str, Any]],
    x: float,
    y: float,
    w: float,
    h: float,
    src_box: Tuple[float, float, float, float] = (0.0, 0.0, 100.0, 100.0)
) -> List[Tuple[str, Any]]:
    """
    將定義於 src_box (預設 100x100) 的部件，縮放並平移到目標矩形 (x, y, w, h)。
    注意：筆畫中心線會適應目標區域，筆劃粗細 T 維持不變，確保視覺均勻度。
    """
    sx0, sy0, sw, sh = src_box
    scale_x = w / sw if sw != 0 else 1.0
    scale_y = h / sh if sh != 0 else 1.0
    ox = x - sx0 * scale_x
    oy = y - sy0 * scale_y
    return transform(comp, sx=scale_x, sy=scale_y, ox=ox, oy=oy)

def fit(
    comp: List[Tuple[str, Any]],
    x: float,
    y: float,
    w: float,
    h: float
) -> List[Tuple[str, Any]]:
    """
    依部件自己的骨架外框，把它放進目標矩形 (x, y, w, h)。
    目標矩形指的是墨跡範圍。墨跡在骨架外多出多少（筆寬一半、燕尾上翹、點、斜筆平頭），
    四個邊各自量，縮放時這段不變，所以骨架內縮剛好那麼多，墨跡邊緣貼齊格子。
    部件不必知道自己原本畫在哪一格（整格或偏旁位置都可以）。
    """
    from .exporter import glyph_to_outline
    x0, y0, x1, y1 = bbox(comp)
    ix0, iy0, ix1, iy1 = glyph_to_outline(comp).bounds
    left, top, right, bottom = x0 - ix0, y0 - iy0, ix1 - x1, iy1 - y1
    return place(comp, x + left, y + top, w - left - right, h - top - bottom,
                 src_box=(x0, y0, x1 - x0, y1 - y0))

def left_right(
    left_comp: List[Tuple[str, Any]],
    right_comp: List[Tuple[str, Any]],
    split_x: float = 40.0,
    gap: float = 6.0,
    top_y: float = 0.0,
    bottom_y: float = 100.0
) -> List[Tuple[str, Any]]:
    """左右結構（⿰）"""
    w_left = split_x - gap / 2
    w_right = 100.0 - (split_x + gap / 2)
    h = bottom_y - top_y
    
    left = fit(left_comp, x=0.0, y=top_y, w=w_left, h=h)
    right = fit(right_comp, x=split_x + gap / 2, y=top_y, w=w_right, h=h)
    return combine(left, right)

def left_mid_right(
    left_comp: List[Tuple[str, Any]],
    mid_comp: List[Tuple[str, Any]],
    right_comp: List[Tuple[str, Any]],
    splits: Tuple[float, float] = (28.0, 70.0),
    gap: float = 6.0,
    top_y: float = 0.0,
    bottom_y: float = 100.0
) -> List[Tuple[str, Any]]:
    """左中右結構（⿲，例如「術」＝彳＋朮＋亍）"""
    a, b = splits
    h = bottom_y - top_y
    left = fit(left_comp, x=0.0, y=top_y, w=a - gap / 2, h=h)
    mid = fit(mid_comp, x=a + gap / 2, y=top_y, w=b - a - gap, h=h)
    right = fit(right_comp, x=b + gap / 2, y=top_y, w=100.0 - b - gap / 2, h=h)
    return combine(left, mid, right)

def top_bottom(
    top_comp: List[Tuple[str, Any]],
    bot_comp: List[Tuple[str, Any]],
    split_y: float = 48.0,
    gap: float = 6.0,
    left_x: float = 0.0,
    right_x: float = 100.0
) -> List[Tuple[str, Any]]:
    """上下結構（⿱）"""
    h_top = split_y - gap / 2
    h_bot = 100.0 - (split_y + gap / 2)
    w = right_x - left_x
    
    top = fit(top_comp, x=left_x, y=0.0, w=w, h=h_top)
    bot = fit(bot_comp, x=left_x, y=split_y + gap / 2, w=w, h=h_bot)
    return combine(top, bot)

def semi_enclose_top_left(
    frame_comp: List[Tuple[str, Any]],
    inside_comp: List[Tuple[str, Any]],
    pad_left: float = 24.0,
    pad_top: float = 24.0,
    inside_w: float = 72.0,
    inside_h: float = 72.0
) -> List[Tuple[str, Any]]:
    """左上包圍結構（⿸，例如「广」包住「郎」或「良」）"""
    inside = place(inside_comp, x=pad_left, y=pad_top, w=inside_w, h=inside_h)
    return combine(frame_comp, inside)

def full_enclose(
    frame_comp: List[Tuple[str, Any]],
    inside_comp: List[Tuple[str, Any]],
    pad: float = 18.0
) -> List[Tuple[str, Any]]:
    """全包圍結構（⿴，例如「囗」包住內部部件）"""
    inside = place(inside_comp, x=pad, y=pad, w=100.0 - 2 * pad, h=100.0 - 2 * pad)
    return combine(frame_comp, inside)
