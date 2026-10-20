"use client";
import { useQuery } from "@tanstack/react-query";
import type { ChangeEventDto } from "@/server/repository";
import { useWorkspace } from "../store";

const OP_LABEL: Record<string, string> = { create: "إنشاء", update: "تعديل", delete: "حذف" };
const KIND_LABEL: Record<string, string> = { entity: "الكيان", relationship: "علاقة", placement: "الموضع", canvas: "اللوحة" };

/** Change history from the server's append-only audit log. */
export function History({ id, related }: { id: string; related?: boolean }) {
  const pending = useWorkspace((s) => s.pending);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["history", id, related, pending === 0],
    queryFn: async () => {
      const res = await fetch(`/api/history?id=${encodeURIComponent(id)}${related ? "&related=1" : ""}`);
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as ChangeEventDto[];
    },
    staleTime: 5000,
  });
  if (isLoading) return <div className="text-xs text-[var(--fg-subtle)]">جارٍ التحميل…</div>;
  if (isError) return <div className="text-xs text-red-500">تعذّر تحميل السجل (قد تكون غير متصل).</div>;
  if (!data?.length) return <div className="text-xs text-[var(--fg-subtle)]">لا توجد تعديلات محفوظة بعد.</div>;
  return (
    <ol className="space-y-1.5 text-xs">
      {data.slice(0, 30).map((ev) => {
        const fields = ev.op === "update" && "patch" in ev.payload ? Object.keys(ev.payload.patch).filter((k) => k !== "updatedAt") : [];
        return (
          <li key={ev.id} className="flex gap-2">
            <time dir="ltr" className="shrink-0 tabular-nums text-[var(--fg-subtle)]">
              {new Date(ev.at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}
            </time>
            <span className="text-[var(--fg-muted)]">
              {OP_LABEL[ev.op] ?? ev.op} {KIND_LABEL[ev.kind] ?? ev.kind}
              {fields.length > 0 && <span className="text-[var(--fg-subtle)]"> ({fields.join("، ")})</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
