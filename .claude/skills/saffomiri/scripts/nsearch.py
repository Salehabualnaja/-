import sys, re, glob, os
T = re.compile('[ؐ-ًؚ-ٰٟۖ-ۭـ]')
def n(s): return re.sub('[أإآٱ]', 'ا', T.sub('', s))
pat = n(sys.argv[2]); w = int(sys.argv[3]) if len(sys.argv) > 3 else 300
for f in sorted(glob.glob(os.path.join(sys.argv[1], 'p*.txt'))):
    s = n(open(f, encoding='utf-8').read())
    for m in re.finditer(re.escape(pat), s):
        print(os.path.basename(f), '|', s[max(0, m.start()-w):m.end()+w].replace('\n', ' ⏎ '))
