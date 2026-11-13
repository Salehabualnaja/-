"""Split the small-font runs into numbered-word lists for the isnad classification agents.

usage: python3 -I cls_lists.py SMALL_ALL.jsonl OUT_DIR [PER_FILE]
Writes OUT_DIR/cls_in_1.txt, cls_in_2.txt … (PER_FILE candidates each, default 500), one line each:
  p050-2 | entry ٣٤ | RUN: [0]أخبرنا [1]أحمد … | AFTER: **عن** خالد …
Numbering the words lets an agent say «keep_from 8» instead of copying Arabic text by hand.
"""
import sys, os, json

rows = [json.loads(l) for l in open(sys.argv[1], encoding='utf-8')]
out = sys.argv[2]; per = int(sys.argv[3]) if len(sys.argv) > 3 else 500
os.makedirs(out, exist_ok=True)
def fmt(r):
    run = ' '.join(f'[{i}]{t}' for i, t in enumerate(r['text'].split()))
    return f"{r['id']} | entry {r['entry'] or '-'} | RUN: {run} | AFTER: {r['after'][:150]}"
parts = [rows[i:i + per] for i in range(0, len(rows), per)]
for i, part in enumerate(parts, 1):
    p = os.path.join(out, f'cls_in_{i}.txt')
    open(p, 'w', encoding='utf-8').write('\n'.join(fmt(r) for r in part) + '\n')
    print(p, len(part), 'candidates')
