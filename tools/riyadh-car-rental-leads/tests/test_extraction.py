"""اختبارات تطبيع الأرقام السعودية واستخراج أرقام المبيعات من HTML."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from saudi_phones import find_numbers, normalize  # noqa: E402
from site_enrich import extract_from_html, score_context  # noqa: E402

FIXTURE = Path(__file__).parent / "fixtures" / "sample_company.html"


class TestNormalize(unittest.TestCase):
    def test_mobile_variants_collapse_to_one_number(self):
        for raw in ["0551234567", "+966551234567", "00966551234567",
                    "966 55 123 4567", "055-123-4567", "٠٥٥١٢٣٤٥٦٧"]:
            with self.subTest(raw=raw):
                phone = normalize(raw)
                self.assertIsNotNone(phone, raw)
                self.assertEqual(phone.e164, "+966551234567")
                self.assertEqual(phone.kind, "mobile")

    def test_riyadh_landline(self):
        phone = normalize("011 234 5678")
        self.assertEqual(phone.e164, "+966112345678")
        self.assertEqual(phone.kind, "landline")
        self.assertEqual(phone.region, "الرياض")

    def test_unified_and_tollfree(self):
        unified = normalize("920012345")
        self.assertEqual(unified.kind, "unified_920")
        self.assertEqual(unified.national, "920012345")

        tollfree = normalize("8001234567")
        self.assertEqual(tollfree.kind, "tollfree_800")
        self.assertIsNone(tollfree.e164)  # لا يعمل من خارج المملكة

    def test_rejects_non_phone_digit_runs(self):
        for raw in ["1010123456", "300012345600003", "2024", "70012345"]:
            with self.subTest(raw=raw):
                self.assertIsNone(normalize(raw))


class TestFindNumbers(unittest.TestCase):
    def test_two_adjacent_numbers_are_not_merged(self):
        found = find_numbers("للحجز 0112345678 0509876543 شكرًا")
        keys = {phone.key for phone, _, _ in found}
        self.assertEqual(keys, {"+966112345678", "+966509876543"})

    def test_commercial_registration_is_ignored(self):
        found = find_numbers("سجل تجاري 1010123456 والرقم الضريبي 300012345600003")
        self.assertEqual(found, [])

    def test_context_is_captured(self):
        found = find_numbers("قسم المبيعات: 0551112222")
        self.assertEqual(len(found), 1)
        self.assertIn("قسم المبيعات", found[0][1])

    def test_near_context_is_tighter_than_wide(self):
        text = "الدعم الفني 0114445555 " + "حشو " * 40 + " قسم المبيعات"
        _, near, wide = find_numbers(text)[0]
        self.assertNotIn("قسم المبيعات", near)
        self.assertIn("قسم المبيعات", wide)


class TestScoring(unittest.TestCase):
    def test_sales_context_scores_high(self):
        score, labels = score_context("قسم المبيعات للشركات")
        self.assertGreaterEqual(score, 3)
        self.assertIn("قسم المبيعات", labels)

    def test_support_context_scores_low(self):
        score, _ = score_context("الدعم الفني والشكاوى")
        self.assertLess(score, 3)

    def test_overlapping_keywords_counted_once(self):
        # «قسم المبيعات» يحتوي «المبيعات» و«مبيعات» — يجب ألّا تُحتسب ثلاثًا
        specific, _ = score_context("قسم المبيعات")
        self.assertEqual(specific, 5)

    def test_page_url_signal_is_capped(self):
        neutral, _ = score_context("للتواصل")
        from_url, _ = score_context("للتواصل", "https://x.sa/corporate-sales-fleet")
        self.assertEqual(from_url - neutral, 2)


class TestHtmlExtraction(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        html = FIXTURE.read_text(encoding="utf-8")
        cls.hits, cls.emails = extract_from_html(html, "https://example.sa/contact")
        cls.by_key = {hit.phone.key: hit for hit in cls.hits}

    def test_finds_all_distinct_numbers(self):
        self.assertEqual(
            set(self.by_key),
            {"+966112345678",    # قسم المبيعات
             "+966551112222",    # مدير مبيعات الشركات
             "+966920001122",    # الرقم الموحّد (مكتوب بأرقام عربية-هندية)
             "+966114445555",    # الدعم الفني
             "+966119998888",    # فاكس
             "+966505550001",    # زر واتساب عائم
             "+966533334444"},   # واتساب الشركات والأساطيل
        )

    def test_only_sales_numbers_pass_threshold(self):
        passing = {key for key, hit in self.by_key.items() if hit.score >= 3}
        self.assertEqual(
            passing,
            {"+966112345678", "+966551112222", "+966533334444"},
        )

    def test_whatsapp_numbers_are_flagged_as_mobiles(self):
        for key in ("+966505550001", "+966533334444"):
            with self.subTest(key=key):
                self.assertTrue(self.by_key[key].on_whatsapp)
                self.assertEqual(self.by_key[key].phone.kind, "mobile")

    def test_landline_whatsapp_link_is_rejected(self):
        # web.whatsapp.com?phone=966112345678 أرضي — لا يجوز وسمه بواتساب
        self.assertFalse(self.by_key["+966112345678"].on_whatsapp)

    def test_generic_whatsapp_button_is_medium_not_sales(self):
        # «تواصل معنا واتساب» رقم صالح للاتصال لكنّه ليس دليل مبيعات
        generic = self.by_key["+966505550001"]
        self.assertTrue(generic.on_whatsapp)
        self.assertLess(generic.score, 3)

    def test_support_and_fax_are_pushed_below_neutral(self):
        neutral = self.by_key["+966920001122"].score
        self.assertLess(self.by_key["+966114445555"].score, neutral)
        self.assertLess(self.by_key["+966119998888"].score, neutral)

    def test_context_is_scoped_to_its_own_block(self):
        # سياق رقم الدعم الفني يجب ألّا يتسرّب إليه ذكر «المبيعات» من بند مجاور
        self.assertNotIn("مبيعات", self.by_key["+966114445555"].context)

    def test_tel_link_flagged(self):
        self.assertTrue(self.by_key["+966112345678"].from_tel_link)

    def test_extracts_sales_email(self):
        self.assertIn("sales@example.sa", self.emails)

    def test_raw_bytes_are_decoded_via_meta_charset(self):
        """انحدار: تمرير بايتات الصفحة يجب أن يعطي نفس نتيجة النص المفكوك.

        لو مرّرنا نصًّا فكّه requests بترميز لاتيني مخمَّن، تتحوّل الكلمات
        العربية إلى رموز مشوّهة فتسقط كل درجات المبيعات إلى صفر بصمت.
        """
        raw = FIXTURE.read_bytes()
        hits, emails = extract_from_html(raw, "https://example.sa/contact")
        by_key = {hit.phone.key: hit.score for hit in hits}
        self.assertEqual(by_key, {key: hit.score for key, hit in self.by_key.items()})
        self.assertIn("sales@example.sa", emails)

    def test_misdecoded_html_yields_no_false_sales(self):
        """النص المشوّه لا يجوز أن يُنتج أرقام مبيعات مزيّفة."""
        broken = FIXTURE.read_bytes().decode("latin-1")
        hits, _ = extract_from_html(broken, "https://example.sa/contact")
        self.assertEqual([h for h in hits if h.score >= 3], [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
