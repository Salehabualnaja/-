# Transcription spec (for the page-transcription agents)

Copy this file into the work folder as `SPEC.md`, replace `{WORK}` with the absolute work-folder path and `{BOOK}` with the book's title/edition, and add a «Clarifications» section after the pilot. Every transcription agent reads it first.

---

The book {BOOK} is a scanned PDF. Each page is an image:
`{WORK}/pages/pNNN.png` (NNN = 3-digit PDF page number). Full-resolution scans: `{WORK}/full/f-NNN.png`.

Your job: transcribe pages into plain-text files, one per page: `{WORK}/trans/pNNN.txt`.

**The absolute rule: not a single word may be dropped, added or changed.** Accuracy beats speed.

## How to work, per page
1. Read the page image with the Read tool.
2. Transcribe it following the conventions below; write the file with the Write tool.
3. Proof it: look at the image again line by line, top to bottom, against what you wrote — no visual line skipped (count the lines of each paragraph), no word skipped or duplicated, every number right (entry numbers, footnote numbers, Quran references, dates), harakat as printed, all footnotes present. Fix with Edit.
4. Zoom only for a word you genuinely cannot read:
   `python3 -I {SKILL}/scripts/zoom.py {WORK} N band Y0 Y1 [SCALE]` (rows Y0..Y1 of the page image, nearest-neighbour ×SCALE), or
   `python3 -I {SKILL}/scripts/zoom.py {WORK} N thirds` (three native-resolution strips — best for small-font isnads).

## Efficiency (a book has hundreds of pages)
- Budget about 3–5 tool calls per page: Read → Write → proof in your head against the image already in context → at most 1–2 targeted zooms → Edit.
- Do not zoom routinely, and do not zoom only to settle a haraka or a hamza in the small-font isnads — give your best reading there.
- Shadda+kasra vs shadda+damma (and kasratan/dammatan) look alike in many fonts: follow the grammatically expected vowel silently.
- `⟨؟⟩` marks an uncertain word or letter only — never a doubtful haraka.

## File format
```
=== page NNN | printed: ٥٠ ===
<body>
--- footnotes ---
[1] footnote text
[2] footnote text
```
- `printed:` = the page number printed on the page, in the digits printed (Arabic-Indic usually), or `none`. Printed numbering may skip or shift (e.g. a missing printed number near the indexes) — always write what is printed.
- Omit the `--- footnotes ---` section if the page has none.

## What to skip — and only this
- The running header (book title / chapter title at the top) and the page number in its ornament.
- The rule above the footnotes, and purely decorative ornaments (flowers beside entry numbers, frames, end-of-chapter ornaments).
Everything else — every word of body, headings, footnotes, captions, signatures, dates, copyright text, notes — is transcribed.

## Text fidelity
- Copy exactly as printed: spelling, hamza forms (أ إ آ ء ؤ ئ), ى/ي, ة/ه. **Do not correct** anything, even obvious misprints (they are listed later, not fixed).
- **Harakat:** reproduce exactly the diacritics printed, on the letters where they are printed — no more, no fewer.
- **Honorific ligatures:** ﷺ stays as the character ﷺ; ﷻ for جل جلاله; any other honorific printed as a small ligature glyph → its words inside braces: `{رضي الله عنه}`, `{رحمه الله}`, `{رضي الله عنهما}`, `{عز وجل}`, `{جل وعلا}`, `{عليه السلام}` … Keep printed brackets around it: `[{رضي الله عنه}]`.
- Punctuation exactly as printed: ، ؛ : . ! ؟ « » " ( ) [ ] ـ … A dash used as punctuation (ـ حين ذبحت الشاة ـ) → `ـ`.
- Ignore kashida stretching used only for justification (فــمــطــبــوع → فمطبوع). But a word split across the two hemistichs of a verse with a printed tatweel keeps it: `العبـ || ـدَ`; with no tatweel printed: `النا || س`.
- Digits as printed. Volume/page references are written in logical order, volume first: `(٣/ ٥٠٦)`.
- Quran: keep ﴿ ﴾, the text as printed (Uthmani script if printed so, with its marks), verse-number glyphs and the printed reference, e.g. `[المؤمنون: ٥٣]`.

## Layout markup
- **Paragraphs:** one paragraph = one line (join wrapped visual lines with single spaces); a blank line between paragraphs. A page that starts mid-sentence just starts with it — joining across pages happens later.
- **Headings:** chapter titles (ذكر… / باب…) → `## `; a framed chapter number above the title goes into the heading: `## [٢] ذكر …`. Major section titles (مقدمة…, ترجمة…, سند الكتاب…, الخاتمة, فهرس…, a title page) → `# `. Smaller headings inside a section → `### ` (keep a printed leading star: `### ✱ …` / `### * …`).
- **Numbered entries:** the boxed number → `[[٣٣]]` at the start of the entry, followed by a space and the entry's first words.
- **Font size — very important:** in the body, wrap every run of SMALLER-font text in `<small>` … `</small>` — in most hadith/adab editions this is how the editor sets the isnads (chains of narrators) and the lines introducing verses («وأنشدني فلان:»). Mark exactly where the size changes, even mid-line. A line that is printed in body size (often starting with a bold word: **عن**, **حدَّثنا**, **أنشدني**) is NOT small. No `<small>` in footnotes or headings.
- **Bold:** `**…**` for bold text (قال أبو حاتم, the first word of a matn, bold prophetic words inside «…», a bold lemma at the start of a footnote).
- **Footnote marks** in the body (raised ١، ٢…) → `[^1]`, `[^2]` in Western digits, placed exactly where the mark is.
- **Footnotes:** one per line `[N] text` (wrapped lines joined; footnotes printed side by side → separate lines in number order). A footnote continued from the previous page (no number, top of the footnote area) → `[cont] text`. Keep a printed continuation sign `=` where it appears.
- **Poetry:** each verse on its own line starting with `%% `, hemistichs separated by ` || `: `%% صدر البيت || عجز البيت`. A single hemistich / one-piece line → `%% text`. Poetry inside a footnote: `%% ` lines right after that footnote's `[N]` line.
- **Images** (cover art, logos, manuscript photos, calligraphic basmala): `[صورة: وصف قصير]`; then transcribe any legible text in it as normal lines.
- **Index / table pages:** one entry per line, columns separated by ` | ` (dotted leaders become the separator); the column headings as the first line, repeated on each page if printed so.
- Lists (١ ـ … ٢ ـ …), centred lines, signatures, dates, places → each its own line.
- Blank page → only the `=== page … ===` line and `(صفحة فارغة)`.

## Report
When done with your range, reply briefly: pages done, pages where you used `⟨؟⟩` (with the word), layout oddities, misprints you kept as printed, any page not completed. Do not paste transcriptions.
