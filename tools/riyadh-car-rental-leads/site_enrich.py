"""زحف مهذّب على موقع كل شركة تأجير لاستخراج أرقام قسم المبيعات/الشركات.

لماذا هذه الخطوة؟ لأن جوجل يعطي غالبًا رقم الاستقبال أو الرقم الموحّد فقط،
بينما رقم المبيعات يظهر في صفحات مثل «تأجير الشركات» أو «اتصل بنا».

الأدب في الزحف مطبَّق هنا:
  * احترام robots.txt لكل نطاق قبل أي طلب.
  * مهلة بين الطلبات وحدّ أقصى لعدد الصفحات لكل موقع.
  * User-Agent صريح يعرّف بالأداة.
"""

from __future__ import annotations

import re
import time
import urllib.robotparser
from dataclasses import dataclass, field
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

from saudi_phones import PhoneHit, find_numbers, normalize, to_ascii_digits

USER_AGENT = (
    "RiyadhCarRentalLeads/1.0 (B2B contact research; respects robots.txt)"
)

# كلمات تدلّ على أنّ الرقم يخصّ المبيعات — الوزن يعكس قوة الدلالة
SALES_SIGNALS: list[tuple[str, int]] = [
    ("قسم المبيعات", 5), ("إدارة المبيعات", 5), ("مدير المبيعات", 5),
    ("المبيعات", 4), ("مبيعات", 4), ("sales", 4),
    ("حسابات الشركات", 4), ("عملاء الشركات", 4), ("قطاع الشركات", 4),
    ("تأجير الشركات", 4), ("خدمة الشركات", 3), ("عروض الشركات", 3),
    ("corporate", 3), ("b2b", 3), ("fleet", 3), ("الأسطول", 3), ("الأساطيل", 3),
    ("طويل الأمد", 3), ("long term", 3), ("long-term", 3), ("leasing", 3),
    ("تطوير الأعمال", 3), ("business development", 3),
    ("العقود", 2), ("عقود", 2), ("commercial", 2), ("account manager", 2),
    ("الشركات", 2), ("business", 1), ("استفسار", 1), ("عروض الأسعار", 2),
    ("طلب عرض سعر", 3),
]

# كلمات تدلّ على أنّ الرقم ليس للمبيعات
NEGATIVE_SIGNALS: list[tuple[str, int]] = [
    ("الدعم الفني", 4), ("دعم فني", 4), ("الشكاوى", 4), ("شكوى", 4),
    ("الطوارئ", 4), ("المساعدة على الطريق", 4), ("roadside", 4),
    ("technical support", 3), ("complaint", 3), ("فاكس", 4), ("fax", 4),
    ("التوظيف", 4), ("الوظائف", 4), ("careers", 4), ("hr", 3),
    ("سجل تجاري", 5), ("الرقم الضريبي", 5), ("vat", 4), ("ترخيص", 3),
]

# مسارات يُرجَّح وجود أرقام المبيعات فيها
CANDIDATE_PATHS = [
    "/", "/contact", "/contact-us", "/contactus", "/contact_us",
    "/en/contact", "/ar/contact", "/اتصل-بنا", "/تواصل-معنا",
    "/corporate", "/business", "/b2b", "/companies", "/الشركات",
    "/corporate-leasing", "/long-term-rental", "/leasing", "/fleet",
    "/sales", "/about", "/about-us",
]

# كلمات في الرابط أو نصّه تجعل الصفحة أولوية للزحف
LINK_HINTS = [
    "contact", "اتصل", "تواصل", "corporate", "شركات", "business", "b2b",
    "fleet", "أسطول", "sales", "مبيعات", "leasing", "تأجير", "long", "طويل",
]

SALES_EMAIL_RE = re.compile(
    r"[\w.+-]+@[\w-]+\.[\w.-]+", re.IGNORECASE
)
SALES_EMAIL_HINTS = ("sales", "corporate", "business", "b2b", "fleet", "info")


@dataclass
class SiteResult:
    website: str
    pages_fetched: list[str] = field(default_factory=list)
    hits: list[PhoneHit] = field(default_factory=list)
    emails: list[str] = field(default_factory=list)
    error: str = ""

    @property
    def sales_hits(self) -> list[PhoneHit]:
        ranked = [h for h in self.hits if h.score >= 3]
        return sorted(ranked, key=lambda h: h.score, reverse=True)

    @property
    def sales_emails(self) -> list[str]:
        return [e for e in self.emails
                if any(h in e.lower().split("@")[0] for h in SALES_EMAIL_HINTS[:5])]


class PoliteFetcher:
    """جالب صفحات يحترم robots.txt ويفرض مهلة بين الطلبات لكل نطاق."""

    def __init__(self, delay: float = 1.0, timeout: int = 15,
                 respect_robots: bool = True) -> None:
        self.delay = delay
        self.timeout = timeout
        self.respect_robots = respect_robots
        self._robots: dict[str, urllib.robotparser.RobotFileParser | None] = {}
        self._last_request: dict[str, float] = {}
        self._session = requests.Session()
        self._session.headers.update({
            "User-Agent": USER_AGENT,
            "Accept-Language": "ar,en;q=0.8",
        })

    def _robots_for(self, url: str):
        host = urlparse(url).netloc
        if host in self._robots:
            return self._robots[host]
        parser = urllib.robotparser.RobotFileParser()
        parser.set_url(urljoin(url, "/robots.txt"))
        try:
            response = self._session.get(urljoin(url, "/robots.txt"), timeout=self.timeout)
            if response.status_code == 200:
                parser.parse(response.text.splitlines())
            else:
                parser = None  # لا ملف robots ⇒ لا قيود معلنة
        except requests.RequestException:
            parser = None
        self._robots[host] = parser
        return parser

    def allowed(self, url: str) -> bool:
        if not self.respect_robots:
            return True
        parser = self._robots_for(url)
        return True if parser is None else parser.can_fetch(USER_AGENT, url)

    def get(self, url: str) -> bytes | None:
        """يعيد بايتات الصفحة لا نصًّا.

        كثير من المواقع السعودية ترسل UTF-8 دون إعلان charset في الترويسة،
        فيخمّن requests ترميزًا لاتينيًّا ويتحوّل النص العربي إلى رموز مشوّهة
        تُسقط كل الكلمات المفتاحية بصمت. تسليم البايتات إلى BeautifulSoup
        يجعلها تعتمد على <meta charset> وكشف الترميز الفعلي.
        """
        if not self.allowed(url):
            return None
        host = urlparse(url).netloc
        elapsed = time.monotonic() - self._last_request.get(host, 0.0)
        if elapsed < self.delay:
            time.sleep(self.delay - elapsed)
        try:
            response = self._session.get(url, timeout=self.timeout, allow_redirects=True)
        except requests.RequestException:
            return None
        finally:
            self._last_request[host] = time.monotonic()
        if response.status_code != 200:
            return None
        if "html" not in response.headers.get("Content-Type", "").lower():
            return None
        return response.content


# ---------------------------------------------------------------- التقييم


def _match_signals(haystack: str, signals: list[tuple[str, int]]) -> tuple[int, list[str]]:
    """يجمع أوزان الكلمات المطابقة دون احتساب التداخل مرّتين.

    «قسم المبيعات» يحتوي «المبيعات» ويحتوي «مبيعات»؛ بلا هذا الحجب تُحتسب
    المطابقة الواحدة ثلاث مرّات فتنتفخ الدرجة بلا معنى.
    """
    total = 0
    labels: list[str] = []
    consumed = [False] * len(haystack)

    # الأطول أولًا: «قسم المبيعات» يبتلع مدى «المبيعات» فلا تُحتسب بعده
    for keyword, weight in sorted(signals, key=lambda s: len(s[0]), reverse=True):
        needle = keyword.lower()
        start = haystack.find(needle)
        while start != -1:
            end = start + len(needle)
            if not any(consumed[start:end]):
                for index in range(start, end):
                    consumed[index] = True
                total += weight
                if keyword not in labels:
                    labels.append(keyword)
                break
            start = haystack.find(needle, start + 1)
    return total, labels


def score_context(context: str, page_url: str = "") -> tuple[int, list[str]]:
    """يقيس مدى ارتباط الرقم بالمبيعات: نصّ محيط بوزن كامل + إشارة صفحة محدودة."""
    haystack = context.lower()

    positive, labels = _match_signals(haystack, SALES_SIGNALS)
    negative, negative_labels = _match_signals(haystack, NEGATIVE_SIGNALS)
    score = positive - negative
    labels.extend(f"-{label}" for label in negative_labels)

    # رابط الصفحة إشارة على مستوى الصفحة لا على مستوى الرقم، فنسقفها
    if page_url:
        page_score, page_labels = _match_signals(page_url.lower(), SALES_SIGNALS)
        if page_score:
            score += min(2, page_score)
            labels.extend(f"~{label}" for label in page_labels[:2])

    return score, labels


# وسوم تمثّل «بندًا» مستقلًّا في الصفحة — حدود طبيعية لسياق الرقم
ITEM_TAGS = {"li", "td", "th", "p", "dd", "dt", "address", "figcaption",
             "blockquote", "label", "h1", "h2", "h3", "h4", "h5", "h6"}

_HAS_DIGIT_RE = re.compile(r"[\d٠-٩۰-۹]")
_MAX_BLOCK_CHARS = 300


def _block_context(node) -> str:
    """نصّ أقرب كتلة بنيوية تحتوي الرقم.

    الصعود يتوقّف عند أوّل وسم «بند» (مثل <li>) لأنّه الحد الطبيعي بين
    «قسم المبيعات: رقم» و«الدعم الفني: رقم» في صفحات التواصل.
    """
    fallback = ""
    current = node.parent
    while current is not None and current.name not in ("body", "html", "[document]"):
        text = re.sub(r"\s+", " ", to_ascii_digits(current.get_text(" ", strip=True)))
        if current.name in ITEM_TAGS:
            return text
        if len(text) > _MAX_BLOCK_CHARS:
            break
        fallback = text
        current = current.parent
    return fallback


def extract_from_html(html: str | bytes, page_url: str) -> tuple[list[PhoneHit], list[str]]:
    """يستخرج الأرقام (مع تقييمها) والبُرد الإلكترونية من صفحة واحدة."""
    soup = BeautifulSoup(html, "lxml")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()

    hits: dict[str, PhoneHit] = {}

    def record(phone, near: str, display: str, from_tel: bool) -> None:
        score, labels = score_context(near, page_url)
        if from_tel:
            score += 1  # روابط tel: أدقّ من نصّ عابر
        hit = PhoneHit(
            phone=phone, context=display[:400], source_url=page_url,
            from_tel_link=from_tel, labels=labels, score=score,
        )
        if hit.phone.key in hits:
            hits[hit.phone.key].merge(hit)
        else:
            hits[hit.phone.key] = hit

    # 1) روابط tel: — أوثق مصدر، وسياقه كتلة الرابط
    for anchor in soup.select('a[href^="tel:"]'):
        phone = normalize(anchor.get("href", "")[4:])
        if phone is None:
            continue
        context = _block_context(anchor) or anchor.get_text(" ", strip=True)
        record(phone, context, context, from_tel=True)

    # 2) العُقد النصّية — كل رقم يُقيَّم داخل كتلته وحدها
    for node in soup.find_all(string=_HAS_DIGIT_RE.search):
        block = _block_context(node)
        for phone, near, wide in find_numbers(str(node)):
            context = block if 0 < len(block) <= _MAX_BLOCK_CHARS else (near or wide)
            record(phone, context, block or wide, from_tel=False)

    # 3) احتياطي للأرقام المجزّأة بين وسوم (<span>011</span><span>2345678</span>):
    #    نقرأ الصفحة مسطّحة، لكن للأرقام الجديدة فقط حتى لا يلوّث السياق العريض
    #    درجات الأرقام التي قيّمناها بدقّة أعلاه.
    text = soup.get_text("\n", strip=True)
    for phone, near, wide in find_numbers(text):
        if phone.key not in hits:
            record(phone, near, wide, from_tel=False)

    emails = sorted({
        match.group().lower()
        for match in SALES_EMAIL_RE.finditer(to_ascii_digits(text))
        if not match.group().lower().endswith((".png", ".jpg", ".jpeg", ".gif", ".webp"))
    })

    return list(hits.values()), emails


def discover_links(html: str | bytes, base_url: str, limit: int = 12) -> list[str]:
    """يجمع روابط داخلية يُرجَّح أن تحوي بيانات تواصل المبيعات."""
    soup = BeautifulSoup(html, "lxml")
    base_host = urlparse(base_url).netloc.replace("www.", "")
    scored: list[tuple[int, str]] = []
    seen: set[str] = set()

    for anchor in soup.find_all("a", href=True):
        url = urljoin(base_url, anchor["href"]).split("#")[0].rstrip("/")
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            continue
        if parsed.netloc.replace("www.", "") != base_host:
            continue
        if url in seen:
            continue
        seen.add(url)

        haystack = f"{url} {anchor.get_text(' ', strip=True)}".lower()
        weight = sum(2 for hint in LINK_HINTS if hint in haystack)
        if weight:
            scored.append((weight, url))

    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [url for _, url in scored[:limit]]


def enrich_site(website: str, fetcher: PoliteFetcher, max_pages: int = 8) -> SiteResult:
    """يزحف على موقع شركة واحد ويعيد ما وجده من أرقام وبُرد."""
    if not website:
        return SiteResult(website="", error="لا يوجد موقع إلكتروني")

    if not website.startswith(("http://", "https://")):
        website = "https://" + website

    result = SiteResult(website=website)
    merged: dict[str, PhoneHit] = {}
    emails: set[str] = set()

    home_html = fetcher.get(website)
    if home_html is None:
        result.error = "تعذّر جلب الصفحة الرئيسية (حجب/خطأ شبكة/robots.txt)"
        return result

    queue: list[str] = [website]
    for path in CANDIDATE_PATHS[1:]:
        queue.append(urljoin(website, path))
    for link in discover_links(home_html, website):
        if link not in queue:
            queue.append(link)

    visited: set[str] = set()
    for url in queue:
        if len(result.pages_fetched) >= max_pages:
            break
        normalized_url = url.rstrip("/")
        if normalized_url in visited:
            continue
        visited.add(normalized_url)

        html = home_html if url == website else fetcher.get(url)
        if html is None:
            continue
        result.pages_fetched.append(url)

        page_hits, page_emails = extract_from_html(html, url)
        emails.update(page_emails)
        for hit in page_hits:
            if hit.phone.key in merged:
                merged[hit.phone.key].merge(hit)
            else:
                merged[hit.phone.key] = hit

    result.hits = sorted(merged.values(), key=lambda h: h.score, reverse=True)
    result.emails = sorted(emails)
    if not result.hits and not result.error:
        result.error = "لم نعثر على أرقام في الصفحات المتاحة"
    return result
