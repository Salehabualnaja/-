/**
 * Debounced, ordered, crash-safe persistence of op batches.
 *
 *  - Every dispatch enqueues ops; the queue is mirrored to localStorage so a
 *    closed tab or a lost connection never loses edits.
 *  - Flushes are debounced and sequential; queued batches are merged into one
 *    request whose batchId is fixed before the first attempt, so retries are
 *    idempotent on the server.
 *  - Network failures retry with exponential backoff. A rejection (4xx) means
 *    the client diverged from the server: the batch is dropped and the caller
 *    is told to reload.
 */
import { newId } from "@/core/model";
import type { Op } from "@/core/ops";

const STORAGE_KEY = "mindspace:pending-ops:v1";
const DEBOUNCE_MS = 350;

export type SyncState = "saved" | "saving" | "offline" | "error";

interface Pending {
  batchId: string | null; // fixed once a send was attempted
  ops: Op[];
}

export interface SyncCallbacks {
  onState: (state: SyncState, pending: number) => void;
  onRejected: (message: string) => void;
}

function readStored(): Pending[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Pending[]) : [];
  } catch {
    return [];
  }
}

export class SyncQueue {
  private queue: Pending[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private sending = false;
  private backoff = 1000;

  constructor(private cb: SyncCallbacks) {}

  /** Ops left over from a previous session (not yet confirmed by the server). */
  restore(): Op[] {
    this.queue = readStored();
    return this.queue.flatMap((p) => p.ops);
  }

  get pending(): number {
    return this.queue.reduce((n, p) => n + p.ops.length, 0);
  }

  enqueue(ops: Op[]) {
    if (!ops.length) return;
    const last = this.queue[this.queue.length - 1];
    // Merge into the newest batch unless it is already being sent.
    if (last && last.batchId === null) last.ops.push(...ops);
    else this.queue.push({ batchId: null, ops: [...ops] });
    this.persist();
    this.cb.onState("saving", this.pending);
    this.schedule(DEBOUNCE_MS);
  }

  /** Send everything now (used before reloads). Resolves when the queue is empty or a send fails. */
  async flushNow(): Promise<boolean> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    while (this.sending) await new Promise((r) => setTimeout(r, 50));
    while (this.queue.length) {
      const ok = await this.sendHead();
      if (!ok) return false;
    }
    return true;
  }

  private schedule(ms: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run();
    }, ms);
  }

  private async run() {
    if (this.sending) return;
    while (this.queue.length) {
      const ok = await this.sendHead();
      if (!ok) return;
    }
  }

  private persist() {
    try {
      if (this.queue.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(this.queue));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage full or blocked: the in-memory queue still works for this session.
    }
  }

  private async sendHead(): Promise<boolean> {
    if (this.sending) return false;
    const head = this.queue[0];
    if (!head) return true;
    if (head.batchId === null) {
      head.batchId = newId();
      this.persist();
    }
    this.sending = true;
    this.cb.onState("saving", this.pending);
    try {
      const res = await fetch("/api/ops", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ batchId: head.batchId, ops: head.ops }),
      });
      if (res.ok) {
        this.queue.shift();
        this.persist();
        this.backoff = 1000;
        this.cb.onState(this.queue.length ? "saving" : "saved", this.pending);
        return true;
      }
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        this.queue.shift();
        this.persist();
        this.cb.onState("error", this.pending);
        this.cb.onRejected(body.message ?? body.error ?? `HTTP ${res.status}`);
        return false;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch {
      this.cb.onState("offline", this.pending);
      this.schedule(this.backoff);
      this.backoff = Math.min(this.backoff * 2, 30000);
      return false;
    } finally {
      this.sending = false;
    }
  }
}
