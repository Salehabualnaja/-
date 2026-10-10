"""تفريغ الرسائل الصوتية العربية إلى نص عبر خدمة Groq (نموذج Whisper large-v3).

لا يحتاج أي مكتبة خارجية (مكتبة Python القياسية فقط)، فلا يحظره Smart App Control.
الصوت يُرسَل إلى Groq للتفريغ.

الإعداد مرة واحدة (PowerShell):
    setx GROQ_API_KEY "المفتاح"
ثم أعد تشغيل البوت.

الاستعمال:
    python tools/transcribe_cloud.py <مسار الملف الصوتي>
"""
import json
import os
import sys
import urllib.error
import urllib.request
import uuid

URL = "https://api.groq.com/openai/v1/audio/transcriptions"


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    key = os.environ.get("GROQ_API_KEY")
    if not key:
        print("GROQ_API_KEY is not set", file=sys.stderr)
        return 3
    if len(sys.argv) != 2 or not os.path.isfile(sys.argv[1]):
        print("usage: python tools/transcribe_cloud.py <audio-file>", file=sys.stderr)
        return 2

    path = sys.argv[1]
    name = os.path.basename(path)
    if name.lower().endswith(".oga"):  # رسائل تيليجرام الصوتية: Opus داخل Ogg
        name = name[:-4] + ".ogg"
    with open(path, "rb") as f:
        audio = f.read()

    fields = {
        "model": os.environ.get("GROQ_WHISPER_MODEL", "whisper-large-v3"),
        "language": os.environ.get("WHISPER_LANG", "ar"),
        "response_format": "json",
        "temperature": "0",
        # يرفع دقة الأسماء الخاصة التي تتكرر في رسائل صاحب العمل
        "prompt": "أسامة، سدانة، صدى، سكن، معين 360، تأهيل بلو، بيبي وماما، تحدي القراء، فريق السحابة، الوارد.",
    }
    boundary = uuid.uuid4().hex
    body = b""
    for k, v in fields.items():
        body += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n").encode()
    body += (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{name}\"\r\n"
        "Content-Type: application/octet-stream\r\n\r\n"
    ).encode() + audio + f"\r\n--{boundary}--\r\n".encode()

    req = urllib.request.Request(
        URL,
        data=body,
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            print(json.load(resp).get("text", "").strip())
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read().decode(errors='replace')[:300]}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
