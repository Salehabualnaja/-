"use client";
import { Fragment, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Columns3, Download } from "lucide-react";
import type { Entity, FieldDefinition } from "@/core/model";
import { formatFieldValue } from "@/core/fields";
import { normalizeText } from "@/core/search";
import { useWorkspace } from "../store";
import { updateEntity } from "../actions";
import { exportEntitiesCsv } from "../exporters";
import { EntityIcon } from "../icons";
import { Button, CommitInput, Empty, Input, Popover, Select, cn } from "../ui";

type SortKey = "title" | "type" | "status" | "priority" | "dueDate" | "updatedAt" | "links" | `f:${string}`;
const BUILTIN = [
  { key: "status", label: "الحالة" },
  { key: "priority", label: "الأولوية" },
  { key: "dueDate", label: "الاستحقاق" },
  { key: "links", label: "العلاقات" },
  { key: "canvases", label: "اللوحات" },
  { key: "updatedAt", label: "آخر تعديل" },
] as const;

/**
 * Dynamic table over the same entities shown on the canvas. Edits here are
 * ordinary ops, so they appear on every canvas and dashboard immediately.
 */
export function TableView() {
  const snap = useWorkspace((s) => s.snap);
  const set = useWorkspace((s) => s.set);
  const inspected = useWorkspace((s) => s.inspected);
  const [typeId, setTypeId] = useState<string>("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "updatedAt", dir: -1 });
  const [hidden, setHidden] = useState<string[]>(["canvases"]);

  const { statuses, priorities } = snap.workspace.settings;
  const typeFields: FieldDefinition[] = useMemo(
    () =>
      typeId
        ? Object.values(snap.fields)
            .filter((f) => f.entityTypeId === typeId)
            .sort((a, b) => a.sortOrder - b.sortOrder)
        : [],
    [snap.fields, typeId],
  );

  const stats = useMemo(() => {
    const links = new Map<string, number>();
    const canvases = new Map<string, number>();
    for (const r of Object.values(snap.relationships)) {
      links.set(r.sourceId, (links.get(r.sourceId) ?? 0) + 1);
      links.set(r.targetId, (links.get(r.targetId) ?? 0) + 1);
    }
    for (const p of Object.values(snap.placements)) canvases.set(p.entityId, (canvases.get(p.entityId) ?? 0) + 1);
    return { links, canvases };
  }, [snap.relationships, snap.placements]);

  const rows = useMemo(() => {
    const nq = normalizeText(q);
    const list = Object.values(snap.entities).filter(
      (e) => (!typeId || e.typeId === typeId) && (!nq || normalizeText(`${e.title} ${e.description} ${e.tags.join(" ")}`).includes(nq)),
    );
    const val = (e: Entity): string | number => {
      if (sort.key === "type") return snap.entityTypes[e.typeId]?.name ?? "";
      if (sort.key === "links") return stats.links.get(e.id) ?? 0;
      if (sort.key === "priority") return priorities.findIndex((p) => p.value === e.priority);
      if (sort.key === "status") return statuses.findIndex((p) => p.value === e.status);
      if (sort.key.startsWith("f:")) {
        const v = e.properties[sort.key.slice(2)];
        return typeof v === "number" ? v : v == null ? "" : String(v);
      }
      return (e[sort.key as keyof Entity] as string | null) ?? "";
    };
    return list.sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "ar")) * sort.dir;
    });
  }, [snap.entities, snap.entityTypes, typeId, q, sort, stats, priorities, statuses]);

  const show = (k: string) => !hidden.includes(k);
  const header = (key: SortKey, label: string) => (
    <th className="whitespace-nowrap px-2 py-2 text-start font-medium">
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-[var(--fg)]"
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : 1 }))}
      >
        {label}
        {sort.key === key && (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] p-3">
        <Select className="w-44" value={typeId} onChange={(e) => setTypeId(e.target.value)} aria-label="النوع">
          <option value="">كل الأنواع</option>
          {Object.values(snap.entityTypes)
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
        </Select>
        <Input className="w-56" placeholder="تصفية بالنص…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="text-xs text-[var(--fg-muted)]">{rows.length} كيان</span>
        <div className="ms-auto flex gap-1">
          <Popover
            align="end"
            trigger={
              <Button variant="outline" size="sm">
                <Columns3 size={14} /> الأعمدة
              </Button>
            }
          >
            <div className="w-56 p-1 text-sm">
              {[...BUILTIN.map((b) => ({ key: b.key as string, label: b.label })), ...typeFields.map((f) => ({ key: `f:${f.key}`, label: f.label }))].map((c) => (
                <label key={c.key} className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-[var(--surface-2)]">
                  <input type="checkbox" checked={show(c.key)} onChange={() => setHidden((h) => (h.includes(c.key) ? h.filter((x) => x !== c.key) : [...h, c.key]))} />
                  {c.label}
                </label>
              ))}
              {!typeId && <p className="px-1.5 pt-1 text-[11px] text-[var(--fg-subtle)]">اختر نوعاً لإظهار حقوله المخصصة.</p>}
            </div>
          </Popover>
          <Button variant="outline" size="sm" onClick={() => exportEntitiesCsv(snap, rows.map((r) => r.id))}>
            <Download size={14} /> CSV
          </Button>
        </div>
      </div>
      {rows.length === 0 ? (
        <Empty title="لا توجد كيانات مطابقة">أنشئ كيانات من اللوحة أو من «التقاط سريع».</Empty>
      ) : (
        <div className="ms-scroll min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-sm" data-testid="entity-table">
            <thead className="sticky top-0 z-10 bg-[var(--surface)] text-xs text-[var(--fg-muted)] shadow-[0_1px_0_var(--border)]">
              <tr>
                {header("title", "العنوان")}
                {header("type", "النوع")}
                {show("status") && header("status", "الحالة")}
                {show("priority") && header("priority", "الأولوية")}
                {show("dueDate") && header("dueDate", "الاستحقاق")}
                {typeFields.filter((f) => show(`f:${f.key}`)).map((f) => (
                  <Fragment key={f.id}>{header(`f:${f.key}`, f.label)}</Fragment>
                ))}
                {show("links") && header("links", "العلاقات")}
                {show("canvases") && <th className="px-2 py-2 text-start font-medium">اللوحات</th>}
                {show("updatedAt") && header("updatedAt", "آخر تعديل")}
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const t = snap.entityTypes[e.typeId];
                return (
                  <tr
                    key={e.id}
                    className={cn("border-b border-[var(--border)] hover:bg-[var(--surface-2)]", inspected?.id === e.id && "bg-[var(--accent-soft)]")}
                    onClick={(ev) => {
                      if ((ev.target as HTMLElement).closest("input,select,textarea,button")) return;
                      set({ inspected: { kind: "entity", id: e.id } });
                    }}
                  >
                    <td className="min-w-56 px-2 py-1">
                      <CommitInput className="h-7 border-transparent bg-transparent px-1 font-medium hover:border-[var(--border)]" value={e.title} placeholder="بلا عنوان" onCommit={(title) => updateEntity(e.id, { title })} />
                    </td>
                    <td className="whitespace-nowrap px-2 py-1">
                      <span className="inline-flex items-center gap-1.5">
                        <EntityIcon name={t?.icon ?? "circle"} color={t?.color} size={13} /> {t?.name}
                      </span>
                    </td>
                    {show("status") && (
                      <td className="px-2 py-1">
                        <Select className="h-7 w-28 border-transparent bg-transparent" value={e.status ?? ""} onChange={(ev) => updateEntity(e.id, { status: ev.target.value || null })}>
                          <option value="">—</option>
                          {statuses.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </Select>
                      </td>
                    )}
                    {show("priority") && (
                      <td className="px-2 py-1">
                        <Select className="h-7 w-28 border-transparent bg-transparent" value={e.priority ?? ""} onChange={(ev) => updateEntity(e.id, { priority: ev.target.value || null })}>
                          <option value="">—</option>
                          {priorities.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </Select>
                      </td>
                    )}
                    {show("dueDate") && (
                      <td className="whitespace-nowrap px-2 py-1 tabular-nums" dir="ltr">
                        {e.dueDate ?? ""}
                      </td>
                    )}
                    {typeFields
                      .filter((f) => show(`f:${f.key}`))
                      .map((f) => (
                        <td key={f.id} dir="auto" className="whitespace-nowrap px-2 py-1">
                          {formatFieldValue(e.properties[f.key], f)}
                        </td>
                      ))}
                    {show("links") && <td className="px-2 py-1 tabular-nums">{stats.links.get(e.id) ?? 0}</td>}
                    {show("canvases") && <td className="px-2 py-1 tabular-nums">{stats.canvases.get(e.id) ?? 0}</td>}
                    {show("updatedAt") && (
                      <td className="whitespace-nowrap px-2 py-1 text-xs text-[var(--fg-muted)]" dir="ltr">
                        {new Date(e.updatedAt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
