/**
 * Custom field values: coercion when a field changes data type, plus display helpers.
 *
 * Changing a field's type never silently destroys data: values that cannot be
 * converted are moved to `properties._legacy[fieldKey]` so the user can recover them.
 */
import type { Entity, FieldDataType, FieldDefinition, Relationship } from "./model";
import type { Op } from "./ops";

export const LEGACY_KEY = "_legacy";

export const FIELD_TYPE_LABELS: Record<FieldDataType, string> = {
  text: "نص قصير",
  longText: "نص طويل",
  number: "رقم",
  currency: "مبلغ مالي",
  percent: "نسبة مئوية",
  date: "تاريخ",
  select: "اختيار واحد",
  multiSelect: "اختيارات متعددة",
  checkbox: "صح / خطأ",
  url: "رابط",
};

const NUMERIC: FieldDataType[] = ["number", "currency", "percent"];
const TEXTUAL: FieldDataType[] = ["text", "longText", "url"];

/** Arabic-Indic and Persian digits to ASCII, so "١٢٣" becomes 123. */
function asciiDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

export function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string") {
    const cleaned = asciiDigits(v).replace(/[,\s٬]/g, "").replace("٫", ".").replace(/%$/, "");
    if (cleaned === "") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export type Coerced = { ok: true; value: unknown } | { ok: false };

/** Convert a stored value to a new data type. `undefined`/null/"" always convert to "empty". */
export function coerceValue(value: unknown, to: FieldDataType, field?: Pick<FieldDefinition, "options">): Coerced {
  if (value === undefined || value === null || value === "") return { ok: true, value: undefined };
  if (Array.isArray(value) && value.length === 0) return { ok: true, value: undefined };

  if (TEXTUAL.includes(to)) {
    if (Array.isArray(value)) return { ok: true, value: value.join("، ") };
    if (typeof value === "boolean") return { ok: true, value: value ? "نعم" : "لا" };
    return { ok: true, value: String(value) };
  }
  if (NUMERIC.includes(to)) {
    const n = toNumber(value);
    return n === null ? { ok: false } : { ok: true, value: n };
  }
  if (to === "checkbox") {
    if (typeof value === "boolean") return { ok: true, value };
    const s = String(value).trim().toLowerCase();
    if (["true", "1", "yes", "نعم", "صح"].includes(s)) return { ok: true, value: true };
    if (["false", "0", "no", "لا", "خطأ"].includes(s)) return { ok: true, value: false };
    return { ok: false };
  }
  if (to === "date") {
    const s = asciiDigits(String(value)).trim();
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m && !Number.isNaN(Date.parse(`${m[1]}-${m[2]}-${m[3]}`))) return { ok: true, value: `${m[1]}-${m[2]}-${m[3]}` };
    return { ok: false };
  }
  const choices = field?.options.choices ?? [];
  const matchChoice = (raw: unknown) => {
    const s = String(raw).trim();
    return choices.find((c) => c.value === s || c.label === s)?.value;
  };
  if (to === "select") {
    const first = Array.isArray(value) ? value[0] : value;
    const c = matchChoice(first);
    if (c === undefined || (Array.isArray(value) && value.length > 1)) return { ok: false };
    return { ok: true, value: c };
  }
  if (to === "multiSelect") {
    const raw = Array.isArray(value) ? value : String(value).split(/[,،]/);
    const mapped = raw.map(matchChoice);
    if (mapped.some((m) => m === undefined)) return { ok: false };
    return { ok: true, value: mapped };
  }
  return { ok: false };
}

/**
 * Ops that change a field's data type and migrate every affected value safely
 * (entity properties for entity-type fields, relationship properties for
 * relationship-type fields). Expanding into primitive ops keeps the server
 * simple and makes the change undoable.
 */
export function changeFieldTypeOps(
  field: FieldDefinition,
  next: Pick<FieldDefinition, "dataType" | "options">,
  records: { entities?: Iterable<Entity>; relationships?: Iterable<Relationship> },
  at: string,
): Op[] {
  const ops: Op[] = [{ op: "update", kind: "field", id: field.id, patch: { dataType: next.dataType, options: next.options } }];
  const migrate = (props: Record<string, unknown>): Record<string, unknown> | null => {
    if (!(field.key in props)) return null;
    const old = props[field.key];
    const res = coerceValue(old, next.dataType, next);
    const properties: Record<string, unknown> = { ...props };
    if (res.ok) {
      if (res.value === undefined) delete properties[field.key];
      else properties[field.key] = res.value;
    } else {
      delete properties[field.key];
      const legacy = { ...((properties[LEGACY_KEY] as Record<string, unknown>) ?? {}) };
      legacy[field.key] = { value: old, fromType: field.dataType, at };
      properties[LEGACY_KEY] = legacy;
    }
    return properties;
  };
  if (field.entityTypeId)
    for (const e of records.entities ?? []) {
      if (e.typeId !== field.entityTypeId) continue;
      const properties = migrate(e.properties);
      if (properties) ops.push({ op: "update", kind: "entity", id: e.id, patch: { properties, updatedAt: at } });
    }
  if (field.relationshipTypeId)
    for (const r of records.relationships ?? []) {
      if (r.typeId !== field.relationshipTypeId) continue;
      const properties = migrate(r.properties);
      if (properties) ops.push({ op: "update", kind: "relationship", id: r.id, patch: { properties, updatedAt: at } });
    }
  return ops;
}

/** How many stored values would not survive a type change (they would move to `_legacy`). */
export function countLossyValues(
  field: FieldDefinition,
  next: Pick<FieldDefinition, "dataType" | "options">,
  records: { entities?: Iterable<Entity>; relationships?: Iterable<Relationship> },
): number {
  let n = 0;
  const check = (props: Record<string, unknown>) => {
    if (field.key in props && !coerceValue(props[field.key], next.dataType, next).ok) n++;
  };
  if (field.entityTypeId) for (const e of records.entities ?? []) if (e.typeId === field.entityTypeId) check(e.properties);
  if (field.relationshipTypeId) for (const r of records.relationships ?? []) if (r.typeId === field.relationshipTypeId) check(r.properties);
  return n;
}

export function formatFieldValue(value: unknown, field: Pick<FieldDefinition, "dataType" | "options">): string {
  if (value === undefined || value === null || value === "") return "";
  switch (field.dataType) {
    case "currency": {
      const n = toNumber(value);
      return n === null ? String(value) : `${n.toLocaleString("en-US")} ${field.options.currency ?? ""}`.trim();
    }
    case "number":
      return toNumber(value)?.toLocaleString("en-US") ?? String(value);
    case "percent":
      return `${toNumber(value) ?? value}%`;
    case "checkbox":
      return value ? "نعم" : "لا";
    case "select":
      return field.options.choices?.find((c) => c.value === value)?.label ?? String(value);
    case "multiSelect":
      return (Array.isArray(value) ? value : [value])
        .map((v) => field.options.choices?.find((c) => c.value === v)?.label ?? String(v))
        .join("، ");
    default:
      return String(value);
  }
}

/** Machine key from a label: keeps Arabic letters, replaces spaces. */
export function slugKey(label: string, taken: Iterable<string>): string {
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48) || "field";
  const used = new Set(taken);
  let key = base;
  for (let i = 2; used.has(key); i++) key = `${base}_${i}`;
  return key;
}
