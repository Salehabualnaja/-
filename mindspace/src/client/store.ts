"use client";
/**
 * Client state.
 *
 * `snap` is the in-memory copy of the knowledge graph. Every change goes
 * through `dispatch(ops)`: applied optimistically with the shared reducer,
 * inverted for Undo, and queued for the server. All views (canvas, table,
 * dashboards, inspector) read from the same `snap`, so an edit anywhere shows
 * up everywhere immediately.
 */
import { create } from "zustand";
import type { Snapshot } from "@/core/model";
import { applyOps, invertOps, OpError, type Op } from "@/core/ops";
import { SyncQueue, type SyncState } from "./sync";

export type ViewName = "canvas" | "table" | "dashboards" | "settings";
export type Inspected = { kind: "entity" | "relationship"; id: string } | null;

export interface HistoryEntry {
  label: string;
  forward: Op[];
  inverse: Op[];
}

export interface Toast {
  id: number;
  message: string;
  tone: "info" | "error";
  action?: { label: string; run: () => void };
}

export interface Analysis {
  title: string;
  entityIds: string[];
  relationshipIds: string[];
  /** Explanation rows: entity + the relationship chain that justifies it. */
  rows: Array<{ entityId: string; detail: string; via: string[] }>;
}

export interface CanvasFilters {
  hiddenEntityTypes: string[];
  hiddenRelationshipTypes: string[];
}

export interface WorkspaceState {
  status: "loading" | "ready" | "error";
  loadError: string | null;
  offlineStart: boolean;
  snap: Snapshot;

  view: ViewName;
  activeCanvasId: string | null;
  inspected: Inspected;
  /** Node ids (placements / annotations) and edge ids (relationships) selected on the canvas. */
  selectedNodes: string[];
  selectedEdges: string[];
  editingNodeId: string | null;
  focus: { entityId: string; depth: number } | null;
  filters: CanvasFilters;
  analysis: Analysis | null;
  cameraRequest: { nodeIds: string[]; at: number } | null;
  showMinimap: boolean;
  tool: "pan" | "select";
  paletteOpen: boolean;
  captureOpen: boolean;

  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  syncState: SyncState;
  pending: number;
  toasts: Toast[];

  load: () => Promise<void>;
  dispatch: (ops: Op[], opts?: { label?: string; undoable?: boolean }) => boolean;
  undo: () => void;
  redo: () => void;
  set: (patch: Partial<WorkspaceState>) => void;
  toast: (message: string, tone?: Toast["tone"], action?: Toast["action"]) => void;
  dismissToast: (id: number) => void;
}

const EMPTY: Snapshot = {
  workspace: { id: "", name: "", settings: { statuses: [], priorities: [] } },
  entityTypes: {},
  fields: {},
  relationshipTypes: {},
  entities: {},
  relationships: {},
  canvases: {},
  placements: {},
  annotations: {},
};

const SNAPSHOT_CACHE_KEY = "mindspace:snapshot-cache:v1";
const UI_KEY = "mindspace:ui:v1";
const HISTORY_LIMIT = 200;

let toastSeq = 0;
let cameraSeq = 0;

/** A camera request for CanvasView: fly to these node ids. */
export function cameraTo(nodeIds: string[]) {
  return { nodeIds, at: ++cameraSeq };
}
let cacheTimer: ReturnType<typeof setTimeout> | null = null;

/** Keep a local copy for offline starts; serialised when the browser is idle, not mid-gesture. */
function cacheSnapshot(s: Snapshot) {
  if (cacheTimer) clearTimeout(cacheTimer);
  cacheTimer = setTimeout(() => {
    const write = () => {
      try {
        localStorage.setItem(SNAPSHOT_CACHE_KEY, JSON.stringify(s));
      } catch {
        /* quota or private mode: offline start just won't be available */
      }
    };
    if ("requestIdleCallback" in window) window.requestIdleCallback(write, { timeout: 10000 });
    else write();
  }, 3000);
}

function readUi(): Partial<WorkspaceState> {
  try {
    const raw = localStorage.getItem(UI_KEY);
    return raw ? (JSON.parse(raw) as Partial<WorkspaceState>) : {};
  } catch {
    return {};
  }
}

function saveUi(s: WorkspaceState) {
  try {
    localStorage.setItem(
      UI_KEY,
      JSON.stringify({ activeCanvasId: s.activeCanvasId, view: s.view, showMinimap: s.showMinimap, tool: s.tool, filters: s.filters }),
    );
  } catch {
    /* ignore */
  }
}

function errorText(err: unknown): string {
  if (err instanceof OpError) {
    const map: Record<OpError["code"], string> = {
      not_found: "العنصر غير موجود",
      exists: "العنصر موجود مسبقاً",
      invalid_ref: "مرجع غير صالح",
      in_use: "لا يمكن الحذف لأنه مستخدم",
      conflict: "تعارض: الكيان موجود في هذه اللوحة",
    };
    return map[err.code];
  }
  return err instanceof Error ? err.message : String(err);
}

export const useWorkspace = create<WorkspaceState>()((set, get) => {
  const sync =
    typeof window === "undefined"
      ? null
      : new SyncQueue({
          onState: (syncState, pending) => set({ syncState, pending }),
          onRejected: (message) => {
            get().toast(`رفض الخادم تعديلاً (${message}). أُعيد تحميل البيانات من الخادم.`, "error");
            set({ undoStack: [], redoStack: [] });
            void get().load();
          },
        });

  const commit = (ops: Op[], entry: HistoryEntry | null, stack: "undo" | "redo" | "fresh"): boolean => {
    const before = get().snap;
    let after: Snapshot;
    try {
      after = applyOps(before, ops);
    } catch (err) {
      get().toast(errorText(err), "error");
      return false;
    }
    const patch: Partial<WorkspaceState> = { snap: after };
    if (entry) {
      if (stack === "fresh") {
        patch.undoStack = [...get().undoStack, entry].slice(-HISTORY_LIMIT);
        patch.redoStack = [];
      }
    }
    set(patch);
    sync?.enqueue(ops);
    cacheSnapshot(after);
    return true;
  };

  return {
    status: "loading",
    loadError: null,
    offlineStart: false,
    snap: EMPTY,
    view: "canvas",
    activeCanvasId: null,
    inspected: null,
    selectedNodes: [],
    selectedEdges: [],
    editingNodeId: null,
    focus: null,
    filters: { hiddenEntityTypes: [], hiddenRelationshipTypes: [] },
    analysis: null,
    cameraRequest: null,
    showMinimap: true,
    tool: "pan",
    paletteOpen: false,
    captureOpen: false,
    undoStack: [],
    redoStack: [],
    syncState: "saved",
    pending: 0,
    toasts: [],

    async load() {
      set({ status: get().status === "ready" ? "ready" : "loading", loadError: null });
      const leftover = sync?.restore() ?? [];
      if (leftover.length) await sync?.flushNow();
      try {
        const res = await fetch("/api/workspace", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const snap = (await res.json()) as Snapshot;
        const ui = { ...readUi(), ...pickUi(get()) };
        const canvasIds = Object.values(snap.canvases)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((c) => c.id);
        const activeCanvasId = ui.activeCanvasId && snap.canvases[ui.activeCanvasId] ? ui.activeCanvasId : (canvasIds[0] ?? null);
        set({
          snap,
          status: "ready",
          offlineStart: false,
          activeCanvasId,
          view: ui.view ?? "canvas",
          showMinimap: ui.showMinimap ?? true,
          tool: ui.tool ?? "pan",
          filters: ui.filters ?? { hiddenEntityTypes: [], hiddenRelationshipTypes: [] },
          syncState: sync && sync.pending ? "saving" : "saved",
        });
        cacheSnapshot(snap);
      } catch (err) {
        // Offline start: use the cached snapshot plus edits not yet confirmed.
        try {
          const cached = localStorage.getItem(SNAPSHOT_CACHE_KEY);
          if (!cached) throw err;
          let snap = JSON.parse(cached) as Snapshot;
          try {
            snap = applyOps(snap, sync?.restore() ?? []);
          } catch {
            /* the cache may already contain them */
          }
          const ui = readUi();
          set({
            snap,
            status: "ready",
            offlineStart: true,
            activeCanvasId: ui.activeCanvasId && snap.canvases[ui.activeCanvasId] ? ui.activeCanvasId : Object.keys(snap.canvases)[0] ?? null,
            syncState: "offline",
          });
        } catch {
          set({ status: "error", loadError: errorText(err) });
        }
      }
    },

    dispatch(ops, opts) {
      if (!ops.length) return true;
      const undoable = opts?.undoable ?? true;
      if (!undoable) return commit(ops, null, "fresh");
      let inverse: Op[];
      try {
        inverse = invertOps(get().snap, ops);
      } catch (err) {
        get().toast(errorText(err), "error");
        return false;
      }
      return commit(ops, { label: opts?.label ?? "", forward: ops, inverse }, "fresh");
    },

    undo() {
      const stack = get().undoStack;
      const entry = stack[stack.length - 1];
      if (!entry) return;
      if (commit(entry.inverse, entry, "undo"))
        set({ undoStack: stack.slice(0, -1), redoStack: [...get().redoStack, entry] });
      else set({ undoStack: stack.slice(0, -1) });
    },

    redo() {
      const stack = get().redoStack;
      const entry = stack[stack.length - 1];
      if (!entry) return;
      if (commit(entry.forward, entry, "redo"))
        set({ redoStack: stack.slice(0, -1), undoStack: [...get().undoStack, entry] });
      else set({ redoStack: stack.slice(0, -1) });
    },

    set(patch) {
      set(patch);
      if ("activeCanvasId" in patch || "view" in patch || "showMinimap" in patch || "tool" in patch || "filters" in patch)
        saveUi(get());
    },

    toast(message, tone = "info", action) {
      const id = ++toastSeq;
      set({ toasts: [...get().toasts, { id, message, tone, action }].slice(-4) });
      setTimeout(() => get().dismissToast(id), tone === "error" ? 7000 : 4500);
    },

    dismissToast(id) {
      set({ toasts: get().toasts.filter((t) => t.id !== id) });
    },
  };
});

function pickUi(s: WorkspaceState): Partial<WorkspaceState> {
  return s.status === "ready"
    ? { activeCanvasId: s.activeCanvasId, view: s.view, showMinimap: s.showMinimap, tool: s.tool, filters: s.filters }
    : {};
}

/** Warn before closing the tab while edits are still on their way to the server. */
export function installUnloadGuard() {
  const handler = (e: BeforeUnloadEvent) => {
    if (useWorkspace.getState().pending > 0) {
      e.preventDefault();
    }
  };
  window.addEventListener("beforeunload", handler);
  return () => window.removeEventListener("beforeunload", handler);
}
