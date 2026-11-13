# Verification — how to prove nothing was dropped

Run every check; report the numbers to the user. A claim like «لم تسقط كلمة» must rest on these, not on impressions.

## 1. Structural check (after transcription)
For each `trans/pNNN.txt`: valid header line; `<small>` and `</small>` balanced; even number of `**`; every `[^N]` has a `[N]` footnote and vice versa; list all `⟨؟⟩`. (One short Python loop — see SKILL.md step 5.) Fix problems by re-reading the page image.

## 2. Reference text alignment (the main omission detector)
Get the same work from the Shamela or Turath connector (a different edition is fine — the author's text is the same):
- Shamela: `shamela_search_books` → `shamela_get_pages_range` (book_id, count 20, `response_format: "json"`). Responses are capped at about 8–9 pages per call, inline (not saved to a file).
- Delegate the fetch to a subagent and have it save `{page_id, printed_page, body, foot}` JSONL **without retyping**: the harness logs every tool result verbatim in the subagent's transcript (`~/.claude/projects/<project>/<session>/subagents/agent-<id>.jsonl`), so a small Python script can pull the pages from there. Retyping 300 pages by a model would introduce the very errors we are hunting.
- Turath (`get_page`) gives one page per call — use it only for spot checks.

Then:
```
python3 -I scripts/verify.py WORK/trans WORK/book.pdf WORK/ref.jsonl WORK/out/v FIRST LAST
```
(FIRST..LAST = the PDF pages holding the author's text, without the editor's introduction and indexes. Env `SH_IDS=a-b` restricts the reference to page_ids a..b — useful for testing a sample.)

Read `v_report.md`:
- **MISSING** = runs of ≥3 reference words absent from the transcription — every one must be explained. Locate it (`scripts/nsearch.py WORK/trans "words without harakat"`) and look at the page image. Usual explanations: edition difference (word order, a verse placed elsewhere in the poem, a different name in an isnad), Uthmani Quran spelling vs plain spelling, duplication in the reference text, or pages not yet transcribed. Only a real gap goes back to transcription.
- **EXTRA** = text in our edition not in the reference (editor's additions, honorifics, other edition's longer passages) — informational.
- Typical result for a sound transcription: ~96% of the reference matched, a handful of MISSING runs, all explained.

## 3. Page word-count check (weak, but covers intro, footnotes and indexes)
`scripts/pagecheck.py WORK/trans WORK/book.pdf` compares each page's word count with the PDF's own OCR layer. Median ratio is ≈0.96; poetry pages fall to 0.75–0.85 because the OCR layer shatters verse into single letters — so a low ratio on a poetry page is not evidence of loss. Look at the page only when the ratio is low and the page is prose.

## 4. Stage-to-stage equality (exact)
```
python3 -I scripts/wordcheck.py trans   WORK/trans WORK/out/full.md                 # pages → full MD
python3 -I scripts/wordcheck.py removal WORK/out/full.md WORK/out/noisnad.md WORK/out/noisnad.md.removed.jsonl
python3 -I scripts/wordcheck.py docx    WORK/out/noisnad.md WORK/docx/book.docx
```
Each must print IDENTICAL / EXACT. «removal» lists the footnotes that disappeared together with an isnad (a note on a narrator's name) — report them.

## 5. Visual check of the Word file
Run `scripts/preview.py BOOK.pdf OUT_DIR` — it picks the cover and front pages, the most verse-heavy and footnote-heavy pages, a chapter opening, the middle and the index, and pastes them four to a sheet. Read the sheets; re-render a single page at 100–110 dpi for details.
