"""地下室的縮圖圖集：把 rooms/00-cellar/room.json 裡每幅的 image 縮成小圖，拼成一張 webp

執行方式：
    python tools/cellar-thumbs.py            照 room.json 重做
    python tools/cellar-thumbs.py --cell 192 一格多大（預設 256）

產生：
    rooms/00-cellar/thumbs.webp   圖集，一格一幅，長邊貼滿一格（少四個像素的邊）
    rooms/00-cellar/thumbs.json   每幅在圖集裡的位置 {src, w, h, rects: {image: [x, y, w, h]}}
並在 room.json 寫上 "thumbs": "thumbs.json"（遊戲看到這個才去下載，見 js/zones/gallery/cellar.js）。
原圖不動，看畫時點進去才載原圖。
"""
import argparse
import json
import math
import os
import sys

from PIL import Image

if sys.stdout.encoding.lower() != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOM = os.path.join(ROOT, 'rooms', '00-cellar')
PAD = 4


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cell', type=int, default=256)
    ap.add_argument('--quality', type=int, default=82)
    args = ap.parse_args()
    cell = args.cell

    path = os.path.join(ROOM, 'room.json')
    with open(path, encoding='utf-8') as f:
        room = json.load(f)
    images = []
    for p in room.get('paintings', []):
        img = p.get('image')
        if img and img not in images:
            if not os.path.exists(os.path.join(ROOM, img)):
                print(f'找不到 {img}（{p.get("title", "")}），跳過')
                continue
            images.append(img)
    if not images:
        print('room.json 裡還沒有 image，先不做圖集')
        return

    cols = 8
    rows = math.ceil(len(images) / cols)
    W = cols * cell
    H = 1 << math.ceil(math.log2(rows * cell))   # 高度補到 2 的次方，手機的 GPU 才能做 mipmap
    atlas = Image.new('RGB', (W, H), (40, 32, 30))
    rects = {}
    for i, img in enumerate(images):
        src = Image.open(os.path.join(ROOM, img)).convert('RGB')
        k = (cell - PAD * 2) / max(src.width, src.height)
        w, h = max(1, round(src.width * k)), max(1, round(src.height * k))
        x = (i % cols) * cell + PAD
        y = (i // cols) * cell + PAD
        # 先貼一張大一圈的墊底，邊緣的顏色往外延，縮小（mipmap）時不會吃到隔壁那格
        atlas.paste(src.resize((w + PAD * 2, h + PAD * 2), Image.LANCZOS), (x - PAD, y - PAD))
        atlas.paste(src.resize((w, h), Image.LANCZOS), (x, y))
        rects[img] = [x, y, w, h]

    atlas.save(os.path.join(ROOM, 'thumbs.webp'), 'WEBP', quality=args.quality, method=6)
    with open(os.path.join(ROOM, 'thumbs.json'), 'w', encoding='utf-8') as f:
        json.dump({'src': 'thumbs.webp', 'w': W, 'h': H, 'rects': rects}, f, ensure_ascii=False, indent=2)
        f.write('\n')
    if room.get('thumbs') != 'thumbs.json':
        room['thumbs'] = 'thumbs.json'
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(room, f, ensure_ascii=False, indent=2)
            f.write('\n')
    size = os.path.getsize(os.path.join(ROOM, 'thumbs.webp'))
    print(f'{len(images)} 幅，圖集 {W}×{H}，{size // 1024} KB')


if __name__ == '__main__':
    main()
