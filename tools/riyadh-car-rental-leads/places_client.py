"""عميل Google Places API (New) لجمع مكاتب تأجير السيارات في الرياض.

نستخدم الواجهة الرسمية بدل كشط صفحات خرائط جوجل: الكشط يخالف شروط
الاستخدام ويُحظر الوصول منه سريعًا، والواجهة تعطي الرقم والموقع مباشرة.

الاستراتيجية:
  1. `searchText` على شبكة مستطيلات تغطّي الرياض × عدّة صيغ بحث عربية/إنجليزية.
     (كل طلب يعيد 20 نتيجة كحد أقصى و60 مع الصفحات، لذا الشبكة ضرورية.)
  2. إزالة التكرار بمعرّف المكان.
  3. `places/{id}` مرّة واحدة لكل مكان فريد لجلب الهاتف والموقع الإلكتروني.
"""

from __future__ import annotations

import json
import math
import time
from dataclasses import dataclass, asdict, field

import requests

PLACES_BASE = "https://places.googleapis.com/v1"

# صندوق يغطّي أمانة منطقة الرياض الحضرية
RIYADH_BBOX = (24.45, 46.45, 25.10, 47.10)  # (lat_min, lng_min, lat_max, lng_max)

DEFAULT_QUERIES = [
    "تأجير سيارات",
    "مكتب تأجير سيارات",
    "تأجير سيارات للشركات",
    "تأجير سيارات طويل الأمد",
    "car rental",
    "car leasing company",
]

# حقول البحث (فئة أرخص) — بيانات التواصل تُطلب لاحقًا لكل مكان فريد
SEARCH_FIELDS = ",".join(
    f"places.{f}"
    for f in ("id", "displayName", "formattedAddress", "location",
              "businessStatus", "primaryTypeDisplayName")
) + ",nextPageToken"

DETAIL_FIELDS = ",".join(
    ("id", "displayName", "formattedAddress", "shortFormattedAddress",
     "internationalPhoneNumber", "nationalPhoneNumber", "websiteUri",
     "rating", "userRatingCount", "businessStatus", "location",
     "googleMapsUri", "primaryTypeDisplayName", "regularOpeningHours")
)


@dataclass
class Place:
    place_id: str
    name: str = ""
    address: str = ""
    phone_intl: str = ""
    phone_national: str = ""
    website: str = ""
    rating: float | None = None
    reviews: int | None = None
    status: str = ""
    lat: float | None = None
    lng: float | None = None
    maps_url: str = ""
    category: str = ""
    matched_queries: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


class QuotaExceeded(RuntimeError):
    """يُرفع عند تجاوز سقف الطلبات الذي حدّده المستخدم."""


class PlacesClient:
    def __init__(self, api_key: str, max_requests: int = 400,
                 delay: float = 0.15, timeout: int = 30,
                 language: str = "ar", region: str = "SA") -> None:
        self.api_key = api_key
        self.max_requests = max_requests
        self.delay = delay
        self.timeout = timeout
        self.language = language
        self.region = region
        self.search_requests = 0
        self.detail_requests = 0
        self._session = requests.Session()

    # ------------------------------------------------------------ الأساسيات

    @property
    def total_requests(self) -> int:
        return self.search_requests + self.detail_requests

    def _check_budget(self) -> None:
        if self.total_requests >= self.max_requests:
            raise QuotaExceeded(
                f"بلغنا سقف {self.max_requests} طلب. ارفعه بـ --max-requests إن أردت المتابعة."
            )

    def _post(self, path: str, body: dict, field_mask: str) -> dict:
        self._check_budget()
        response = self._session.post(
            f"{PLACES_BASE}/{path}",
            headers={
                "Content-Type": "application/json",
                "X-Goog-Api-Key": self.api_key,
                "X-Goog-FieldMask": field_mask,
            },
            data=json.dumps(body),
            timeout=self.timeout,
        )
        self.search_requests += 1
        time.sleep(self.delay)
        if response.status_code != 200:
            raise RuntimeError(
                f"فشل الطلب {path} ({response.status_code}): {response.text[:400]}"
            )
        return response.json()

    def _get(self, path: str, field_mask: str) -> dict:
        self._check_budget()
        response = self._session.get(
            f"{PLACES_BASE}/{path}",
            headers={"X-Goog-Api-Key": self.api_key, "X-Goog-FieldMask": field_mask},
            params={"languageCode": self.language, "regionCode": self.region},
            timeout=self.timeout,
        )
        self.detail_requests += 1
        time.sleep(self.delay)
        if response.status_code != 200:
            raise RuntimeError(
                f"فشل جلب التفاصيل {path} ({response.status_code}): {response.text[:400]}"
            )
        return response.json()

    # ------------------------------------------------------------ البحث

    def search_text(self, query: str, rect: tuple[float, float, float, float]) -> list[dict]:
        """بحث نصّي داخل مستطيل واحد، مع تتبّع صفحات النتائج."""
        lat_min, lng_min, lat_max, lng_max = rect
        body = {
            "textQuery": query,
            "includedType": "car_rental",
            "languageCode": self.language,
            "regionCode": self.region,
            "maxResultCount": 20,
            "locationRestriction": {
                "rectangle": {
                    "low": {"latitude": lat_min, "longitude": lng_min},
                    "high": {"latitude": lat_max, "longitude": lng_max},
                }
            },
        }

        collected: list[dict] = []
        page_token = None
        for _ in range(3):  # الواجهة تسمح بثلاث صفحات (60 نتيجة) كحد أقصى
            if page_token:
                body["pageToken"] = page_token
            data = self._post("places:searchText", body, SEARCH_FIELDS)
            collected.extend(data.get("places", []))
            page_token = data.get("nextPageToken")
            if not page_token:
                break
        return collected

    def discover(self, bbox=RIYADH_BBOX, grid: int = 6,
                 queries: list[str] | None = None,
                 on_progress=None) -> dict[str, Place]:
        """يمسح الرياض على شبكة `grid × grid` بكل صيغة بحث، ويعيد المكاتب الفريدة."""
        queries = queries or DEFAULT_QUERIES
        found: dict[str, Place] = {}
        cells = list(split_bbox(bbox, grid))

        for cell_index, rect in enumerate(cells, 1):
            for query in queries:
                try:
                    raw_places = self.search_text(query, rect)
                except QuotaExceeded:
                    raise
                except RuntimeError as error:
                    if on_progress:
                        on_progress(f"  ! تخطّينا «{query}» في الخلية {cell_index}: {error}")
                    continue

                for raw in raw_places:
                    place = _place_from_search(raw)
                    existing = found.get(place.place_id)
                    if existing:
                        if query not in existing.matched_queries:
                            existing.matched_queries.append(query)
                    else:
                        place.matched_queries.append(query)
                        found[place.place_id] = place

            if on_progress:
                on_progress(
                    f"  الخلية {cell_index}/{len(cells)} — "
                    f"{len(found)} مكتب فريد حتى الآن "
                    f"({self.total_requests} طلب)"
                )
        return found

    # ------------------------------------------------------------ التفاصيل

    def fill_details(self, places: dict[str, Place], on_progress=None) -> None:
        """يجلب الهاتف والموقع والتقييم لكل مكان فريد (طلب واحد لكل مكان)."""
        total = len(places)
        for index, place in enumerate(places.values(), 1):
            try:
                data = self._get(f"places/{place.place_id}", DETAIL_FIELDS)
            except QuotaExceeded:
                raise
            except RuntimeError as error:
                if on_progress:
                    on_progress(f"  ! تعذّر جلب تفاصيل {place.name}: {error}")
                continue
            _apply_details(place, data)
            if on_progress and index % 25 == 0:
                on_progress(f"  التفاصيل {index}/{total}")


# ---------------------------------------------------------------- مساعدات


def split_bbox(bbox: tuple[float, float, float, float], grid: int):
    """يقسّم الصندوق إلى شبكة `grid × grid` من المستطيلات."""
    lat_min, lng_min, lat_max, lng_max = bbox
    lat_step = (lat_max - lat_min) / grid
    lng_step = (lng_max - lng_min) / grid
    for row in range(grid):
        for col in range(grid):
            yield (
                lat_min + row * lat_step,
                lng_min + col * lng_step,
                lat_min + (row + 1) * lat_step,
                lng_min + (col + 1) * lng_step,
            )


def cell_size_km(bbox: tuple[float, float, float, float], grid: int) -> tuple[float, float]:
    """أبعاد خلية الشبكة تقريبًا بالكيلومتر — لتقدير ما إذا كانت الشبكة كافية."""
    lat_min, lng_min, lat_max, lng_max = bbox
    mid_lat = math.radians((lat_min + lat_max) / 2)
    height = (lat_max - lat_min) / grid * 110.574
    width = (lng_max - lng_min) / grid * 111.320 * math.cos(mid_lat)
    return width, height


def _place_from_search(raw: dict) -> Place:
    location = raw.get("location") or {}
    return Place(
        place_id=raw.get("id", ""),
        name=(raw.get("displayName") or {}).get("text", ""),
        address=raw.get("formattedAddress", ""),
        status=raw.get("businessStatus", ""),
        lat=location.get("latitude"),
        lng=location.get("longitude"),
        category=(raw.get("primaryTypeDisplayName") or {}).get("text", ""),
    )


def _apply_details(place: Place, data: dict) -> None:
    location = data.get("location") or {}
    place.name = (data.get("displayName") or {}).get("text", "") or place.name
    place.address = data.get("formattedAddress", "") or place.address
    place.phone_intl = data.get("internationalPhoneNumber", "")
    place.phone_national = data.get("nationalPhoneNumber", "")
    place.website = data.get("websiteUri", "")
    place.rating = data.get("rating")
    place.reviews = data.get("userRatingCount")
    place.status = data.get("businessStatus", "") or place.status
    place.lat = location.get("latitude", place.lat)
    place.lng = location.get("longitude", place.lng)
    place.maps_url = data.get("googleMapsUri", "")
    place.category = (data.get("primaryTypeDisplayName") or {}).get("text", "") or place.category
