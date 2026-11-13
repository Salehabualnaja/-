"""Export the assembled book (same model as assemble.py) as JSON blocks for the DOCX builder.

usage: python3 -I export_json.py TRANS_DIR OUT_JSON [--decisions D.jsonl] [--omit-pages 27]
Inline markup kept for the builder: **bold**, <small>…</small>, [^label], [صفحة N].
"""
import sys, os, re, json, types

here = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(here, 'assemble.py'), encoding='utf-8').read()
src = src[:src.index("if __name__ == '__main__':")]
A = types.ModuleType('assemble'); exec(src, A.__dict__)

args = sys.argv[1:]
tdir, out = args[0], args[1]
if '--omit-pages' in args:
    A.OMIT_PAGES = {int(x) for x in args[args.index('--omit-pages') + 1].split(',')}
if '--decisions' in args:
    A.DECISIONS = {}
    for l in open(args[args.index('--decisions') + 1], encoding='utf-8'):
        if l.strip():
            r = json.loads(l); A.DECISIONS[r['id']] = r

pages = A.load_pages(tdir)
doc, fn_by_page = A.build(pages)
used = set()
blocks, foot = [], {}

def inline(text, pages_):
    return A.render_inline(A.fix_refs(text, pages_, fn_by_page, used), pages_[0], None)

for u in doc:
    t, pages_, mark = u['t'], u['pages'], u.get('mark')
    if t == 'h':
        if mark:
            blocks.append({'t': 'marker', 'text': mark, 'page': pages_[0]})
        blocks.append({'t': 'h', 'lvl': u['lvl'], 'text': inline(u['text'], pages_), 'page': pages_[0]})
    elif t == 'para':
        txt = (mark + ' ' if mark else '') + u['text']
        blocks.append({'t': 'para', 'text': inline(txt, pages_), 'page': pages_[0]})
    elif t == 'verses':
        vs = list(u['v'])
        if mark:
            vs[0] = mark + ' ' + vs[0]
        joined = A.fix_refs('\n'.join(vs), pages_, fn_by_page, used)
        rows = []
        for v in joined.split('\n'):
            v = A.render_inline(v, pages_[0], None)
            rows.append([h.strip() for h in v.split('||')])
        blocks.append({'t': 'verses', 'v': rows, 'page': pages_[0]})
    elif t == 'lines':
        ls = list(u['v'])
        if mark:
            ls[0] = mark + ' ' + ls[0]
        for x in ls:
            blocks.append({'t': 'para', 'text': inline(x, pages_), 'page': pages_[0], 'tight': True})
    elif t == 'table':
        if mark:
            blocks.append({'t': 'marker', 'text': mark, 'page': pages_[0]})
        rows = [[inline(c.strip(), pages_) for c in r.split(' | ')] for r in u['rows']]
        blocks.append({'t': 'table', 'rows': rows, 'page': pages_[0]})
    elif t in ('blank', 'omit'):
        if mark:
            blocks.append({'t': 'marker', 'text': mark, 'page': pages_[0]})
    for pno in u.get('ends', []):
        for f in fn_by_page.get(pno, []):
            lab = f'p{pno:03d}-{f["num"]}'
            body = A.render_inline(f['text'], pno, None)
            body = A.FNREF.sub(lambda m: f'({m.group(1)})', body)
            verses = [[h.strip() for h in A.render_inline(v, pno, None).split('||')] for v in f['verses']]
            foot[lab] = {'text': body, 'verses': verses}

refs = []
for b in blocks:
    for s in ([b.get('text', '')] + [c for r in b.get('rows', []) for c in r] + [c for r in b.get('v', []) for c in r]):
        refs += re.findall(r'\[\^([^\]]+)\]', s)
missing = [r for r in refs if r not in foot]
unused = [k for k in foot if k not in set(refs)]
json.dump({'blocks': blocks, 'footnotes': foot}, open(out, 'w', encoding='utf-8'), ensure_ascii=False)
print('blocks', len(blocks), 'footnotes', len(foot), 'refs', len(refs), 'missing', missing[:5], 'unused', unused[:5])
