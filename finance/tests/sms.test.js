// اختبارات محلّل الرسائل: node finance/tests/sms.test.js
const assert = require("assert");
const P = require("../sms.js");
const NOW = new Date(2026, 9, 4, 15, 0, 0); // 4 أكتوبر 2026

const cases = [
  {
    name: "الراجحي — شراء نقاط بيع",
    sms: "شراء عبر نقاط البيع\nبطاقة:4123;مدى-ابل باي\nمبلغ:SAR 37.95\nلدى:BARNS COFFEE\nفي:26-10-03 21:14",
    expect: { kind: "expense", amount: 37.95, merchant: "BARNS COFFEE", digit: "4123", date: "2026-10-03 21:14" },
  },
  {
    name: "الراجحي — شراء إنترنت بالدولار",
    sms: "شراء إنترنت\nبطاقة:4123;فيزا\nمبلغ:USD 20\nلدى:OPENAI *CHATGPT\nفي:26-10-01 09:00",
    expect: { kind: "expense", amount: 75, currency: "USD", merchant: "OPENAI *CHATGPT", date: "2026-10-01 09:00" },
  },
  {
    name: "دولار مع المقابل بالريال",
    sms: "شراء إنترنت\nبطاقة: 4123\nمبلغ: USD 9.99 (SAR 37.80)\nلدى: NETFLIX.COM",
    expect: { kind: "expense", amount: 37.8, currency: "SAR", merchant: "NETFLIX.COM" },
  },
  {
    name: "الأهلي — شراء مدى بتاريخ يوم/شهر/سنة",
    sms: "شراء\nعبر:*8899 مدى أبل باي\nمبلغ:SAR 120.00\nلدى:PANDA\nفي:03/10/26 18:22",
    expect: { kind: "expense", amount: 120, merchant: "PANDA", digit: "8899", date: "2026-10-03 18:22" },
  },
  {
    name: "حوالة واردة",
    sms: "حوالة واردة محلية\nعبر:SARIE\nمبلغ:SAR 15,000.00\nمن:شركة الأفق للتقنية\nإلى:**5544\nفي:2026-10-01 08:00",
    expect: { kind: "income", amount: 15000, merchant: "شركة الأفق للتقنية", dst: "5544", transfer: true },
  },
  {
    name: "حوالة صادرة مع رصيد",
    sms: "حوالة صادرة: داخلية\nمن:5544\nمبلغ:SAR 3,500\nإلى:محمد عبدالله\nالرصيد:SAR 11,200.50\n26-10-02 10:15",
    expect: { kind: "expense", amount: 3500, merchant: "محمد عبدالله", src: "5544", balance: 11200.5, transfer: true },
  },
  {
    name: "إيداع راتب بالأرقام الهندية",
    sms: "إيداع راتب\nحساب: **٥٥٤٤\nمبلغ: ١٨٬٥٠٠٫٠٠ ر.س\nالرصيد: ٢٢٬٣٤٠٫١٠ ر.س",
    expect: { kind: "income", amount: 18500, balance: 22340.1, digit: "5544" },
  },
  {
    name: "الرياض — إنجليزي",
    sms: "POS Purchase\nCard: **7788 (mada)\nAmount: SAR 64.50\nAt: ALDREES PETROLEUM\nDate: 2026-10-02 07:40\nBalance: SAR 2,104.33",
    expect: { kind: "expense", amount: 64.5, merchant: "ALDREES PETROLEUM", digit: "7788", balance: 2104.33, date: "2026-10-02 07:40" },
  },
  {
    name: "سحب صراف",
    sms: "سحب نقدي\nبطاقة: 4123 مدى\nمبلغ: 500 ريال\nمكان السحب: ATM Alrajhi Olaya",
    expect: { kind: "expense", amount: 500, merchant: "ATM Alrajhi Olaya", digit: "4123", atm: true },
  },
  {
    name: "سداد فاتورة",
    sms: "سداد فاتورة\nالمفوتر: STC\nالخدمة: 0555123456\nمبلغ: 230.00 SAR\nمن حساب: **5544",
    expect: { kind: "expense", amount: 230, merchant: "STC", digit: "5544" },
  },
  {
    name: "استرداد",
    sms: "استرداد مبلغ\nبطاقة:4123\nمبلغ:SAR 99\nمن:NOON",
    expect: { kind: "income", amount: 99, merchant: "NOON" },
  },
  {
    name: "رمز تحقق — يُتجاهل",
    sms: "رمز التحقق: 482910 لعملية شراء بمبلغ 250 SAR لدى AMAZON. لا تشاركه مع أحد",
    expect: { kind: "ignore" },
  },
  {
    name: "عملية مرفوضة — تُتجاهل",
    sms: "شراء مرفوض\nبطاقة: 4123\nمبلغ: SAR 80\nلدى: JARIR\nالسبب: رصيد غير كاف",
    expect: { kind: "ignore" },
  },
  {
    name: "محفظة — سطر واحد",
    sms: "تم خصم 45.00 ريال من محفظتك لدى Jahez. رصيدك الحالي 312.40 ريال",
    expect: { kind: "expense", amount: 45, merchant: "Jahez", balance: 312.4 },
  },
  {
    name: "بطاقة ائتمانية مع الحد المتاح",
    sms: "Purchase with credit card ending 3321 for SAR 1,250.00 at IKEA on 02/10/2026. Available limit SAR 8,750.00",
    expect: { kind: "expense", amount: 1250, merchant: "IKEA", digit: "3321", date: "2026-10-02" },
  },
  {
    name: "إنجليزي — credited",
    sms: "Your account **5544 has been credited with SAR 2,000.00 from AHMED ALI on 01-10-2026",
    expect: { kind: "income", amount: 2000, merchant: "AHMED ALI", digit: "5544", date: "2026-10-01" },
  },
  {
    name: "رسالة رصيد فقط",
    sms: "رصيد حسابك **5544 هو SAR 9,870.00",
    expect: { kind: "balance", balance: 9870 },
  },
  {
    name: "إعلان — يُتجاهل",
    sms: "استمتع بخصم 20% على مشترياتك من نون باستخدام بطاقتك",
    expect: { kind: "ignore" },
  },
];

function fmt(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

let pass = 0, fail = 0;
for (const c of cases) {
  const r = P.parse(c.sms, { now: NOW });
  const e = c.expect;
  try {
    assert.strictEqual(r.kind, e.kind, "kind");
    if ("amount" in e) assert.strictEqual(r.amount, e.amount, "amount");
    if ("currency" in e) assert.strictEqual(r.currency, e.currency, "currency");
    if ("merchant" in e) assert.strictEqual(r.merchant, e.merchant, "merchant");
    if ("balance" in e) assert.strictEqual(r.balance, e.balance, "balance");
    if ("digit" in e) assert.ok(r.digits.any.includes(e.digit), "digit " + JSON.stringify(r.digits));
    if ("src" in e) assert.ok(r.digits.src.includes(e.src), "src " + JSON.stringify(r.digits));
    if ("dst" in e) assert.ok(r.digits.dst.includes(e.dst), "dst " + JSON.stringify(r.digits));
    if ("transfer" in e) assert.strictEqual(r.isTransfer, e.transfer, "transfer");
    if ("atm" in e) assert.strictEqual(r.isAtm, e.atm, "atm");
    if ("date" in e) assert.ok(r.date && fmt(r.date).startsWith(e.date), "date " + (r.date && fmt(r.date)));
    pass++;
  } catch (err) {
    fail++;
    console.log(`✗ ${c.name}: ${err.message}\n  got: ${JSON.stringify({ kind: r.kind, amount: r.amount, currency: r.currency, merchant: r.merchant, balance: r.balance, digits: r.digits, date: r.date && fmt(r.date), reason: r.reason })}`);
  }
}

// تقسيم عدة رسائل ملصوقة معاً
const multi = P.splitMessages(cases[0].sms + "\n\n" + cases[3].sms + "\n---\n" + cases[7].sms);
try { assert.strictEqual(multi.length, 3); pass++; } catch (e) { fail++; console.log("✗ splitMessages", multi.length); }
// البصمة ثابتة رغم اختلاف المسافات
try { assert.strictEqual(P.hash("شراء  \n مبلغ: 5"), P.hash("شراء\nمبلغ: 5")); pass++; } catch (e) { fail++; console.log("✗ hash"); }

console.log(`\n${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
