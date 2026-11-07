"""Momo — piksel art uygulama ikonu (32x32 grid, 512px'e nearest-neighbor)."""

from __future__ import annotations

import os

from PIL import Image, ImageDraw, ImageFont

GRID = 32
SCALE = 16
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "icon-concepts")

BG = (14, 124, 140, 255)
BG_DEEP = (10, 92, 105, 255)
HOOD = (247, 251, 252, 255)
HOOD_SH = (203, 227, 231, 255)
HAIR = (27, 74, 84, 255)
HAIR_HI = (44, 107, 119, 255)
SKIN = (255, 228, 214, 255)
SKIN_SH = (243, 201, 184, 255)
EYE_W = (255, 255, 255, 255)
IRIS = (14, 124, 140, 255)
PUPIL = (18, 51, 59, 255)
BLUSH = (240, 123, 164, 255)
SCARF = (240, 123, 164, 255)
SCARF_SH = (212, 80, 124, 255)
MOUTH = (194, 90, 119, 255)
OUTLINE = (8, 46, 54, 255)


def draw_icon() -> Image.Image:
    img = Image.new("RGBA", (GRID, GRID), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # zemin (yuvarlatılmış köşeler piksel adımlarıyla)
    d.rectangle((2, 0, 29, 31), fill=BG)
    d.rectangle((0, 2, 31, 29), fill=BG)
    d.rectangle((1, 1, 30, 30), fill=BG)

    # kapüşon
    d.rounded_rectangle((4, 1, 27, 21), radius=5, fill=OUTLINE)
    d.rounded_rectangle((5, 2, 26, 20), radius=4, fill=HOOD)
    d.rectangle((5, 14, 6, 19), fill=HOOD_SH)
    d.rectangle((25, 14, 26, 19), fill=HOOD_SH)

    # yüz
    d.rectangle((9, 7, 22, 20), fill=OUTLINE)
    d.rectangle((10, 8, 21, 19), fill=SKIN)
    d.rectangle((10, 8, 21, 9), fill=HAIR)

    # saç (kahküller, dişli alt kenar)
    depths = {10: 4, 11: 5, 12: 4, 13: 6, 14: 4, 15: 5, 16: 4, 17: 6, 18: 4, 19: 5, 20: 4, 21: 5}
    for x, depth in depths.items():
        d.rectangle((x, 8, x, 7 + depth), fill=HAIR)
    # yan tutamlar
    d.rectangle((8, 9, 9, 17), fill=HAIR)
    d.rectangle((22, 9, 23, 17), fill=HAIR)
    d.rectangle((9, 8, 9, 8), fill=HAIR_HI)
    d.rectangle((21, 8, 21, 8), fill=HAIR_HI)

    # gözler
    for ex in (11, 18):
        d.rectangle((ex, 12, ex + 3, 15), fill=OUTLINE)
        d.rectangle((ex + 1, 13, ex + 3, 15), fill=EYE_W)
        d.rectangle((ex + 1, 13, ex + 2, 15), fill=IRIS)
        d.rectangle((ex + 1, 14, ex + 2, 15), fill=PUPIL)
        d.rectangle((ex + 1, 13, ex + 1, 13), fill=EYE_W)

    # allık
    d.rectangle((10, 16, 11, 17), fill=BLUSH)
    d.rectangle((20, 16, 21, 17), fill=BLUSH)

    # ağız
    d.rectangle((15, 18, 16, 18), fill=MOUTH)

    # atkı
    d.rectangle((4, 19, 27, 26), fill=OUTLINE)
    d.rectangle((5, 20, 26, 25), fill=SCARF)
    d.rectangle((5, 20, 26, 21), fill=SCARF_SH)
    d.rectangle((13, 20, 18, 25), fill=(249, 195, 214, 255))
    d.rectangle((14, 21, 17, 24), fill=SCARF)
    d.rectangle((14, 21, 17, 22), fill=(249, 195, 214, 255))

    return img


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    icon = draw_icon()
    big = icon.resize((512, 512), Image.NEAREST)
    big.save(os.path.join(OUT, "6-pixel-momo.png"))

    # önizleme sayfası
    sheet = Image.new("RGB", (700, 340), (246, 249, 250))
    d = ImageDraw.Draw(sheet)
    font = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 20)
    x = 24
    for size, label in [(256, "256"), (128, "128"), (64, "64"), (32, "32"), (16, "16")]:
        thumb = big.resize((size, size), Image.NEAREST)
        sheet.paste(thumb, (x, 40), thumb)
        d.text((x, 40 + size + 8), f"{label}px", font=font, fill=(18, 51, 59))
        x += size + 24
    sheet.save(os.path.join(OUT, "pixel-momo-preview.png"))
    print("ok", OUT)


if __name__ == "__main__":
    main()
