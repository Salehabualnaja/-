import sys, os, glob, subprocess, re
sys.argv = sys.argv  # TRANS_DIR PDF
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from importlib.machinery import SourceFileLoader
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'verify.py'), encoding='utf-8').read()
src = src[:src.index('\ndef main')]
ns = {}; exec(src, ns)
tdir, pdf = sys.argv[1], sys.argv[2]
for f in sorted(glob.glob(os.path.join(tdir, 'p[0-9][0-9][0-9].txt'))):
    n = int(os.path.basename(f)[1:4])
    b, ft = ns['read_trans'](f)
    tw = len(ns['norm_text'](ns['strip_markup'](b + '\n' + ft)))
    ocr = subprocess.run(['pdftotext', '-f', str(n), '-l', str(n), pdf, '-'], capture_output=True, text=True).stdout
    ow = len(ns['norm_text'](ocr))
    r = tw / ow if ow else 0
    flag = ' <--' if ow > 30 and (r < 0.88 or r > 1.25) else ''
    if flag or '-a' in sys.argv:
        print(f'p{n:03d} trans={tw} ocr={ow} ratio={r:.2f}{flag}')
