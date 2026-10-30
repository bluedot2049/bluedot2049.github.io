"""字型輸出器（Font Exporter）

利用 shapely 進行筆畫外擴（Stroke-to-Outline）與布林聯集運算，
再透過 fontTools 將向量輪廓編譯為標準的 TrueType (.ttf) 與網頁字型 (.woff2)。
"""
from dataclasses import replace
from math import cos, sin, pi, hypot
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

from shapely.geometry import Polygon
from shapely.ops import unary_union
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

from .primitives import T, HOOKS, attrs, dot_outline
from .style import Style, MONO

UPM = 1000
ADVANCE_WIDTH = 1000
MITRE_LIMIT = 2.0  # 銳角折筆（被壓窄的鉤）改成斜切，不會拉出尖刺


def _unit(a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    n = hypot(dx, dy)
    return dx / n, dy / n


def _corner(p, d1, w1, d2, w2, limit) -> Optional[Polygon]:
    """折點外側的補角：在 mitre 長度以內是尖角，超過就在 limit 處切平"""
    cross = d1[0] * d2[1] - d1[1] * d2[0]
    if abs(cross) < 1e-9:
        return None
    side = -1 if cross > 0 else 1                       # 外側法線方向
    n1 = (-d1[1] * side, d1[0] * side)
    n2 = (-d2[1] * side, d2[0] * side)
    o1 = (p[0] + n1[0] * w1 / 2, p[1] + n1[1] * w1 / 2)
    o2 = (p[0] + n2[0] * w2 / 2, p[1] + n2[1] * w2 / 2)
    # 兩條外緣線 o1 + s·d1、o2 − u·d2 的交點
    s = ((o2[0] - o1[0]) * d2[1] - (o2[1] - o1[1]) * d2[0]) / cross
    m = (o1[0] + s * d1[0], o1[1] + s * d1[1])
    reach = limit * max(w1, w2) / 2
    bis = (m[0] - p[0], m[1] - p[1])
    dist = hypot(*bis)
    if dist <= reach:
        return Polygon([p, o1, m, o2])
    u = (bis[0] / dist, bis[1] / dist)
    def clip(o, d, sign):
        k = (reach - ((o[0] - p[0]) * u[0] + (o[1] - p[1]) * u[1])) / (sign * (d[0] * u[0] + d[1] * u[1]))
        return (o[0] + sign * k * d[0], o[1] + sign * k * d[1])
    return Polygon([p, o1, clip(o1, d1, 1), clip(o2, d2, -1), o2])


def _wing_cap(e, d, w):
    """燕尾：上緣提早收、尖端往外上方翹；回收、外伸、上翹量都按筆寬等比例"""
    k = w / T
    up = (d[1], -d[0])
    at = lambda along, side: (e[0] + d[0] * along + up[0] * side, e[1] + d[1] * along + up[1] * side)
    return Polygon([at(-8 * k, w / 2), at(2 * k, w / 2 + 4 * k), at(-2 * k, -w / 2), at(-8 * k, -w / 2)])


def stroke_polygon(pts, style: Style, end: str = None, limit: float = MITRE_LIMIT) -> Any:
    """折線外擴成輪廓。每一段的寬度由它的方向決定（橫細豎粗），平頭、mitre 接角；end 是收筆"""
    pts = [p for i, p in enumerate(pts) if i == 0 or p != pts[i - 1]]
    if len(pts) < 2:
        return None
    if end in HOOKS:                                    # 鉤、提：固定方向和長度，接在最後一點
        (vx, vy), length = HOOKS[end]
        ex, ey = pts[-1]
        pts = pts + [(ex + vx * length * style.t, ey + vy * length * style.t)]
    segs = []
    parts = []
    for i, (a, b) in enumerate(zip(pts, pts[1:])):
        d = _unit(a, b)
        w = style.width(*d)
        if end == 'wing' and i == len(pts) - 2:          # 燕尾：最後一段縮回，尖端另外補
            parts.append(_wing_cap(b, d, w))
            b = (b[0] - d[0] * 2 * w / T, b[1] - d[1] * 2 * w / T)
        nx, ny = -d[1] * w / 2, d[0] * w / 2
        parts.append(Polygon([(a[0] + nx, a[1] + ny), (b[0] + nx, b[1] + ny),
                              (b[0] - nx, b[1] - ny), (a[0] - nx, a[1] - ny)]))
        segs.append((d, w))
    joints = list(zip(pts[1:], segs, segs[1:]))
    if len(pts) > 2 and pts[0] == pts[-1]:              # 封閉折線，起點也要接角
        joints.append((pts[0], segs[-1], segs[0]))
    for p, (d1, w1), (d2, w2) in joints:
        c = _corner(p, d1, w1, d2, w2, limit)
        if c is not None:
            parts.append(c)
    return unary_union(parts)


def ring_polygon(cx, cy, r, style: Style, n: int = 64) -> Polygon:
    """圓環：切線水平處（上下）細，切線垂直處（左右）粗"""
    outer, inner = [], []
    for i in range(n):
        a = 2 * pi * i / n
        w = style.width(-sin(a), cos(a))
        outer.append((cx + (r + w / 2) * cos(a), cy + (r + w / 2) * sin(a)))
        inner.append((cx + max(0.1, r - w / 2) * cos(a), cy + max(0.1, r - w / 2) * sin(a)))
    return Polygon(outer, [inner])


def prim_to_polygon(prim: Tuple[str, Any], style: Style = MONO) -> Any:
    """將單個原子圖元轉換為 Shapely 幾何多邊形"""
    kind, data, *_ = prim
    a = attrs(prim)
    if a.get('w', 1.0) != 1.0:                          # 這一筆有自己的粗細倍數
        style = replace(style, t=style.t * a['w'])
    if kind == 'bar':
        end = a.get('end')
        return stroke_polygon(data, style, dict(style.terminals).get(end, end))
    elif kind == 'dot':
        cx, cy, r = data                                 # 點的大小跟這個字重的筆寬走
        return Polygon(dot_outline(cx, cy, r * style.t / T))
    elif kind == 'ring':
        return ring_polygon(*data, style)
    return None


def glyph_to_outline(prims: List[Tuple[str, Any]], style: Style = MONO) -> Any:
    """將一組圖元（字形）轉換並合併為無重疊縫隙的封閉輪廓（Polygon 或 MultiPolygon）"""
    polys = []
    for p in prims:
        geom = prim_to_polygon(p, style)
        if geom is not None and not geom.is_empty:
            polys.append(geom)
    if not polys:
        return Polygon()
    merged = unary_union(polys)
    # 聯集偶爾留下面積為 0 的碎洞（浮點誤差），清掉
    parts = [merged] if merged.geom_type == 'Polygon' else list(merged.geoms)
    parts = [Polygon(p.exterior, [r for r in p.interiors if Polygon(r).area > 1e-3]) for p in parts]
    return parts[0] if len(parts) == 1 else unary_union(parts)


def draw_shapely_to_pen(geom: Any, pen: TTGlyphPen, body: float):
    """將 Shapely 幾何形狀寫入 TrueType Glyph Pen，並完成座標系對齊"""
    if geom.is_empty:
        return
    ox, oy = ADVANCE_WIDTH / 2 - 50 * body, 450 - 50 * body

    polygons = [geom] if geom.geom_type == 'Polygon' else list(geom.geoms)
    for poly in polygons:
        # 外輪廓 (Exterior) + 孔洞 (Interiors)
        rings = [poly.exterior] + list(poly.interiors)
        for ring in rings:
            coords = list(ring.coords)[:-1]
            if len(coords) < 3:
                continue
            # 座標轉換：100x100 網格 -> 1000 UPM TrueType 空間（Y 軸向上翻轉）
            first_pt = (
                round(coords[0][0] * body + ox),
                round((100.0 - coords[0][1]) * body + oy)
            )
            pen.moveTo(first_pt)
            for x, y in coords[1:]:
                pt = (
                    round(x * body + ox),
                    round((100.0 - y) * body + oy)
                )
                pen.lineTo(pt)
            pen.closePath()


def build_font(
    glyphs_dict: Dict[str, List[Tuple[str, Any]]],
    output_ttf: Path,
    output_woff2: Path,
    family_name: str = "AlchemyGallery",
    style_name: str = "Regular",
    style: Style = MONO,
    style_for: Optional[Dict[str, Style]] = None
):
    """
    從 Python 字形字典編譯並匯出標準 TrueType (.ttf) 與 WebFont (.woff2)
    style_for 可以讓個別的字用另一組筆畫規則（例如鎖住字標四字）
    """
    style_for = style_for or {}
    fb = FontBuilder(UPM, isTTF=True)

    # 1. 整理字形名稱與 Unicode 映射表
    glyph_order = ['.notdef', 'space']
    cmap: Dict[int, str] = {0x0020: 'space'}
    glyf_dict = {}
    metrics_dict = {}

    # 建立 .notdef 字形（幾何線框）
    notdef_pen = TTGlyphPen(None)
    notdef_pen.moveTo((100, 50))
    notdef_pen.lineTo((100, 850))
    notdef_pen.lineTo((900, 850))
    notdef_pen.lineTo((900, 50))
    notdef_pen.closePath()
    notdef_pen.moveTo((150, 100))
    notdef_pen.lineTo((850, 100))
    notdef_pen.lineTo((850, 800))
    notdef_pen.lineTo((150, 800))
    notdef_pen.closePath()
    glyf_dict['.notdef'] = notdef_pen.glyph()
    metrics_dict['.notdef'] = (ADVANCE_WIDTH, 100)

    # 建立空白 space
    space_pen = TTGlyphPen(None)
    glyf_dict['space'] = space_pen.glyph()
    metrics_dict['space'] = (500, 0)

    # 2. 逐一轉換註冊的漢字
    for ch, prims in glyphs_dict.items():
        code = ord(ch)
        glyph_name = f'uni{code:04X}'
        glyph_order.append(glyph_name)
        cmap[code] = glyph_name

        outline = glyph_to_outline(prims, style_for.get(ch, style))
        pen = TTGlyphPen(None)
        draw_shapely_to_pen(outline, pen, style.body)
        glyf_dict[glyph_name] = pen.glyph()
        metrics_dict[glyph_name] = (ADVANCE_WIDTH, int(ADVANCE_WIDTH / 2 - 50 * style.body))

    # 3. 裝配 OpenType 表
    fb.setupGlyphOrder(glyph_order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyf_dict)
    fb.setupHorizontalMetrics(metrics_dict)
    ascent = max(880, int(450 + 50 * style.body) + 10)  # 字身放大時，頂端不能超出 ascent 被裁掉
    fb.setupHorizontalHeader(ascent=ascent, descent=-120)
    fb.setupNameTable({
        'familyName': family_name,
        'styleName': style_name,
        'uniqueFontIdentifier': f'{family_name}-{style_name}-1.0',
        'fullName': f'{family_name} {style_name}',
        'psName': f'{family_name}-{style_name}',
        'version': 'Version 1.000',
    })
    fb.setupOS2(
        sTypoAscender=ascent,
        sTypoDescender=-120,
        usWinAscent=ascent,
        usWinDescent=120,
        sxHeight=500,
        sCapHeight=700
    )
    fb.setupPost()

    # 4. 匯出檔案
    font = fb.font
    output_ttf.parent.mkdir(parents=True, exist_ok=True)
    
    # 存為 TTF
    font.flavor = None
    font.save(str(output_ttf))

    # 存為 WOFF2
    font.flavor = 'woff2'
    font.save(str(output_woff2))
    
    return len(glyphs_dict)
