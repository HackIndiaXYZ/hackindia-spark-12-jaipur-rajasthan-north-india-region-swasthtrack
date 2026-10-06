#!/usr/bin/env python3
"""Convert a photo (JPEG/PNG/WebP/HEIC-if-supported) to an 8-bit grey PGM, EXIF-rotated, longest side <= max.
Usage: to-pgm.py <input> <output.pgm> [maxSide]"""
import sys
from PIL import Image, ImageOps

src, dst = sys.argv[1], sys.argv[2]
max_side = int(sys.argv[3]) if len(sys.argv) > 3 else 1200
im = Image.open(src)
im = ImageOps.exif_transpose(im)
im = im.convert("L")
w, h = im.size
scale = min(1.0, max_side / max(w, h))
if scale < 1.0:
    im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
im.save(dst)
