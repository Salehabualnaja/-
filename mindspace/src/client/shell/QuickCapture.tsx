"use client";
import { useState } from "react";
import { useWorkspace } from "../store";
import { quickCapture } from "../actions";
import { Button, Dialog, Textarea } from "../ui";

/** Get thoughts out fast: one idea per line, no classification required. */
export function QuickCapture() {
  const open = useWorkspace((s) => s.captureOpen);
  const set = useWorkspace((s) => s.set);
  const [text, setText] = useState("");
  const [place, setPlace] = useState(false);
  const lines = text.split("\n").filter((l) => l.trim());
  const save = () => {
    const n = quickCapture(text.split("\n"), place);
    if (n) useWorkspace.getState().toast(place ? `أُضيفت ${n} فكرة إلى اللوحة.` : `أُضيفت ${n} فكرة إلى «الوارد».`);
    setText("");
    set({ captureOpen: false });
  };
  return (
    <Dialog open={open} onOpenChange={(o) => set({ captureOpen: o })} title="التقاط سريع" description="اكتب فكرة في كل سطر. صنّفها لاحقاً من التفاصيل.">
      <Textarea
        autoFocus
        className="min-h-40"
        placeholder={"فكرة أولى\nفكرة ثانية\n…"}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save();
        }}
      />
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={place} onChange={(e) => setPlace(e.target.checked)} /> ضعها في اللوحة الحالية (وإلا تذهب إلى «الوارد»)
      </label>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-[var(--fg-subtle)]">{lines.length} فكرة · Ctrl+Enter للحفظ</span>
        <Button variant="primary" disabled={!lines.length} onClick={save}>
          حفظ
        </Button>
      </div>
    </Dialog>
  );
}
