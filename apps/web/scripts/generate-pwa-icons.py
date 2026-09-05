#!/usr/bin/env python3
"""Generate temporary Pantry PWA icons from a simple geometric mark.

Uses only the Python standard library so icon generation is not a production
dependency. Temporary technical assets, not final branding.
"""

from __future__ import annotations

import struct
import zlib
from pathlib import Path

BG = (247, 251, 248, 255)  # oklch(0.985 0.006 148) → #f7fbf8
ACCENT = (23, 95, 51, 255)  # oklch(0.43 0.1 152) → #175f33

PUBLIC = Path(__file__).resolve().parents[1] / "public"


def rounded_rect_sdf(
    x: float,
    y: float,
    x0: float,
    y0: float,
    x1: float,
    y1: float,
    radius: float,
) -> float:
    cx = (x0 + x1) / 2
    cy = (y0 + y1) / 2
    hw = (x1 - x0) / 2
    hh = (y1 - y0) / 2
    r = min(radius, hw, hh)
    dx = abs(x - cx) - (hw - r)
    dy = abs(y - cy) - (hh - r)
    outside = (max(dx, 0.0) ** 2 + max(dy, 0.0) ** 2) ** 0.5
    inside = min(max(dx, dy), 0.0)
    return outside + inside - r


def mix_pixel(dst: list[int], color: tuple[int, int, int, int], alpha: float) -> None:
    if alpha <= 0:
        return
    if alpha >= 1:
        dst[:] = color
        return
    inv = 1.0 - alpha
    dst[0] = round(dst[0] * inv + color[0] * alpha)
    dst[1] = round(dst[1] * inv + color[1] * alpha)
    dst[2] = round(dst[2] * inv + color[2] * alpha)
    dst[3] = 255


def coverage(sdf: float, pixel_size: float) -> float:
    # Smooth the edge across about one output pixel.
    return max(0.0, min(1.0, 0.5 - sdf / pixel_size))


def map_pad(value: float, pad: float) -> float:
    return pad + value * (1.0 - 2.0 * pad)


def render_icon(size: int, pad: float) -> bytearray:
    pixels = bytearray(size * size * 4)
    pixel_size = 1.0 / size

    lid = (
        map_pad(0.08, pad),
        map_pad(0.18, pad),
        map_pad(0.92, pad),
        map_pad(0.32, pad),
        0.035 * (1.0 - 2.0 * pad),
    )
    body = (
        map_pad(0.16, pad),
        map_pad(0.30, pad),
        map_pad(0.84, pad),
        map_pad(0.88, pad),
        0.055 * (1.0 - 2.0 * pad),
    )
    opening = (
        map_pad(0.28, pad),
        map_pad(0.42, pad),
        map_pad(0.72, pad),
        map_pad(0.52, pad),
        0.02 * (1.0 - 2.0 * pad),
    )

    for y in range(size):
        ny = (y + 0.5) / size
        row = y * size * 4
        for x in range(size):
            nx = (x + 0.5) / size
            px = [BG[0], BG[1], BG[2], BG[3]]
            mix_pixel(px, ACCENT, coverage(rounded_rect_sdf(nx, ny, *body), pixel_size))
            mix_pixel(px, ACCENT, coverage(rounded_rect_sdf(nx, ny, *lid), pixel_size))
            mix_pixel(px, BG, coverage(rounded_rect_sdf(nx, ny, *opening), pixel_size))
            offset = row + x * 4
            pixels[offset : offset + 4] = bytes(px)
    return pixels


def write_png(path: Path, size: int, pixels: bytearray) -> None:
    raw = b"".join(b"\x00" + bytes(pixels[y * size * 4 : (y + 1) * size * 4]) for y in range(size))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)


def write_ico(path: Path, png_bytes: bytes, size: int) -> None:
    # PNG-compressed ICO (supported by modern browsers).
    header = struct.pack("<HHH", 0, 1, 1)
    width = 0 if size >= 256 else size
    entry = struct.pack("<BBBBHHII", width, width, 0, 0, 1, 32, len(png_bytes), 22)
    path.write_bytes(header + entry + png_bytes)


def downsample(src: bytearray, src_size: int, dst_size: int) -> bytearray:
    if src_size == dst_size:
        return src
    dst = bytearray(dst_size * dst_size * 4)
    scale = src_size / dst_size
    for y in range(dst_size):
        y0 = int(y * scale)
        y1 = int((y + 1) * scale)
        for x in range(dst_size):
            x0 = int(x * scale)
            x1 = int((x + 1) * scale)
            totals = [0, 0, 0, 0]
            count = 0
            for sy in range(y0, max(y1, y0 + 1)):
                row = sy * src_size * 4
                for sx in range(x0, max(x1, x0 + 1)):
                    offset = row + sx * 4
                    totals[0] += src[offset]
                    totals[1] += src[offset + 1]
                    totals[2] += src[offset + 2]
                    totals[3] += src[offset + 3]
                    count += 1
            dst_off = (y * dst_size + x) * 4
            dst[dst_off] = totals[0] // count
            dst[dst_off + 1] = totals[1] // count
            dst[dst_off + 2] = totals[2] // count
            dst[dst_off + 3] = totals[3] // count
    return dst


def main() -> None:
    PUBLIC.mkdir(parents=True, exist_ok=True)
    master_size = 1024
    any_master = render_icon(master_size, pad=0.12)
    maskable_master = render_icon(master_size, pad=0.22)

    outputs = {
        "pwa-192x192.png": downsample(any_master, master_size, 192),
        "pwa-512x512.png": downsample(any_master, master_size, 512),
        "pwa-512x512-maskable.png": downsample(maskable_master, master_size, 512),
        "apple-touch-icon.png": downsample(any_master, master_size, 180),
        "favicon-32x32.png": downsample(any_master, master_size, 32),
        "favicon-48x48.png": downsample(any_master, master_size, 48),
    }

    for name, pixels in outputs.items():
        size = int(len(pixels) ** 0.5 / 2)
        path = PUBLIC / name
        write_png(path, size, pixels)
        print(f"wrote {path.relative_to(PUBLIC.parent)} ({size}x{size})")

    favicon_48 = PUBLIC / "favicon-48x48.png"
    write_ico(PUBLIC / "favicon.ico", favicon_48.read_bytes(), 48)
    print("wrote public/favicon.ico (48x48)")


if __name__ == "__main__":
    main()
