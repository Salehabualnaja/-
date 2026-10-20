"use client";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Crosshair, MapPin, Plus, Trash2, Unlink, X, Zap } from "lucide-react";
import { LEGACY_KEY } from "@/core/fields";
import { entityBriefing } from "@/core/queries";
import { searchEntities } from "@/core/search";
import type { RelationshipCategory } from "@/core/model";
import { cameraTo, useWorkspace } from "../store";
import { createRelationship, deleteEntities, deleteRelationships, placeEntities, placementOf, runImpactAnalysis, updateEntity, viewCenter } from "../actions";
import { EntityIcon } from "../icons";
import { Button, CommitInput, IconButton, Input, Label, Section, Select, cn } from "../ui";
import { FieldInput } from "./FieldInput";
import { History } from "./History";
import { ConfirmDeleteEntity } from "./ConfirmDeleteEntity";

export const CATEGORY_LABEL: Record<RelationshipCategory, string> = {
  hierarchical: "الهيكل",
  financial: "المالية",
  execution: "التنفيذ",
  dependency: "الاعتماديات",
  people: "الأشخاص",
  resource: "الموارد",
  ownership: "المسؤولية",
  strategic: "الأهداف",
  information: "المعلومات",
  ai: "الذكاء الاصطناعي",
  influence: "التأثير",
  custom: "أخرى",
};

export function EntityInspector({ id }: { id: string }) {
  const snap = useWorkspace((s) => s.snap);
  const activeCanvasId = useWorkspace((s) => s.activeCanvasId);
  const set = useWorkspace((s) => s.set);
  const entity = snap.entities[id];
  const [confirm, setConfirm] = useState(false);

  const fields = useMemo(
    () =>
      entity
        ? Object.values(snap.fields)
            .filter((f) => f.entityTypeId === entity.typeId)
            .sort((a, b) => a.sortOrder - b.sortOrder)
        : [],
    [snap.fields, entity],
  );
  const rels = useMemo(() => Object.values(snap.relationships).filter((r) => r.sourceId === id || r.targetId === id), [snap.relationships, id]);
  const briefing = useMemo(() => (entity ? entityBriefing(snap, id) : null), [snap, id, entity]);
  const placements = useMemo(() => Object.values(snap.placements).filter((p) => p.entityId === id), [snap.placements, id]);

  if (!entity) return <div className="p-4 text-sm text-[var(--fg-muted)]">الكيان غير موجود (ربما حُذف).</div>;
  const type = snap.entityTypes[entity.typeId];
  const { statuses, priorities } = snap.workspace.settings;
  const legacy = entity.properties[LEGACY_KEY] as Record<string, { value: unknown; fromType: string }> | undefined;
  const placedHere = !!placementOf(id, activeCanvasId);

  const goTo = (entityId: string) => {
    const p = placementOf(entityId, activeCanvasId);
    set({ inspected: { kind: "entity", id: entityId }, ...(p ? { selectedNodes: [p.id], selectedEdges: [], cameraRequest: cameraTo([p.id]) } : {}) });
  };

  return (
    <div className="pb-8">
      <div className="flex items-center gap-2 px-4 pb-2 pt-3">
        <EntityIcon name={type?.icon ?? "circle"} color={type?.color} size={18} />
        <Select
          aria-label="نوع الكيان"
          className="h-7 w-auto border-transparent bg-transparent px-1 text-xs font-semibold"
          value={entity.typeId}
          onChange={(e) => updateEntity(id, { typeId: e.target.value })}
        >
          {Object.values(snap.entityTypes)
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
        </Select>
        <IconButton label="إغلاق" className="ms-auto" onClick={() => set({ inspected: null })}>
          <X size={16} />
        </IconButton>
      </div>

      <div className="space-y-3 px-4 pb-3">
        <CommitInput
          aria-label="العنوان"
          className="h-auto border-transparent px-1 py-1 text-lg font-bold hover:border-[var(--border)]"
          placeholder="بلا عنوان"
          value={entity.title}
          onCommit={(title) => updateEntity(id, { title })}
        />
        <CommitInput multiline placeholder="وصف مختصر…" value={entity.description} onCommit={(description) => updateEntity(id, { description })} />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>الحالة</Label>
            <Select value={entity.status ?? ""} onChange={(e) => updateEntity(id, { status: e.target.value || null })}>
              <option value="">—</option>
              {statuses.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>الأولوية</Label>
            <Select value={entity.priority ?? ""} onChange={(e) => updateEntity(id, { priority: e.target.value || null })}>
              <option value="">—</option>
              {priorities.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>تاريخ البدء</Label>
            <Input type="date" dir="ltr" value={entity.startDate ?? ""} onChange={(e) => updateEntity(id, { startDate: e.target.value || null })} />
          </div>
          <div>
            <Label>تاريخ الاستحقاق</Label>
            <Input type="date" dir="ltr" value={entity.dueDate ?? ""} onChange={(e) => updateEntity(id, { dueDate: e.target.value || null })} />
          </div>
        </div>
        <div>
          <Label hint="افصل بفاصلة">العلامات</Label>
          <CommitInput
            value={entity.tags.join("، ")}
            onCommit={(v) =>
              updateEntity(id, {
                tags: [
                  ...new Set(
                    v
                      .split(/[,،]/)
                      .map((t) => t.trim().replace(/^#/, ""))
                      .filter(Boolean),
                  ),
                ],
              })
            }
          />
        </div>
      </div>

      {fields.length > 0 && (
        <Section title={`حقول ${type?.name ?? ""}`}>
          <div className="space-y-2.5">
            {fields.map((f) => (
              <div key={f.id}>
                <Label>{f.label}</Label>
                <FieldInput
                  field={f}
                  value={entity.properties[f.key]}
                  onChange={(v) => {
                    const properties = { ...entity.properties };
                    if (v === undefined) delete properties[f.key];
                    else properties[f.key] = v;
                    updateEntity(id, { properties });
                  }}
                />
              </div>
            ))}
          </div>
          {legacy && Object.keys(legacy).length > 0 && (
            <div className="mt-3 rounded-md bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
              قيم محفوظة لم يمكن تحويلها بعد تغيير نوع الحقل:
              <ul className="mt-1 list-inside list-disc">
                {Object.entries(legacy).map(([k, v]) => (
                  <li key={k}>
                    {k}: <span dir="auto">{String(v.value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>
      )}

      <Section title="المحتوى التفصيلي">
        <CommitInput multiline className="min-h-28" placeholder="ملاحظات، تفاصيل، مراجع… (Ctrl+Enter للحفظ)" value={entity.content} onCommit={(content) => updateEntity(id, { content })} />
      </Section>

      <Section title={`العلاقات (${rels.length})`}>
        <ul className="space-y-1">
          {rels.map((r) => {
            const out = r.sourceId === id;
            const other = snap.entities[out ? r.targetId : r.sourceId];
            const rt = snap.relationshipTypes[r.typeId];
            const verb = out ? rt?.name : rt?.inverseName || rt?.name;
            const role = typeof r.properties.role === "string" ? r.properties.role : "";
            return (
              <li key={r.id} className="group flex items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-[var(--surface-2)]">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: rt?.visual.color }} />
                <button type="button" className="min-w-0 flex-1 text-start" onClick={() => set({ inspected: { kind: "relationship", id: r.id } })}>
                  <span className="text-xs text-[var(--fg-muted)]">
                    {r.label || verb}
                    {role && ` · ${role}`}
                  </span>{" "}
                  {out ? <ArrowLeft size={11} className="inline" /> : <ArrowRight size={11} className="inline" />}
                </button>
                <button type="button" dir="auto" className="max-w-[45%] truncate font-medium hover:text-[var(--accent)]" onClick={() => other && goTo(other.id)}>
                  {other?.title || "بلا عنوان"}
                </button>
                <IconButton label="حذف العلاقة" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => deleteRelationships([r.id])}>
                  <Unlink size={13} />
                </IconButton>
              </li>
            );
          })}
        </ul>
        <LinkCreator entityId={id} />
      </Section>

      {briefing && (briefing.byCategory.length > 0 || briefing.sharesResourcesWith.length > 0) && (
        <Section title="الصورة الكاملة (مشتقة من العلاقات)">
          <dl className="space-y-1.5 text-xs">
            {briefing.byCategory.map((g) => (
              <div key={g.category} className="flex gap-2">
                <dt className="w-20 shrink-0 text-[var(--fg-muted)]">{CATEGORY_LABEL[g.category]}</dt>
                <dd dir="auto" className="flex-1">
                  {g.links.map((l) => l.entity.title || "بلا عنوان").join("، ")}
                </dd>
              </div>
            ))}
            {briefing.sharesResourcesWith.length > 0 && (
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-[var(--fg-muted)]">يتشارك موارد مع</dt>
                <dd dir="auto" className="flex-1">
                  {briefing.sharesResourcesWith.map((x) => `${x.entity.title} (عبر ${x.via.map((v) => v.title).join("، ")})`).join("؛ ")}
                </dd>
              </div>
            )}
          </dl>
          <div className="mt-2 flex gap-1.5">
            <Button size="sm" variant="outline" onClick={() => runImpactAnalysis(id)}>
              <Zap size={13} /> تحليل الأثر
            </Button>
            {placedHere && (
              <Button size="sm" variant="outline" onClick={() => set({ focus: { entityId: id, depth: 1 }, view: "canvas" })}>
                <Crosshair size={13} /> وضع التركيز
              </Button>
            )}
          </div>
        </Section>
      )}

      <Section title={`الظهور في اللوحات (${placements.length})`}>
        <ul className="space-y-1 text-sm">
          {placements.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="flex items-center gap-1.5 hover:text-[var(--accent)]"
                onClick={() => set({ view: "canvas", activeCanvasId: p.canvasId, selectedNodes: [p.id], cameraRequest: cameraTo([p.id]) })}
              >
                <MapPin size={13} /> {snap.canvases[p.canvasId]?.name}
              </button>
            </li>
          ))}
        </ul>
        {!placedHere && activeCanvasId && (
          <Button size="sm" variant="outline" className="mt-2" onClick={() => placeEntities([id], viewCenter())}>
            <Plus size={13} /> ضعه في اللوحة الحالية
          </Button>
        )}
      </Section>

      <Section title="سجل التعديلات">
        <History id={id} related />
      </Section>

      <div className="px-4 pt-2">
        <Button variant="ghost" size="sm" className="text-red-600" onClick={() => setConfirm(true)}>
          <Trash2 size={14} /> حذف الكيان من النظام
        </Button>
      </div>
      {confirm && (
        <ConfirmDeleteEntity
          entityIds={[id]}
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            setConfirm(false);
            deleteEntities([id]);
          }}
        />
      )}
    </div>
  );
}

/** Link this entity to any other entity without needing both on a canvas. */
function LinkCreator({ entityId }: { entityId: string }) {
  const snap = useWorkspace((s) => s.snap);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [target, setTarget] = useState<string | null>(null);
  const relTypes = useMemo(() => Object.values(snap.relationshipTypes).sort((a, b) => a.sortOrder - b.sortOrder), [snap.relationshipTypes]);
  const [typeId, setTypeId] = useState("");
  const hits = useMemo(() => (q ? searchEntities(snap, q, 8).filter((h) => h.entity.id !== entityId) : []), [snap, q, entityId]);

  if (!open)
    return (
      <Button size="sm" variant="ghost" className="mt-1" onClick={() => setOpen(true)}>
        <Plus size={13} /> ربط بكيان آخر
      </Button>
    );

  const reset = () => {
    setOpen(false);
    setQ("");
    setTarget(null);
  };

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-[var(--border)] p-2">
      {!target ? (
        <>
          <Input autoFocus placeholder="ابحث عن الكيان…" value={q} onChange={(e) => setQ(e.target.value)} />
          <ul className="max-h-40 overflow-auto">
            {hits.map((h) => (
              <li key={h.entity.id}>
                <button type="button" dir="auto" className="w-full truncate rounded px-2 py-1 text-start text-sm hover:bg-[var(--surface-2)]" onClick={() => setTarget(h.entity.id)}>
                  {h.entity.title || "بلا عنوان"} <span className="text-xs text-[var(--fg-subtle)]">· {snap.entityTypes[h.entity.typeId]?.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <div dir="auto" className="text-sm">
            ← <b>{snap.entities[target]?.title}</b>
          </div>
          <Select value={typeId || relTypes[0]?.id} onChange={(e) => setTypeId(e.target.value)}>
            {relTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              const tid = typeId || relTypes[0]?.id;
              const t = snap.relationshipTypes[tid];
              if (t) createRelationship({ typeId: tid, sourceId: entityId, targetId: target, direction: t.directed ? "forward" : "none" });
              reset();
            }}
          >
            إنشاء العلاقة
          </Button>
        </>
      )}
      <button type="button" className={cn("text-xs text-[var(--fg-muted)]")} onClick={reset}>
        إلغاء
      </button>
    </div>
  );
}
