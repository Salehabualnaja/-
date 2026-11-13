# Typesetting spec — the house style

This is the style of the approved reference edition («روضة العقلاء ونزهة الفضلاء»، النسخة بلا أسانيد، 2026-11). `scripts/build_docx.js` implements it; this file documents it so it can be checked, explained, or adjusted on request (font and page size via env `BOOK_FONT`, `PAGE_CM`).

## Contents
1. Markdown conventions
2. Word: page, fonts, sizes
3. Word: blocks (headings, prose, entries, verses, tables, footnotes)
4. Page breaks
5. What is dropped or changed only in Word

## 1. Markdown conventions (both MD files)
- Top of file: an HTML comment with title, author, edition, editor, and the conventions line.
- `[صفحة ٥٠]` — start of printed page 50, inline exactly at the page boundary when a paragraph runs over pages. Never `[ص: ٥٠]`: that collides with Quran references to Surat Ṣād «[ص: ٢٦]».
- `<small>…</small>` — text printed in the small font (mostly isnads).
- `**[٣٤]**` — entry number. `**…**` — bold as printed.
- Footnotes `[^p050-1]` (page-scoped, unique), definitions placed after the block where their page ends; a footnote continued over pages becomes one footnote (the printed `=` continuation signs removed at the join).
- Verses: one verse per line, hemistichs separated by « … », lines joined by a trailing `\` (hard break).
- Headings `#` sections, `##` chapters (`## [٢] ذكر …`), `###` sub-headings.
- Indexes as Markdown tables (header row repeated per printed page).
- Honorific ligatures written as words (رضي الله عنه، عز وجل…), ﷺ kept as the glyph.
- Volume/page references rendered `(٢/ ٣٩٣)` — the space after the slash keeps the volume on the right in RTL display.
- A leading printed `*` is escaped (`\*`) so it is not a list bullet; `* * *` stays a separator.

## 2. Word — page, fonts, sizes
| Item | Value |
|---|---|
| Page | 17 × 24 cm (9638 × 13606 twips), portrait |
| Margins | top 2.1 cm (1191), bottom 2.0 cm (1134), right/left 1.8 cm (1020); header/footer distance ≈ 1 cm (560) |
| Font | Traditional Arabic for every script slot (ascii, cs, hAnsi, eastAsia); runs `rtl`, paragraphs `bidi` |
| Body | 16 pt; line spacing 1.15 (276); space after 5 pt (100); justified (`both`); first-line indent 1 cm (567) |
| Small-font text (`<small>`) | 13 pt |
| Section heading (H1) | 22 pt bold, centred, 12 pt before/after |
| Chapter heading (H2) | 19 pt bold, centred, 12 pt before / 10 pt after |
| Sub-heading (H3) | 16 pt bold, aligned to the start (right), 8 pt before / 4 pt after |
| Footnotes | 12 pt (small runs inside 11 pt), single spacing, justified, 1 pt after; numbering restarts on each page |
| Page markers `[صفحة N]` | 9 pt, gray #808080, non-breaking spaces inside |
| Running header | book title, 10 pt, gray #595959, centred, thin bottom rule #A0A0A0 |
| Footer | page number, 10 pt, centred |
| First page (cover) | no header, no footer |
All headings use Word's built-in Heading 1/2/3 styles (navigation pane, automatic TOC possible); keepNext on headings.

## 3. Word — blocks
- **Prose paragraph:** justified, first-line indent 1 cm. Exceptions — no indent: a paragraph starting with an entry number `[N]`; lines of a multi-line block (lists, signatures, copyright lines: 1.5 pt after).
- **Entry number** `[٣٤]`: bold, same size as the text.
- **Verses:** a borderless 2-column table, RTL, each column half the text width; each hemistich centred in its cell; rows can't split across pages; a single-hemistich line spans both columns, centred; 2 pt after each line; a small spacer after the poem. An entry number or page marker standing before the first verse goes on its own line above the table.
- **Front matter (printed pages 1–4: cover, half-title, copyright, basmala):** every line centred. Any basmala line elsewhere: centred.
- **Image placeholders** `[صورة: …]`: 13 pt gray italic, centred.
- **Index tables:** thin borders #A0A0A0; header row bold on #EDEDED, repeated on each Word page; first column (text) aligned to the start, other columns 2.3 cm (1300) centred; 13 pt; rows don't split.
- **Footnote verses:** each verse as a centred line inside the footnote, hemistichs separated by spaces.

## 4. Page breaks
- Before each front-matter page 2, 3, 4 (cover / half-title / copyright / basmala each on its own page).
- Before every section heading (H1, after the front matter) and every chapter heading (H2).
- The break moves back over a basmala line, a picture placeholder or a page marker that sit just before the heading on the same printed page, so «بسم الله…» stays on the heading's page.

## 5. Dropped or changed only in Word
- `(صفحة فارغة)` placeholders are not printed (the page marker stays).
- Footnote labels become real Word footnotes in reference order.
Everything else is word-for-word the isnad-free Markdown — check it (SKILL.md step 9).

## Known limits and notes
- **Preview:** LibreOffice (used for the PDF preview) lacks Traditional Arabic and substitutes a font without kashida support; justified lines may look broken into letters, harakat may touch the line above, page count and break positions differ from Word. It is a preview artifact — the text is intact (check the XML text, not the preview, for content).
- **Footnote numerals:** footnote numbers follow Word's own numeral setting (File › Options › Advanced › Numeral: «Context» or «Hindi» shows ١، ٢، ٣ like the print; «Arabic» shows 1, 2, 3). The file does not force it (no reliable OOXML format for Arabic-Indic footnote numbers).
- **Index page numbers** are the printed edition's pages; in the Word file they correspond to the gray `[صفحة N]` markers, not to Word's page numbers. Say so in the notes; renumbering the index is a separate request.
- **Document properties:** author = «saffomiri», title = the book title.
