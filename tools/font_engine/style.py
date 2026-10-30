"""字重（Style）：一組筆畫規則

同一套骨架，換一組 Style 就是另一個字重。
  t         豎筆筆寬
  contrast  橫筆筆寬 ÷ 豎筆筆寬。1.0 是等粗；小於 1 就是「橫細豎粗」，
            斜筆按角度在兩者之間過渡。密的字（境、竟）靠這條規則透氣。
  body      100 格放大成字型單位的倍數（字身大小，1000 UPM）。字身置中在 500, 450。
  terminals 收筆替換表，例如 (('wing', None),) 把燕尾換成平頭。

Text 的數值是量出來的：12–20px 渲染後算「糊度」（有墨像素裡中間灰的比例），
在筆寬、橫豎比、字身的組合裡，取糊度最低、又能通過留白檢查的那組。
結論是小字要字身大、等粗：細筆在 1px 以下只會變淡，橫細豎粗是大字才看得到的細節。
"""
from dataclasses import dataclass
from math import hypot
from typing import Optional, Tuple

from .primitives import T


@dataclass(frozen=True)
class Style:
    name: str
    t: float = T
    contrast: float = 1.0
    body: float = 8.2
    terminals: Tuple[Tuple[str, Optional[str]], ...] = ()

    def width(self, dx: float, dy: float) -> float:
        """方向 (dx, dy) 的筆畫寬度：水平最細，垂直最粗"""
        length = hypot(dx, dy)
        steep = abs(dy) / length if length else 1.0
        return self.t * (self.contrast + (1 - self.contrast) * steep)


MONO = Style('Mono')                                   # 等粗，舊版的樣子
DISPLAY = Style('Display', t=T, contrast=0.82)         # 標題、字標，24px 以上
TEXT = Style('Text', t=7.0, contrast=1.0, body=8.8)   # 小字，24px 以下
