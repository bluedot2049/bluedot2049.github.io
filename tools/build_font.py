"""編譯並輸出「煉金體（Alchemy Gallery Font）」

執行方式：
    python tools/build_font.py

將自動完成：
  1. 將字形庫轉為封閉輪廓並消除交疊線條
  2. 用同一套骨架輸出兩個字重，各自有 .ttf 與 .woff2：
       AlchemyGallery      Display，標題與字標（24px 以上）
       AlchemyGalleryText  Text，內文與按鈕（24px 以下），筆畫較細、橫更細
  3. 生成 css/alchemy-font.css (供網頁直接 @font-face 引用)
  4. 每個字重跑一次留白檢查
"""
import sys
from pathlib import Path

# 確保 Windows 主控台正確輸出 UTF-8 漢字與特殊符號
if sys.stdout.encoding.lower() != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

# 將當前路徑加入模組搜尋路徑
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from tools.font_engine.registry import GLYPH_REGISTRY, LOCKED
from tools.font_engine.metrics import scorecard, summary
from tools.font_engine.style import MONO, DISPLAY, TEXT
from tools.font_engine.exporter import build_font
from tools.font_engine.lint import lint_registry, MIN_GAP, MIN_COUNTER

ASSETS_DIR = ROOT / 'assets'
CSS_DIR = ROOT / 'css'

CSS_PATH = CSS_DIR / 'alchemy-font.css'

# (字族名稱, 筆畫規則, 個別字的例外)；字標四字在 Display 維持等粗，和字標一致
WEIGHTS = [
    ('AlchemyGallery', DISPLAY, {ch: MONO for ch in LOCKED}),
    ('AlchemyGalleryText', TEXT, {}),
]

def generate_css():
    """生成對應的 CSS @font-face 與類別"""
    css_content = """/* 煉金體（Alchemy Gallery Font）- 系統化幾何造字 */
@font-face {
    font-family: 'AlchemyGallery';
    src: url('../assets/AlchemyGallery.woff2') format('woff2'),
         url('../assets/AlchemyGallery.ttf') format('truetype');
    font-weight: normal;
    font-style: normal;
    font-display: swap;
}

/* 小字用：筆畫較細、橫更細，24px 以下比較不會糊 */
@font-face {
    font-family: 'AlchemyGalleryText';
    src: url('../assets/AlchemyGalleryText.woff2') format('woff2'),
         url('../assets/AlchemyGalleryText.ttf') format('truetype');
    font-weight: normal;
    font-style: normal;
    font-display: swap;
}

.alchemy-text {
    font-family: 'AlchemyGallery', serif;
    letter-spacing: 0.18em;
}

.alchemy-small {
    font-family: 'AlchemyGalleryText', serif;
    letter-spacing: 0.24em;
}

.alchemy-gold {
    font-family: 'AlchemyGallery', serif;
    letter-spacing: 0.18em;
    background: linear-gradient(180deg, #f6dba6 0%, #e8b86a 50%, #a9763a 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    display: inline-block;
}
"""
    CSS_PATH.write_text(css_content, encoding='utf-8')
    print(f"[OK] CSS 已更新: {CSS_PATH}")

def main():
    print(f"[*] 開始編譯煉金體字型庫...")
    print(f"[*] 已註冊漢字與符號數量: {len(GLYPH_REGISTRY)} 個")
    print(f"    字符列表: {' '.join(GLYPH_REGISTRY.keys())}")
    
    for family, style, style_for in WEIGHTS:
        ttf, woff2 = ASSETS_DIR / f'{family}.ttf', ASSETS_DIR / f'{family}.woff2'
        build_font(
            glyphs_dict=GLYPH_REGISTRY,
            output_ttf=ttf,
            output_woff2=woff2,
            family_name=family,
            style_name="Regular",
            style=style,
            style_for=style_for,
        )
        print(f"[OK] {family}（{style.name}，筆寬 {style.t:.2f}，橫豎比 {style.contrast}）"
              f" ttf {ttf.stat().st_size} bytes / woff2 {woff2.stat().st_size} bytes")

        free = {ch: p for ch, p in GLYPH_REGISTRY.items() if ch not in LOCKED}
        print(f"    評分（不含字標四字）：{summary(scorecard(free, style))}")

        report = lint_registry(GLYPH_REGISTRY, style, style_for)
        if report:
            print(f"[!] 留白檢查：{len(report)} 個字的白太窄（門檻：筆畫間 {MIN_GAP}t、封閉白 {MIN_COUNTER}t）")
            for ch, issues in report.items():
                for msg in issues:
                    print(f"    {ch}  {msg}")
        else:
            print("[OK] 留白檢查通過")

    generate_css()
    print("[*] 全部編譯完成！字型可直接安裝到 Windows/macOS，或於網頁中直接打字。")

if __name__ == '__main__':
    main()
