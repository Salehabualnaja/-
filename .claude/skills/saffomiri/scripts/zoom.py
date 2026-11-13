"""Zoom into a page from the full-resolution scan (for proofreading transcriptions).

usage:
  python3 -I zoom.py WORK N band Y0 Y1 [SCALE]   # rows Y0..Y1 of pages/pNNN.png, upscaled (nearest) x SCALE (default 2)
  python3 -I zoom.py WORK N thirds               # page split in 3 overlapping strips at native scan resolution
WORK is the work folder holding full/ (f-NNN.png), pages/ (pNNN.png + crop_map.json) and zoom/.
Nearest-neighbour upscaling keeps hamza and dots crisp (smooth resampling blurs them away).
Prints the output paths — Read them.
"""
import sys, os, json
from PIL import Image

work, n, mode = sys.argv[1], int(sys.argv[2]), sys.argv[3]
os.makedirs(os.path.join(work, 'zoom'), exist_ok=True)
full = Image.open(os.path.join(work, 'full', f'f-{n:03d}.png')).convert('L')
cmap = json.load(open(os.path.join(work, 'pages', 'crop_map.json')))
x0, y0, x1, y1, s = cmap[str(n)]
page = full.crop((x0, y0, x1, y1))
out = []
if mode == 'band':
    a, b = float(sys.argv[4]), float(sys.argv[5])
    scale = int(sys.argv[6]) if len(sys.argv) > 6 else 2
    pad = 12 / s  # keep hamza above / dots below the band edges
    c = page.crop((0, max(0, int(a / s - pad)), page.width, min(page.height, int(b / s + pad))))
    c = c.resize((int(c.width * s * scale), int(c.height * s * scale)), Image.NEAREST)  # SCALE x the page-image size
    p = os.path.join(work, 'zoom', f'z{n:03d}_{int(a)}_{int(b)}.png'); c.save(p); out.append(p)
elif mode == 'thirds':
    h = page.height
    for i, (a, b) in enumerate([(0, 0.36), (0.32, 0.68), (0.64, 1.0)]):
        c = page.crop((0, int(h * a), page.width, int(h * b)))
        p = os.path.join(work, 'zoom', f't{n:03d}_{i}.png'); c.save(p); out.append(p)
print('\n'.join(out))
