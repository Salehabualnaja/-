"""يحوّل ملف Markdown بسيطاً إلى HTML بهوية سكن (غلاف، صفحات المحتوى، خاتمة).

الاستعمال:
    python3 -I md_to_brand_html.py IN.md OUT_DIR "العنوان" "العنوان الفرعي" "التاريخ"

OUT_DIR يجب أن يحتوي الخطوط والشعارات (انظر SKILL.md: «تجهيز مجلد العمل»).
يدعم: العناوين #/##/###، والفقرات، و**الغامق**، والقوائم - و1.، والجداول |…|، و> اقتباس، و---.
السطر الذي يبدأ بـ «**مؤشر الإنذار:**» يُلوَّن بلون التنبيه.
"""
import html
import re
import shutil
import sys
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent


def inline(t: str) -> str:
    t = html.escape(t)
    t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
    return t


def convert(md: str) -> str:
    out, lines, i = [], md.splitlines(), 0
    sec = 0
    while i < len(lines):
        ln = lines[i].rstrip()
        if not ln.strip():
            i += 1
            continue
        if ln.startswith("# "):
            out.append(f"<h1>{inline(ln[2:])}</h1>")
        elif ln.startswith("## "):
            sec += 1
            txt = re.sub(r"^\d+\\?\)\s*", "", ln[3:])  # «1) العنوان» يكفيه الرقم المصفوف
            out.append(f'<h2><span class="num">{sec:02d}</span>{inline(txt)}</h2>')
        elif ln.startswith("### "):
            out.append(f"<h3>{inline(ln[4:])}</h3>")
        elif ln.strip() == "---":
            out.append("<hr>")
        elif ln.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                if not all(re.fullmatch(r":?-{2,}:?", c) for c in cells):
                    rows.append(cells)
                i += 1
            head, body = rows[0], rows[1:]
            t = ["<table><thead><tr>"] + [f"<th>{inline(c.replace('**', ''))}</th>" for c in head] + ["</tr></thead><tbody>"]
            for r in body:
                t.append("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>")
            t.append("</tbody></table>")
            out.append("".join(t))
            continue
        elif re.match(r"^\s*[-*] ", ln):
            items = []
            while i < len(lines) and re.match(r"^\s*[-*] ", lines[i]):
                items.append(f"<li>{inline(re.sub(r'^\s*[-*] ', '', lines[i]))}</li>")
                i += 1
            out.append("<ul>" + "".join(items) + "</ul>")
            continue
        elif re.match(r"^\s*\d+\. ", ln):
            items = []
            while i < len(lines) and re.match(r"^\s*\d+\. ", lines[i]):
                items.append(f"<li>{inline(re.sub(r'^\s*\d+\. ', '', lines[i]))}</li>")
                i += 1
            out.append("<ol>" + "".join(items) + "</ol>")
            continue
        elif ln.startswith("> "):
            out.append(f"<blockquote>{inline(ln[2:])}</blockquote>")
        else:
            cls = ' class="alert"' if ln.startswith("**مؤشر الإنذار") else ""
            out.append(f"<p{cls}>{inline(ln)}</p>")
        i += 1
    return "\n".join(out)


def main() -> int:
    src, outdir, title, subtitle, date = sys.argv[1:6]
    outdir = Path(outdir)
    md = Path(src).read_text(encoding="utf-8")
    md = re.sub(r"^# .*\n", "", md, count=1)  # العنوان الأول يصير غلافاً
    shutil.copy(SKILL / "assets" / "style.css", outdir / "style.css")
    body = convert(md)
    doc = f"""<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<link rel="stylesheet" href="style.css"><title>{html.escape(title)}</title></head><body>
<section class="cover">
  <img class="mark" src="logo-symbol-cream.png"><img class="mark2" src="logo-symbol-cream.png">
  <img class="logo" src="logo-word-cream.png">
  <h1>{html.escape(title)}</h1>
  <div class="sub">{html.escape(subtitle)}</div>
  <div class="chips"><span class="chip">التأهيل</span><span class="chip">التوفيق</span><span class="chip">الاستشارات الأسرية</span></div>
  <div class="meta">{html.escape(date)} · sakann.net</div>
</section>
<main class="page">
<img class="toplogo" src="logo-word-green.png">
{body}
</main>
<section class="closing">
  <img class="logo" src="logo-word-cream.png">
  <div class="tag">نحو بيوت تسكنها المودة</div>
  <div class="site">sakann.net</div>
</section>
</body></html>"""
    (outdir / "index.html").write_text(doc, encoding="utf-8")
    print(outdir / "index.html")
    return 0


if __name__ == "__main__":
    sys.exit(main())
