"""Completeness checks for the transcription.

1) Page-level: compare word counts of each transcribed page (body+footnotes) with the
   PDF's own (low-quality) OCR text layer — flags pages where lines may be missing.
2) Matn-level: align Ibn Hibban's text (body of pages FIRST..LAST) against the Shamela
   edition and list runs of >= MINRUN Shamela words that have no counterpart in the
   transcription (possible omissions), with the page where they should be.

usage: python3 -I verify.py TRANS_DIR PDF SHAMELA_JSONL OUT_PREFIX [FIRST LAST]
"""
import re, sys, os, glob, json, subprocess, difflib

TASHKEEL = re.compile('[ؐ-ًؚ-ٰٟۖ-ۭـ]')
NONLETTER = re.compile(r'[^ء-غف-ي\s]')


def norm_text(s):
    s = TASHKEEL.sub('', s)
    s = s.replace('ﷺ', ' صلى الله عليه وسلم ')
    s = re.sub('[أإآٱ]', 'ا', s)
    s = s.replace('ى', 'ي').replace('ة', 'ه').replace('ؤ', 'و').replace('ئ', 'ي')
    s = NONLETTER.sub(' ', s)
    return s.split()


def strip_markup(s):
    s = re.sub(r'</?small>', ' ', s)
    s = re.sub(r'\[\^\d+\]', ' ', s)
    s = re.sub(r'\[\[[^\]]*\]\]', ' ', s)
    s = s.replace('**', ' ').replace('||', ' ').replace('%%', ' ')
    s = re.sub(r'\{([^{}]*)\}', r' \1 ', s)
    s = re.sub(r'^#+ ', ' ', s, flags=re.M)
    s = s.replace('⟨؟⟩', ' ')
    return s


def read_trans(path):
    raw = open(path, encoding='utf-8').read()
    lines = raw.split('\n')[1:]
    body, foot, inf = [], [], False
    for ln in lines:
        if ln.strip() == '--- footnotes ---':
            inf = True; continue
        (foot if inf else body).append(ln)
    return '\n'.join(body), '\n'.join(foot)


def main():
    tdir, pdf, shj, outp = sys.argv[1:5]
    first, last = (int(sys.argv[5]), int(sys.argv[6])) if len(sys.argv) > 6 else (29, 398)
    files = sorted(glob.glob(os.path.join(tdir, 'p[0-9][0-9][0-9].txt')))
    rep = []
    # ---- 1) page-level word counts vs OCR layer
    rep.append('# Page word-count check (transcription vs PDF OCR layer)\n')
    rep.append('page | trans_words | ocr_words | ratio')
    flagged = []
    for f in files:
        n = int(os.path.basename(f)[1:4])
        b, ft = read_trans(f)
        tw = len(norm_text(strip_markup(b + '\n' + ft)))
        ocr = subprocess.run(['pdftotext', '-f', str(n), '-l', str(n), pdf, '-'], capture_output=True, text=True).stdout
        ow = len(norm_text(ocr))
        ratio = tw / ow if ow else (1.0 if tw == 0 else 9.99)
        if ow > 30 and (ratio < 0.88 or ratio > 1.25):
            flagged.append((n, tw, ow, ratio))
    for n, tw, ow, r in flagged:
        rep.append(f'{n} | {tw} | {ow} | {r:.2f}')
    rep.append(f'\nflagged pages: {len(flagged)} of {len(files)}\n')
    # ---- 2) matn alignment vs Shamela
    tw, tpage = [], []
    for f in files:
        n = int(os.path.basename(f)[1:4])
        if n < first or n > last:
            continue
        b, _ = read_trans(f)
        ws = norm_text(strip_markup(b))
        tw += ws; tpage += [n] * len(ws)
    sw, spage = [], []
    for l in open(shj, encoding='utf-8'):
        r = json.loads(l)
        if os.environ.get('SH_IDS'):
            a, b = map(int, os.environ['SH_IDS'].split('-'))
            if not a <= r['page_id'] <= b:
                continue
        ws = norm_text(r['body'])
        sw += ws; spage += [r['printed_page']] * len(ws)
    sm = difflib.SequenceMatcher(None, sw, tw, autojunk=False)
    ops = sm.get_opcodes()
    matched = sum(i2 - i1 for t, i1, i2, j1, j2 in ops if t == 'equal')
    rep.append('# Matn alignment vs Shamela\n')
    rep.append(f'shamela words: {len(sw)}  transcription words (pp. {first}-{last}): {len(tw)}  matched: {matched} ({matched/len(sw):.1%} of shamela)\n')
    MINRUN = int(os.environ.get('MINRUN', '3'))
    rep.append(f'## Shamela runs (>= {MINRUN} words) missing from transcription\n')
    cnt = 0
    for t, i1, i2, j1, j2 in ops:
        if t in ('delete', 'replace') and (i2 - i1) >= MINRUN and (t == 'delete' or (i2 - i1) - (j2 - j1) >= MINRUN):
            pg = tpage[min(j1, len(tpage) - 1)] if tpage else '?'
            ctx_before = ' '.join(tw[max(0, j1 - 6):j1])
            rep.append(f'- trans p{pg} | shamela p{spage[i1]} | MISSING: {" ".join(sw[i1:i2])} | after: …{ctx_before}'
                       + (f' | trans has instead: {" ".join(tw[j1:j2])}' if t == 'replace' else ''))
            cnt += 1
    rep.append(f'\ncount: {cnt}\n')
    rep.append(f'## Transcription runs (>= {MINRUN} words) not in Shamela (possible additions / edition differences)\n')
    cnt2 = 0
    for t, i1, i2, j1, j2 in ops:
        if t in ('insert', 'replace') and (j2 - j1) >= MINRUN and (t == 'insert' or (j2 - j1) - (i2 - i1) >= MINRUN):
            rep.append(f'- trans p{tpage[j1]} | EXTRA: {" ".join(tw[j1:j2])}')
            cnt2 += 1
    rep.append(f'\ncount: {cnt2}\n')
    open(outp + '_report.md', 'w', encoding='utf-8').write('\n'.join(rep))
    print('\n'.join(rep[:3] + [rep[-1]]))
    print('flagged pages', len(flagged), '| missing runs', cnt, '| extra runs', cnt2)


main()
