"""留白檢查（計白當黑）

把字形轉成輪廓後量兩種白：
  1. 筆畫之間的白：兩個互不相連的筆劃，最近距離太小，小字時會糊成一團
  2. 封閉的白（口、日 的內部）：最大內切圓直徑太小，小字時會被填滿

門檻以豎筆筆寬 t 的倍數表示，換字重時門檻會跟著變。
"""
from itertools import combinations
from typing import Any, Dict, List, Tuple

import shapely
from shapely.geometry import LineString, Polygon
from shapely.ops import nearest_points, unary_union

from .exporter import prim_to_polygon, glyph_to_outline
from .style import Style, MONO

MIN_GAP = 0.8      # 筆畫之間的白，至少 0.8 倍筆寬
MIN_COUNTER = 1.2  # 封閉的白，最窄處至少 1.2 倍筆寬


def lint_glyph(prims: List[Tuple[str, Any]], style: Style = MONO) -> List[str]:
    issues = []
    t = style.t

    polys = [prim_to_polygon(p, style) for p in prims]
    for (i, a), (j, b) in combinations(enumerate(polys), 2):
        if a is None or b is None:                       # 長度為 0 的筆劃
            continue
        d = a.distance(b)
        if 0 < d < MIN_GAP * t:
            # 兩筆之間如果被第三筆的墨蓋住（例如都接在同一道橫上），那裡不是白
            bridge = LineString(nearest_points(a, b))
            others = unary_union([q for k, q in enumerate(polys) if k not in (i, j) and q is not None])
            if bridge.difference(others).length < 0.05 * d:
                continue
            issues.append(f'筆劃 {i}、{j} 之間只剩 {d / t:.2f}t')

    outline = glyph_to_outline(prims, style)
    parts = [outline] if outline.geom_type == 'Polygon' else list(outline.geoms)
    for poly in parts:
        for ring in poly.interiors:
            hole = Polygon(ring)
            width = 2 * shapely.maximum_inscribed_circle(hole).length
            if width < MIN_COUNTER * t:
                x, y = hole.representative_point().coords[0]
                issues.append(f'({x:.0f}, {y:.0f}) 附近的封閉白最窄 {width / t:.2f}t')

    return issues


def lint_registry(glyphs: Dict[str, List[Tuple[str, Any]]], style: Style = MONO,
                  style_for: Dict[str, Style] = None) -> Dict[str, List[str]]:
    style_for = style_for or {}
    report = {}
    for ch, prims in glyphs.items():
        issues = lint_glyph(prims, style_for.get(ch, style))
        if issues:
            report[ch] = issues
    return report
