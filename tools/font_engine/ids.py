"""結構式組字（IDS, Ideographic Description Sequence）

字不再手寫座標，只寫結構：
    compose('⿰木木')   林
    compose('⿲彳朮亍') 術
    compose('⿱宀至')   室

每個部件登記它在不同位置的寫法（Form）：當左偏旁時怎麼收、佔多少份量、
在另一個方向上佔格子的哪一段。組字器照下面的規則把它們排進格子：

  份量分配   沿分割方向，格子按各部件的 weight 分；部件之間留 GAP 的白
  左收右放   ⿰⿲ 的最左部件、⿱⿳ 的最上部件，份量打 YIELD 折
  主筆唯一   一字不二長：整個字只留最長的那一道燕尾，其餘燕尾改成平橫
"""
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Tuple, Union

from .primitives import T, end_of, with_attrs
from .layouts import fit
from .components import (
    COMP_WOOD, RAD_WOOD_LEFT, COMP_SUN, COMP_MOON, RAD_WATER_LEFT, COMP_LIANG,
    COMP_LIANG_LEFT, RAD_STEP_LEFT, BODY_SHU, RAD_CHU_RIGHT, RAD_GRAIN_LEFT, COMP_BI,
    RAD_ROOF_MIAN, COMP_ZHI, COMP_EARTH, RAD_EARTH_LEFT, COMP_JING, RAD_EAR_RIGHT,
)

Prims = List[Tuple[str, Any]]

GAP = 1.0 * T     # 部件之間的白；比留白門檻（0.8t）寬，後面的字面修正縮小時才不會跌破
YIELD = 0.88      # 左收右放、上緊下鬆


@dataclass(frozen=True)
class Form:
    prims: Prims
    weight: float = 1.0                       # 沿分割方向佔的份量
    span: Tuple[float, float] = (0.0, 1.0)    # 在另一個方向上佔格子的哪一段


# 部件在各位置的寫法；沒登記的位置用 full
FORMS: Dict[str, Dict[str, Form]] = {
    '木': {'full': Form(COMP_WOOD), 'left': Form(RAD_WOOD_LEFT, 0.8)},
    '日': {'full': Form(COMP_SUN), 'left': Form(COMP_SUN, 0.75, span=(0.16, 0.76))},
    '月': {'full': Form(COMP_MOON)},
    '氵': {'left': Form(RAD_WATER_LEFT, 0.42)},
    '良': {'full': Form(COMP_LIANG), 'left': Form(COMP_LIANG_LEFT, 0.95)},
    '彳': {'left': Form(RAD_STEP_LEFT, 0.4, span=(0.04, 0.96))},
    '朮': {'full': Form(BODY_SHU, 0.85)},
    '亍': {'right': Form(RAD_CHU_RIGHT, 0.4, span=(0.06, 0.96))},
    '禾': {'left': Form(RAD_GRAIN_LEFT, 0.66)},
    '必': {'full': Form(COMP_BI)},
    '宀': {'top': Form(RAD_ROOF_MIAN, 0.68)},
    '至': {'full': Form(COMP_ZHI), 'bottom': Form(COMP_ZHI, span=(0.1, 0.9))},
    '土': {'full': Form(COMP_EARTH), 'left': Form(RAD_EARTH_LEFT, 0.55)},
    '竟': {'full': Form(COMP_JING)},
    '阝': {'right': Form(RAD_EAR_RIGHT, 0.42)},
}

# 結構符號：(子部件數, 分割方向, 各子部件的位置名)
OPERATORS = {
    '⿰': (2, 'x', ('left', 'right')),
    '⿲': (3, 'x', ('left', 'mid', 'right')),
    '⿱': (2, 'y', ('top', 'bottom')),
    '⿳': (3, 'y', ('top', 'mid', 'bottom')),
}

Node = Union[str, Tuple[str, list]]


def parse(ids: str) -> Node:
    def walk(i: int) -> Tuple[Node, int]:
        ch = ids[i]
        if ch not in OPERATORS:
            return ch, i + 1
        children, i = [], i + 1
        for _ in range(OPERATORS[ch][0]):
            child, i = walk(i)
            children.append(child)
        return (ch, children), i
    node, end = walk(0)
    assert end == len(ids), f'結構式多出字元：{ids}'
    return node


def form_of(node: Node, role: str) -> Form:
    if isinstance(node, tuple):
        return Form([])                       # 巢狀結構：份量 1、佔滿
    forms = FORMS[node]
    return forms.get(role) or forms['full']


def layout(node: Node, box: Tuple[float, float, float, float], role: str = 'full') -> Prims:
    x, y, w, h = box
    if not isinstance(node, tuple):
        f = form_of(node, role)
        return fit(f.prims, x, y, w, h)

    op, children = node
    _, axis, roles = OPERATORS[op]
    forms = [form_of(c, r) for c, r in zip(children, roles)]
    weights = [f.weight for f in forms]
    weights[0] *= YIELD
    length = (w if axis == 'x' else h) - GAP * (len(children) - 1)

    out, cursor = [], (x if axis == 'x' else y)
    for child, r, f, wt in zip(children, roles, forms, weights):
        size = length * wt / sum(weights)
        a, b = f.span
        if axis == 'x':
            cell = (cursor, y + a * h, size, (b - a) * h)
        else:
            cell = (x + a * w, cursor, (b - a) * w, size)
        out += layout(child, cell, r)
        cursor += size + GAP
    return out


# ------------------------------------------------------------------
# 整字規則：組完以後套用，順序就是這個清單的順序
# ------------------------------------------------------------------

def one_main_stroke(prims: Prims) -> Prims:
    """一字不二長：只留最長的燕尾，其餘改成平頭"""
    wings = [i for i, p in enumerate(prims) if end_of(p) == 'wing']
    if len(wings) < 2:
        return prims
    main = max(wings, key=lambda i: abs(prims[i][1][-1][0] - prims[i][1][0][0]))
    return [with_attrs(p, end=None) if i in wings and i != main else p for i, p in enumerate(prims)]


RULES: List[Callable[[Prims], Prims]] = [one_main_stroke]


def compose(ids: str) -> Prims:
    prims = layout(parse(ids), (0.0, 0.0, 100.0, 100.0))
    for rule in RULES:
        prims = rule(prims)
    return prims
