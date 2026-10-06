#!/usr/bin/env python3
"""pgm-to-png.py <in.pgm> [<in2.pgm> ...]: writes a .png next to each file (for viewing debug dumps)."""
import sys
from PIL import Image
for f in sys.argv[1:]:
    Image.open(f).save(f[:-4] + ".png")
