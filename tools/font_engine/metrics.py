"""評分表：一組字放在一起時，均不均勻

  墨量   字的墨跡面積佔 100×100 格的百分比。排成一行時，墨量差太多會出現黑塊和空洞
  重心   墨跡重心的高度（y 向下）。重心忽高忽低，一行字會上下跳
  字面   墨跡外框的寬高
  視覺大小  凸包面積開根號。框形的字（日、門）凸包飽滿，看起來大；開放的字（土、火）看起來小

單字的數字本身沒有對錯，要看的是整組的分散程度（標準差）。
"""
from statistics import mean, pstdev
from typing import Any, Dict, List, Tuple

from .exporter import glyph_to_outline
from .lint import lint_glyph
from .style import Style, DISPLAY


def is_hanzi(ch: str) -> bool:
    return 0x4E00 <= ord(ch) <= 0x9FFF


def measure(prims: List[Tuple[str, Any]], style: Style = DISPLAY) -> Dict[str, float]:
    o = glyph_to_outline(prims, style)
    x0, y0, x1, y1 = o.bounds
    return {
        'ink': o.area / 100,
        'cy': o.centroid.y,
        'w': x1 - x0,
        'h': y1 - y0,
        'size': o.convex_hull.area ** 0.5,
    }


def scorecard(glyphs: Dict[str, List[Tuple[str, Any]]], style: Style = DISPLAY,
              style_for: Dict[str, Style] = None) -> Dict[str, Any]:
    style_for = style_for or {}
    rows = {ch: measure(p, style_for.get(ch, style)) for ch, p in glyphs.items() if is_hanzi(ch)}
    col = lambda k: [r[k] for r in rows.values()]
    issues = sum(len(lint_glyph(glyphs[ch], style_for.get(ch, style))) for ch in rows)
    return {
        'rows': rows,
        'ink_sd': pstdev(col('ink')), 'ink_mean': mean(col('ink')),
        'cy_sd': pstdev(col('cy')), 'cy_mean': mean(col('cy')),
        'size_sd': pstdev(col('size')), 'size_mean': mean(col('size')),
        'lint': issues,
    }


def summary(card: Dict[str, Any]) -> str:
    return (f"墨量 {card['ink_mean']:.1f}±{card['ink_sd']:.2f}%  "
            f"重心 {card['cy_mean']:.1f}±{card['cy_sd']:.2f}  "
            f"視覺大小 {card['size_mean']:.1f}±{card['size_sd']:.2f}  "
            f"留白問題 {card['lint']} 處")
