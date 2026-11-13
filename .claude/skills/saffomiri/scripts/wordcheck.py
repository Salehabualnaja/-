"""Word-for-word integrity checks between the pipeline's stages.

usage:
  python3 -I wordcheck.py trans TRANS_DIR FULL.md
      every word of the page transcriptions is in the assembled Markdown, and nothing else
  python3 -I wordcheck.py removal FULL.md NOISNAD.md REMOVED_LOG.jsonl
      FULL − NOISNAD == exactly the removed isnad words (+ footnotes that were inside them — listed)
  python3 -I wordcheck.py docx NOISNAD.md BOOK.docx
      the Word file holds exactly the Markdown's words (minus «(صفحة فارغة)» placeholders)
Words are compared as multisets after dropping markup, page markers and punctuation.
"""
import sys, re, glob, os, json, zipfile, html, collections


def read_md(path):
    # the leading HTML comment (title, edition, conventions) is metadata, not book text
    return re.sub(r'^\s*<!--.*?-->\s*', '', open(path, encoding='utf-8').read(), flags=re.S)


def norm(s):
    s = re.sub(r'\[صفحة[  ][^\]]+\]', ' ', s)
    s = re.sub(r'(?m)^=== page.*$|^--- footnotes ---$', ' ', s)
    s = re.sub(r'(?m)^\[(\d+|cont)\]', ' ', s)
    s = re.sub(r'\[\^[^\]]+\]:?', ' ', s)
    s = re.sub(r'</?small>', ' ', s)
    s = re.sub(r'\{([^{}]*)\}', r' \1 ', s)
    s = re.sub(r'[^\w؀-ۿ]', ' ', s)
    s = re.sub(r'[،؛؟٪-٭۔]', ' ', s)
    return [w for w in s.split() if w]


def report(name_a, a, name_b, b, extra_ok=None):
    ca, cb = collections.Counter(a), collections.Counter(b)
    if extra_ok:
        ca = ca - collections.Counter(extra_ok)
    only_a, only_b = ca - cb, cb - ca
    print(f'{name_a}: {len(a)} words | {name_b}: {len(b)} words')
    print(f'only in {name_a}:', only_a.most_common(12))
    print(f'only in {name_b}:', only_b.most_common(12))
    print('RESULT:', 'IDENTICAL' if not only_a and not only_b else 'DIFFERENT')


mode = sys.argv[1]
if mode == 'trans':
    t = []
    for f in sorted(glob.glob(os.path.join(sys.argv[2], 'p[0-9][0-9][0-9].txt'))):
        t += norm(open(f, encoding='utf-8').read())
    report('pages', t, 'markdown', norm(read_md(sys.argv[3])))
elif mode == 'removal':
    full_md = read_md(sys.argv[2])
    full, noi = norm(full_md), norm(read_md(sys.argv[3]))
    removed = []
    for l in open(sys.argv[4], encoding='utf-8'):
        r = json.loads(l)
        txt = r['removed'].replace(r['kept'], ' ', 1) if r['kept'] else r['removed']
        removed += norm(txt)
    noi_text = read_md(sys.argv[3])
    lost_fn = [m.group(1) for m in re.finditer(r'(?m)^\[\^([^\]]+)\]:', full_md) if f'[^{m.group(1)}]:' not in noi_text]
    for lab in lost_fn:
        removed += norm(re.search(r'(?m)^\[\^' + re.escape(lab) + r'\]:.*$', full_md).group(0))
    print('footnotes removed with their isnad:', lost_fn)
    diff = collections.Counter(full) - collections.Counter(noi)
    print(f'full {len(full)} | noisnad {len(noi)} | removed {len(removed)}')
    print('removed but not explained:', (diff - collections.Counter(removed)).most_common(12))
    print('explained but still present:', (collections.Counter(removed) - diff).most_common(12))
    print('added in noisnad:', (collections.Counter(noi) - collections.Counter(full)).most_common(12))
    ok = not (diff - collections.Counter(removed)) and not (collections.Counter(removed) - diff) and not (collections.Counter(noi) - collections.Counter(full))
    print('RESULT:', 'EXACT' if ok else 'CHECK')
elif mode == 'docx':
    md = norm(read_md(sys.argv[2]))
    z = zipfile.ZipFile(sys.argv[3])
    txt = ''
    for part in ('word/document.xml', 'word/footnotes.xml'):
        s = z.read(part).decode('utf-8')
        txt += ' '.join(html.unescape(x) for x in re.findall(r'<w:t(?:\s[^>]*)?>([^<]*)</w:t>', s)) + ' '
    blanks = read_md(sys.argv[2]).count('(صفحة فارغة)')
    report('markdown', md, 'docx', norm(txt), extra_ok=['صفحة', 'فارغة'] * blanks)
