import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { applyBatch, ensureWorkspace } from "@/server/repository";
import { OpBatchSchema } from "@/core/ops";
import { errorResponse } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Apply one batch of ops atomically. Retrying the same batchId is safe. */
export async function POST(req: Request) {
  try {
    const batch = OpBatchSchema.parse(await req.json());
    const db = await getDb();
    const ws = await ensureWorkspace(db);
    return NextResponse.json(await applyBatch(db, ws, batch.batchId, batch.ops));
  } catch (err) {
    return errorResponse(err);
  }
}
