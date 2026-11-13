"""Build the reviewer's list (Markdown) of every isnad removal.

usage: python3 -I review.py SMALL_ALL_JSONL DECISIONS_JSONL REMOVED_LOG_JSONL NOISNAD_MD OUT_MD ["عنوان الكتاب"]
"""
import sys, json, re

AR = '٠١٢٣٤٥٦٧٨٩'
def ar(n): return ''.join(str(AR.index(c)) if c in AR else c for c in str(n))

small = {json.loads(l)['id']: json.loads(l) for l in open(sys.argv[1], encoding='utf-8')}
dec = {json.loads(l)['id']: json.loads(l) for l in open(sys.argv[2], encoding='utf-8')}
removed_all = [json.loads(l) for l in open(sys.argv[3], encoding='utf-8')]
removed = [r for r in removed_all if not r['id'].endswith('-page')]
omitted_pages = [r for r in removed_all if r['id'].endswith('-page')]
noisnad = open(sys.argv[4], encoding='utf-8').read()

def clean(s):
    s = re.sub(r'\[\^\d+\]', '', s)
    s = re.sub(r'\{([^{}]*)\}', r'\1', s)
    return s.replace('|', '¦').strip()

def printed_page(pid):
    return small[pid]['page']

out = []
TITLE = sys.argv[6] if len(sys.argv) > 6 else ''
out.append('# قائمة الأسانيد المحذوفة' + (' — ' + TITLE if TITLE else '') + '\n')
full = [r for r in removed if not r['kept']]
part = [r for r in removed if r['kept']]
kept = [k for k, d in dec.items() if d['action'] == 'keep']
out.append(f'- أسانيد حُذفت كاملة: **{ar(len(full))}**')
out.append(f'- مواضع حُذف سندها وبقي منها ما يلزم للفهم (اسم القائل أو الشاعر أو تتمة الخبر): **{ar(len(part))}**')
out.append(f'- عبارات مطبوعة بالخط الصغير وليست أسانيد فأُبقيت كما هي: **{ar(len(kept))}**\n')
out.append('ملاحظة: أرقام الصفحات هنا هي أرقام صفحات الطبعة، وتقابلها في ملف الكتاب علامة [صفحة N].\n')
out.append('قاعدة الحذف: حُذف ما ميّزه المحقق بالخط الصغير على أنه إسناد، وبقي ما جعله بالخط الكبير بدايةً للمتن (مثل «عن خالد الربعي قال»)، ورقم النص، وكل الحواشي إلا ما كان تعليقًا على لفظ داخل السند المحذوف.\n')

for r in omitted_pages:
    out.append(f"- حُذفت الصفحة {ar(r['page'])} كاملة لأنها كلها إسناد (مثل صفحة «سند الكتاب إلى مؤلفه»). بقيت علامة الصفحة في موضعها، وبقي ذكرها في الفهرس كما طُبع.\n")
out.append('## أولًا: مواضع حُذف سندها وبقي منها جزء\n')
out.append('| الصفحة | رقم النص | العبارة الأصلية | ما بقي منها |')
out.append('|---|---|---|---|')
for r in part:
    s = small[r['id']]
    out.append(f"| {ar(s['page'])} | {s['entry'] or '—'} | {clean(r['removed'])} | {clean(r['kept'])} |")

out.append('\n## ثانيًا: عبارات بالخط الصغير أُبقيت لأنها ليست أسانيد\n')
out.append('| الصفحة | رقم النص | العبارة |')
out.append('|---|---|---|')
for k in kept:
    s = small[k]
    out.append(f"| {ar(s['page'])} | {s['entry'] or '—'} | {clean(s['text'])} |")

out.append('\n## ثالثًا: الأسانيد المحذوفة كاملة\n')
out.append('| الصفحة | رقم النص | السند المحذوف |')
out.append('|---|---|---|')
for r in full:
    s = small[r['id']]
    out.append(f"| {ar(s['page'])} | {s['entry'] or '—'} | {clean(r['removed'])} |")

# leftover transmission formulas in the isnad-free text (large font, kept on purpose)
body = re.sub(r'(?m)^\[\^[^\]]+\]:.*$', '', noisnad)
T = re.compile('[ً-ْٰ]')
hits = []
last = ''
for para in body.split('\n\n'):
    b = T.sub('', para)
    for m in re.finditer(r'(?:^|[\s*])(و?(?:حدثنا|أخبرنا|اخبرنا|أنبأنا|انبانا|أنبانا|انبأنا|حدثني|أخبرني|سمعت|ثنا))\s', b):
        ctx = b[max(0, m.start() - 30):m.end() + 60].replace('\n', ' ')
        pm = re.findall(r'\[صفحة ([^\]]+)\]', b[:m.start()])
        hits.append((pm[-1] if pm else last, ctx))
    pm_all = re.findall(r'\[صفحة ([^\]]+)\]', b)
    if pm_all:
        last = pm_all[-1]
out.append('\n## رابعًا: صيغ رواية بقيت في الخط الكبير كما طبعها المحقق (للمراجعة)\n')
out.append('هذه بقيت لأن المحقق جعلها جزءًا من المتن (الراوي الأخير أو صاحب القول). إن رغبتَ في حذفها أيضًا فأخبرني.\n')
out.append('| الصفحة (تقريبًا) | السياق |')
out.append('|---|---|')
for p, c in hits:
    out.append(f'| {ar(p)} | {clean(c)} |')
open(sys.argv[5], 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print('partial', len(part), 'full', len(full), 'kept', len(kept), 'leftover formulas', len(hits))
