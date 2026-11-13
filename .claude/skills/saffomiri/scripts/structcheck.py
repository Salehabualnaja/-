"""Structural check of the page transcriptions.

usage: python3 -I structcheck.py TRANS_DIR [FIRST LAST]
Reports: missing page files, bad headers, unbalanced <small>, odd ** count,
footnote marks without footnotes (and the reverse), and every ⟨؟⟩ with context.
"""
import sys, re, glob, os

d = sys.argv[1]
files = sorted(glob.glob(os.path.join(d, 'p[0-9][0-9][0-9].txt')))
nums = [int(os.path.basename(f)[1:4]) for f in files]
first, last = (int(sys.argv[2]), int(sys.argv[3])) if len(sys.argv) > 3 else (min(nums), max(nums))
missing = [n for n in range(first, last + 1) if n not in nums]
probs, q = [], []
for f in files:
    s = open(f, encoding='utf-8').read(); n = os.path.basename(f)
    if not re.match(r'^=== page \d{3} \| printed: .+ ===\n', s): probs.append((n, 'header'))
    body, _, foot = s.partition('--- footnotes ---')
    if body.count('<small>') != body.count('</small>'): probs.append((n, 'unbalanced <small>'))
    if s.count('**') % 2: probs.append((n, 'odd ** count'))
    refs = set(re.findall(r'\[\^(\d+)\]', body)); defs = set(re.findall(r'(?m)^\[(\d+)\]', foot))
    if refs - defs: probs.append((n, f'marks without footnote {sorted(refs - defs)}'))
    if defs - refs: probs.append((n, f'footnotes without mark {sorted(defs - refs)}'))
    for m in re.finditer('⟨؟⟩', s):
        q.append((n, s[max(0, m.start() - 40):m.start()].replace('\n', ' ')))
print('pages:', len(files), '| missing:', missing)
print('problems:', len(probs)); [print('  ', p) for p in probs]
print('uncertain ⟨؟⟩:', len(q)); [print('  ', x) for x in q]
