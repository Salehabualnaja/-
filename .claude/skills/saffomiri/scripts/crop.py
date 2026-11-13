"""Crop margins from rendered page images and scale them for reading.

usage: python3 -I crop.py FULL_DIR PAGES_DIR [LONG_SIDE]
  FULL_DIR  : PNGs from `pdftoppm -r 220 -gray -png book.pdf FULL_DIR/f` (f-001.png …)
  PAGES_DIR : output pNNN.png, long side LONG_SIDE px (default 1560 — the largest size
              an image is shown at without downscaling, keeps harakat legible)
Also writes PAGES_DIR/crop_map.json: {page: [x0, y0, x1, y1, scale]} so zoom.py can map
page-image pixels back to the full-resolution scan.
"""
import sys, os, glob, json
from PIL import Image, ImageOps

src, dst = sys.argv[1], sys.argv[2]
long_side = int(sys.argv[3]) if len(sys.argv) > 3 else 1560
os.makedirs(dst, exist_ok=True)
cmap = {}
for f in sorted(glob.glob(os.path.join(src, '*.png'))):
    im = Image.open(f).convert('L')
    inv = ImageOps.invert(im).point(lambda v: 255 if v > 80 else 0)
    bb = inv.getbbox() or (0, 0, im.width, im.height)
    pad = 18
    bb = (max(0, bb[0] - pad), max(0, bb[1] - pad), min(im.width, bb[2] + pad), min(im.height, bb[3] + pad))
    im = im.crop(bb)
    w, h = im.size
    s = min(1.0, long_side / max(w, h))
    if s < 1:
        im = im.resize((round(w * s), round(h * s)), Image.LANCZOS)
    n = int(os.path.basename(f).split('-')[-1].split('.')[0])
    im.save(os.path.join(dst, f'p{n:03d}.png'), optimize=True)
    cmap[n] = [*bb, s]
json.dump(cmap, open(os.path.join(dst, 'crop_map.json'), 'w'))
print(len(cmap), 'pages ->', dst)
