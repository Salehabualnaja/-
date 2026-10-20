"use client";
import { X } from "lucide-react";
import { useWorkspace } from "../store";
import { cn } from "../ui";

export function Toasts() {
  const toasts = useWorkspace((s) => s.toasts);
  const dismiss = useWorkspace((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto flex max-w-[90vw] items-center gap-3 rounded-lg px-3.5 py-2 text-sm shadow-xl",
            t.tone === "error" ? "bg-red-600 text-white" : "bg-[var(--fg)] text-[var(--bg)]",
          )}
        >
          <span>{t.message}</span>
          {t.action && (
            <button
              type="button"
              className="font-semibold underline-offset-2 hover:underline"
              onClick={() => {
                t.action!.run();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button type="button" aria-label="إغلاق" className="opacity-60 hover:opacity-100" onClick={() => dismiss(t.id)}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
