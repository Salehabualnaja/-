"""Assemble per-page transcriptions (book/trans/pNNN.txt) into one Markdown book.

usage: python3 -I assemble.py TRANS_DIR OUT_MD [--first N] [--last N] [--no-isnad DECISIONS_JSON]

Model: every page -> units (heading / para / verses / lines / table / blank) + footnotes.
Paragraphs and verse groups continuing across pages are joined, with an inline page
marker «[ص: N]» at the exact page boundary. Footnotes get unique labels [^pNNN-k].
"""
import re, sys, os, json, glob

AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'
def to_ar(n):
    return ''.join(AR_DIGITS[int(c)] for c in str(n))

HDR = re.compile(r'^=== page (\d+) \| printed: (.*?) ===\s*$')
END_PUNCT = tuple('.!؟?»"”):…]')


SMALL = re.compile(r'<small>(.*?)</small>', re.S)
DECISIONS = None   # id -> {"action": "remove"|"keep"|"partial", "keep": str}
OMIT_PAGES = set()  # pages dropped entirely in the isnad-free build (e.g. the book's own chain, p. 27)
REMOVED_LOG = []


def apply_decisions(raw, pno):
    head, _, rest = raw.partition('\n')
    body, sep, foot = rest.partition('--- footnotes ---')
    drop_fn = set()
    k = 0
    def rep(m):
        nonlocal k
        k += 1
        rid = f'p{pno:03d}-{k}'
        d = DECISIONS.get(rid)
        if not d or d['action'] == 'keep':
            return m.group(0)
        if d['action'] == 'partial':
            keep = d['keep']
            run = ' '.join(m.group(1).split())
            if keep not in run:
                raise SystemExit(f'{rid}: keep text not a substring of the run')
            removed = run.replace(keep, ' … ', 1)
            for r in re.findall(r'\[\^(\d+)\]', removed):
                drop_fn.add(r)
            REMOVED_LOG.append({'id': rid, 'page': pno, 'removed': run, 'kept': keep})
            return '<small>' + keep.strip() + '</small>'
        for r in re.findall(r'\[\^(\d+)\]', m.group(1)):
            drop_fn.add(r)
        REMOVED_LOG.append({'id': rid, 'page': pno, 'removed': m.group(1), 'kept': ''})
        return '\x00'
    body = SMALL.sub(rep, body)
    # clean up what the removal left
    body = re.sub(r'[ \t]*\x00[ \t]*', ' ', body)
    body = re.sub(r'(?m)^[ \t]+|[ \t]+$', '', body)
    body = re.sub(r'[ \t]{2,}', ' ', body)
    # an entry number left alone on its paragraph -> attach to the next paragraph/verse
    body = re.sub(r'(?m)^(\[\[[^\]]+\]\])\n+(?=\S)(%% )?', lambda m: (m.group(2) or '') + m.group(1) + ' ', body)
    if drop_fn and sep:
        out, skip = [], False
        for ln in foot.split('\n'):
            fm = re.match(r'^\[(\d+|cont)\]', ln.strip())
            if fm:
                skip = fm.group(1) in drop_fn
            if not skip:
                out.append(ln)
        foot = '\n'.join(out)
    return head + '\n' + body + sep + foot


def parse_page(path):
    raw = open(path, encoding='utf-8').read().replace('\r', '')
    if DECISIONS is not None:
        pno0 = int(HDR.match(raw.split('\n', 1)[0].strip()).group(1))
        if pno0 in OMIT_PAGES:
            head, _, rest = raw.partition('\n')
            REMOVED_LOG.append({'id': f'p{pno0:03d}-page', 'page': pno0, 'removed': rest.strip(), 'kept': ''})
            raw = head + '\n(OMITTED)\n'
        raw = apply_decisions(raw, pno0)
    lines = raw.split('\n')
    m = HDR.match(lines[0].strip())
    if not m:
        raise SystemExit(f'bad header in {path}: {lines[0][:80]!r}')
    pno, printed = int(m.group(1)), m.group(2).strip()
    body_lines, foot_lines, in_foot = [], [], False
    for ln in lines[1:]:
        if ln.strip() == '--- footnotes ---':
            in_foot = True
            continue
        (foot_lines if in_foot else body_lines).append(ln.rstrip())
    # body -> blocks (split on blank lines)
    blocks, cur = [], []
    for ln in body_lines:
        if ln.strip() == '':
            if cur:
                blocks.append(cur); cur = []
        else:
            cur.append(ln.strip())
    if cur:
        blocks.append(cur)
    units = []
    for b in blocks:
        # split a block into runs of verse lines / other lines
        run, kind = [], None
        def flush():
            if not run:
                return
            if kind == 'verse':
                units.append({'t': 'verses', 'v': [x[2:].strip() for x in run]})
            else:
                for x in run_lines_to_units(run):
                    units.append(x)
        for ln in b:
            k = 'verse' if ln.startswith('%%') else 'other'
            if kind is not None and k != kind:
                flush(); run = []
            kind = k
            run.append(ln)
        flush()
    # footnotes
    foots = []  # list of [num or 'cont', text, [verses]]
    for ln in foot_lines:
        s = ln.strip()
        if not s:
            continue
        fm = re.match(r'^\[(\d+|cont)\]\s*(.*)$', s)
        if fm:
            foots.append([fm.group(1), fm.group(2), []])
        elif s.startswith('%%'):
            if not foots:
                foots.append(['cont', '', []])
            foots[-1][2].append(s[2:].strip())
        else:
            # stray continuation line of previous footnote
            if not foots:
                foots.append(['cont', s, []])
            else:
                foots[-1][1] += ' ' + s
    return {'page': pno, 'printed': printed, 'units': units, 'foots': foots}


def run_lines_to_units(run):
    out = []
    if len(run) > 1 and all(' | ' in x for x in run):
        return [{'t': 'table', 'rows': run}]
    if len(run) > 1 and not any(x.startswith('#') for x in run):
        # several lines without blank separation (lists, index entries, signatures)
        if any(' | ' in x for x in run):
            return [{'t': 'table', 'rows': [x for x in run]}]
        return [{'t': 'lines', 'v': run}]
    for x in run:
        if x.startswith('#'):
            lvl = len(x) - len(x.lstrip('#'))
            out.append({'t': 'h', 'lvl': lvl, 'text': x[lvl:].strip()})
        elif x == '(صفحة فارغة)':
            out.append({'t': 'blank'})
        else:
            out.append({'t': 'para', 'text': x})
    return out


def starts_new(text):
    s = text.lstrip()
    return (s.startswith('[[') or s.startswith('**') or s.startswith('<small>')
            or s.startswith('[صورة') or s.startswith('«') and False)


def page_marker(p):
    lab = p['printed'] if p['printed'] and p['printed'] != 'none' else to_ar(p['page'])
    return f'[صفحة {lab}]'


def build(pages):
    """Return list of rendered blocks (each a dict with 'md' and 'pages_ending')."""
    doc = []      # units with page refs
    fn_by_page = {}
    last_fn_page = None
    for p in pages:
        pno = p['page']
        # footnotes
        fl = []
        for num, text, verses in p['foots']:
            if num == 'cont' and last_fn_page is not None and fn_by_page.get(last_fn_page):
                prev = fn_by_page[last_fn_page][-1]
                a, b = prev['text'].rstrip(), text.lstrip()
                if a.endswith('=') and b.startswith('='):
                    a, b = a[:-1].rstrip(), b[1:].lstrip()
                prev['text'] = (a + ' ' + b).strip()
                prev['verses'] += verses
                prev['cont_pages'].append(pno)
            else:
                fl.append({'num': num, 'text': text, 'verses': verses, 'cont_pages': []})
        if fl:
            fn_by_page[pno] = fl
            last_fn_page = pno
        units = [dict(u) for u in p['units'] if u['t'] != 'blank'] or [{'t': 'blank'}]
        if len(units) == 1 and units[0].get('t') == 'para' and units[0].get('text') == '(OMITTED)':
            units = [{'t': 'omit'}]
        mark = page_marker(p)
        first = units[0]
        prev = doc[-1] if doc else None
        joined = False
        lone_num = prev is not None and prev['t'] == 'para' and re.fullmatch(r'\[\[[^\]]+\]\]', prev['text'].strip())
        if lone_num and first['t'] == 'verses':
            num = prev['text'].strip()
            prev['t'] = 'verses'
            prev['v'] = [num + ' ' + mark + ' ' + first['v'][0]] + first['v'][1:]
            del prev['text']
            prev['pages'].append(pno)
            joined = True
        elif prev and first['t'] == 'para' and prev['t'] == 'para' and (lone_num or (pno >= 5
                and not re.sub(r'</small>$', '', prev['text']).endswith(END_PUNCT) and not re.sub(r'</small>$', '', prev['text']).endswith(':')
                and len(re.sub(r'<[^>]+>|\*\*|\[\^\d+\]', '', prev['text']).split()) >= 8
                and not first['text'].lstrip('*').startswith('بسم')
                and (not starts_new(first['text']) or (prev['text'].endswith('</small>') and first['text'].startswith('<small>'))))):
            prev['text'] = prev['text'] + ' ' + mark + ' ' + first['text']
            prev['pages'].append(pno)
            joined = True
        elif prev and first['t'] == 'verses' and prev['t'] == 'verses':
            first_v = [mark + ' ' + first['v'][0]] + first['v'][1:]
            prev['v'] += first_v
            prev['pages'].append(pno)
            joined = True
        start = 1 if joined else 0
        for i, u in enumerate(units[start:], start):
            u['pages'] = [pno]
            if i == 0:
                u['mark'] = mark
            doc.append(u)
        # record which doc unit holds the end of this page
        doc[-1].setdefault('ends', []).append(pno)
    return doc, fn_by_page


HON = re.compile(r'\{([^{}]{2,30})\}')
FNREF = re.compile(r'\[\^(\d+)\]')


VOLPAGE = re.compile(r'(?<![٠-٩/])([١-٩][٠-٩]?)/ ?([٠-٩]{1,4})(?![٠-٩]*/)')


def render_inline(text, pno_for_refs, refmap):
    text = HON.sub(lambda m: m.group(1), text)
    text = VOLPAGE.sub(r'\1/ \2', text)   # «ج/ ص»: keeps the volume on the right in RTL display
    text = re.sub(r'\[\[([^\]]+)\]\]', r'**[\1]**', text)
    return text


def fix_refs(text, pages, fn_by_page, used):
    """Replace [^k] with page-scoped labels. A ref belongs to the page where it occurs;
    since a joined paragraph spans pages, split on page markers to know the page."""
    parts = re.split(r'(\[صفحة [^\]]+\])', text)
    out, idx = [], 0
    page_seq = list(pages)
    cur_page = page_seq[0]
    k = 0
    for part in parts:
        if re.fullmatch(r'\[صفحة [^\]]+\]', part or ''):
            k += 1
            if k < len(page_seq):
                cur_page = page_seq[k]
            out.append(part)
            continue
        def rep(m, cp=cur_page):
            lab = f'p{cp:03d}-{m.group(1)}'
            used.add(lab)
            return f'[^{lab}]'
        out.append(FNREF.sub(rep, part))
    return ''.join(out)


def render(doc, fn_by_page):
    md, used, defined = [], set(), set()
    pending_pages = []
    for u in doc:
        pages = u['pages']
        mark = u.get('mark')
        t = u['t']
        if t == 'h':
            if mark:
                md.append(mark)
            md.append('#' * u['lvl'] + ' ' + fix_refs(render_inline(u['text'], pages[0], None), pages, fn_by_page, used))
        elif t == 'para':
            txt = u['text']
            if txt.strip() != '* * *' and re.match(r'^[*+-] ', txt):
                txt = '\\' + txt   # a printed leading star/dash, not a Markdown bullet
            if mark:
                txt = mark + ' ' + txt
                # page marker before a leading [[n]] is fine
            md.append(fix_refs(render_inline(txt, pages[0], None), pages, fn_by_page, used))
        elif t == 'verses':
            vs = list(u['v'])
            if mark:
                vs[0] = mark + ' ' + vs[0]
            # verses may carry page markers when joined across pages
            rendered = []
            vpages = list(pages)
            text = '\n'.join(vs)
            text = fix_refs(text, vpages, fn_by_page, used)
            for v in text.split('\n'):
                v = render_inline(v, pages[0], None)
                v = ' … '.join(h.strip() for h in v.split('||'))
                rendered.append(v)
            md.append(' \\\n'.join(rendered))
        elif t == 'lines':
            ls = list(u['v'])
            if mark:
                ls[0] = mark + ' ' + ls[0]
            ls = [render_inline(fix_refs(x, pages, fn_by_page, used), pages[0], None) for x in ls]
            md.append(' \\\n'.join(ls))
        elif t == 'table':
            rows = [[c.strip() for c in r.split(' | ')] for r in u['rows']]
            ncol = max(len(r) for r in rows)
            rows = [r + [''] * (ncol - len(r)) for r in rows]
            if mark:
                md.append(mark)
            tbl = ['| ' + ' | '.join(rows[0]) + ' |', '|' + '---|' * ncol]
            for r in rows[1:]:
                tbl.append('| ' + ' | '.join(render_inline(fix_refs(c, pages, fn_by_page, used), pages[0], None) for c in r) + ' |')
            md.append('\n'.join(tbl))
        elif t == 'blank':
            md.append((mark + ' ' if mark else '') + '(صفحة فارغة)')
        elif t == 'omit':
            md.append(mark or '')
        # footnote definitions for pages ending in this unit
        for pno in u.get('ends', []):
            for f in fn_by_page.get(pno, []):
                lab = f'p{pno:03d}-{f["num"]}'
                body = render_inline(f['text'], pno, None)
                body = FNREF.sub(lambda m: f'({m.group(1)})', body)
                if f['verses']:
                    vs = [' … '.join(h.strip() for h in render_inline(v, pno, None).split('||')) for v in f['verses']]
                    body = (body + ' ' if body else '') + ' / '.join(vs)
                md.append(f'[^{lab}]: {body}')
                defined.add(lab)
    return '\n\n'.join(md) + '\n', used, defined


def load_pages(d, first=None, last=None):
    pages = []
    for f in sorted(glob.glob(os.path.join(d, 'p[0-9][0-9][0-9].txt'))):
        n = int(os.path.basename(f)[1:4])
        if first and n < first or last and n > last:
            continue
        pages.append(parse_page(f))
    return pages


if __name__ == '__main__':
    args = sys.argv[1:]
    d, out = args[0], args[1]
    first = int(args[args.index('--first') + 1]) if '--first' in args else None
    last = int(args[args.index('--last') + 1]) if '--last' in args else None
    if '--omit-pages' in args:
        OMIT_PAGES = {int(x) for x in args[args.index('--omit-pages') + 1].split(',')}
    if '--decisions' in args:
        DECISIONS = {}
        for l in open(args[args.index('--decisions') + 1], encoding='utf-8'):
            if l.strip():
                r = json.loads(l); DECISIONS[r['id']] = r
    pages = load_pages(d, first, last)
    doc, fn = build(pages)
    md, used, defined = render(doc, fn)
    open(out, 'w', encoding='utf-8').write(md)
    print('pages', len(pages), 'units', len(doc), 'refs', len(used), 'defs', len(defined))
    print('refs without def:', sorted(used - defined)[:20])
    print('defs without ref:', sorted(defined - used)[:20])
    if DECISIONS is not None:
        lp = out + '.removed.jsonl'
        with open(lp, 'w', encoding='utf-8') as fh:
            for r in REMOVED_LOG:
                fh.write(json.dumps(r, ensure_ascii=False) + '\n')
        print('removed runs:', len(REMOVED_LOG), '->', lp)
