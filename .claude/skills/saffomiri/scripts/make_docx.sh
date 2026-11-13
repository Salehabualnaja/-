#!/bin/bash
# Build the typeset Word file from export_json.py output, patch footnote numbering
# (restart on each page), validate if the docx skill is available, and render a PDF preview.
# usage: make_docx.sh BOOK.json OUT_DIR "عنوان الكتاب"
# Optional env: BOOK_FONT (default "Traditional Arabic"), PAGE_CM (default "17x24")
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
IN=$(realpath "$1"); O=$(realpath -m "$2"); TITLE=$3
mkdir -p "$O"
node "$HERE/build_docx.js" "$IN" "$O/raw.docx" "$TITLE"
rm -rf "$O/un" && mkdir "$O/un" && cd "$O/un" && unzip -q ../raw.docx
python3 -I - <<'PY'
import re
p = 'word/document.xml'; s = open(p, encoding='utf-8').read()
fp = '<w:footnotePr><w:numRestart w:val="eachPage"/></w:footnotePr>'
m = list(re.finditer(r'<w:sectPr\b[^>]*>', s)); assert len(m) == 1
start = m[0].end(); sect = s[start:s.index('</w:sectPr>', start)]
refs = list(re.finditer(r'<w:(headerReference|footerReference)\b[^>]*/>', sect))
pos = start + (refs[-1].end() if refs else 0)
open(p, 'w', encoding='utf-8').write(s[:pos] + fp + s[pos:])
PY
rm -f ../book.docx && zip -q -X -r -D ../book.docx . && cd ..
# optional: validate + PDF preview with the docx skill's helpers, else plain soffice
SOFF=$(find "$HOME/.claude" /root/.claude /mnt/skills /mnt/user-data -path '*/docx/scripts/office/soffice.py' 2>/dev/null | head -1)
DOCX_SKILL=${SOFF%/scripts/office/soffice.py}
if [ -n "$DOCX_SKILL" ] && [ -f "$DOCX_SKILL/scripts/office/validate.py" ]; then
  python3 "$DOCX_SKILL/scripts/office/validate.py" book.docx 2>&1 | tail -1
  rm -f book.pdf; timeout 900 python3 "$DOCX_SKILL/scripts/office/soffice.py" --headless --convert-to pdf book.docx >/dev/null 2>&1 || true
elif command -v soffice >/dev/null; then
  rm -f book.pdf; timeout 900 soffice --headless --convert-to pdf book.docx >/dev/null 2>&1 || true
fi
[ -f book.pdf ] && pdfinfo book.pdf | grep Pages || echo "no PDF preview (LibreOffice not found)"
echo "$O/book.docx"
