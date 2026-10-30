"""光學修正：字組好以後，整字再調一次，讓一組字放在一起時均勻

規則依序套用（OPTICS 清單的順序）：

  墨量平衡   筆畫多的字筆畫細、筆畫少的字筆畫粗，墨量往 INK_TARGET 靠。
             變細的時候分層：碰到字外框的筆畫和主筆（最長的橫、最長的豎）是辨識字形的骨幹，
             只細一半；內部的筆畫細足。（參考 Typotheque 設計中文超粗體的筆畫層級）
  字面修正   框形的字看起來大，開放的字看起來小。用凸包面積開根號當視覺大小，
             往 SIZE_TARGET 靠一部分，最多放大縮小 6%。（參考 justfont「國」字內縮）
  重心修正   墨跡重心往視覺中心拉一半。視覺中心略高於幾何中心。重心只求趨近，不求一致。

所有修正都不讓墨跡超出 BOX。
"""
from typing import Any, Callable, List, Tuple

from .primitives import transform, weight_of, with_weight
from .exporter import glyph_to_outline, prim_to_polygon
from .style import DISPLAY

Prims = List[Tuple[str, Any]]

INK_TARGET = 24.0           # 墨量目標（佔格子的 %）
WEIGHT_GAMMA = 0.5          # 越大，墨量拉得越用力
WEIGHT_RANGE = (0.84, 1.12)

SIZE_TARGET = 86.0          # 視覺大小目標（凸包面積開根號）
SIZE_BETA = 0.4
SIZE_RANGE = (0.94, 1.06)

CENTER = (50.0, 49.0)       # 視覺中心：水平置中，垂直略高
CENTER_PULL = 0.5

BOX = (-1.0, 101.0)         # 墨跡可用的範圍


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _is_main(prims: Prims, i: int) -> bool:
    """主筆：整字最長的那一橫、最長的那一豎"""
    def span(p, axis):
        kind, a = p[0], p[1]
        if kind != 'bar':
            return 0.0
        best = 0.0
        for (x0, y0), (x1, y1) in zip(a, a[1:]):
            dx, dy = abs(x1 - x0), abs(y1 - y0)
            if axis == 'x' and dy < 0.2 * dx:
                best = max(best, dx)
            if axis == 'y' and dx < 0.2 * dy:
                best = max(best, dy)
        return best
    return any(span(prims[i], ax) > 0 and span(prims[i], ax) == max(span(p, ax) for p in prims)
               for ax in ('x', 'y'))


def balance_weight(prims: Prims) -> Prims:
    outline = glyph_to_outline(prims, DISPLAY)
    ink = outline.area / 100
    f = _clamp((INK_TARGET / ink) ** WEIGHT_GAMMA, *WEIGHT_RANGE)
    if f >= 1.0:
        return [with_weight(p, weight_of(p) * f) for p in prims]
    gx0, gy0, gx1, gy1 = outline.bounds
    out = []
    for i, p in enumerate(prims):
        x0, y0, x1, y1 = prim_to_polygon(p, DISPLAY).bounds
        outer = min(x0 - gx0, y0 - gy0, gx1 - x1, gy1 - y1) < 1.0
        k = (1 + f) / 2 if outer or _is_main(prims, i) else f
        out.append(with_weight(p, weight_of(p) * k))
    return out


def _fit_box(prims: Prims, s: float, cx: float, cy: float) -> float:
    """以 (cx, cy) 縮放 s 倍後若超出 BOX，把 s 收回到剛好不超出"""
    lo, hi = BOX
    x0, y0, x1, y1 = glyph_to_outline(prims, DISPLAY).bounds
    if s <= 1.0:
        return s
    room = min((cx - lo) / (cx - x0), (hi - cx) / (x1 - cx), (cy - lo) / (cy - y0), (hi - cy) / (y1 - cy))
    return min(s, max(1.0, room))


def normalize_size(prims: Prims) -> Prims:
    outline = glyph_to_outline(prims, DISPLAY)
    size = outline.convex_hull.area ** 0.5
    s = _clamp((SIZE_TARGET / size) ** SIZE_BETA, *SIZE_RANGE)
    x0, y0, x1, y1 = outline.bounds
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    s = _fit_box(prims, s, cx, cy)
    return transform(prims, sx=s, sy=s, ox=cx * (1 - s), oy=cy * (1 - s))


def center(prims: Prims) -> Prims:
    outline = glyph_to_outline(prims, DISPLAY)
    x0, y0, x1, y1 = outline.bounds
    lo, hi = BOX
    c = outline.centroid
    dx = _clamp(CENTER_PULL * (CENTER[0] - c.x), lo - x0, hi - x1)
    dy = _clamp(CENTER_PULL * (CENTER[1] - c.y), lo - y0, hi - y1)
    return transform(prims, ox=dx, oy=dy)


OPTICS: List[Callable[[Prims], Prims]] = [balance_weight, normalize_size, center]


def optical(prims: Prims) -> Prims:
    for rule in OPTICS:
        prims = rule(prims)
    return prims
