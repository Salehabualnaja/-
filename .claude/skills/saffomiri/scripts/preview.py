"""Pick the pages worth looking at in the PDF preview and paste them into contact sheets.

usage: python3 -I preview.py BOOK.pdf OUT_DIR [DPI]
Chooses: the first 4 pages (cover, half-title, copyright, basmala), the page with the most
verse lines, the page with the most footnotes, a chapter opening, a middle page, and the
last 2 pages (index). Writes sheet_1.jpg, sheet_2.jpg … (4 pages each) and prints which
page is which. Read the sheets; re-render a single page at 100–110 dpi to inspect details.
Remember: page count, breaks and line endings come from LibreOffice with a substitute
font, not from Word with Traditional Arabic — judge structure, not exact pagination.
"""
import sys, os, re, subprocess
from PIL import Image

pdf, out = sys.argv[1], sys.argv[2]
dpi = sys.argv[3] if len(sys.argv) > 3 else '70'
os.makedirs(out, exist_ok=True)
n = int(re.search(r'Pages:\s+(\d+)', subprocess.run(['pdfinfo', pdf], capture_output=True, text=True).stdout).group(1))
best_verse = best_foot = (0, 1)
chapter = None
for p in range(5, max(6, n - 8)):   # the last pages are usually index tables
    t = subprocess.run(['pdftotext', '-layout', '-f', str(p), '-l', str(p), pdf, '-'], capture_output=True, text=True).stdout
    lines = [l for l in t.split('\n') if l.strip()]
    verse = sum(1 for l in lines if re.search(r'\S {6,}\S', l.strip()) and not re.search(r'[٠-٩0-9]\s*$', l.strip()))
    foot = sum(1 for l in lines if re.match(r'^\s*[0-9]{1,2}\s*[^\s0-9]', l) and len(l.strip()) > 3)
    best_verse = max(best_verse, (verse, p))
    best_foot = max(best_foot, (foot, p))
    if chapter is None and p > n // 5 and re.search(r'(\[\s*[٠-٩]+\s*\]|\]\s*[٠-٩]+\s*\[)\s*(ذكر|باب)|(ذكر|باب).{0,80}(\[\s*[٠-٩]+\s*\]|\]\s*[٠-٩]+\s*\[)', ' '.join(lines[1:4])):
        chapter = p
picks = [(1, 'cover'), (2, 'front'), (3, 'front'), (4, 'front'),
         (best_verse[1], 'most verses'), (best_foot[1], 'most footnotes'),
         (chapter or n // 3, 'chapter opening' if chapter else 'third'), (n // 2, 'middle'),
         (n - 1, 'index'), (n, 'last')]
seen, order = set(), []
for p, why in picks:
    if 1 <= p <= n and p not in seen:
        seen.add(p); order.append((p, why))
imgs = []
for p, why in order:
    base = os.path.join(out, f'pv{p:04d}')
    subprocess.run(['pdftoppm', '-jpeg', '-r', dpi, '-f', str(p), '-l', str(p), '-singlefile', pdf, base], check=True)
    imgs.append((p, why, base + '.jpg'))
for k in range(0, len(imgs), 4):
    group = imgs[k:k + 4]
    ims = [Image.open(f) for _, _, f in group]
    w = max(i.width for i in ims); h = max(i.height for i in ims)
    sheet = Image.new('RGB', (w * len(ims) + 12 * (len(ims) - 1), h), 'white')
    for i, im in enumerate(ims):
        sheet.paste(im, (i * (w + 12), 0))
    path = os.path.join(out, f'sheet_{k // 4 + 1}.jpg'); sheet.save(path)
    print(path, '| left→right:', ', '.join(f'p{p} ({why})' for p, why, _ in group))
