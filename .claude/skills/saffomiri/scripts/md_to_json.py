"""Read a book Markdown written in this skill's conventions (assemble.py output, full or
isnad-free) back into the JSON blocks that build_docx.js typesets.
Use it when the Markdown is all you have (no trans/ pages), e.g. a file from Drive.

usage: python3 -I md_to_json.py BOOK.md OUT.json

Conventions read (references/typesetting-spec.md §1):
  [صفحة N] page markers · #/##/### headings · **bold** · <small> · **[N]** entry numbers
  verses: lines «صدر … عجز», several verses joined by a trailing «\\» · tables «| … |»
  footnote definitions «[^label]: text» · leading HTML comment (dropped)
"""
import sys, re, json

AR = '٠١٢٣٤٥٦٧٨٩'
def page_no(lab):
    try:
        return int(''.join(str(AR.index(c)) if c in AR else c for c in lab))
    except ValueError:
        return None

src = open(sys.argv[1], encoding='utf-8').read().replace('\r', '')
src = re.sub(r'^\s*<!--.*?-->\s*', '', src, flags=re.S)
MARK = re.compile(r'\[صفحة ([^\]]+)\]')
VERSE_SEP = ' … '

blocks, foot = [], {}
page = None
for raw in re.split(r'\n\s*\n', src):
    b = raw.strip('\n')
    if not b.strip():
        continue
    fm = re.match(r'^\[\^([^\]]+)\]:\s?(.*)$', b, flags=re.S)
    if fm:
        foot[fm.group(1)] = {'text': fm.group(2).strip(), 'verses': []}
        continue
    start_page = page
    marks = MARK.findall(b)
    lead = MARK.match(b.strip())
    if lead:
        start_page = page_no(lead.group(1)) or start_page
    if marks:
        page = page_no(marks[-1]) or page
    lines = [l for l in b.split('\n')]
    stripped = MARK.sub('', b).strip()
    if stripped in ('', '(صفحة فارغة)'):
        blocks.append({'t': 'marker', 'text': lead.group(0) if lead else b.strip(), 'page': start_page})
        continue
    if lines[0].startswith('#'):
        lvl = len(lines[0]) - len(lines[0].lstrip('#'))
        blocks.append({'t': 'h', 'lvl': lvl, 'text': lines[0][lvl:].strip(), 'page': start_page})
        continue
    if all(l.lstrip().startswith('|') for l in lines):
        rows = [[c.strip() for c in l.strip().strip('|').split(' | ')] for l in lines if not re.match(r'^\|(-+\|)+$', l.strip())]
        blocks.append({'t': 'table', 'rows': rows, 'page': start_page})
        continue
    clean = [re.sub(r'\s*\\$', '', l) for l in lines]
    if all(VERSE_SEP in l or (len(clean) > 1 and len(l.split()) <= 9) for l in clean) and any(VERSE_SEP in l for l in clean):
        blocks.append({'t': 'verses', 'v': [[h.strip() for h in l.split(VERSE_SEP)] for l in clean], 'page': start_page})
        continue
    if len(clean) > 1:
        for l in clean:
            blocks.append({'t': 'para', 'text': l.replace('\\* ', '* '), 'page': start_page, 'tight': True})
        continue
    blocks.append({'t': 'para', 'text': clean[0].replace('\\* ', '* '), 'page': start_page})

refs = []
for b in blocks:
    for s in [b.get('text', '')] + [c for r in b.get('rows', []) for c in r] + [c for r in b.get('v', []) for c in r]:
        refs += re.findall(r'\[\^([^\]]+)\]', s)
missing = [r for r in refs if r not in foot]
json.dump({'blocks': blocks, 'footnotes': foot}, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False)
from collections import Counter
print('blocks', len(blocks), dict(Counter(b['t'] for b in blocks)), '| footnotes', len(foot), '| refs', len(refs), '| missing', missing[:5])
