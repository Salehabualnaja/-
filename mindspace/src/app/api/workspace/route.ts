import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { ensureWorkspace, loadSnapshot } from "@/server/repository";
import { errorResponse } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Full snapshot of the (single-user) workspace. */
export async function GET() {
  try {
    const db = await getDb();
    const id = await ensureWorkspace(db);
    return NextResponse.json(await loadSnapshot(db, id));
  } catch (err) {
    return errorResponse(err);
  }
}
