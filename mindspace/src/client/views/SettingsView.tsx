"use client";
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  EDGE_CURVES,
  EDGE_DASHES,
  FIELD_DATA_TYPES,
  RELATIONSHIP_CATEGORIES,
  newId,
  nowIso,
  type EdgeVisual,
  type EntityType,
  type FieldDataType,
  type FieldDefinition,
  type RelationshipType,
} from "@/core/model";
import { changeFieldTypeOps, countLossyValues, FIELD_TYPE_LABELS, slugKey } from "@/core/fields";
import type { Op } from "@/core/ops";
import { useWorkspace } from "../store";
import { ENTITY_ICONS, EntityIcon, PALETTE } from "../icons";
import { CATEGORY_LABEL } from "../inspector/EntityInspector";
import { Button, CommitInput, Dialog, IconButton, Label, Select, Swatches, cn } from "../ui";

type Selected = { kind: "entityType" | "relationshipType"; id: string } | null;

/**
 * Configuration-driven structure: entity types, relationship types and their
 * fields are data, edited here, never hard-coded.
 */
export function SettingsView() {
  const entityTypes = useWorkspace((s) => s.snap.entityTypes);
  const relTypes = useWorkspace((s) => s.snap.relationshipTypes);
  const entities = useWorkspace((s) => s.snap.entities);
  const relationships = useWorkspace((s) => s.snap.relationships);
  const [sel, setSel] = useState<Selected>(null);

  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of Object.values(entities)) m.set(e.typeId, (m.get(e.typeId) ?? 0) + 1);
    for (const r of Object.values(relationships)) m.set(r.typeId, (m.get(r.typeId) ?? 0) + 1);
    return m;
  }, [entities, relationships]);

  const sortedE = Object.values(entityTypes).sort((a, b) => a.sortOrder - b.sortOrder);
  const sortedR = Object.values(relTypes).sort((a, b) => a.sortOrder - b.sortOrder);
  const dispatch = useWorkspace.getState().dispatch;

  const addEntityType = () => {
    const t: EntityType = {
      id: newId(),
      key: slugKey("type", sortedE.map((x) => x.key)),
      name: "نوع جديد",
      nameEn: "",
      icon: "circle",
      color: PALETTE[sortedE.length % PALETTE.length],
      description: "",
      sortOrder: (sortedE.at(-1)?.sortOrder ?? 0) + 1,
    };
    if (dispatch([{ op: "create", kind: "entityType", value: t }], { label: "نوع كيان جديد" })) setSel({ kind: "entityType", id: t.id });
  };
  const addRelType = () => {
    const t: RelationshipType = {
      id: newId(),
      key: slugKey("relation", sortedR.map((x) => x.key)),
      category: "custom",
      name: "علاقة جديدة",
      nameEn: "",
      inverseName: "",
      description: "",
      directed: true,
      visual: { color: PALETTE[sortedR.length % PALETTE.length], width: 1.75, dash: "solid", curve: "bezier", arrow: "arrowclosed", opacity: 1, showLabel: true },
      sortOrder: (sortedR.at(-1)?.sortOrder ?? 0) + 1,
    };
    if (dispatch([{ op: "create", kind: "relationshipType", value: t }], { label: "نوع علاقة جديد" })) setSel({ kind: "relationshipType", id: t.id });
  };

  return (
    <div className="flex h-full">
      <div className="ms-scroll w-64 shrink-0 overflow-auto border-e border-[var(--border)] p-3">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-xs font-semibold text-[var(--fg-muted)]">أنواع الكيانات</h2>
          <IconButton label="نوع كيان جديد" className="h-7 w-7" onClick={addEntityType}>
            <Plus size={15} />
          </IconButton>
        </div>
        <ul className="mb-4">
          {sortedE.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => setSel({ kind: "entityType", id: t.id })}
                className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm", sel?.id === t.id ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--surface-2)]")}
              >
                <EntityIcon name={t.icon} color={t.color} size={15} />
                <span className="truncate">{t.name}</span>
                <span className="ms-auto text-[10px] text-[var(--fg-subtle)]">{usage.get(t.id) ?? 0}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-xs font-semibold text-[var(--fg-muted)]">أنواع العلاقات</h2>
          <IconButton label="نوع علاقة جديد" className="h-7 w-7" onClick={addRelType}>
            <Plus size={15} />
          </IconButton>
        </div>
        <ul>
          {sortedR.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => setSel({ kind: "relationshipType", id: t.id })}
                className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm", sel?.id === t.id ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--surface-2)]")}
              >
                <span className="h-0.5 w-4 rounded" style={{ background: t.visual.color }} />
                <span className="truncate">{t.name}</span>
                <span className="ms-auto text-[10px] text-[var(--fg-subtle)]">{usage.get(t.id) ?? 0}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="ms-scroll min-w-0 flex-1 overflow-auto p-6">
        {!sel && (
          <div className="max-w-xl text-sm leading-relaxed text-[var(--fg-muted)]">
            <h2 className="mb-2 text-base font-semibold text-[var(--fg)]">البنية بيدك</h2>
            الأنواع والحقول والعلاقات هنا إعدادات ابتدائية لا قيود. أعد تسميتها، وغيّر أيقوناتها وألوانها، وأضف حقولاً جديدة تظهر تلقائياً في التفاصيل والجدول. المعرّف الثابت (key) لكل نوع لا يتغيّر عند إعادة التسمية، فتبقى لوحات المعلومات تعمل.
          </div>
        )}
        {sel?.kind === "entityType" && entityTypes[sel.id] && <EntityTypeEditor key={sel.id} type={entityTypes[sel.id]} used={usage.get(sel.id) ?? 0} onDeleted={() => setSel(null)} />}
        {sel?.kind === "relationshipType" && relTypes[sel.id] && <RelationshipTypeEditor key={sel.id} type={relTypes[sel.id]} used={usage.get(sel.id) ?? 0} onDeleted={() => setSel(null)} />}
      </div>
    </div>
  );
}

function update(kind: "entityType" | "relationshipType", id: string, patch: Record<string, unknown>) {
  useWorkspace.getState().dispatch([{ op: "update", kind, id, patch } as Op], { label: "تعديل نوع" });
}

function DeleteType({ kind, id, used, onDeleted }: { kind: "entityType" | "relationshipType"; id: string; used: number; onDeleted: () => void }) {
  return (
    <div className="mt-8 border-t border-[var(--border)] pt-4">
      <Button
        variant="ghost"
        size="sm"
        className="text-red-600"
        disabled={used > 0}
        onClick={() => useWorkspace.getState().dispatch([{ op: "delete", kind, id }], { label: "حذف نوع" }) && onDeleted()}
      >
        <Trash2 size={14} /> حذف النوع
      </Button>
      {used > 0 && <p className="mt-1 text-xs text-[var(--fg-subtle)]">مستخدم في {used} عنصر؛ انقلها إلى نوع آخر أولاً.</p>}
    </div>
  );
}

function EntityTypeEditor({ type, used, onDeleted }: { type: EntityType; used: number; onDeleted: () => void }) {
  return (
    <div className="max-w-2xl space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>الاسم</Label>
          <CommitInput value={type.name} onCommit={(name) => name.trim() && update("entityType", type.id, { name: name.trim() })} />
        </div>
        <div>
          <Label>الاسم بالإنجليزية</Label>
          <CommitInput dir="ltr" value={type.nameEn} onCommit={(nameEn) => update("entityType", type.id, { nameEn })} />
        </div>
      </div>
      <div>
        <Label hint={<span dir="ltr">{type.key}</span>}>الوصف</Label>
        <CommitInput multiline value={type.description} onCommit={(description) => update("entityType", type.id, { description })} />
      </div>
      <div>
        <Label>الأيقونة</Label>
        <div className="flex flex-wrap gap-1">
          {Object.keys(ENTITY_ICONS).map((name) => (
            <button
              key={name}
              type="button"
              title={name}
              onClick={() => update("entityType", type.id, { icon: name })}
              className={cn("flex h-8 w-8 items-center justify-center rounded-md border", type.icon === name ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-transparent hover:bg-[var(--surface-2)]")}
            >
              <EntityIcon name={name} size={16} color={type.color} />
            </button>
          ))}
        </div>
      </div>
      <div>
        <Label>اللون</Label>
        <Swatches colors={PALETTE} value={type.color} onChange={(color) => color && update("entityType", type.id, { color })} />
      </div>
      <FieldsEditor owner={{ entityTypeId: type.id }} />
      <DeleteType kind="entityType" id={type.id} used={used} onDeleted={onDeleted} />
    </div>
  );
}

function RelationshipTypeEditor({ type, used, onDeleted }: { type: RelationshipType; used: number; onDeleted: () => void }) {
  const setVisual = (patch: Partial<EdgeVisual>) => update("relationshipType", type.id, { visual: { ...type.visual, ...patch } });
  return (
    <div className="max-w-2xl space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>الاسم (من المصدر إلى الهدف)</Label>
          <CommitInput value={type.name} onCommit={(name) => name.trim() && update("relationshipType", type.id, { name: name.trim() })} />
        </div>
        <div>
          <Label>الاسم العكسي (من الهدف إلى المصدر)</Label>
          <CommitInput value={type.inverseName} onCommit={(inverseName) => update("relationshipType", type.id, { inverseName })} />
        </div>
        <div>
          <Label hint="تعتمد عليها التحليلات">الفئة الدلالية</Label>
          <Select value={type.category} onChange={(e) => update("relationshipType", type.id, { category: e.target.value })}>
            {RELATIONSHIP_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
        </div>
        <label className="flex items-end gap-2 pb-1.5 text-sm">
          <input type="checkbox" checked={type.directed} onChange={(e) => update("relationshipType", type.id, { directed: e.target.checked })} /> علاقة ذات اتجاه
        </label>
      </div>
      <div>
        <Label hint={<span dir="ltr">{type.key}</span>}>الوصف</Label>
        <CommitInput multiline value={type.description} onCommit={(description) => update("relationshipType", type.id, { description })} />
      </div>
      <div className="rounded-lg border border-[var(--border)] p-3">
        <div className="mb-2 text-xs font-semibold text-[var(--fg-muted)]">المظهر الافتراضي (لا يغيّر المعنى)</div>
        <Swatches colors={PALETTE} value={type.visual.color} onChange={(color) => color && setVisual({ color })} />
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Select value={type.visual.dash} onChange={(e) => setVisual({ dash: e.target.value as EdgeVisual["dash"] })}>
            {EDGE_DASHES.map((d) => (
              <option key={d} value={d}>
                {{ solid: "متصل", dashed: "متقطع", dotted: "منقّط" }[d]}
              </option>
            ))}
          </Select>
          <Select value={type.visual.curve} onChange={(e) => setVisual({ curve: e.target.value as EdgeVisual["curve"] })}>
            {EDGE_CURVES.map((c) => (
              <option key={c} value={c}>
                {{ bezier: "منحني", straight: "مستقيم", step: "زوايا قائمة" }[c]}
              </option>
            ))}
          </Select>
          <Select value={String(type.visual.width)} onChange={(e) => setVisual({ width: Number(e.target.value) })}>
            {[1, 1.75, 2.5, 4].map((w) => (
              <option key={w} value={w}>
                سماكة {w}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <FieldsEditor owner={{ relationshipTypeId: type.id }} />
      <DeleteType kind="relationshipType" id={type.id} used={used} onDeleted={onDeleted} />
    </div>
  );
}

function FieldsEditor({ owner }: { owner: { entityTypeId?: string; relationshipTypeId?: string } }) {
  const allFields = useWorkspace((s) => s.snap.fields);
  const fields = useMemo(
    () =>
      Object.values(allFields)
        .filter((f) => (owner.entityTypeId ? f.entityTypeId === owner.entityTypeId : f.relationshipTypeId === owner.relationshipTypeId))
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [allFields, owner.entityTypeId, owner.relationshipTypeId],
  );
  const [pendingType, setPendingType] = useState<{ field: FieldDefinition; dataType: FieldDataType; lossy: number } | null>(null);
  const dispatch = useWorkspace.getState().dispatch;

  const add = () => {
    const f: FieldDefinition = {
      id: newId(),
      entityTypeId: owner.entityTypeId ?? null,
      relationshipTypeId: owner.relationshipTypeId ?? null,
      key: slugKey("حقل", fields.map((x) => x.key)),
      label: "حقل جديد",
      dataType: "text",
      options: {},
      sortOrder: (fields.at(-1)?.sortOrder ?? 0) + 1,
    };
    dispatch([{ op: "create", kind: "field", value: f }], { label: "حقل جديد" });
  };

  const applyType = (field: FieldDefinition, dataType: FieldDataType) => {
    const s = useWorkspace.getState().snap;
    const options = dataType === "select" || dataType === "multiSelect" ? { ...field.options, choices: field.options.choices ?? [] } : field.options;
    dispatch(changeFieldTypeOps(field, { dataType, options }, { entities: Object.values(s.entities), relationships: Object.values(s.relationships) }, nowIso()), {
      label: "تغيير نوع حقل",
    });
  };

  const requestType = (field: FieldDefinition, dataType: FieldDataType) => {
    const s = useWorkspace.getState().snap;
    const lossy = countLossyValues(field, { dataType, options: field.options }, { entities: Object.values(s.entities), relationships: Object.values(s.relationships) });
    if (lossy > 0) setPendingType({ field, dataType, lossy });
    else applyType(field, dataType);
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">الحقول المخصصة</h3>
        <Button size="sm" variant="outline" onClick={add}>
          <Plus size={13} /> حقل
        </Button>
      </div>
      {fields.length === 0 && <p className="text-xs text-[var(--fg-subtle)]">لا توجد حقول. الحقول الجديدة تظهر تلقائياً في التفاصيل والجدول.</p>}
      <ul className="space-y-2">
        {fields.map((f) => (
          <li key={f.id} className="rounded-lg border border-[var(--border)] p-2.5">
            <div className="flex items-center gap-2">
              <CommitInput
                className="flex-1"
                value={f.label}
                onCommit={(label) => label.trim() && dispatch([{ op: "update", kind: "field", id: f.id, patch: { label: label.trim() } }], { label: "تعديل حقل" })}
              />
              <Select className="w-36" value={f.dataType} onChange={(e) => requestType(f, e.target.value as FieldDataType)}>
                {FIELD_DATA_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {FIELD_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
              <IconButton label="حذف الحقل (القيم المحفوظة تبقى في الكيانات)" onClick={() => dispatch([{ op: "delete", kind: "field", id: f.id }], { label: "حذف حقل" })}>
                <Trash2 size={14} />
              </IconButton>
            </div>
            {(f.dataType === "select" || f.dataType === "multiSelect") && (
              <div className="mt-2">
                <Label hint="افصل بفاصلة">الخيارات</Label>
                <CommitInput
                  value={(f.options.choices ?? []).map((c) => c.label).join("، ")}
                  onCommit={(v) => {
                    const labels = v
                      .split(/[,،]/)
                      .map((x) => x.trim())
                      .filter(Boolean);
                    const old = f.options.choices ?? [];
                    const taken: string[] = [];
                    const choices = labels.map((label) => {
                      const keep = old.find((c) => c.label === label);
                      const value = keep?.value ?? slugKey(label, [...old.map((c) => c.value), ...taken]);
                      taken.push(value);
                      return { value, label, ...(keep?.color ? { color: keep.color } : {}) };
                    });
                    dispatch([{ op: "update", kind: "field", id: f.id, patch: { options: { ...f.options, choices } } }], { label: "تعديل خيارات" });
                  }}
                />
              </div>
            )}
            {f.dataType === "currency" && (
              <div className="mt-2 w-32">
                <Label>العملة</Label>
                <CommitInput dir="ltr" value={f.options.currency ?? ""} onCommit={(currency) => dispatch([{ op: "update", kind: "field", id: f.id, patch: { options: { ...f.options, currency } } }], { label: "تعديل عملة" })} />
              </div>
            )}
            <div className="mt-1 text-[10px] text-[var(--fg-subtle)]" dir="ltr">
              key: {f.key}
            </div>
          </li>
        ))}
      </ul>
      {pendingType && (
        <Dialog open onOpenChange={(o) => !o && setPendingType(null)} title="تغيير نوع الحقل">
          <p className="text-sm leading-relaxed text-[var(--fg-muted)]">
            {pendingType.lossy} قيمة لا يمكن تحويلها إلى «{FIELD_TYPE_LABELS[pendingType.dataType]}». لن تُحذف: ستُحفظ جانباً في الكيان وتظهر في تفاصيله تحت «قيم محفوظة». ويمكنك التراجع بـ Ctrl+Z.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPendingType(null)}>
              إلغاء
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                applyType(pendingType.field, pendingType.dataType);
                setPendingType(null);
              }}
            >
              تغيير النوع
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
