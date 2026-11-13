"""Turn classifier output (exceptions only) into a full decisions JSONL.

usage: python3 -I decisions.py SMALL_ALL_JSONL OUT_JSONL CLS_OUT_1 [CLS_OUT_2 ...]
Every small run gets a decision: remove (default) / keep / partial (keep = words N..M).
"""
import sys, json, re

small = [json.loads(l) for l in open(sys.argv[1], encoding='utf-8')]
byid = {r['id']: r for r in small}
exc, flags, bad, unknown = {}, [], [], []
for path in sys.argv[3:]:
    for ln in open(path, encoding='utf-8'):
        ln = ln.strip()
        if not ln or ln.startswith('#'):
            continue
        parts = ln.split()
        rid, act = parts[0], parts[1] if len(parts) > 1 else ''
        if rid not in byid:
            unknown.append(rid); continue
        toks = byid[rid]['text'].split()
        try:
            if act == 'keep':
                exc[rid] = {'action': 'keep'}
            elif act == 'keep_from':
                n = int(parts[2]); assert 0 <= n < len(toks)
                exc[rid] = {'action': 'partial', 'keep': ' '.join(toks[n:])}
            elif act == 'keep_range':
                n, m = int(parts[2]), int(parts[3]); assert 0 <= n < m <= len(toks)
                exc[rid] = {'action': 'partial', 'keep': ' '.join(toks[n:m])}
            elif act == 'flag':
                flags.append((rid, ' '.join(parts[2:])))
            else:
                bad.append(ln)
        except Exception:
            bad.append(ln)
with open(sys.argv[2], 'w', encoding='utf-8') as fh:
    for r in small:
        d = exc.get(r['id'], {'action': 'remove'})
        d = dict(d, id=r['id'])
        fh.write(json.dumps(d, ensure_ascii=False) + '\n')
from collections import Counter
print(Counter(exc.get(r['id'], {'action': 'remove'})['action'] for r in small))
print('flags:', len(flags))
for f in flags:
    print('  FLAG', f[0], '|', byid[f[0]]['text'][:140], '|', f[1])
print('malformed lines:', bad)
if unknown:
    print(f'ignored {len(unknown)} ids that are not among the candidates (other page range?):', unknown[:5])
