"""Modlum Launcher ikon konseptleri — 512px PNG + karşılaştırma sayfası."""

from __future__ import annotations

import os

from PIL import Image, ImageDraw, ImageFont

SIZE = 512
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "icon-concepts")

LAGOON = (14, 124, 140, 255)
LAGOON_DARK = (10, 92, 105, 255)
LAGOON_LIGHT = (95, 198, 210, 255)
PINK = (240, 123, 164, 255)
PINK_DEEP = (212, 80, 124, 255)
CLOUD = (250, 252, 252, 255)
SKIN = (255, 228, 214, 255)
HAIR = (27, 74, 84, 255)


def base(bg=LAGOON) -> Image.Image:
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, SIZE - 1, SIZE - 1), radius=int(SIZE * 0.22), fill=bg)
    return img


def play(d: ImageDraw.ImageDraw, cx: float, cy: float, r: float, color) -> None:
    d.polygon(
        [(cx - r * 0.58, cy - r), (cx - r * 0.58, cy + r), (cx + r * 0.95, cy)],
        fill=color,
    )


def concept_cube_play() -> Image.Image:
    img = base()
    d = ImageDraw.Draw(img)
    cx, cy, s = SIZE * 0.5, SIZE * 0.52, SIZE * 0.3
    top = [(cx, cy - s), (cx + s, cy - s * 0.5), (cx, cy), (cx - s, cy - s * 0.5)]
    left = [(cx - s, cy - s * 0.5), (cx, cy), (cx, cy + s), (cx - s, cy + s * 0.5)]
    right = [(cx + s, cy - s * 0.5), (cx, cy), (cx, cy + s), (cx + s, cy + s * 0.5)]
    d.polygon(top, fill=LAGOON_LIGHT)
    d.polygon(left, fill=LAGOON_DARK)
    d.polygon(right, fill=(20, 112, 127, 255))
    d.ellipse((cx - 74, cy - 44, cx + 74, cy + 104), fill=PINK)
    play(d, cx + 4, cy + 30, 44, CLOUD)
    return img


def concept_cloud_play() -> Image.Image:
    img = base()
    d = ImageDraw.Draw(img)
    cx, cy = SIZE * 0.5, SIZE * 0.55
    for dx, dy, r in [(-92, 6, 78), (0, -34, 104), (98, 4, 82), (48, 44, 72), (-48, 44, 72)]:
        d.ellipse((cx + dx - r, cy + dy - r, cx + dx + r, cy + dy + r), fill=CLOUD)
    d.rounded_rectangle((cx - 170, cy + 10, cx + 170, cy + 108), radius=52, fill=CLOUD)
    play(d, cx + 6, cy + 22, 62, PINK)
    return img


def concept_monogram() -> Image.Image:
    img = base()
    d = ImageDraw.Draw(img)
    font_path = "C:/Windows/Fonts/georgiab.ttf"
    try:
        font = ImageFont.truetype(font_path, 320)
    except OSError:
        font = ImageFont.load_default()
    text = "M"
    box = d.textbbox((0, 0), text, font=font)
    tw, th = box[2] - box[0], box[3] - box[1]
    d.text((SIZE / 2 - tw / 2 - box[0], SIZE / 2 - th / 2 - box[1] - 12), text, font=font, fill=CLOUD)
    d.ellipse((SIZE * 0.63, SIZE * 0.62, SIZE * 0.63 + 46, SIZE * 0.62 + 46), fill=PINK)
    return img


def concept_momo() -> Image.Image:
    img = base()
    d = ImageDraw.Draw(img)
    cx, cy = SIZE * 0.5, SIZE * 0.48
    d.ellipse((cx - 150, cy - 150, cx + 150, cy + 150), fill=CLOUD)
    d.ellipse((cx - 128, cy - 132, cx + 128, cy + 120), fill=SKIN)
    # saç
    d.chord((cx - 140, cy - 160, cx + 140, cy + 40), 180, 360, fill=HAIR)
    d.rectangle((cx - 140, cy - 70, cx - 108, cy + 90), fill=HAIR)
    d.rectangle((cx + 108, cy - 70, cx + 140, cy + 90), fill=HAIR)
    # gözler
    for ex in (cx - 58, cx + 58):
        d.ellipse((ex - 30, cy - 22, ex + 30, cy + 38), fill=CLOUD)
        d.ellipse((ex - 19, cy - 10, ex + 19, cy + 32), fill=LAGOON)
        d.ellipse((ex - 9, cy - 2, ex + 9, cy + 20), fill=(18, 51, 59, 255))
        d.ellipse((ex - 14, cy - 6, ex - 2, cy + 8), fill=CLOUD)
    # allık + atkı
    d.ellipse((cx - 108, cy + 44, cx - 62, cy + 66), fill=(240, 123, 164, 120))
    d.ellipse((cx + 62, cy + 44, cx + 108, cy + 66), fill=(240, 123, 164, 120))
    d.rounded_rectangle((cx - 128, cy + 92, cx + 128, cy + 152), radius=30, fill=PINK)
    d.rounded_rectangle((cx - 50, cy + 118, cx + 50, cy + 160), radius=16, fill=PINK_DEEP)
    return img


def concept_play_gem() -> Image.Image:
    img = base()
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((60, 60, SIZE - 60, SIZE - 60), radius=110, fill=CLOUD)
    d.ellipse((SIZE * 0.2, SIZE * 0.2, SIZE * 0.8, SIZE * 0.8), fill=PINK)
    play(d, SIZE * 0.52, SIZE * 0.5, 84, LAGOON)
    d.ellipse((SIZE - 108, 92, SIZE - 62, 138), fill=PINK)
    return img


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    concepts = {
        "1-cube-play": concept_cube_play(),
        "2-cloud-play": concept_cloud_play(),
        "3-monogram": concept_monogram(),
        "4-momo": concept_momo(),
        "5-play-gem": concept_play_gem(),
    }
    for name, image in concepts.items():
        image.save(os.path.join(OUT, f"{name}.png"))

    # karşılaştırma sayfası
    cell = 300
    pad = 26
    sheet = Image.new("RGB", (pad + (cell + pad) * 5, cell + 120), (246, 249, 250))
    d = ImageDraw.Draw(sheet)
    try:
        label_font = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 22)
    except OSError:
        label_font = ImageFont.load_default()
    for index, (name, image) in enumerate(concepts.items()):
        x = pad + index * (cell + pad)
        sheet.paste(image.resize((cell, cell), Image.LANCZOS), (x, pad), image.resize((cell, cell), Image.LANCZOS))
        d.text((x, cell + pad + 12), f"{index + 1}", font=label_font, fill=(18, 51, 59))
    sheet.save(os.path.join(OUT, "comparison.png"))
    print("konseptler yazıldı:", OUT)


if __name__ == "__main__":
    main()
