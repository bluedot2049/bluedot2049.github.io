"""煉金體（Alchemy Font）幾何圖元與變換核心

3 種原子筆劃（Primitives）：
  bar:  骨架折線，筆寬由字重決定；收筆形狀另外指定（見下）
  dot:  45° 旋轉菱形點
  ring: 圓環（煉金/天文符號同心圓）

收筆（仿 GlyphWiki KAGE 把線型和收筆形狀分開）：
  bar(..., end='wing')       燕尾：右端斜切上翹。wing(x0, x1, y) 是它的簡寫
  bar(..., end='hook_left')  豎鉤，往左上勾
  bar(..., end='hook_up')    豎彎鉤、臥鉤，往上勾
  bar(..., end='lift')       提，往右上挑
收筆的長度、角度是固定的，跟著筆寬走，不隨部件縮放變形。字重可以整組替換收筆
（例如符號感的字重把燕尾換成平頭），見 style.py。

筆劃可以帶屬性：(kind, data, {'w': 粗細倍數, 'end': 收筆})，省略就是預設值。
"""
from typing import Any, Dict, List, Tuple

T = 7.5  # 預設筆畫粗細
DOT_R = 0.62 * T  # 菱形點外接半徑：跟筆寬掛勾，部件縮放時不變

# 鉤、提的方向（單位向量，y 向下）與長度（筆寬的倍數）
HOOKS: Dict[str, Tuple[Tuple[float, float], float]] = {
    'hook_left': ((-0.77, -0.64), 1.6),
    'hook_up': ((0.0, -1.0), 1.5),
    'lift': ((0.95, -0.32), 1.8),
}


def bar(*pts: Tuple[float, float], end: str = None) -> Tuple:
    """折線或直線，由多個 (x, y) 座標點構成；end 是收筆形狀"""
    return ('bar', pts, {'end': end}) if end else ('bar', pts)

def wing(x0: float, x1: float, y: float) -> Tuple:
    """主橫劃：右端斜切上翹的燕尾橫"""
    return bar((x0, y), (x1, y), end='wing')

def dot(cx: float, cy: float, r: float = DOT_R) -> Tuple:
    """菱形點：中心 (cx, cy)，外接半徑 r"""
    return ('dot', (cx, cy, r))

def ring(cx: float, cy: float, r: float) -> Tuple:
    """圓環：中心 (cx, cy)，半徑 r，線寬同 T"""
    return ('ring', (cx, cy, r))

def attrs(prim: Tuple) -> Dict[str, Any]:
    return prim[2] if len(prim) > 2 else {}

def with_attrs(prim: Tuple, **changes) -> Tuple:
    """改筆劃屬性；值為 None 或預設值的屬性拿掉"""
    a = {k: v for k, v in {**attrs(prim), **changes}.items() if v is not None and not (k == 'w' and v == 1.0)}
    return (prim[0], prim[1], a) if a else (prim[0], prim[1])

def weight_of(prim: Tuple) -> float:
    return attrs(prim).get('w', 1.0)

def with_weight(prim: Tuple, k: float) -> Tuple:
    return with_attrs(prim, w=k)

def end_of(prim: Tuple) -> str:
    return attrs(prim).get('end')

def dot_outline(cx: float, cy: float, r: float) -> List[Tuple[float, float]]:
    """菱形點的外框頂點"""
    return [(cx, cy - r), (cx + r, cy), (cx, cy + r), (cx - r, cy)]

def bbox(prims: List[Tuple[str, Any]]) -> Tuple[float, float, float, float]:
    """一組筆劃的骨架外框 (x0, y0, x1, y1)，不含筆寬與收筆"""
    xs, ys = [], []
    for kind, a, *_ in prims:
        if kind == 'bar':
            xs += [x for x, _ in a]
            ys += [y for _, y in a]
        elif kind in ('dot', 'ring'):
            cx, cy, r = a
            xs += [cx - r, cx + r]
            ys += [cy - r, cy + r]
    return min(xs), min(ys), max(xs), max(ys)

def num(v: float) -> str:
    """浮點數格式化，去除多餘的 0"""
    return f'{v:.2f}'.rstrip('0').rstrip('.')

def transform_primitive(prim: Tuple[str, Any], sx: float, sy: float, ox: float, oy: float) -> Tuple[str, Any]:
    """將單一筆劃依照縮放 (sx, sy) 與位移 (ox, oy) 進行幾何變換（屬性照抄）"""
    kind, data, *rest = prim
    if kind == 'bar':
        data = tuple((x * sx + ox, y * sy + oy) for x, y in data)
    elif kind == 'dot':
        cx, cy, r = data
        data = (cx * sx + ox, cy * sy + oy, r)
    elif kind == 'ring':
        cx, cy, r = data
        avg_s = (abs(sx) + abs(sy)) / 2
        data = (cx * sx + ox, cy * sy + oy, r * avg_s)
    return (kind, data, *rest)

def transform(prims: List[Tuple[str, Any]], sx: float = 1.0, sy: float = 1.0, ox: float = 0.0, oy: float = 0.0) -> List[Tuple[str, Any]]:
    """批次幾何變換一組筆劃（如部件或整字）"""
    return [transform_primitive(p, sx, sy, ox, oy) for p in prims]

def shift(prims: List[Tuple[str, Any]], dx: float = 0.0, dy: float = 0.0) -> List[Tuple[str, Any]]:
    """平移一組筆劃"""
    return transform(prims, sx=1.0, sy=1.0, ox=dx, oy=dy)

def scale(prims: List[Tuple[str, Any]], sx: float = 1.0, sy: float = 1.0, cx: float = 50.0, cy: float = 50.0) -> List[Tuple[str, Any]]:
    """以 (cx, cy) 為中心縮放一組筆劃"""
    return transform(prims, sx=sx, sy=sy, ox=cx * (1 - sx), oy=cy * (1 - sy))

def render_svg_elements(prims: List[Tuple[str, Any]], ox: float = 0.0, oy: float = 0.0, paint: str = 'currentColor', t: float = T) -> str:
    """將圖元序列渲染為 SVG path（用和字型相同的輪廓）"""
    from .exporter import glyph_to_outline
    from .style import Style
    outline = glyph_to_outline(transform(prims, ox=ox, oy=oy), Style('svg', t=t))
    parts = [outline] if outline.geom_type == 'Polygon' else list(outline.geoms)
    d = ''.join('M' + ' L'.join(f'{num(x)} {num(y)}' for x, y in list(r.coords)[:-1]) + 'Z'
                for p in parts for r in [p.exterior, *p.interiors])
    return f'<path d="{d}" fill="{paint}" fill-rule="evenodd"/>'
