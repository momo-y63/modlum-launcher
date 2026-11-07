"""Piksel Momo ikonunu build/icon.png + build/icon.ico olarak üretir."""

from __future__ import annotations

import io
import os
import struct

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, "assets", "icon-concepts", "6-pixel-momo.png")
BUILD = os.path.join(ROOT, "build")
SIZES = [16, 24, 32, 48, 64, 128, 256]


def write_ico(images: list[Image.Image], path: str) -> None:
    payloads: list[bytes] = []
    for image in images:
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        payloads.append(buffer.getvalue())

    offset = 6 + 16 * len(images)
    header = struct.pack("<HHH", 0, 1, len(images))
    entries = b""
    for image, payload in zip(images, payloads):
        width = 0 if image.width >= 256 else image.width
        height = 0 if image.height >= 256 else image.height
        entries += struct.pack(
            "<BBBBHHII",
            width,
            height,
            0,
            0,
            1,
            32,
            len(payload),
            offset,
        )
        offset += len(payload)

    with open(path, "wb") as handle:
        handle.write(header)
        handle.write(entries)
        for payload in payloads:
            handle.write(payload)


def main() -> None:
    os.makedirs(BUILD, exist_ok=True)
    source = Image.open(SOURCE).convert("RGBA")
    source.resize((512, 512), Image.NEAREST).save(os.path.join(BUILD, "icon.png"))
    frames = [source.resize((size, size), Image.NEAREST) for size in SIZES]
    write_ico(frames, os.path.join(BUILD, "icon.ico"))
    print("ikonlar yazıldı:", BUILD)


if __name__ == "__main__":
    main()
