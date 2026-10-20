"use client";
import { useMemo } from "react";
import { ArrowLeftRight, Trash2, X } from "lucide-react";
import { EDGE_ARROWS, EDGE_CURVES, EDGE_DASHES, effectiveVisual, type EdgeVisual, type RelationshipDirection } from "@/core/model";
import { cameraTo, useWorkspace } from "../store";
import { deleteRelationships, placementOf, updateRelationship } from "../actions";
import { PALETTE } from "../icons";
import { Button, CommitInput, IconButton, Input, Label, Section, Select, Swatches, cn } from "../ui";
import { FieldInput } from "./FieldInput";
import { History } from "./History";
import { CATEGORY_LABEL } from "./EntityInspector";

const DIRECTION_LABEL: Record<RelationshipDirection, string> = { forward: "باتجاه واحد", both: "بالاتجاهين", none: "بلا اتجاه" };
const CURVE_LABEL: Record<string, string> = { bezier: "منحني", straight: "مستقيم", step: "زوايا قائمة" };
const DASH_LABEL: Record<string, string> = { solid: "متصل", dashed: "متقطع", dotted: "منقّط" };
const ARROW_LABEL: Record<string, string> = { arrowclosed: "سهم مصمت", arrow: "سهم مفتوح", none: "بلا رأس" };

export function RelationshipInspector({ id }: { id: string }) {
  const snap = useWorkspace((s) => s.snap);
  const activeCanvasId = useWorkspace((s) => s.activeCanvasId);
  const set = useWorkspace((s) => s.set);
  const rel = snap.relationships[id];
  const fields = useMemo(
    () =>
      rel
        ? Object.values(snap.fields)
            .filter((f) => f.relationshipTypeId === rel.typeId)
            .sort((a, b) => a.sortOrder - b.sortOrder)
        : [],
    [snap.fields, rel],
  );
  if (!rel) return <div className="p-4 text-sm text-[var(--fg-muted)]">العلاقة غير موجودة (ربما حُذفت).</div>;

  const type = snap.relationshipTypes[rel.typeId];
  const v = effectiveVisual(rel, type);
  const setVisual = (patch: Partial<EdgeVisual>) => {
    const next = { ...(rel.visual ?? {}), ...patch };
    // Drop overrides equal to the type default so the type stays in control.
    for (const k of Object.keys(next) as (keyof EdgeVisual)[]) if (type && next[k] === type.visual[k]) delete next[k];
    updateRelationship(id, { visual: Object.keys(next).length ? next : null });
  };
  const go = (entityId: string) => {
    const p = placementOf(entityId, activeCanvasId);
    set({ inspected: { kind: "entity", id: entityId }, ...(p ? { selectedNodes: [p.id], selectedEdges: [], cameraRequest: cameraTo([p.id]) } : {}) });
  };

  return (
    <div className="pb-8">
      <div className="flex items-center gap-2 px-4 pb-2 pt-3">
        <span className="h-1 w-5 rounded" style={{ background: v.color }} />
        <span className="text-xs font-semibold text-[var(--fg-muted)]">علاقة · {type ? CATEGORY_LABEL[type.category] : ""}</span>
        <IconButton label="إغلاق" className="ms-auto" onClick={() => set({ inspected: null })}>
          <X size={16} />
        </IconButton>
      </div>

      <div className="space-y-3 px-4 pb-3">
        <div className="flex items-center gap-2 rounded-lg bg-[var(--surface-2)] p-2 text-sm">
          <button type="button" dir="auto" className="max-w-[40%] truncate font-semibold hover:text-[var(--accent)]" onClick={() => go(rel.sourceId)}>
            {snap.entities[rel.sourceId]?.title || "بلا عنوان"}
          </button>
          <span className="text-xs text-[var(--fg-muted)]">← {type?.name} ←</span>
          <button type="button" dir="auto" className="max-w-[40%] truncate font-semibold hover:text-[var(--accent)]" onClick={() => go(rel.targetId)}>
            {snap.entities[rel.targetId]?.title || "بلا عنوان"}
          </button>
          <IconButton
            label="عكس المصدر والهدف"
            className="ms-auto h-7 w-7"
            onClick={() => updateRelationship(id, { sourceId: rel.targetId, targetId: rel.sourceId })}
          >
            <ArrowLeftRight size={14} />
          </IconButton>
        </div>

        <div>
          <Label>نوع العلاقة (المعنى)</Label>
          <Select value={rel.typeId} onChange={(e) => updateRelationship(id, { typeId: e.target.value })}>
            {Object.values(snap.relationshipTypes)
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </Select>
        </div>
        <div>
          <Label>اسم العلاقة</Label>
          <CommitInput value={rel.label} placeholder={type?.name} onCommit={(label) => updateRelationship(id, { label })} />
        </div>
        <div>
          <Label>الاتجاه</Label>
          <div className="flex gap-1 text-xs">
            {(Object.keys(DIRECTION_LABEL) as RelationshipDirection[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => updateRelationship(id, { direction: d })}
                className={cn("flex-1 rounded-md border px-1 py-1.5", rel.direction === d ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)]")}
              >
                {DIRECTION_LABEL[d]}
              </button>
            ))}
          </div>
        </div>
        <CommitInput multiline placeholder="وصف العلاقة…" value={rel.description} onCommit={(description) => updateRelationship(id, { description })} />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>الحالة</Label>
            <Select value={rel.status ?? ""} onChange={(e) => updateRelationship(id, { status: e.target.value || null })}>
              <option value="">—</option>
              {snap.workspace.settings.statuses.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>التاريخ</Label>
            <Input type="date" dir="ltr" value={rel.date ?? ""} onChange={(e) => updateRelationship(id, { date: e.target.value || null })} />
          </div>
        </div>
        <div>
          <Label hint={rel.weight === null ? "غير محددة" : `${Math.round(rel.weight * 100)}%`}>قوة العلاقة</Label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            className="w-full"
            defaultValue={rel.weight ?? 0.5}
            key={`weight${rel.weight}`}
            onPointerUp={(e) => updateRelationship(id, { weight: Number((e.target as HTMLInputElement).value) })}
            onKeyUp={(e) => updateRelationship(id, { weight: Number((e.target as HTMLInputElement).value) })}
          />
        </div>
      </div>

      {fields.length > 0 && (
        <Section title={`خصائص ${type?.name ?? ""}`}>
          <div className="space-y-2.5">
            {fields.map((f) => (
              <div key={f.id}>
                <Label>{f.label}</Label>
                <FieldInput
                  field={f}
                  value={rel.properties[f.key]}
                  onChange={(val) => {
                    const properties = { ...rel.properties };
                    if (val === undefined) delete properties[f.key];
                    else properties[f.key] = val;
                    updateRelationship(id, { properties });
                  }}
                />
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section
        title="المظهر (لا يغيّر معنى العلاقة)"
        actions={
          rel.visual && (
            <button type="button" className="text-xs text-[var(--accent)]" onClick={() => updateRelationship(id, { visual: null })}>
              افتراضي النوع
            </button>
          )
        }
      >
        <div className="space-y-2.5">
          <Swatches colors={PALETTE} value={v.color} onChange={(color) => setVisual({ color: color ?? type?.visual.color })} />
          <div className="grid grid-cols-2 gap-2">
            <Select value={v.dash} onChange={(e) => setVisual({ dash: e.target.value as EdgeVisual["dash"] })}>
              {EDGE_DASHES.map((d) => (
                <option key={d} value={d}>
                  {DASH_LABEL[d]}
                </option>
              ))}
            </Select>
            <Select value={v.curve} onChange={(e) => setVisual({ curve: e.target.value as EdgeVisual["curve"] })}>
              {EDGE_CURVES.map((c) => (
                <option key={c} value={c}>
                  {CURVE_LABEL[c]}
                </option>
              ))}
            </Select>
            <Select value={v.arrow} onChange={(e) => setVisual({ arrow: e.target.value as EdgeVisual["arrow"] })}>
              {EDGE_ARROWS.map((a) => (
                <option key={a} value={a}>
                  {ARROW_LABEL[a]}
                </option>
              ))}
            </Select>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={v.showLabel} onChange={(e) => setVisual({ showLabel: e.target.checked })} /> إظهار الاسم
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <label>
              السماكة {v.width}
              <input type="range" min={0.5} max={8} step={0.25} defaultValue={v.width} key={`w${v.width}`} className="w-full" onPointerUp={(e) => setVisual({ width: Number((e.target as HTMLInputElement).value) })} />
            </label>
            <label>
              الشفافية {Math.round(v.opacity * 100)}%
              <input type="range" min={0.1} max={1} step={0.05} defaultValue={v.opacity} key={`o${v.opacity}`} className="w-full" onPointerUp={(e) => setVisual({ opacity: Number((e.target as HTMLInputElement).value) })} />
            </label>
          </div>
        </div>
      </Section>

      <Section title="سجل التعديلات">
        <History id={id} />
      </Section>

      <div className="px-4 pt-2">
        <Button variant="ghost" size="sm" className="text-red-600" onClick={() => deleteRelationships([id])}>
          <Trash2 size={14} /> حذف العلاقة
        </Button>
      </div>
    </div>
  );
}
