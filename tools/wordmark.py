"""煉金畫廊的字標：四個字用同一組模組拼出來，改這裡再跑一次就會更新 assets 裡的圖。

    python tools/wordmark.py

模組
  bar   直線或折線，一樣粗，平頭
  wing  主橫：右端往上斜切成尖，從毛筆的燕尾簡化來
  dot   菱形點
  ring  圓環，煉金術符號裡的圓
每個字畫在 100×100 的格子裡（扁體 100×72），座標是筆畫中線。
"""
from pathlib import Path

T = 7.5        # 筆畫粗細
GAP = 18       # 字距
BOX = 100
OUT = Path(__file__).resolve().parent.parent / 'assets'


def bar(*pts):
    return ('bar', pts)


def wing(x0, x1, y):
    return ('wing', (x0, x1, y))


def dot(cx, cy, r=6.2):
    return ('dot', (cx, cy, r))


def ring(cx, cy, r):
    return ('ring', (cx, cy, r))


GLYPHS = {
    '煉': [
        # 火
        bar((5, 27), (10, 38)),
        bar((33, 24), (27, 37)),
        bar((19, 4), (19, 56), (4, 86)),
        bar((23, 63), (31, 75)),
        # 柬
        wing(41, 96, 11),
        bar((48, 26), (92, 26), (92, 52), (48, 52), (48, 26 - T / 2)),
        bar((70, 1), (70, 96)),
        dot(58, 39, 4.6), dot(82, 39, 4.6),
        bar((68, 54), (45, 82)),
        bar((72, 54), (97, 82)),
    ],
    '金': [
        bar((2, 42), (50, 5), (98, 42)),
        bar((30, 46), (70, 46)),
        bar((24, 64), (76, 64)),
        bar((50, 46), (50, 87)),
        bar((33, 71), (40, 80)),
        bar((67, 71), (60, 80)),
        wing(6, 92, 87),
    ],
    # 田換成 ⊕
    '画': [
        wing(5, 93, 8),
        bar((10, 28), (10, 88), (90, 88), (90, 28)),
        ring(50, 48, 21),
        bar((50, 27), (50, 69)),
        bar((29, 48), (71, 48)),
    ],
    '廊': [
        dot(54, 3, 5),
        wing(7, 96, 15),
        bar((7 + T / 2, 15), (7 + T / 2, 60), (2, 90)),
        # 良
        bar((26, 31), (56, 31), (56, 59), (26, 59)),
        bar((26, 45), (56, 45)),
        bar((26, 31 - T / 2), (26, 86), (36, 79)),
        bar((42, 66), (58, 86)),
        # 阝
        bar((70, 31 - T / 2), (70, 96)),
        bar((70, 31), (90, 31), (80, 47), (94, 61), (82, 74)),
    ],
}

# 扁體：格子 100×72，筆畫細一點；擠的地方（金的下半、良）重排，不是直接壓扁
FLAT_H = 72
FT = 7
FLAT = {
    '煉': [
        bar((5, 19), (10, 28)),
        bar((33, 17), (27, 27)),
        bar((19, 2), (19, 40), (3, 63)),
        bar((23, 45), (32, 55)),
        wing(41, 96, 8),
        bar((48, 19), (92, 19), (92, 38), (48, 38), (48, 19 - FT / 2)),
        bar((70, 0), (70, 70)),
        dot(58, 28.5, 3.8), dot(82, 28.5, 3.8),
        bar((68, 40), (44, 60)),
        bar((72, 40), (97, 60)),
    ],
    '金': [
        bar((2, 31), (50, 3), (98, 31)),
        bar((30, 33), (70, 33)),
        bar((24, 45), (76, 45)),
        bar((50, 33), (50, 66)),
        dot(36, 55.5, 4), dot(64, 55.5, 4),
        wing(6, 92, 66),
    ],
    '画': [
        wing(5, 93, 5),
        bar((10, 20), (10, 66), (90, 66), (90, 20)),
        ring(50, 38, 15.5),
        bar((50, 22.5), (50, 53.5)),
        bar((34.5, 38), (65.5, 38)),
    ],
    '廊': [
        dot(54, 1, 3.6),
        wing(7, 96, 12),
        bar((7 + FT / 2, 12), (7 + FT / 2, 42), (2, 66)),
        bar((26, 22), (56, 22), (56, 44), (26, 44)),
        bar((26, 33), (56, 33)),
        bar((26, 22 - FT / 2), (26, 64), (36, 58)),
        bar((42, 49), (58, 64)),
        bar((70, 22 - FT / 2), (70, 70)),
        bar((70, 22), (90, 22), (81, 33), (94, 44), (83, 54)),
    ],
}


def gold(h=BOX):
    return ('<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="' + str(h) + '" gradientUnits="userSpaceOnUse">'
            '<stop offset="0" stop-color="#f6dba6"/><stop offset=".5" stop-color="#e8b86a"/>'
            '<stop offset="1" stop-color="#a9763a"/></linearGradient></defs>')


def num(v):
    return f'{v:.2f}'.rstrip('0').rstrip('.')


def path(pts, ox):
    return 'M' + ' L'.join(f'{num(x + ox)} {num(y)}' for x, y in pts)


def glyph(prims, ox, paint, t):
    out = []
    for kind, a in prims:
        if kind == 'bar':
            out.append(f'<path d="{path(a, ox)}" fill="none" stroke="{paint}" stroke-width="{t}" stroke-miterlimit="10"/>')
        elif kind == 'wing':
            x0, x1, y = a
            top, bot = y - t / 2, y + t / 2
            # 上緣先收、右端斜切上翹
            pts = [(x0, top), (x1 - 8, top), (x1 + 2, top - 4), (x1 - 2, bot), (x0, bot)]
            out.append(f'<path d="{path(pts, ox)}Z" fill="{paint}"/>')
        elif kind == 'dot':
            cx, cy, r = a
            out.append(f'<path d="{path([(cx, cy - r), (cx + r, cy), (cx, cy + r), (cx - r, cy)], ox)}Z" fill="{paint}"/>')
        elif kind == 'ring':
            cx, cy, r = a
            out.append(f'<circle cx="{num(cx + ox)}" cy="{num(cy)}" r="{num(r)}" fill="none" stroke="{paint}" stroke-width="{t}"/>')
    return ''.join(out)


def wordmark(paint, defs='', glyphs=GLYPHS, h=BOX, t=T, text='煉金画廊', pad=8):
    w = len(text) * BOX + (len(text) - 1) * GAP
    body = ''.join(glyph(glyphs[ch], i * (BOX + GAP), paint, t) for i, ch in enumerate(text))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{-pad} {-pad} {w + 2 * pad} {h + 2 * pad}" '
            f'width="{w + 2 * pad}" height="{h + 2 * pad}"><title>煉金畫廊</title>{defs}{body}</svg>\n')


# 小圖示只放「金」，筆畫加粗，縮到 16px 還看得出來
def icon(pad=14, t=9):
    s = BOX + 2 * pad
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{-pad} {-pad} {s} {s}" width="{s}" height="{s}">'
            f'{gold()}<rect x="{-pad}" y="{-pad}" width="{s}" height="{s}" fill="#1c130d"/>'
            f'{glyph(GLYPHS["金"], 0, "url(#g)", t)}</svg>\n')


if __name__ == '__main__':
    flat = dict(glyphs=FLAT, h=FLAT_H, t=FT)
    files = {
        'wordmark-gold.svg': wordmark('url(#g)', gold()),
        'wordmark-light.svg': wordmark('#fff0d7'),
        'wordmark-ink.svg': wordmark('#120c08'),
        'wordmark-flat-gold.svg': wordmark('url(#g)', gold(FLAT_H), **flat),
        'wordmark-flat-light.svg': wordmark('#fff0d7', **flat),
        'wordmark-flat-ink.svg': wordmark('#120c08', **flat),
        'favicon.svg': icon(),
    }
    for name, svg in files.items():
        (OUT / name).write_text(svg, encoding='utf-8')
        print(OUT / name)
