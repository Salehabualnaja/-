# Isnad-removal classification spec (for the classification agents)

Goal: an isnad-free reading version **without altering any other word**. The edition's editor printed the chains of transmission (الأسانيد) in a SMALL font and the text (المتن) in a LARGE font. Each candidate is one small-font RUN, its words numbered `[0] [1] …`, plus what follows it (AFTER: large font, possibly a new paragraph; `%%` = verse line, `||` = between hemistichs, `**…**` = bold).

Very often the editor already put the final source in the large font: AFTER begins with **عن** فلان / **قال** فلان / **حدَّثنا** فلان / **سمعت** فلانًا / **أنشَدَني** فلان … — then the whole RUN is just the chain and is removed.

## Decide for every RUN
1. **remove** (default — write no line): the RUN is only a chain — narrators' names and formulas (حدثنا، حدثني، أخبرنا، أنبأنا، ثنا، نا، عن، قال، سمعت فلانًا يقول، أنشدني/أنشدنا فلان، بـ«البلد»، kinship like «ابن أخي فلان»، «خالي») — and nothing in it is needed to understand AFTER.
2. **keep** — the RUN is not a chain: the author's own words or a narrative frame («ولقد أحسن الذي يقول:», «وقال آخر:», «وأنشد بعضهم:», «وأنشدني بعض أهل الأدب:» — an unnamed reciter, «قال أبو حاتم: رأيت على حجر…»), or a named non-transmitter («ألا ترى المقنع الكندي حيث يقول:», «كما قال العتبي:»).
3. **keep_from N** — chain + something that must stay; keep words N..end:
   a. poet/author attribution after the chain: «وأنشَدَني أحمدُ بنُ محمد الصنعاني **لابن عِكراش:**» → keep_from at «لابن».
   b. story content after the chain: «سمعتُ فلانًا يقول: **وجدتُ على خُفِّ عطاءٍ مكتوبًا:**» → keep_from at «وجدتُ».
   c. AFTER names no speaker at all (starts directly with the saying, «كان يقال…», a « quote, a passive «قُرئ على…», a pronoun «أنه سمع…», «سمعت أبي» / «حدثني أبي» where the father is unidentifiable without the RUN) while the RUN ends with that speaker → keep from the speaker's name, dropping the verb before it: «… حدثنا **الأصمعي قال:**» → keep_from at «الأصمعي». If AFTER already names its speaker or actor («كتب الحجاج…», «كان عمر بن عبد العزيز…»), it is case 1.
   - «وأنشَدَني فلان:» before verses is case 1 (the reciter is a transmitter) — unless he recited his own verses («لنفسه», «من قوله»): keep.
4. **keep_range N M** — keep only words N..M-1. Typical: the author's words before a reciter: «من ذلك ما أنشدني …» → keep_range 0 2 («من ذلك»); a framing phrase inside dashes «ـ في ذم من هذا نعته ـ:» → keep it with both dashes.
5. **flag NOTE** — genuinely unclear; reviewed by hand.

## Patterns met in practice
- A RUN at a page end with empty AFTER: look up the next page in the assembled MD before deciding (usually case 1).
- A chain split over two pages appears as two RUNs: both are removed.
- RUNs opening with a linking word («كما أخبرنا», «ولقد أنبأنا», «لأنَّ», «ولذلك») are removed whole when the previous sentence still reads cleanly; when the linking word is the grammatical subject the previous sentence needs («ومن أنواع المداراة: **ما** حدثني به…»), flag it — often keeping only «ما» (keep_range 0 1) restores the sentence when AFTER starts with a large «حدثنا فلان».
- A footnote mark inside a removed RUN removes that footnote too (it annotated a narrator's name) — mention it in the notes.

## Output
Only the exceptions, one per line, nothing else; end with `#done <count>`:
```
p034-1 keep
p053-1 keep_from 8
p120-3 keep_range 4 9
p200-2 flag the run ends mid-name, continues on next page
#done 463
```
Word numbers are the bracketed numbers in the RUN.
