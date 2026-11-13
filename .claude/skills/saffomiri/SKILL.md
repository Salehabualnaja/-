---
name: saffomiri
description: "صفّ الكتب للعميري (saffomiri): تحويل كتاب عربي مصوَّر (PDF ممسوح) إلى Markdown كامل دون إسقاط كلمة، ثم نسخة بلا أسانيد، ثم ملف Word مصفوف بأسلوب ثابت (17×24 سم، Traditional Arabic، حواشٍ سفلية حقيقية، أبيات في شطرين، فهارس جداول) مع فحوص رقمية تثبت سلامة النص في كل مرحلة. استعملها كلما طلب المستخدم تحويل كتاب أو مخطوط أو PDF عربي إلى نص أو MD أو Word، أو قال «صف الكتب للعميري»، «طبّق صف العميري»، «صفّه على طريقة العميري»، «حوّل الكتاب»، «انسخ الكتاب»، «احذف الأسانيد»، «نسخة بلا أسانيد»، «صفّ الكتاب»، «أخرجه Word»، أو أرسل كتاب حديث/أدب/رقائق مصوّرًا ويريد نصّه — حتى لو لم يذكر اسم المهارة. Use for any scanned Arabic heritage book → faithful Markdown → isnad-free edition → typeset .docx."
---

# صفّ الكتب للعميري (saffomiri)

تحوّل هذه المهارة كتابًا عربيًّا مصوَّرًا إلى نصٍّ رقمي أمين ثم إلى كتاب مصفوف، بالطريقة التي اعتُمدت في «روضة العقلاء» (407 صفحات): نسخ صفحةً صفحة بوكلاء متوازين، وتجميع آلي، ومقابلة بنص مرجعي، وحذف أسانيد يتبع طباعة المحقق، وصفّ Word بأسلوب واحد ثابت.

ثلاثة مبادئ تحكم كل خطوة، لأن المستخدم يبني عليها قراراته:
1. **لا تسقط كلمة ولا تُزاد ولا تُصحَّح.** أخطاء الطبعة تُثبت كما طُبعت وتُذكر في الملاحظات.
2. **كل ادعاء سلامة يقوم على رقم:** عدّ الكلمات بين المراحل، ومقابلة بنص مرجعي، وتفسير كل فرق.
3. **حذف الأسانيد يتبع اجتهاد المحقق في الطباعة** (السند بالخط الصغير، والمتن بالكبير)، لا اجتهادًا جديدًا.

مسار السكربتات: `SKILL=<مجلد هذه المهارة>`؛ كل سكربت Python يُشغَّل بـ`python3 -I`.

## المخرجات (افتراضيًّا كلها)
| الملف | المحتوى |
|---|---|
| `…_النص-الكامل_v1.md` | الكتاب كاملًا من الغلاف إلى الفهارس |
| `…_بدون-أسانيد_v1.md` | النسخة بلا أسانيد |
| `…_قائمة-الأسانيد-المحذوفة_v1.md` | كل موضع حُذف أو بقي، برقم الصفحة والنص |
| `…_ملاحظات-التحويل_v1.md` | الطريقة، ونتائج الفحص بالأرقام، والقرارات، وأخطاء الطبعة |
| `…_بدون-أسانيد_مصفوف_v1.docx` | ملف Word المصفوف |

إن لم يكن الكتاب كتاب رواية (لا أسانيد فيه) فتخطَّ مرحلة الأسانيد واصفف النص الكامل.

## من أين تبدأ؟
| ما بيد المستخدم | ابدأ من |
|---|---|
| PDF مصوّر | الخطوة 1 (المسار كاملًا) |
| صفحات منسوخة `trans/` | الخطوة 6 |
| ملف MD بهذه الاصطلاحات (كامل أو بلا أسانيد)، مثلًا من Drive | الخطوة 9، بالطريق «من ملف MD» |

إن طلب «صفّ» ملف MD فلا تُعد النسخ ولا الحذف: صفّه كما هو.

## مجلد العمل
```
WORK/ book.pdf · full/ (f-NNN.png 220dpi) · pages/ (pNNN.png + crop_map.json) · zoom/
      trans/ (pNNN.txt) · SPEC.md · ref.jsonl · out/ · docx/ · final/
```
ضعه في مجلد المسودات (scratchpad)، لا في مستودع.

## الخطوات

### 1. جلب الـPDF
- من Drive: `download_file_content` حدّه 10MB. إن كان أكبر: اطلب من المستخدم أن يجعل الملف مؤقتًا «أي شخص لديه الرابط» ثم نزّله مباشرة:
  `curl -sSL -o WORK/book.pdf "https://drive.usercontent.google.com/download?id=<FILE_ID>&export=download&confirm=t"`
  ثم ذكّره أن يعيده «مقيّدًا» — أدوات Drive تمنح الصلاحية ولا تسحبها. البديل: تقسيم الملف أجزاءً أصغر من 10MB.
- `read_file_content` لا يصلح بديلًا: يعيد جزءًا من النص فقط وقد يكون مقلوبًا.

### 2. فحص الـPDF
`pdfinfo`، `pdfimages -list -f 50 -l 50`، `pdffonts`، و`pdftotext -f 50 -l 50`. إن كانت الصفحات صورًا (ccitt/jpeg بدقة 300dpi) فالطبقة النصية — إن وُجدت — قراءة آلية رديئة لا يُعتمد عليها؛ اتبع مسار النسخ بالصور. (إن كان PDF رقميًّا بنص سليم فاستخرج النص مباشرة وانتقل إلى الخطوة 6 بعد تحويله إلى صيغة صفحات `trans/`.)

### 3. تصوير الصفحات
```
pdftoppm -r 220 -gray -png WORK/book.pdf WORK/full/f
python3 -I $SKILL/scripts/crop.py WORK/full WORK/pages        # قصّ الهوامش، الضلع الطويل 1560px
```

### 4. مسح بنية الكتاب
استخرج أول سطرين من كل صفحة من الطبقة النصية (رديئة لكنها تكفي لمعرفة الأقسام) لتحديد: الغلاف والحقوق، والتقديمات ومقدمة المحقق والترجمة، وصفحة «سند الكتاب» إن وُجدت، ومقدمة المؤلف، وبداية النص ونهايته، والفهارس. تحقق من أن رقم صفحة الـPDF يساوي الرقم المطبوع، وانتبه لقفزات الترقيم.

### 5. النسخ (أكبر مرحلة)
1. انسخ `references/transcription-spec.md` إلى `WORK/SPEC.md` واملأ `{WORK}` و`{SKILL}` و`{BOOK}`.
2. **تجربة أولى:** وكيل واحد على 6 صفحات نموذجية (فيها سند وشعر وحواشٍ). قابل صفحة منها بنفسك بالصورة. أضف إلى SPEC قسم «Clarifications» بما ظهر (أشكال الرموز، حدود الخط الصغير، لافتات أرقام الأبواب…).
3. **التوزيع:** وكيل `general-purpose` لكل 20 صفحة تقريبًا، كلهم في رسالة واحدة وفي الخلفية. القالب:
   > You are transcribing pages of a scanned Arabic book into text with absolute word-for-word fidelity. First read the spec and follow it exactly (including the Efficiency section): `WORK/SPEC.md`. Pilot outputs for style reference: `WORK/trans/p050.txt`, `p051.txt`. Your range: PDF pages A to B. Write each page to `WORK/trans/pNNN.txt`. Do only your range. Work page by page in order; if interrupted, resume from the first missing file. Final reply: per the spec's Report section (short).
4. أثناء الانتظار: جهّز التجميع والفحص. أخبر المستخدم بالتقدّم كل بضعة وكلاء.
5. عند الاكتمال: `python3 -I $SKILL/scripts/structcheck.py WORK/trans` — أصلح كل مشكلة بالرجوع إلى الصورة. علامات `⟨؟⟩` التي هي شكّ في حركة فقط تُزال؛ وما كان كلمة مطبوعة على غير المتوقع يُثبت كما طُبع ويُذكر في الملاحظات.

### 6. التجميع
```
python3 -I $SKILL/scripts/assemble.py WORK/trans WORK/out/full.md
```
يصل الفقرات المنقطعة بين الصفحات، ويضع `[صفحة N]`، ويجعل الحواشي فريدة، ويحوّل الأبيات والفهارس. ثم أضف في رأس الملف تعليق HTML بالعنوان والطبعة والاصطلاحات (انظر `references/typesetting-spec.md` §1). وراجع بالعين: بداية الكتاب، وفصلًا، وصفحة فهرس.

### 7. التحقق
اتبع `references/verification.md`: المقابلة بنص مرجعي من الشاملة/تراث (`verify.py`) وتفسير كل موضع «MISSING»، ثم `wordcheck.py trans` ويجب أن يخرج IDENTICAL.

### 8. حذف الأسانيد
```
python3 -I $SKILL/scripts/extract_small.py WORK/trans WORK/out/small_all.jsonl FIRST LAST   # صفحات نص المؤلف
python3 -I $SKILL/scripts/cls_lists.py WORK/out/small_all.jsonl WORK/out
```
- وكيل لكل ملف `cls_in_N.txt` يقرأ `references/isnad-classification.md` ويكتب الاستثناءات فقط في `cls_out_N.txt`.
- راجع بنفسك كل `flag` وكل `keep_from` (اطبعها مع نصها)، واكتب قراراتك في `cls_out_manual.txt`.
- `python3 -I $SKILL/scripts/decisions.py WORK/out/small_all.jsonl WORK/out/decisions.jsonl WORK/out/cls_out_*.txt`
- `python3 -I $SKILL/scripts/assemble.py WORK/trans WORK/out/noisnad.md --decisions WORK/out/decisions.jsonl [--omit-pages 27]`
  (`--omit-pages` لصفحة هي إسناد خالص كـ«سند الكتاب إلى مؤلفه» — اسأل المستخدم عنها أو احذفها إن طلب حذف الأسانيد عمومًا.)
- `python3 -I $SKILL/scripts/review.py WORK/out/small_all.jsonl WORK/out/decisions.jsonl WORK/out/noisnad.md.removed.jsonl WORK/out/noisnad.md WORK/out/review.md "العنوان"`
- `python3 -I $SKILL/scripts/wordcheck.py removal WORK/out/full.md WORK/out/noisnad.md WORK/out/noisnad.md.removed.jsonl` → EXACT.
- ما بقي من صيغ رواية بالخط الكبير (راويان جعلهما المحقق من المتن) يُترك ويُعرض في القسم الرابع من القائمة؛ حذفه يترك الخبر بلا قائل.

### 9. الصفّ في Word
```
python3 -I $SKILL/scripts/export_json.py WORK/trans WORK/docx/book.json --decisions WORK/out/decisions.jsonl [--omit-pages 27]
bash $SKILL/scripts/make_docx.sh WORK/docx/book.json WORK/docx "عنوان الكتاب"
python3 -I $SKILL/scripts/wordcheck.py docx WORK/out/noisnad.md WORK/docx/book.docx     # → IDENTICAL
```
(للنص الكامل: صدّر بلا `--decisions`.)

**من ملف MD جاهز** (لا صفحات `trans/`). مجلد العمل: `WORK/src/` (الملف الداخل) و`WORK/docx/` و`WORK/final/`.
1. الجلب من Drive: `download_file_content` (لا `read_file_content`، فهو يعيد تمثيلًا للنص لا الملف بحروفه). نتيجة أي ملف أكبر من بضع مئات KB لا تظهر في الرد، بل تحفظها البيئة ملفَّ JSON وتذكر مساره؛ فكّه بـ:
   `python3 -I $SKILL/scripts/b64file.py <مسار نتيجة الأداة> WORK/src/book.md` وطابِق الحجم بالبايت مع Drive.
2. ثم:
```
python3 -I $SKILL/scripts/md_to_json.py WORK/src/book.md WORK/docx/book.json
bash $SKILL/scripts/make_docx.sh WORK/docx/book.json WORK/docx "عنوان الكتاب"
python3 -I $SKILL/scripts/wordcheck.py docx WORK/src/book.md WORK/docx/book.docx     # → IDENTICAL
```
حدود هذا الطريق: بيتٌ من شطر واحد بلا « … » لا يتميز في MD عن النثر فيُصفّ فقرةً؛ وأبيات الحواشي تبقى نصًّا داخل الحاشية.

**التسمية:** `make_docx.sh` يُخرج دائمًا `WORK/docx/book.docx`؛ انسخه إلى `WORK/final/` بالاسم الذي طلبه المستخدم إن سمّاه، وإلا `YYYY-MM-DD_اسم-الكتاب_بدون-أسانيد_مصفوف_vN.docx`.

**الفحص بالعين:** `python3 -I $SKILL/scripts/preview.py WORK/docx/book.pdf WORK/docx/preview` يختار الغلاف وصفحات المقدمة وأكثر الصفحات شعرًا وحواشيَ وصفحة فصل والوسط والفهرس، ويلصقها أربعًا أربعًا؛ اقرأ الصور، وأعد تصوير صفحة بعينها بدقة 100–110 للتفاصيل.

الأسلوب كله في `references/typesetting-spec.md`؛ لا تغيّره إلا بطلب. **حدود المعاينة:** LibreOffice بلا Traditional Arabic يستعمل خطًّا بديلًا: تتقطع حروف الأسطر المضبوطة، وعدد الصفحات ومواضع الانتقال تقريبية — احكم على البنية لا على الترقيم الدقيق، ولا تذكر للمستخدم عدد صفحات المعاينة إلا مقرونًا بأنه تقريبي.

### 10. التسليم
- الأسماء: `YYYY-MM-DD_اسم-الكتاب_الوصف_vN.ext`؛ أي تعديل لاحق يُرفع إصدارًا جديدًا (v2) ولا يُحذف القديم إلا بإذن.
- الرفع إلى Drive بـ`create_file` مع `base64Content: "sha256:<hash>:<absolute path>"` و`disableConversionToGoogleType: true` (للـmd: `text/markdown`، للـdocx: `application/vnd.openxmlformats-officedocument.wordprocessingml.document`)، وطابِق الحجم بالبايت بعد الرفع.
- اتبع أعراف مشروع المستخدم في الحفظ والتسجيل (مجلد الوارد، سجل المهام…) إن كانت مذكورة في تعليماته.
- ملف الملاحظات: المصدر والطبعة؛ جدول الملفات؛ الاصطلاحات؛ طريقة العمل؛ نتائج الفحص بالأرقام (نسبة المطابقة، عدد مواضع MISSING وتفسيرها، تطابق عدد الكلمات)؛ قرارات الأسانيد (المحذوف كاملًا/جزئيًّا/الباقي، الحواشي المحذوفة، الصفحات المحذوفة)؛ ما يحسن معرفته (همزات الأسانيد بالخط الصغير قراءة تقريبية، أخطاء الطبعة المثبتة كما هي، قفزات الترقيم، الصفحات الخالية، **وأن أرقام الفهارس هي أرقام الطبعة الورقية تقابلها علامات `[صفحة N]` لا أرقام صفحات Word**، وأن أرقام الحواشي في Word تتبع إعداد «الأرقام» فيه)؛ ما ينتظر قرار المستخدم.
- الردّ على المستخدم: الروابط، وأرقام الفحص، والقرارات المعلّقة في سطرين.

## دروس من التجربة الأولى (لا تكررها)
- التجربة الأولى بلا قواعد كفاءة استغرقت 34 دقيقة لست صفحات بسبب التكبير المفرط؛ بعد القواعد صار الوكيل ينجز 20 صفحة في 5–15 دقيقة (نحو 150–300 ألف token).
- الهمزة في الخط الصغير لا تُقرأ بدقة الصفحة؛ إن كانت دقّة الأسانيد مهمة فاطلب `zoom.py … thirds`.
- علامة الصفحة `[ص: N]` تتعارض مع إحالات سورة ص — استعمل `[صفحة N]`.
- إحالات «ج/ص» بلا مسافة تظهر مقلوبة في العرض من اليمين؛ التجميع يضيف المسافة.
- قاعدة الوصل بين الصفحات لا تصل سطرًا قصيرًا (أقل من 8 كلمات) ولا ما قبل البسملة — حتى لا يلتصق سطر في صفحة الحقوق بالبسملة.
- الخط الصغير ليس دائمًا سندًا («ولقد أحسن الذي يقول:»)، وبعض الأسانيد بالخط الكبير — لذلك التصنيف بوكلاء ومراجعة يدوية للحالات المعلّقة.
- النص المرجعي (الشاملة) طبعة أخرى: فروقه في الترتيب والأسماء ليست سقطًا، وقد يكون فيه تكرار ليس في طبعتك — احكم بالصورة.

## مراجع المهارة
- `references/transcription-spec.md` — قواعد النسخ للوكلاء (تُنسخ إلى SPEC.md).
- `references/isnad-classification.md` — قواعد تصنيف المواضع الصغيرة.
- `references/typesetting-spec.md` — أسلوب الصفّ بقيمه الدقيقة واصطلاحات MD.
- `references/verification.md` — الفحوص وكيف تُقرأ نتائجها.
- `scripts/` — crop، zoom، structcheck، assemble، verify، pagecheck، nsearch، wordcheck، extract_small، cls_lists، decisions، review، export_json، md_to_json، b64file، build_docx.js، make_docx.sh، preview.
