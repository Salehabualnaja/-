/* محلّل رسائل البنوك — الميزان
   يستخرج من نص الرسالة: نوع العملية، المبلغ، العملة، التاجر/الطرف، أرقام البطاقة/الحساب،
   الرصيد بعد العملية، والتاريخ. يعمل في المتصفح وفي Node (للاختبارات). */
(function (root) {
  "use strict";

  // أسعار تقريبية للتحويل إلى الريال عند الشراء بعملة أجنبية دون ذكر المقابل بالريال
  const FX = { SAR: 1, USD: 3.75, EUR: 4.1, GBP: 4.9, AED: 1.02, KWD: 12.2, BHD: 9.95, QAR: 1.03, OMR: 9.75, EGP: 0.077, JOD: 5.29, TRY: 0.11 };

  const CUR_SRC =
    "SAR|S\\.?R\\.?|ر\\.?\\s?س\\.?|ريال(?:\\s?سعودي)?|رس|USD|US\\$|\\$|دولار(?:\\s?أمريكي)?|EUR|€|يورو|GBP|£|AED|درهم(?:\\s?إماراتي)?|KWD|دينار\\s?كويتي|BHD|QAR|OMR|EGP|جنيه(?:\\s?مصري)?|JOD|TRY";
  const NUM_SRC = "\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?";

  function curCode(c) {
    c = (c || "").replace(/\s/g, "").toUpperCase();
    if (!c || /^(SAR|S\.?R\.?|ر\.?س\.?|ريال.*|رس)$/.test(c)) return "SAR";
    if (/^(USD|US\$|\$|دولار.*)$/.test(c)) return "USD";
    if (/^(EUR|€|يورو)$/.test(c)) return "EUR";
    if (/^(GBP|£)$/.test(c)) return "GBP";
    if (/^(AED|درهم.*)$/.test(c)) return "AED";
    if (/^(KWD|دينار.*)$/.test(c)) return "KWD";
    if (/^(EGP|جنيه.*)$/.test(c)) return "EGP";
    return c;
  }
  const toNum = (s) => parseFloat(String(s).replace(/,/g, ""));

  // توحيد الأرقام والرموز: الأرقام الهندية → لاتينية، الفاصلة العربية، علامات الاتجاه
  function normalize(text) {
    return String(text || "")
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
      .replace(/٫/g, ".")
      .replace(/٬/g, ",")
      .replace(/[‎‏‪-‮⁦-⁩؜]/g, "")
      .replace(/：/g, ":")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t ]+/g, " ")
      .replace(/ *\n */g, "\n")
      .trim();
  }

  const IGNORE_RE = /رمز التحقق|رمز التفعيل|رمز المرور|كلمة المرور|رمز الدخول|كود التحقق|رمزك|لا تشارك|\bOTP\b|one[- ]time|verification code|passcode|\bcode is\b|مرفوض|رفض|declined|غير ناجح|لم تتم|failed|unsuccessful|محاولة دخول|تسجيل دخول|\blogin\b|تم تحديث بيانات/i;
  const PROMO_RE = /عرض خاص|عروض|خصم \d+ ?%|\d+ ?٪|\boffer\b|\bpromo|استمتع|اربح|سحب على جوائز/i;
  const TXN_LABEL_RE = /مبلغ|amount|لدى|\bat\b|الرصيد|balance/i;
  const REFUND_RE = /استرداد|استرجاع|مسترد|refund|reversal|cash ?back|كاش ?باك/i;
  const DEBIT_RE = /شراء|purchase|سداد|سحب|withdraw|debited|تم خصم|خصم مبلغ|صادر|outgoing|spent|paid/i;
  const INCOME_RE = /وارد|إيداع|ايداع|أودع|اودع|راتب|استلام|استلمت|مستلم|استرداد|استرجاع|مسترد|إضافة مبلغ|اضافة مبلغ|تمت إضافة|تم إضافة|تم اضافة|أضيف|إضافة رصيد|credited|deposit|received|refund|reversal|incoming|salary|cash ?back|كاش ?باك/i;
  const TRANSFER_RE = /حوال|تحويل|transfer|سريع|sarie/i;
  const ATM_RE = /سحب نقدي|سحب صراف|صراف|cash withdrawal|\batm\b/i;

  const BAL_LABEL = "الرصيد المتاح|الرصيد الحالي|الرصيد المتوفر|رصيدك الحالي|رصيدك المتاح|رصيدك|الرصيد|رصيد|Available Balance|Avail(?:able)?\\.? Bal(?:ance)?|Current Balance|Balance|Bal\\.?";
  const LIMIT_LABEL = "الحد المتاح|الحد الائتماني المتاح|المتبقي من الحد|الحد المتبقي|Available limit|Avail(?:able)? limit|Credit limit|Remaining limit";
  const FEE_LABEL = "رسوم|الرسوم|عمولة|العمولة|ضريبة القيمة المضافة|الضريبة|Fees?|Commission|VAT";
  const AMT_LABEL = "المبلغ|مبلغ|بمبلغ|بقيمة|قيمة|القيمة|Amount|Amt|for|of";

  function labeledValue(text, labelSrc) {
    const re = new RegExp("(?:^|[\\s:،,.(])(?:" + labelSrc + ")\\s*[:\\-]?\\s*(?:(" + CUR_SRC + ")\\s*)?(" + NUM_SRC + ")(?:\\s*(" + CUR_SRC + "))?", "i");
    const m = re.exec(text);
    if (!m) return null;
    return { value: toNum(m[2]), currency: curCode(m[1] || m[3]), index: m.index, length: m[0].length, hasCur: !!(m[1] || m[3]) };
  }
  function cut(text, hit) {
    return text.slice(0, hit.index) + " ".repeat(hit.length) + text.slice(hit.index + hit.length);
  }

  function findAmounts(text) {
    const out = [];
    const re = new RegExp("(?:(" + CUR_SRC + ")\\s*(" + NUM_SRC + "))|(?:(" + NUM_SRC + ")\\s*(" + CUR_SRC + "))(?![A-Za-z])", "gi");
    let m;
    while ((m = re.exec(text))) {
      const numS = m[2] || m[3];
      const before = text[m.index - 1] || " ";
      if (/[A-Za-z]/.test(before) && m[1] && /^[A-Za-z]/.test(m[1])) continue; // جزء من كلمة
      out.push({ value: toNum(numS), currency: curCode(m[1] || m[4]), index: m.index });
    }
    return out;
  }

  // المبلغ الرئيسي: ما بعد كلمة «مبلغ» إن وُجد، وإلا أول مبلغ بعملة (مع تفضيل الريال)
  function extractAmount(text) {
    let t = text;
    let balance = null, fee = null;
    let hit;
    // أزل الرصيد والحد الائتماني من النص قبل البحث عن المبلغ
    while ((hit = labeledValue(t, LIMIT_LABEL))) t = cut(t, hit);
    while ((hit = labeledValue(t, BAL_LABEL))) {
      if (balance === null) balance = hit.value;
      t = cut(t, hit);
    }
    while ((hit = labeledValue(t, FEE_LABEL))) {
      if (fee === null) fee = hit.value;
      t = cut(t, hit);
    }
    const all = findAmounts(t);
    const labeled = labeledValue(t, AMT_LABEL);
    let main = null;
    if (labeled && (labeled.hasCur || !all.length)) main = { value: labeled.value, currency: labeled.currency, index: labeled.index };
    const sar = all.filter((a) => a.currency === "SAR");
    if (main && main.currency !== "SAR" && sar.length) main = sar[0]; // المقابل بالريال مذكور
    if (!main && sar.length) main = sar[0];
    if (!main && all.length) main = all[0];
    if (!main && fee !== null) main = { value: fee, currency: "SAR", fee: true };
    return { main, balance, fee };
  }

  const STOP_SRC = "\\n|\\s(?:في|بتاريخ|تاريخ|بتأريخ|on|date|بطاقة|card|عبر|من حساب|رصيد|الرصيد|balance|via|ref|المرجع|رقم العملية)\\b|[.،,;](?:\\s|$)|\\s-\\s|$";
  function labeledText(text, labelSrc) {
    const re = new RegExp("(?:^|[\\s:،,.])(?:" + labelSrc + ")\\s*[:\\-]?\\s*(.+?)(?=" + STOP_SRC + ")", "i");
    const m = re.exec(text);
    if (!m) return null;
    let v = m[1].trim().replace(/^[:\-\s]+|[:\-\s*]+$/g, "");
    if (!v || /^[*xX#\s\d]+$/.test(v)) return null; // أرقام بطاقة/حساب فقط
    if (/^\d{1,4}[-\/.:]\d{1,2}/.test(v)) return null; // تاريخ أو وقت
    if (new RegExp("^(?:" + CUR_SRC + ")?\\s*[\\d,.]+\\s*(?:" + CUR_SRC + ")?$", "i").test(v)) return null; // مبلغ
    return v.slice(0, 60);
  }

  const MERCHANT_LABEL = "لدى|عند|المتجر|التاجر|اسم التاجر|نقطة البيع|المفوتر|اسم المفوتر|الجهة|الشركة|مكان السحب|الموقع|at|merchant";
  const FROM_LABEL = "من|المرسل|المحول|اسم المرسل|from|sender|by";
  const TO_LABEL = "إلى|الى|المستفيد|للمستفيد|اسم المستفيد|المحول إليه|to|beneficiary";

  // أرقام البطاقة/الحساب (آخر ٣–٤ أرقام) مع تمييز المصدر والوجهة
  function extractDigits(text) {
    const src = [], dst = [], any = [];
    const push = (arr, d) => { if (d && arr.indexOf(d) < 0) arr.push(d); if (d && any.indexOf(d) < 0) any.push(d); };
    const tail = "\\s*[:\\-]?\\s*(?:رقم\\s*)?(?:[*xX#•.]+\\s*)?(\\d{3,4})(?![\\d\\-\\/:.,]\\d)(?!\\d)";
    const srcRe = new RegExp("(?:بطاقة|البطاقة|بطاقتك|بطاقه|مدى|فيزا|ماستركارد|card|ending(?: in| with)?|المنتهية\\s?(?:ب|بـ|بالرقم)?|من حساب|من الحساب|حساب|الحساب|حسابك|account|acc(?:ount)?\\.?|a\\/c|محفظة|عبر|من|from)" + tail, "gi");
    const dstRe = new RegExp("(?:إلى حساب|الى حساب|إلى الحساب|إلى|الى|لحساب|to(?: account)?|للحساب)" + tail, "gi");
    let m;
    while ((m = dstRe.exec(text))) push(dst, m[1]);
    while ((m = srcRe.exec(text))) if (dst.indexOf(m[1]) < 0) push(src, m[1]);
    const bare = /[*xX•]{1,}\s?(\d{3,4})(?!\d)/g;
    while ((m = bare.exec(text))) push([], m[1]);
    return { src, dst, any };
  }

  function pad(n) { return String(n).padStart(2, "0"); }
  function extractDate(text, now) {
    now = now || new Date();
    const re = /(\d{1,4})[-\/.](\d{1,2})[-\/.](\d{1,4})(?:[\sTت,]+(?:الساعة\s*)?(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|ص|م)?)?/i;
    const m = re.exec(text);
    let time = null;
    const tm = /(?:^|\s|في:?|الساعة|at)\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM|ص|م)?(?!\d)/i.exec(text);
    if (!m) {
      if (!tm) return null;
      time = [tm[1], tm[2], tm[3]];
      const d = new Date(now);
      d.setHours(hour24(+time[0], time[2]), +time[1], 0, 0);
      if (d - now > 3600e3) d.setDate(d.getDate() - 1);
      return d;
    }
    const a = m[1], b = +m[2], c = m[3];
    const cands = [];
    const mk = (y, mo, d) => {
      if (y < 100) y += 2000;
      if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return;
      cands.push(new Date(y, mo - 1, d));
    };
    if (a.length === 4) mk(+a, b, +c);
    else if (c.length === 4) { mk(+c, b, +a); mk(+c, +a, b); }
    else { mk(+a, b, +c); mk(+c, b, +a); }
    if (!cands.length) return null;
    const limit = now.getTime() + 36 * 3600e3;
    const valid = cands.filter((d) => d.getTime() <= limit);
    const pick = (valid.length ? valid : cands).sort((x, y) => Math.abs(now - x) - Math.abs(now - y))[0];
    if (m[4]) pick.setHours(hour24(+m[4], m[7]), +m[5], 0, 0);
    else if (tm) pick.setHours(hour24(+tm[1], tm[3]), +tm[2], 0, 0);
    else pick.setHours(12, 0, 0, 0);
    return pick;
  }
  function hour24(h, ap) {
    if (!ap) return h;
    const pm = /pm|م/i.test(ap);
    if (pm && h < 12) return h + 12;
    if (!pm && h === 12) return 0;
    return h;
  }

  const BANKS = [
    ["الراجحي", /راجحي|al ?rajhi|rajhi/i], ["الأهلي", /الأهلي|الاهلي|\bsnb\b|alahli|ncb/i], ["الرياض", /بنك الرياض|riyad ?bank/i],
    ["الإنماء", /الإنماء|الانماء|alinma/i], ["ساب", /\bsab\b|ساب\b|سامبا|samba/i], ["البلاد", /البلاد|albilad/i],
    ["الجزيرة", /الجزيرة|aljazira|bank ?aljazira/i], ["العربي", /العربي الوطني|البنك العربي|\banb\b/i], ["الفرنسي", /الفرنسي|\bbsf\b|fransi/i],
    ["STC Bank", /stc ?(?:pay|bank)|اس تي سي/i], ["urpay", /urpay|يوربي/i], ["D360", /d360|دي ٣٦٠|دي 360/i], ["برق", /barq|برق/i],
    ["الخليج الدولي", /meem|ميم|gib/i], ["الإمارات دبي", /emirates ?nbd/i]
  ];
  function detectBank(text, sender) {
    const s = (sender || "") + " " + text;
    for (const [name, re] of BANKS) if (re.test(s)) return name;
    return "";
  }

  function hash(s) {
    let h = 5381;
    const t = normalize(s).replace(/\s+/g, " ");
    for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  function parse(raw, opts) {
    opts = opts || {};
    const text = normalize(raw);
    const res = { raw: String(raw || "").trim(), text, hash: hash(raw), ok: false, kind: null, reason: "" };
    if (!text) { res.reason = "نص فارغ"; return res; }
    if (IGNORE_RE.test(text) || (PROMO_RE.test(text) && !TXN_LABEL_RE.test(text))) {
      res.kind = "ignore"; res.reason = "رسالة تحقق أو إعلان أو عملية مرفوضة"; return res;
    }
    const amt = extractAmount(text);
    res.balance = amt.balance;
    res.bank = detectBank(text, opts.sender);
    res.digits = extractDigits(text);
    res.date = extractDate(text, opts.now);
    // رسالة استعلام عن الرصيد بصيغة حرّة («رصيد حسابك ... هو SAR ...») دون أي عملية
    if (amt.main && amt.balance === null && /رصيد|balance/i.test(text) && !INCOME_RE.test(text) && !DEBIT_RE.test(text) && !TRANSFER_RE.test(text)) {
      amt.balance = amt.main.value; amt.main = null; res.balance = amt.balance;
    }
    if (!amt.main) {
      if (amt.balance !== null) { res.kind = "balance"; res.reason = "رسالة رصيد فقط"; res.ok = true; return res; }
      res.reason = "لم يُعثر على مبلغ"; return res;
    }
    res.kind = REFUND_RE.test(text) || (INCOME_RE.test(text) && !DEBIT_RE.test(text)) ? "income" : "expense";
    res.currency = amt.main.currency;
    res.originalAmount = amt.main.value;
    res.amount = Math.round(amt.main.value * (FX[res.currency] || 1) * 100) / 100;
    res.approx = res.currency !== "SAR";
    res.fee = amt.fee;
    res.isTransfer = TRANSFER_RE.test(text);
    res.isAtm = ATM_RE.test(text);
    if (amt.main.fee) res.isFee = true;
    let party = labeledText(text, MERCHANT_LABEL);
    if (!party && res.kind === "income") party = labeledText(text, FROM_LABEL);
    if (!party && res.kind === "expense") party = labeledText(text, TO_LABEL);
    if (!party) party = labeledText(text, res.kind === "income" ? TO_LABEL : FROM_LABEL);
    if (!party && res.isAtm) party = "سحب نقدي";
    res.merchant = party || "";
    res.title = text.split("\n")[0].slice(0, 40);
    res.ok = true;
    return res;
  }

  // تقسيم نص ملصوق يحوي عدة رسائل (يُفصل بينها بسطر فارغ أو ---)
  function splitMessages(text) {
    return String(text || "")
      .replace(/\r\n?/g, "\n")
      .split(/\n\s*(?:-{3,}|={3,})?\s*\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const api = { parse, splitMessages, normalize, hash, extractDate, extractDigits, extractAmount, FX };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SmsParser = api;
})(typeof self !== "undefined" ? self : this);
