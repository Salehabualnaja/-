"""استخراج أرقام الهواتف السعودية من نص عربي/إنجليزي وتطبيعها.

يتعامل مع:
  * الأرقام العربية-الهندية (٠١٢٣٤٥٦٧٨٩) والفارسية (۰۱۲۳۴۵۶۷۸۹)
  * علامات الاتجاه المخفية (RLM/LRM) التي تكثر في المواقع العربية
  * الفواصل الشائعة: مسافات، شرطات، أقواس، نقاط
  * الصيغ: ‎+966، 00966، 05x، 011x، 920xxxxxx، 800xxxxxxx
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

# ---------------------------------------------------------------- الأرقام

_ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩"
_EASTERN_ARABIC_INDIC = "۰۱۲۳۴۵۶۷۸۹"
_DIGIT_MAP = {ord(c): str(i) for i, c in enumerate(_ARABIC_INDIC)}
_DIGIT_MAP.update({ord(c): str(i) for i, c in enumerate(_EASTERN_ARABIC_INDIC)})

# علامات اتجاه النص + المسافات غير القياسية التي تكسر الـ regex
_INVISIBLE = dict.fromkeys(
    [0x200B, 0x200C, 0x200D, 0x200E, 0x200F, 0x202A, 0x202B, 0x202C, 0x202D,
     0x202E, 0x2066, 0x2067, 0x2068, 0x2069, 0xFEFF],
    None,
)
_NBSP = {0x00A0: " ", 0x2007: " ", 0x202F: " ", 0x2060: None}

# أكواد المناطق الأرضية في السعودية (بدون الصفر)
LANDLINE_AREA_CODES = {
    "11": "الرياض",
    "12": "مكة/جدة",
    "13": "الشرقية",
    "14": "المدينة/تبوك",
    "16": "القصيم/حائل",
    "17": "عسير/جازان",
}

# الفاصل المسموح بين خانات الرقم (مسافة، شرطة، نقطة، قوس...)
_SEP = r"[\s\-.‐-―()،]{0,3}"


def _digits(count: int) -> str:
    """خانات إضافية يفصل بينها فاصل اختياري."""
    return f"(?:{_SEP}\\d){{{count}}}"


# عدد الخانات مضبوط تمامًا لكل نوع، حتى لا يبتلع التعبير رقمًا مجاورًا
# أو يلتقط سجلًّا تجاريًّا/رقم ضريبة بالخطأ.
_CANDIDATE_RE = re.compile(
    r"(?<!\d)"
    rf"(?:(?:\+|00)?966{_SEP})?"                  # مفتاح الدولة (اختياري)
    rf"(?:0{_SEP})?"                              # صفر التوجيه المحلي
    r"(?:"
    rf"5{_digits(8)}"                             # جوال:    5XXXXXXXX
    rf"|1[1-7]{_digits(7)}"                       # أرضي:    1XXXXXXXX
    rf"|920{_digits(6)}"                          # موحّد:   920XXXXXX
    rf"|800{_digits(7)}"                          # مجاني:   800XXXXXXX
    r")"
    r"(?!\d)"
)


def to_ascii_digits(text: str) -> str:
    """يحوّل الأرقام العربية-الهندية إلى ASCII وينظّف المحارف الخفية."""
    return text.translate(_DIGIT_MAP).translate(_INVISIBLE).translate(_NBSP)


@dataclass(frozen=True)
class PhoneNumber:
    e164: str | None           # مثل +966112345678، أو None للأرقام المحلية فقط
    national: str              # صيغة الاتصال المحلي، مثل 0112345678 أو 9200xxxxx
    kind: str                  # mobile | landline | unified_920 | tollfree_800
    region: str = ""           # اسم المنطقة للأرقام الأرضية

    @property
    def key(self) -> str:
        """المفتاح المستخدم في إزالة التكرار."""
        return self.e164 or self.national

    def __str__(self) -> str:  # pragma: no cover - للعرض فقط
        return self.key


def normalize(raw: str) -> PhoneNumber | None:
    """يحوّل نصًّا خامًّا إلى `PhoneNumber`، أو None إن لم يكن رقمًا سعوديًّا صالحًا."""
    digits = re.sub(r"\D", "", to_ascii_digits(raw))
    if not digits:
        return None

    # إزالة مفتاح الدولة بأي صيغة كُتب بها
    if digits.startswith("00966"):
        digits = digits[5:]
    elif digits.startswith("966"):
        digits = digits[3:]

    # صفر التوجيه المحلي يسبق الجوال والأرضي فقط (لا يسبق 920/800)
    if digits.startswith("0"):
        digits = digits[1:]

    # جوال: 5XXXXXXXX
    if len(digits) == 9 and digits.startswith("5"):
        return PhoneNumber(f"+966{digits}", f"0{digits}", "mobile")

    # أرضي: أكواد المناطق + 7 خانات
    if len(digits) == 9 and digits[:2] in LANDLINE_AREA_CODES:
        return PhoneNumber(
            f"+966{digits}", f"0{digits}", "landline", LANDLINE_AREA_CODES[digits[:2]]
        )

    # الرقم الموحّد 920: تسع خانات ويُطلب محليًّا بلا صفر
    if len(digits) == 9 and digits.startswith("920"):
        return PhoneNumber(f"+966{digits}", digits, "unified_920")

    # المجاني 800: عشر خانات، لا يعمل من خارج المملكة
    if len(digits) == 10 and digits.startswith("800"):
        return PhoneNumber(None, digits, "tollfree_800")

    return None


@dataclass
class PhoneHit:
    """رقم مُستخرج مع السياق النصّي المحيط به."""

    phone: PhoneNumber
    context: str
    source_url: str = ""
    from_tel_link: bool = False
    labels: list[str] = field(default_factory=list)
    score: int = 0

    def merge(self, other: "PhoneHit") -> None:
        """يدمج تكرارًا لنفس الرقم مع الاحتفاظ بأقوى إشارة."""
        if other.score > self.score:
            self.score = other.score
            self.context = other.context
            self.source_url = other.source_url
        self.from_tel_link = self.from_tel_link or other.from_tel_link
        for label in other.labels:
            if label not in self.labels:
                self.labels.append(label)


def find_numbers(text: str, near_chars: int = 70,
                 wide_chars: int = 220) -> list[tuple[PhoneNumber, str, str]]:
    """يعيد كل رقم سعودي صالح مع سياقين: ضيّق للتقييم وواسع للعرض.

    التمييز مقصود: في صفحة «اتصل بنا» المزدحمة تكون كل الأرقام على بُعد
    أسطر قليلة من بعضها، فنافذة واسعة تجعل رقم الدعم الفني يبدو رقم مبيعات.
    """
    clean = to_ascii_digits(text)
    results: list[tuple[PhoneNumber, str, str]] = []

    def window(match, radius: int) -> str:
        start = max(0, match.start() - radius)
        end = min(len(clean), match.end() + radius)
        return re.sub(r"\s+", " ", clean[start:end]).strip()

    for match in _CANDIDATE_RE.finditer(clean):
        phone = normalize(match.group())
        if phone is None:
            continue
        results.append((phone, window(match, near_chars), window(match, wide_chars)))
    return results
