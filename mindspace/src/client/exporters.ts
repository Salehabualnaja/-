"use client";
import type { Snapshot } from "@/core/model";
import { formatFieldValue } from "@/core/fields";

type Saver = (name: string, mime: string, content: string) => void;
let saver: Saver | null = null;
/** Replace the browser download (e.g. where `<a download>` is blocked). */
export function setFileSaver(s: Saver) {
  saver = s;
}

function download(name: string, mime: string, content: string) {
  if (saver) return saver(name, mime, content);
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const stamp = () => new Date().toISOString().slice(0, 10);

/** Full backup of the workspace (all three layers). */
export function exportJson(s: Snapshot) {
  download(`mindspace-${stamp()}.json`, "application/json", JSON.stringify({ format: "mindspace", version: 1, exportedAt: new Date().toISOString(), snapshot: s }, null, 2));
}

function csvCell(v: unknown): string {
  const t = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/** Entities as CSV (UTF-8 with BOM so Excel shows Arabic correctly). */
export function exportEntitiesCsv(s: Snapshot, entityIds?: string[]) {
  const list = entityIds ? entityIds.map((id) => s.entities[id]).filter(Boolean) : Object.values(s.entities);
  const fields = Object.values(s.fields).filter((f) => f.entityTypeId);
  const keys = [...new Map(fields.map((f) => [f.key, f])).values()];
  const header = ["id", "النوع", "العنوان", "الوصف", "الحالة", "الأولوية", "العلامات", "البدء", "الاستحقاق", ...keys.map((f) => f.label)];
  const status = new Map(s.workspace.settings.statuses.map((c) => [c.value, c.label]));
  const prio = new Map(s.workspace.settings.priorities.map((c) => [c.value, c.label]));
  const rows = list.map((e) => [
    e.id,
    s.entityTypes[e.typeId]?.name,
    e.title,
    e.description,
    e.status ? (status.get(e.status) ?? e.status) : "",
    e.priority ? (prio.get(e.priority) ?? e.priority) : "",
    e.tags.join("، "),
    e.startDate,
    e.dueDate,
    ...keys.map((f) => {
      const own = fields.find((x) => x.key === f.key && x.entityTypeId === e.typeId);
      return own ? formatFieldValue(e.properties[f.key], own) : "";
    }),
  ]);
  download(`mindspace-entities-${stamp()}.csv`, "text/csv;charset=utf-8", "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n"));
}

/** Relationships as CSV. */
export function exportRelationshipsCsv(s: Snapshot) {
  const header = ["id", "المصدر", "النوع", "الهدف", "الاسم", "الاتجاه", "الحالة", "القوة", "التاريخ", "الخصائص"];
  const rows = Object.values(s.relationships).map((r) => [
    r.id,
    s.entities[r.sourceId]?.title,
    s.relationshipTypes[r.typeId]?.name,
    s.entities[r.targetId]?.title,
    r.label,
    r.direction,
    r.status,
    r.weight,
    r.date,
    JSON.stringify(r.properties),
  ]);
  download(`mindspace-relationships-${stamp()}.csv`, "text/csv;charset=utf-8", "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n"));
}
