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
from site_enrich import PoliteFetcher, SiteResult, enrich_site  # noqa: E402

# العتبة التي يُعدّ الرقم فوقها رقم مبيعات لا رقم استقبال
SALES_THRESHOLD = 3
PRIORITY_ORDER = ["عالية", "متوسطة", "منخفضة"]

MOBILES_COLUMNS = [
    "الاسم", "الجوال", "الجوال_المحلي", "واتساب", "الأولوية", "درجة_الترجيح",
    "المصدر", "الدلائل", "السياق", "رابط_المصدر", "العنوان", "التقييم",
    "الموقع_الإلكتروني", "رابط_الخرائط", "معرّف_المكان",
]

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


def stage_enrich(places: dict[str, Place], args) -> dict[str, SiteResult]:
    """يزحف على مواقع الشركات ويعيد نتيجة كل موقع مفهرسةً بمعرّف المكان."""
    fetcher = PoliteFetcher(
        delay=args.crawl_delay, timeout=args.timeout,
        respect_robots=not args.ignore_robots,
    )
    with_site = [p for p in places.values() if p.website]
    log(f"» {len(with_site)} مكتبًا لديه موقع إلكتروني. بدء الزحف "
        f"(حتى {args.max_pages} صفحة لكل موقع، مهلة {args.crawl_delay} ث)...")

    results: dict[str, SiteResult] = {}
    for index, place in enumerate(with_site, 1):
        result = enrich_site(place.website, fetcher, max_pages=args.max_pages)
        results[place.place_id] = result

        if result.error:
            log(f"  [{index}/{len(with_site)}] {place.name}: {result.error}")
        elif index % 10 == 0:
            found = sum(len(r.mobiles) for r in results.values())
            log(f"  [{index}/{len(with_site)}] تقدّم — {found} جوّالًا حتى الآن")
    return results


def build_contacts(places: dict[str, Place], results: dict[str, SiteResult],
                   mobiles_only: bool = False) -> list[dict]:
    """جدول كل الأرقام المستخرجة مع تقييم ارتباطها بالمبيعات."""
    contacts: list[dict] = []
    for place in places.values():
        result = results.get(place.place_id)
        if result is None:
            continue
        sales_email = " | ".join(result.sales_emails)
        ranked = result.sales_hits or result.hits[:3]
        if mobiles_only:
            ranked = [h for h in ranked if h.phone.kind == "mobile"]
        for hit in ranked:
            contacts.append({
                "الاسم": place.name,
                "الرقم": hit.phone.e164 or hit.phone.national,
                "الرقم_المحلي": hit.phone.national,
                "النوع": KIND_LABELS.get(hit.phone.kind, hit.phone.kind),
                "درجة_الترجيح": hit.score,
                "مبيعات؟": "نعم" if hit.score >= SALES_THRESHOLD else "محتمل",
                "الدلائل": " | ".join(hit.labels[:6]),
                "رابط_المصدر": hit.source_url,
                "السياق": hit.context[:220],
                "بريد_المبيعات": sales_email,
                "الموقع_الإلكتروني": place.website,
                "معرّف_المكان": place.place_id,
            })
    contacts.sort(key=lambda row: row["درجة_الترجيح"], reverse=True)
    return contacts


def build_mobiles(places: dict[str, Place],
                  results: dict[str, SiteResult]) -> list[dict]:
    """قائمة الجوالات القابلة للاتصال، مرتّبة بحسب أولوية الاتصال.

    مصدران: الرقم المنشور في بطاقة جوجل حين يكون جوّالًا (وهو الحال في كثير
    من المكاتب الصغيرة التي لا موقع لها أصلًا)، وما يظهر في موقع الشركة —
    وأهمّه أزرار واتساب لأنّ رقمها جوال بالضرورة وتردّ عليه المبيعات عادةً.
    """
    rows: list[dict] = []

    for place in places.values():
        result = results.get(place.place_id)
        # المفتاح: الرقم — لدمج ما يرد من جوجل ومن الموقع في صفّ واحد
        merged: dict[str, dict] = {}

        google_phone = normalize(place.phone_intl or place.phone_national or "")
        if google_phone is not None and google_phone.kind == "mobile":
            merged[google_phone.key] = {
                "phone": google_phone, "score": 0, "channels": ["جوجل"],
                "labels": [], "context": "الرقم المعلن في بطاقة النشاط",
                "source_url": place.maps_url, "whatsapp": False,
            }

        for hit in (result.mobiles if result else []):
            entry = merged.get(hit.phone.key)
            if entry is None:
                merged[hit.phone.key] = {
                    "phone": hit.phone, "score": hit.score,
                    "channels": [hit.channels_label], "labels": hit.labels,
                    "context": hit.context, "source_url": hit.source_url,
                    "whatsapp": hit.on_whatsapp,
                }
            else:
                # نفس الرقم في جوجل وفي الموقع ⇒ ثقة أعلى ودلائل أوضح
                entry["score"] = max(entry["score"], hit.score)
                entry["channels"].append(hit.channels_label)
                entry["labels"] = entry["labels"] or hit.labels
                entry["whatsapp"] = entry["whatsapp"] or hit.on_whatsapp
                if hit.score > 0:
                    entry["context"] = hit.context
                    entry["source_url"] = hit.source_url

        for entry in merged.values():
            rows.append({
                "الاسم": place.name,
                "الجوال": entry["phone"].e164,
                "الجوال_المحلي": entry["phone"].national,
                "واتساب": "نعم" if entry["whatsapp"] else "",
                "الأولوية": _priority(entry),
                "درجة_الترجيح": entry["score"],
                "المصدر": " + ".join(dict.fromkeys(entry["channels"])),
                "الدلائل": " | ".join(entry["labels"][:6]),
                "السياق": entry["context"][:220],
                "رابط_المصدر": entry["source_url"],
                "العنوان": place.address,
                "التقييم": place.rating if place.rating is not None else "",
                "الموقع_الإلكتروني": place.website,
                "رابط_الخرائط": place.maps_url,
                "معرّف_المكان": place.place_id,
            })

    rows.sort(key=lambda row: (
        PRIORITY_ORDER.index(row["الأولوية"]),
        -row["درجة_الترجيح"],
        row["الاسم"],
    ))
    return rows


def _priority(entry: dict) -> str:
    """أولوية الاتصال: دليل مبيعات صريح ← رقم منشور للتواصل ← رقم عابر."""
    if entry["score"] >= SALES_THRESHOLD:
        return "عالية"
    if entry["whatsapp"] or entry["channels"] != ["نصّ الصفحة"]:
        return "متوسطة"
    return "منخفضة"


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
                        help="تخطّي الزحف على المواقع (يبقى mobiles.csv من أرقام جوجل)")
    parser.add_argument("--mobiles-only", action="store_true",
                        help="اقصر sales_contacts.csv على الجوالات كذلك")
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

    results = {} if args.no_enrich else stage_enrich(places, args)

    # الجوالات أولًا: هي وحدها ما يوصل إلى شخص تكلّمه
    mobiles = build_mobiles(places, results)
    write_csv(out_dir / "mobiles.csv", MOBILES_COLUMNS, mobiles)
    write_jsonl(out_dir / "mobiles.jsonl", mobiles)

    by_priority = {level: sum(1 for m in mobiles if m["الأولوية"] == level)
                   for level in PRIORITY_ORDER}
    on_whatsapp = sum(1 for m in mobiles if m["واتساب"])
    log(f"» {len(mobiles)} جوّالًا قابلًا للاتصال — "
        f"عالية {by_priority['عالية']} · متوسطة {by_priority['متوسطة']} · "
        f"منخفضة {by_priority['منخفضة']} · على واتساب {on_whatsapp}")
    log(f"» حُفظت الجوالات في {out_dir/'mobiles.csv'}  ← ابدأ من هنا")

    if not args.no_enrich:
        contacts = build_contacts(places, results, mobiles_only=args.mobiles_only)
        write_csv(out_dir / "sales_contacts.csv", CONTACTS_COLUMNS, contacts)
        write_jsonl(out_dir / "sales_contacts.jsonl", contacts)
        log(f"» وكل الأرقام (أرضي و920 أيضًا) في {out_dir/'sales_contacts.csv'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
