/**
 * Persistence for the hosted trial (a claude.ai Artifact, no Next.js server).
 *
 * Each record is one document in the artifact's `db` store, under the
 * viewer's private subtree `data/users/<id>/mindspace/<kind>/<recordId>`,
 * so every person who opens the link gets their own workspace. Writes are
 * coalesced per document and at most one is in flight per document.
 * Without `db` (signed out, or opened outside claude.ai) the whole
 * snapshot is kept in localStorage instead.
 */
import { emptySnapshot, makeCanvas, type Snapshot, type Workspace } from "@/core/model";
import { applyOps, COLLECTION, RECORD_KINDS } from "@/core/ops";
import { DEFAULT_SETTINGS, presetOps } from "@/core/presets";
import type { StandaloneBackend } from "@/client/store";
import type { SyncState } from "@/client/sync";

/* Minimal shapes of the claude.ai runtime used here (see the platform's db.d.ts). */
type DocSnap = { id: string; exists: boolean; data(): Record<string, unknown> | undefined };
type DocRef = { get(): Promise<DocSnap>; set(d: Record<string, unknown>): Promise<void>; delete(): Promise<void>; collection(p: string): ColRef };
type ColRef = { get(): Promise<{ docs: DocSnap[] }>; doc(id: string): DocRef };
type DB = { doc(p: string): DocRef };
type ClaudeRuntime = { use(name: string): Promise<unknown> };

const LOCAL_KEY = "mindspace:trial-snapshot:v1";
const CONCURRENCY = 4;

function freshSnapshot(): Snapshot {
  const ws: Workspace = { id: "trial", name: "مساحتي", settings: DEFAULT_SETTINGS };
  return applyOps(emptySnapshot(ws), [...presetOps(), { op: "create", kind: "canvas", value: makeCanvas({ name: "اللوحة الرئيسية" }) }]);
}

const plain = (v: unknown) => JSON.parse(JSON.stringify(v)) as Record<string, unknown>;

type Change = { kind: string; id: string; value: Record<string, unknown> | null };

/** Records that differ between two snapshots (unchanged collections keep their identity). */
function diff(before: Snapshot, after: Snapshot): { changes: Change[]; workspace: boolean } {
  const changes: Change[] = [];
  for (const kind of RECORD_KINDS) {
    const key = COLLECTION[kind];
    const a = before[key] as unknown as Record<string, unknown>;
    const b = after[key] as unknown as Record<string, unknown>;
    if (a === b) continue;
    for (const id in b) if (a[id] !== b[id]) changes.push({ kind, id, value: plain(b[id]) });
    for (const id in a) if (!(id in b)) changes.push({ kind, id, value: null });
  }
  return { changes, workspace: before.workspace !== after.workspace };
}

class DocWriter {
  private pending = new Map<string, { ref: DocRef; value: Record<string, unknown> | null }>();
  private inflight = new Set<string>();
  private running = 0;
  constructor(private onState: (s: SyncState, pending: number) => void, private onError: (msg: string) => void) {}

  write(path: string, ref: DocRef, value: Record<string, unknown> | null) {
    this.pending.set(path, { ref, value });
    this.pump();
  }

  private report() {
    const n = this.pending.size + this.inflight.size;
    this.onState(n ? "saving" : "saved", n);
  }

  private pump() {
    this.report();
    for (const [path, job] of this.pending) {
      if (this.running >= CONCURRENCY) break;
      if (this.inflight.has(path)) continue;
      this.pending.delete(path);
      this.inflight.add(path);
      this.running++;
      void this.run(path, job.ref, job.value);
    }
  }

  private async run(path: string, ref: DocRef, value: Record<string, unknown> | null, attempt = 0): Promise<void> {
    try {
      if (value) await ref.set(value);
      else await ref.delete();
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if ((code === "unavailable" || code === "resource_exhausted") && attempt < 4) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt + Math.random() * 300));
        return this.run(path, ref, value, attempt + 1);
      }
      this.onError(code === "quota_exceeded" ? "امتلأت مساحة التخزين في نسخة التجربة؛ احذف بعض العناصر." : `تعذّر حفظ تعديل (${code ?? "خطأ"}).`);
      this.onState("error", this.pending.size);
    } finally {
      this.inflight.delete(path);
      this.running--;
      this.pump();
    }
  }
}

export async function createTrialBackend(
  onState: (s: SyncState, pending: number) => void,
  onError: (msg: string) => void,
): Promise<{ backend: StandaloneBackend; mode: "account" | "browser" }> {
  const claude = (globalThis as { claude?: ClaudeRuntime }).claude;
  const db = ((await claude?.use("db").catch(() => null)) ?? null) as DB | null;
  const user = (await claude?.use("user").catch(() => null)) as { id(): Promise<string | null> } | null;
  const uid = (await user?.id().catch(() => null)) ?? null;

  if (!db || !uid) {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return {
      mode: "browser",
      backend: {
        async load() {
          try {
            const raw = localStorage.getItem(LOCAL_KEY);
            if (raw) return JSON.parse(raw) as Snapshot;
          } catch {
            /* storage blocked: start fresh */
          }
          return freshSnapshot();
        },
        persist(_before, after) {
          if (timer) clearTimeout(timer);
          onState("saving", 1);
          timer = setTimeout(() => {
            try {
              localStorage.setItem(LOCAL_KEY, JSON.stringify(after));
              onState("saved", 0);
            } catch {
              onState("error", 1);
            }
          }, 400);
        },
      },
    };
  }

  const root = db.doc(`data/users/${uid}/mindspace`);
  const writer = new DocWriter(onState, onError);
  const writeAll = (before: Snapshot, after: Snapshot) => {
    const { changes, workspace } = diff(before, after);
    for (const c of changes) writer.write(`${c.kind}/${c.id}`, root.collection(c.kind).doc(c.id), c.value);
    if (workspace) writer.write("root", root, { workspace: plain(after.workspace), version: 1 });
  };

  return {
    mode: "account",
    backend: {
      async load() {
        const [head, ...lists] = await Promise.all([root.get(), ...RECORD_KINDS.map((k) => root.collection(k).get())]);
        const s = emptySnapshot((head.exists ? (head.data()!.workspace as Workspace) : null) ?? { id: "trial", name: "مساحتي", settings: DEFAULT_SETTINGS });
        RECORD_KINDS.forEach((kind, i) => {
          const target = s[COLLECTION[kind]] as unknown as Record<string, unknown>;
          for (const d of lists[i].docs) if (d.exists) target[d.id] = d.data();
        });
        if (!Object.keys(s.entityTypes).length) {
          // First visit: install the presets and an empty canvas.
          const fresh = freshSnapshot();
          writeAll(emptySnapshot({ ...fresh.workspace, name: "" }), fresh);
          return fresh;
        }
        if (!head.exists) writer.write("root", root, { workspace: plain(s.workspace), version: 1 });
        return s;
      },
      persist: writeAll,
    },
  };
}
