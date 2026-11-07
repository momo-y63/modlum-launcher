"""NSIS installer görselleri — Modlum teması (BMP + ICO)."""

from __future__ import annotations

import io
import os
import struct

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, "build")
PIXEL = os.path.join(ROOT, "assets", "icon-concepts", "6-pixel-momo.png")

LAGOON_TOP = (18, 132, 148)
LAGOON_BOTTOM = (8, 72, 84)
PINK = (240, 123, 164)
PINK_SOFT = (247, 168, 196)
WHITE = (247, 251, 252)
INK = (18, 51, 59)

GEORGIA = "C:/Windows/Fonts/georgiab.ttf"
SEGOE = "C:/Windows/Fonts/segoeui.ttf"
SEGOE_BD = "C:/Windows/Fonts/segoeuib.ttf"


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


def gradient(size: tuple[int, int], top: tuple, bottom: tuple) -> Image.Image:
    width, height = size
    image = Image.new("RGB", size)
    draw = ImageDraw.Draw(image)
    for y in range(height):
        t = y / max(1, height - 1)
        color = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        draw.line((0, y, width, y), fill=color)
    return image


def spaced_text(draw: ImageDraw.ImageDraw, xy, text: str, font_obj, fill, spacing: int) -> None:
    x, y = xy
    for char in text:
        draw.text((x, y), char, font=font_obj, fill=fill)
        x += draw.textlength(char, font=font_obj) + spacing


def sidebar(tagline: str) -> Image.Image:
    image = gradient((164, 314), LAGOON_TOP, LAGOON_BOTTOM)
    draw = ImageDraw.Draw(image, "RGBA")

    # dekoratif halkalar
    for radius in (56, 86, 116, 146):
        draw.ellipse(
            (82 - radius, 158 - radius, 82 + radius, 158 + radius),
            outline=(255, 255, 255, 26),
            width=1,
        )
    draw.ellipse((118, 44, 156, 82), fill=(240, 123, 164, 40))

    # marka
    word = font(GEORGIA, 27)
    width = draw.textlength("Modlum", font=word)
    draw.text(((164 - width) / 2, 14), "Modlum", font=word, fill=WHITE)
    draw.rectangle((65, 52, 99, 54), fill=PINK)
    spaced_text(draw, (52, 60), "LAUNCHER", font(SEGOE_BD, 8), PINK_SOFT, 3)

    # Momo
    momo = Image.open(PIXEL).convert("RGBA").resize((132, 132), Image.NEAREST)
    shadow = Image.new("RGBA", (150, 24), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).ellipse((0, 0, 149, 23), fill=(3, 30, 35, 90))
    image.paste(shadow, (7, 262), shadow)
    image.paste(momo, (16, 132), momo)

    spaced_text(draw, (16, 292), tagline, font(SEGOE, 7), (255, 255, 255, 190), 1)
    return image


def header() -> Image.Image:
    image = Image.new("RGB", (150, 57), (246, 249, 250))
    draw = ImageDraw.Draw(image)
    draw.line((0, 56, 150, 56), fill=(222, 232, 235))
    momo = Image.open(PIXEL).convert("RGBA").resize((36, 36), Image.NEAREST)
    image.paste(momo, (8, 10), momo)
    draw.text((50, 10), "Modlum", font=font(GEORGIA, 16), fill=INK)
    spaced_text(draw, (52, 32), "LAUNCHER", font(SEGOE_BD, 6), (14, 124, 140), 2)
    return image


def write_ico(source: Image.Image, path: str, sizes=(16, 24, 32, 48)) -> None:
    payloads = []
    for size in sizes:
        buffer = io.BytesIO()
        source.resize((size, size), Image.NEAREST).save(buffer, format="PNG")
        payloads.append(buffer.getvalue())
    offset = 6 + 16 * len(payloads)
    with open(path, "wb") as handle:
        handle.write(struct.pack("<HHH", 0, 1, len(payloads)))
        for size, payload in zip(sizes, payloads):
            handle.write(struct.pack("<BBBBHHII", size, size, 0, 0, 1, 32, len(payload), offset))
            offset += len(payload)
        for payload in payloads:
            handle.write(payload)


def main() -> None:
    os.makedirs(BUILD, exist_ok=True)
    sidebar("MINECRAFT · JAVA EDITION").save(os.path.join(BUILD, "installerSidebar.bmp"))
    sidebar("KALDIRMA İŞLEMİ").save(os.path.join(BUILD, "uninstallerSidebar.bmp"))
    header().save(os.path.join(BUILD, "installerHeader.bmp"))
    write_ico(Image.open(PIXEL).convert("RGBA"), os.path.join(BUILD, "installerHeaderIcon.ico"))
    print("installer görselleri hazır:", BUILD)


if __name__ == "__main__":
    main()
