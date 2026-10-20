"use client";
import { useMemo } from "react";
import { useReactFlow } from "@xyflow/react";
import {
  Crosshair,
  Filter,
  Frame,
  Hand,
  Map as MapIcon,
  Maximize,
  MousePointer2,
  Plus,
  Redo2,
  Route,
  ScanSearch,
  StickyNote,
  Type,
  Undo2,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useWorkspace } from "../store";
import { bringNeighbours, createAnnotationAt, createEntityAt, runImpactAnalysis, runPathAnalysis } from "../actions";
import { EntityIcon } from "../icons";
import { IconButton, MenuItem, Popover, cn } from "../ui";

function Divider() {
  return <div className="mx-0.5 h-5 w-px bg-[var(--border)]" />;
}

export function CanvasToolbar({ flowPointAt }: { flowPointAt: (x?: number, y?: number) => { x: number; y: number } }) {
  const rf = useReactFlow();
  const tool = useWorkspace((s) => s.tool);
  const showMinimap = useWorkspace((s) => s.showMinimap);
  const canUndo = useWorkspace((s) => s.undoStack.length > 0);
  const canRedo = useWorkspace((s) => s.redoStack.length > 0);
  const focus = useWorkspace((s) => s.focus);
  const filters = useWorkspace((s) => s.filters);
  const entityTypes = useWorkspace((s) => s.snap.entityTypes);
  const relTypes = useWorkspace((s) => s.snap.relationshipTypes);
  const placements = useWorkspace((s) => s.snap.placements);
  const entities = useWorkspace((s) => s.snap.entities);
  const selectedNodes = useWorkspace((s) => s.selectedNodes);
  const set = useWorkspace((s) => s.set);

  const selectedEntityIds = useMemo(
    () => selectedNodes.map((id) => placements[id]?.entityId).filter((x): x is string => !!x),
    [selectedNodes, placements],
  );
  const sortedTypes = useMemo(() => Object.values(entityTypes).sort((a, b) => a.sortOrder - b.sortOrder), [entityTypes]);
  const sortedRelTypes = useMemo(() => Object.values(relTypes).sort((a, b) => a.sortOrder - b.sortOrder), [relTypes]);
  const filterCount = filters.hiddenEntityTypes.length + filters.hiddenRelationshipTypes.length;

  const center = () => flowPointAt(...centerOfCanvas());
  const addEntity = (typeId?: string) => {
    const p = center();
    const created = createEntityAt({ x: p.x - 110, y: p.y - 30 }, typeId);
    if (created) set({ editingNodeId: created.placement.id, selectedNodes: [created.placement.id], selectedEdges: [] });
  };
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <>
      <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-lg">
        <IconButton label="أداة التحريك (اسحب لتحريك اللوحة)" active={tool === "pan"} onClick={() => set({ tool: "pan" })}>
          <Hand size={16} />
        </IconButton>
        <IconButton label="أداة التحديد (اسحب لتحديد مجموعة)" active={tool === "select"} onClick={() => set({ tool: "select" })}>
          <MousePointer2 size={16} />
        </IconButton>
        <Divider />
        <Popover
          trigger={
            <button type="button" className="flex h-8 items-center gap-1 rounded-md bg-[var(--accent)] px-2.5 text-sm font-medium text-white hover:opacity-90" title="كيان جديد">
              <Plus size={15} /> كيان
            </button>
          }
        >
          {(close) => (
            <div className="grid grid-cols-2 gap-0.5">
              {sortedTypes.map((t) => (
                <MenuItem
                  key={t.id}
                  icon={<EntityIcon name={t.icon} size={14} color={t.color} />}
                  onSelect={() => {
                    close();
                    addEntity(t.id);
                  }}
                >
                  {t.name}
                </MenuItem>
              ))}
            </div>
          )}
        </Popover>
        <IconButton label="ملاحظة لاصقة" onClick={() => createAnnotationAt("sticky", offset(center(), -100, -80))}>
          <StickyNote size={16} />
        </IconButton>
        <IconButton label="نص" onClick={() => createAnnotationAt("text", offset(center(), -130, -30))}>
          <Type size={16} />
        </IconButton>
        <IconButton label="إطار" onClick={() => createAnnotationAt("frame", offset(center(), -240, -160))}>
          <Frame size={16} />
        </IconButton>
        <Divider />
        <IconButton label="تراجع (Ctrl+Z)" disabled={!canUndo} onClick={() => useWorkspace.getState().undo()}>
          <Undo2 size={16} />
        </IconButton>
        <IconButton label="إعادة (Ctrl+Shift+Z)" disabled={!canRedo} onClick={() => useWorkspace.getState().redo()}>
          <Redo2 size={16} />
        </IconButton>
        <Divider />
        <IconButton label="ملاءمة المحتوى (Shift+1)" onClick={() => void rf.fitView({ duration: 400, padding: 0.15 })}>
          <Maximize size={16} />
        </IconButton>
        <IconButton
          label="التركيز على المحدد (Shift+2)"
          disabled={!selectedNodes.length}
          onClick={() => void rf.fitView({ nodes: selectedNodes.map((id) => ({ id })), duration: 400, maxZoom: 1.5, padding: 0.4 })}
        >
          <ScanSearch size={16} />
        </IconButton>
        <IconButton label="الخريطة المصغرة" active={showMinimap} onClick={() => set({ showMinimap: !showMinimap })}>
          <MapIcon size={16} />
        </IconButton>
        <Popover
          trigger={
            <IconButton label="تصفية الأنواع" active={filterCount > 0}>
              <Filter size={16} />
            </IconButton>
          }
        >
          <div className="w-72 p-1">
            <div className="mb-1 flex items-center justify-between px-1 text-xs font-semibold text-[var(--fg-muted)]">
              <span>أنواع الكيانات الظاهرة</span>
              {filterCount > 0 && (
                <button className="text-[var(--accent)]" onClick={() => set({ filters: { hiddenEntityTypes: [], hiddenRelationshipTypes: [] } })}>
                  إظهار الكل
                </button>
              )}
            </div>
            <div className="mb-2 grid grid-cols-2">
              {sortedTypes.map((t) => (
                <label key={t.id} className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-1 text-xs hover:bg-[var(--surface-2)]">
                  <input
                    type="checkbox"
                    checked={!filters.hiddenEntityTypes.includes(t.id)}
                    onChange={() => set({ filters: { ...filters, hiddenEntityTypes: toggle(filters.hiddenEntityTypes, t.id) } })}
                  />
                  <EntityIcon name={t.icon} size={12} color={t.color} />
                  <span className="truncate">{t.name}</span>
                </label>
              ))}
            </div>
            <div className="mb-1 px-1 text-xs font-semibold text-[var(--fg-muted)]">أنواع العلاقات الظاهرة</div>
            <div className="grid grid-cols-2">
              {sortedRelTypes.map((t) => (
                <label key={t.id} className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-1 text-xs hover:bg-[var(--surface-2)]">
                  <input
                    type="checkbox"
                    checked={!filters.hiddenRelationshipTypes.includes(t.id)}
                    onChange={() => set({ filters: { ...filters, hiddenRelationshipTypes: toggle(filters.hiddenRelationshipTypes, t.id) } })}
                  />
                  <span className="h-0.5 w-3 rounded" style={{ background: t.visual.color }} />
                  <span className="truncate">{t.name}</span>
                </label>
              ))}
            </div>
          </div>
        </Popover>
        {selectedEntityIds.length === 1 && !focus && (
          <>
            <Divider />
            <IconButton label="وضع التركيز: هذا الكيان وعلاقاته فقط" onClick={() => set({ focus: { entityId: selectedEntityIds[0], depth: 1 } })}>
              <Crosshair size={16} />
            </IconButton>
            <IconButton label="تحليل الأثر: ما الذي يتأثر بتعطّله؟" onClick={() => runImpactAnalysis(selectedEntityIds[0])}>
              <Zap size={16} />
            </IconButton>
          </>
        )}
        {selectedEntityIds.length === 2 && (
          <>
            <Divider />
            <IconButton label="أظهر مسار العلاقة بين العنصرين" onClick={() => runPathAnalysis(selectedEntityIds[0], selectedEntityIds[1])}>
              <Route size={16} />
            </IconButton>
          </>
        )}
      </div>

      {focus && (
        <div className="absolute right-3 top-16 z-10 flex items-center gap-2 rounded-xl border border-[var(--accent)] bg-[var(--surface)] px-3 py-1.5 text-sm shadow-lg">
          <Crosshair size={15} className="text-[var(--accent)]" />
          <span className="max-w-48 truncate">
            التركيز على: <b dir="auto">{entities[focus.entityId]?.title || "بلا عنوان"}</b>
          </span>
          <span className="text-xs text-[var(--fg-muted)]">العمق</span>
          {[1, 2, 3].map((d) => (
            <button
              key={d}
              type="button"
              className={cn("h-6 w-6 rounded-md text-xs", focus.depth === d ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-2)]")}
              onClick={() => set({ focus: { ...focus, depth: d } })}
            >
              {d}
            </button>
          ))}
          <IconButton label="أضف إلى اللوحة المرتبطين غير الظاهرين" onClick={() => bringNeighbours(focus.entityId, focus.depth)}>
            <Users size={15} />
          </IconButton>
          <IconButton label="إنهاء وضع التركيز" onClick={() => set({ focus: null })}>
            <X size={15} />
          </IconButton>
        </div>
      )}
    </>
  );
}

function offset(p: { x: number; y: number }, dx: number, dy: number) {
  return { x: p.x + dx, y: p.y + dy };
}

/** Screen coordinates of the canvas centre. */
function centerOfCanvas(): [number, number] {
  const el = document.querySelector(".react-flow");
  const r = el?.getBoundingClientRect();
  return r ? [r.left + r.width / 2, r.top + r.height / 2] : [window.innerWidth / 2, window.innerHeight / 2];
}
