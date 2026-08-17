#!/usr/bin/env python3
"""أداة جمع بيانات مكاتب تأجير السيارات في الرياض وأرقام أقسام المبيعات فيها.

أمثلة:
    export GOOGLE_MAPS_API_KEY="..."
    python3 run.py                          # مسح كامل + استخراج أرقام المبيعات
    python3 run.py --grid 8 --max-requests 800
    python3 run.py --no-enrich              # اكتفِ بأرقام جوجل الرئيسية
    python3 run.py --enrich-only            # أعد الزحف على المواقع من نتائج سابقة
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from places_client import (  # noqa: E402
    DEFAULT_QUERIES, RIYADH_BBOX, Place, PlacesClient, QuotaExceeded, cell_size_km,
)
from saudi_phones import normalize  # noqa: E402
from site_enrich import PoliteFetcher, enrich_site  # noqa: E402

PLACES_COLUMNS = [
    "الاسم", "الهاتف_الرئيسي", "هاتف_محلي", "الموقع_الإلكتروني", "العنوان",
    "التقييم", "عدد_المراجعات", "الحالة", "التصنيف", "خط_العرض", "خط_الطول",
    "رابط_الخرائط", "معرّف_المكان", "صيغ_البحث_المطابقة",
]

CONTACTS_COLUMNS = [
    "الاسم", "الرقم", "الرقم_المحلي", "النوع", "درجة_الترجيح", "مبيعات؟",
    "الدلائل", "رابط_المصدر", "السياق", "بريد_المبيعات", "الموقع_الإلكتروني",
    "معرّف_المكان",
]

KIND_LABELS = {
    "mobile": "جوال",
    "landline": "أرضي",
    "unified_920": "موحّد 920",
    "tollfree_800": "مجاني 800",
}


def log(message: str) -> None:
    print(message, flush=True)


# ---------------------------------------------------------------- التصدير


def write_csv(path: Path, columns: list[str], rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # utf-8-sig حتى يفتح إكسل العربية بلا رموز مشوّهة
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def write_jsonl(path: Path, records: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def place_row(place: Place) -> dict:
    return {
        "الاسم": place.name,
        "الهاتف_الرئيسي": place.phone_intl,
        "هاتف_محلي": place.phone_national,
        "الموقع_الإلكتروني": place.website,
        "العنوان": place.address,
        "التقييم": place.rating if place.rating is not None else "",
        "عدد_المراجعات": place.reviews if place.reviews is not None else "",
        "الحالة": place.status,
        "التصنيف": place.category,
        "خط_العرض": place.lat,
        "خط_الطول": place.lng,
        "رابط_الخرائط": place.maps_url,
        "معرّف_المكان": place.place_id,
        "صيغ_البحث_المطابقة": " | ".join(place.matched_queries),
    }


# ---------------------------------------------------------------- المراحل


def stage_discover(args, api_key: str) -> dict[str, Place]:
    client = PlacesClient(
        api_key=api_key, max_requests=args.max_requests, delay=args.api_delay
    )
    width, height = cell_size_km(RIYADH_BBOX, args.grid)
    log(f"» مسح الرياض على شبكة {args.grid}×{args.grid} "
        f"(الخلية ≈ {width:.1f}×{height:.1f} كم) × {len(args.queries)} صيغة بحث")

    try:
        places = client.discover(
            bbox=RIYADH_BBOX, grid=args.grid, queries=args.queries, on_progress=log
        )
    except QuotaExceeded as error:
        log(f"! {error}")
        places = {}

    log(f"» عُثر على {len(places)} مكتبًا فريدًا. جارٍ جلب بيانات التواصل...")
    try:
        client.fill_details(places, on_progress=log)
    except QuotaExceeded as error:
        log(f"! {error}")

    log(f"» استُهلك {client.search_requests} طلب بحث "
        f"و{client.detail_requests} طلب تفاصيل.")
    return places


def stage_enrich(places: dict[str, Place], args) -> list[dict]:
    """يزحف على مواقع الشركات ويبني جدول جهات اتصال المبيعات."""
    fetcher = PoliteFetcher(
        delay=args.crawl_delay, timeout=args.timeout,
        respect_robots=not args.ignore_robots,
    )
    with_site = [p for p in places.values() if p.website]
    log(f"» {len(with_site)} مكتبًا لديه موقع إلكتروني. بدء الزحف "
        f"(حتى {args.max_pages} صفحة لكل موقع، مهلة {args.crawl_delay} ث)...")

    contacts: list[dict] = []
    sales_count = 0

    for index, place in enumerate(with_site, 1):
        result = enrich_site(place.website, fetcher, max_pages=args.max_pages)
        sales_email = " | ".join(result.sales_emails)

        # نستبعد الرقم الرئيسي المعروف من جوجل حتى لا نكرّره بلا فائدة
        main_key = None
        if place.phone_intl:
            main = normalize(place.phone_intl)
            main_key = main.key if main else None

        ranked = result.sales_hits or result.hits[:3]
        for hit in ranked:
            is_sales = hit.score >= 3
            sales_count += int(is_sales)
            contacts.append({
                "الاسم": place.name,
                "الرقم": hit.phone.e164 or hit.phone.national,
                "الرقم_المحلي": hit.phone.national,
                "النوع": KIND_LABELS.get(hit.phone.kind, hit.phone.kind),
                "درجة_الترجيح": hit.score,
                "مبيعات؟": "نعم" if is_sales else "محتمل",
                "الدلائل": " | ".join(hit.labels[:6]),
                "رابط_المصدر": hit.source_url,
                "السياق": hit.context[:220],
                "بريد_المبيعات": sales_email,
                "الموقع_الإلكتروني": place.website,
                "معرّف_المكان": place.place_id,
                "_هو_الرقم_الرئيسي": hit.phone.key == main_key,
            })

        if result.error:
            log(f"  [{index}/{len(with_site)}] {place.name}: {result.error}")
        elif index % 10 == 0:
            log(f"  [{index}/{len(with_site)}] تقدّم — {sales_count} رقم مبيعات مرشّح")

    contacts.sort(key=lambda row: row["درجة_الترجيح"], reverse=True)
    log(f"» انتهى الزحف: {sales_count} رقمًا مرجّحًا لقسم المبيعات "
        f"من أصل {len(contacts)} رقمًا مستخرجًا.")
    return contacts


# ---------------------------------------------------------------- الواجهة


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        description="جمع مكاتب تأجير السيارات في الرياض وأرقام أقسام المبيعات",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--api-key", default=os.environ.get("GOOGLE_MAPS_API_KEY", ""),
                        help="مفتاح Google Places API (أو متغيّر GOOGLE_MAPS_API_KEY)")
    parser.add_argument("--out", default="output", help="مجلّد المخرجات")
    parser.add_argument("--grid", type=int, default=6, help="دقّة شبكة المسح (grid × grid)")
    parser.add_argument("--max-requests", type=int, default=400,
                        help="سقف طلبات الواجهة — حماية من الفاتورة المفاجئة")
    parser.add_argument("--api-delay", type=float, default=0.15,
                        help="مهلة بين طلبات الواجهة بالثواني")
    parser.add_argument("--queries", nargs="*", default=DEFAULT_QUERIES,
                        help="صيغ البحث المستخدمة")
    parser.add_argument("--no-enrich", action="store_true",
                        help="تخطّي الزحف على المواقع")
    parser.add_argument("--enrich-only", action="store_true",
                        help="استخدام places.jsonl الموجود بدل استدعاء الواجهة")
    parser.add_argument("--max-pages", type=int, default=8,
                        help="حد أقصى للصفحات المزحوف عليها لكل موقع")
    parser.add_argument("--crawl-delay", type=float, default=1.0,
                        help="مهلة بين طلبات الموقع الواحد بالثواني")
    parser.add_argument("--timeout", type=int, default=15, help="مهلة الطلب بالثواني")
    parser.add_argument("--ignore-robots", action="store_true",
                        help="تجاهل robots.txt (غير مستحسن — استخدمه لموقعك أنت فقط)")
    return parser.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)
    out_dir = Path(args.out)
    places_file = out_dir / "places.jsonl"

    if args.enrich_only:
        if not places_file.exists():
            log(f"! لا يوجد {places_file} — شغّل المسح أولًا.")
            return 1
        places = {}
        for line in places_file.read_text(encoding="utf-8").splitlines():
            if line.strip():
                place = Place(**json.loads(line))
                places[place.place_id] = place
        log(f"» حُمّل {len(places)} مكتبًا من {places_file}")
    else:
        if not args.api_key:
            log("! لا يوجد مفتاح واجهة. مرّر --api-key أو اضبط GOOGLE_MAPS_API_KEY.")
            log("  (راجع README.md لخطوات إنشاء المفتاح وتفعيل Places API New)")
            return 2
        places = stage_discover(args, args.api_key)
        if not places:
            log("! لم نحصل على أي نتائج.")
            return 3
        write_jsonl(places_file, [p.to_dict() for p in places.values()])
        write_csv(out_dir / "places.csv", PLACES_COLUMNS,
                  [place_row(p) for p in places.values()])
        log(f"» حُفظت المكاتب في {out_dir/'places.csv'}")

    if args.no_enrich:
        return 0

    contacts = stage_enrich(places, args)
    write_csv(out_dir / "sales_contacts.csv", CONTACTS_COLUMNS, contacts)
    write_jsonl(out_dir / "sales_contacts.jsonl", contacts)
    log(f"» حُفظت جهات اتصال المبيعات في {out_dir/'sales_contacts.csv'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
