"""تفريغ الرسائل الصوتية العربية إلى نص، محلياً على الجهاز ودون إنترنت بعد التنزيل الأول.

الاستعمال:
    python tools/transcribe.py <مسار الملف الصوتي>

يقرأ ملفات تيليجرام الصوتية (.oga/.ogg) وغيرها (mp3, m4a, wav, mp4...).
النموذج الافتراضي large-v3-turbo (نحو 1.6GB، يُنزَّل مرة واحدة أول تشغيل).
للتغيير: متغير البيئة WHISPER_MODEL (مثل small أو medium)، واللغة: WHISPER_LANG (الافتراضي ar).
"""
import os
import sys


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if len(sys.argv) != 2 or not os.path.isfile(sys.argv[1]):
        print("usage: python tools/transcribe.py <audio-file>", file=sys.stderr)
        return 2

    from faster_whisper import WhisperModel

    model = WhisperModel(
        os.environ.get("WHISPER_MODEL", "large-v3-turbo"),
        device="cpu",
        compute_type="int8",
    )
    segments, _ = model.transcribe(
        sys.argv[1],
        language=os.environ.get("WHISPER_LANG", "ar") or None,
        vad_filter=True,
        beam_size=5,
    )
    print(" ".join(s.text.strip() for s in segments).strip())
    return 0


if __name__ == "__main__":
    sys.exit(main())
