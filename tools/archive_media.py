"""أرشيف تراث الشيخ سلطان في Google Drive للحساب الشخصي: تنزيل المقاطع (يوتيوب وغيره) وحفظ الملفات المرسلة.

يكتب الملفات في مجلد الأرشيف على الحاسوب (Google Drive for desktop)، فيرفعها Drive بنفسه
إلى الحساب الشخصي وتُحسب من مساحته. يعتمد على yt-dlp وffmpeg، ويتخطّى ما نُزّل من قبل.

الإعداد مرة واحدة (PowerShell):
    winget install yt-dlp.yt-dlp
    winget install Gyan.FFmpeg
    setx SULTAN_ARCHIVE_DIR "G:\\My Drive\\تراث الشيخ سلطان"   (اختياري: إن لم يُعثر عليه تلقائياً)

الاستعمال:
    python tools/archive_media.py --init                              (إنشاء مجلدات الأرشيف مرة واحدة)
    python tools/archive_media.py <رابط> [--audio] [--series اسم] [--quality 720]
    python tools/archive_media.py <رابط قائمة أو قناة> --probe      (عدد المقاطع ومدتها وحجمها التقريبي، بلا تنزيل)
    python tools/archive_media.py <رابط قائمة> --limit 50
    python tools/archive_media.py <مسار ملف> --dest 03 [--series اسم] --name "الاسم الجديد"   (حفظ ملف مرسل)

يطبع في النهاية سطر JSON فيه ما نُزّل (العنوان، والتاريخ، والمدة، والرابط، والمسار)
ليُسجَّل في «فهرس تراث الشيخ سلطان». لا يحذف شيئاً ولا يكتب فوق ملف موجود.
"""
import argparse
import json
import os
import re
import shutil
import string
import subprocess
import sys

ARCHIVE_NAME = "تراث الشيخ سلطان"
FOLDERS = [
    "00-وارد",
    "01-مرئيات",
    "02-صوتيات",
    "03-كتب ومؤلفات",
    "04-مخطوطات ورسائل",
    "05-مقالات وفتاوى",
    "06-صور",
    "07-وثائق",
    "08-ما كُتب عنه",
]
VIDEO_DIR, AUDIO_DIR = FOLDERS[1], FOLDERS[2]
DOWNLOAD_LOG = "_download-archive.txt"  # معرّفات ما نُزّل، ليتخطّاه yt-dlp لاحقاً
FIELDS = "id,title,upload_date,duration_string,webpage_url,uploader,extractor_key,playlist_title,filepath"
NOT_FOUND = (f"لم أجد مجلد «{ARCHIVE_NAME}» في Google Drive for desktop. "
             "اضبط SULTAN_ARCHIVE_DIR أو مرّر --root")
# تقدير تقريبي للحجم بالميغابايت لكل دقيقة
MB_PER_MIN = {"audio": 1.0, 360: 3.0, 480: 4.5, 720: 8.0, 1080: 15.0}


def find_root() -> str | None:
    env = os.environ.get("SULTAN_ARCHIVE_DIR")
    if env:
        return env if os.path.isdir(env) else None
    bases = ["My Drive", "ملفاتي", "drive saya"]
    candidates = []
    if os.name == "nt":
        for letter in string.ascii_uppercase[3:]:  # من D إلى Z
            for base in bases:
                candidates.append(f"{letter}:\\{base}\\{ARCHIVE_NAME}")
    home = os.path.expanduser("~")
    for base in bases:
        candidates.append(os.path.join(home, "Google Drive", base, ARCHIVE_NAME))
    return next((c for c in candidates if os.path.isdir(c)), None)


def safe_name(name: str) -> str:
    return re.sub(r'[\\/:*?"<>|]', "-", name).strip(" .") or "متفرقات"


def resolve_dest(key: str) -> str | None:
    """«03» أو «03-كتب ومؤلفات» أو «كتب» ← اسم المجلد الكامل."""
    return next((f for f in FOLDERS if f == key or f.startswith(key + "-") or key in f), None)


def import_file(path: str, root: str, args) -> dict:
    dest = resolve_dest(args.dest)
    if not dest:
        return {"ok": False, "error": f"وجهة غير معروفة: {args.dest}", "folders": FOLDERS}
    folder = os.path.join(root, dest, safe_name(args.series)) if args.series else os.path.join(root, dest)
    os.makedirs(folder, exist_ok=True)
    ext = os.path.splitext(path)[1]
    base = safe_name(args.name) if args.name else os.path.splitext(os.path.basename(path))[0]
    if base.lower().endswith(ext.lower()):
        base = base[: -len(ext)]
    target = os.path.join(folder, base + ext)
    n = 2
    while os.path.exists(target):  # لا كتابة فوق ملف موجود
        target = os.path.join(folder, f"{base}_v{n}{ext}")
        n += 1
    shutil.copy2(path, target)
    return {
        "ok": True,
        "root": root,
        "path_in_archive": os.path.relpath(target, root),
        "size_mb": round(os.path.getsize(target) / 1048576, 1),
    }


def probe(url: str, quality: int, audio: bool) -> dict:
    out = subprocess.run(
        ["yt-dlp", "--flat-playlist", "-J", url],
        capture_output=True, text=True, encoding="utf-8",
    )
    if out.returncode != 0:
        return {"ok": False, "error": out.stderr.strip()[-800:]}
    info = json.loads(out.stdout)
    entries = info.get("entries") or [info]
    seconds = sum(e.get("duration") or 0 for e in entries)
    rate = MB_PER_MIN["audio" if audio else quality]
    return {
        "ok": True,
        "title": info.get("title"),
        "count": len(entries),
        "missing_duration": sum(1 for e in entries if not e.get("duration")),
        "total_hours": round(seconds / 3600, 1),
        "estimated_gb": round(seconds / 60 * rate / 1024, 1),
        "first_titles": [e.get("title") for e in entries[:10]],
    }


def download(url: str, root: str, args) -> dict:
    kind_dir = AUDIO_DIR if args.audio else VIDEO_DIR
    series = safe_name(args.series) if args.series else "%(playlist_title|متفرقات)s"
    template = os.path.join(
        root, kind_dir, series,
        "%(upload_date>%Y-%m-%d|0000-00-00)s_%(title).90B [%(id)s].%(ext)s",
    )
    cmd = [
        "yt-dlp", url,
        "--no-playlist",  # رابط مقطع داخل قائمة: المقطع وحده
        "--windows-filenames",
        "--download-archive", os.path.join(root, DOWNLOAD_LOG),
        "--embed-metadata",
        "--ignore-errors",
        "-o", template,
        "--print", f"after_move:%(.{{{FIELDS}}})j",
        "--no-simulate",
        "--no-quiet", "--no-progress",  # لتظهر رسالة «already been recorded» فتُعدّ المكررات
    ]
    if args.limit:
        cmd += ["--playlist-items", f"1:{args.limit}"]
    if args.audio:
        cmd += ["-f", "ba/b", "-x", "--audio-format", "m4a"]
    else:
        q = args.quality
        cmd += ["-f", f"bv*[height<={q}]+ba/b[height<={q}]/b", "--merge-output-format", "mp4"]

    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    items = []
    for line in proc.stdout.splitlines():
        line = line.strip()
        if line.startswith("{"):
            try:
                items.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    for item in items:
        if item.get("filepath"):
            item["path_in_archive"] = os.path.relpath(item["filepath"], root)
    errors = [l for l in proc.stderr.splitlines() if l.startswith("ERROR")]
    return {
        "ok": bool(items) or not errors,
        "root": root,
        "downloaded": items,
        "skipped_existing": (proc.stdout + proc.stderr).count("already been recorded in the archive"),
        "errors": errors[-10:],
    }


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    p = argparse.ArgumentParser(description="تنزيل المقاطع إلى أرشيف تراث الشيخ سلطان")
    p.add_argument("source", nargs="?", help="رابط المقطع أو القائمة، أو مسار ملف محلي")
    p.add_argument("--audio", action="store_true", help="الصوت فقط (m4a) إلى 02-صوتيات")
    p.add_argument("--series", help="اسم السلسلة أو الموضوع (مجلد فرعي)")
    p.add_argument("--quality", type=int, default=720, choices=[360, 480, 720, 1080])
    p.add_argument("--limit", type=int, help="أقصى عدد من مقاطع القائمة أو القناة")
    p.add_argument("--probe", action="store_true", help="عدّ المقاطع وتقدير الحجم دون تنزيل")
    p.add_argument("--root", help="مسار مجلد الأرشيف (بدلاً من البحث التلقائي)")
    p.add_argument("--dest", help="لملف محلي: رقم المجلد أو اسمه، مثل 03 أو كتب")
    p.add_argument("--name", help="لملف محلي: الاسم الجديد دون الامتداد")
    p.add_argument("--init", action="store_true", help="إنشاء مجلدات الأرشيف")
    args = p.parse_args()

    def done(result: dict) -> int:
        print(json.dumps(result, ensure_ascii=False))
        return 0 if result.get("ok") else 1

    if args.init or (args.source and os.path.isfile(args.source)):
        root = args.root or find_root()
        if not root or not os.path.isdir(root):
            return done({"ok": False, "error": NOT_FOUND})
        if args.init:
            for f in FOLDERS:
                os.makedirs(os.path.join(root, f), exist_ok=True)
            return done({"ok": True, "root": root, "folders": FOLDERS})
        if not args.dest:
            return done({"ok": False, "error": "حدّد --dest", "folders": FOLDERS})
        return done(import_file(args.source, root, args))
    if not args.source:
        p.error("أعطِ رابطاً أو مسار ملف أو --init")

    if not shutil.which("yt-dlp"):
        return done({"ok": False, "error": "yt-dlp غير مثبّت: winget install yt-dlp.yt-dlp"})
    if args.probe:
        return done(probe(args.source, args.quality, args.audio))
    root = args.root or find_root()
    if not root or not os.path.isdir(root):
        return done({"ok": False, "error": NOT_FOUND})
    return done(download(args.source, root, args))


if __name__ == "__main__":
    sys.exit(main())
