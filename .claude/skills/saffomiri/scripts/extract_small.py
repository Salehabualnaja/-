"""List every <small>…</small> run in the body of pages FIRST..LAST with context.

usage: python3 -I extract_small.py TRANS_DIR OUT_JSONL [FIRST LAST]
Each line: {"id": "p050-2", "page": 50, "k": 2, "entry": "٣٤", "text": "...", "after": "first words after the run"}
"""
import re, sys, os, glob, json

SMALL = re.compile(r'<small>(.*?)</small>', re.S)

tdir, out = sys.argv[1], sys.argv[2]
first, last = (int(sys.argv[3]), int(sys.argv[4])) if len(sys.argv) > 4 else (29, 398)
rows = []
for f in sorted(glob.glob(os.path.join(tdir, 'p[0-9][0-9][0-9].txt'))):
    n = int(os.path.basename(f)[1:4])
    if n < first or n > last:
        continue
    raw = open(f, encoding='utf-8').read()
    body = raw.split('\n--- footnotes ---')[0]
    body = body.split('\n', 1)[1] if '\n' in body else ''
    for k, m in enumerate(SMALL.finditer(body), 1):
        before = body[:m.start()]
        em = re.findall(r'\[\[([^\]]+)\]\]', before)
        after = re.sub(r'\s+', ' ', body[m.end():m.end() + 160]).strip()
        rows.append({'id': f'p{n:03d}-{k}', 'page': n, 'k': k,
                     'entry': em[-1] if em else '',
                     'text': m.group(1), 'after': after})
with open(out, 'w', encoding='utf-8') as fh:
    for r in rows:
        fh.write(json.dumps(r, ensure_ascii=False) + '\n')
print(len(rows), 'small runs')
