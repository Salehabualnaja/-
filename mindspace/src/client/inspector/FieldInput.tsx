"use client";
import type { FieldDefinition } from "@/core/model";
import { toNumber } from "@/core/fields";
import { CommitInput, Input, Select, cn } from "../ui";

/**
 * Schema-driven editor for one custom field value. Any field the user adds in
 * settings is edited through this component automatically.
 */
export function FieldInput({ field, value, onChange }: { field: FieldDefinition; value: unknown; onChange: (v: unknown) => void }) {
  const set = (v: unknown) => onChange(v === "" || v === null ? undefined : v);
  switch (field.dataType) {
    case "longText":
      return <CommitInput multiline value={value == null ? "" : String(value)} onCommit={set} />;
    case "number":
    case "currency":
    case "percent":
      return (
        <div className="relative">
          <CommitInput
            inputMode="decimal"
            dir="ltr"
            className={cn(field.dataType !== "number" && "pe-12")}
            value={value == null ? "" : String(value)}
            onCommit={(v) => set(v.trim() === "" ? undefined : (toNumber(v) ?? v))}
          />
          {field.dataType !== "number" && (
            <span className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 text-xs text-[var(--fg-subtle)]">
              {field.dataType === "percent" ? "%" : (field.options.currency ?? "")}
            </span>
          )}
        </div>
      );
    case "date":
      return <Input type="date" dir="ltr" value={typeof value === "string" ? value : ""} onChange={(e) => set(e.target.value)} />;
    case "checkbox":
      return <input type="checkbox" className="h-4 w-4" checked={value === true} onChange={(e) => set(e.target.checked)} />;
    case "select":
      return (
        <Select value={typeof value === "string" ? value : ""} onChange={(e) => set(e.target.value)}>
          <option value="">—</option>
          {field.options.choices?.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
      );
    case "multiSelect": {
      const cur = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="flex flex-wrap gap-1">
          {field.options.choices?.map((c) => {
            const on = cur.includes(c.value);
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => set(on ? cur.filter((x) => x !== c.value) : [...cur, c.value])}
                className={cn("rounded-full border px-2 py-0.5 text-xs", on ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)]")}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      );
    }
    case "url":
      return (
        <div className="flex items-center gap-1">
          <CommitInput dir="ltr" value={value == null ? "" : String(value)} onCommit={set} />
          {typeof value === "string" && /^https?:\/\//.test(value) && (
            <a href={value} target="_blank" rel="noreferrer noopener" className="text-xs text-[var(--accent)]">
              فتح
            </a>
          )}
        </div>
      );
    default:
      return <CommitInput value={value == null ? "" : String(value)} onCommit={set} />;
  }
}
