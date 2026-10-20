import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { ensureWorkspace, listChanges, relationshipIdsOf } from "@/server/repository";
import { errorResponse } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Change history of a record (?id=...). For entities, includes their relationships (&related=1). */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "validation", message: "id is required" }, { status: 400 });
    const db = await getDb();
    const ws = await ensureWorkspace(db);
    const ids = url.searchParams.get("related") === "1" ? [id, ...(await relationshipIdsOf(db, ws, id))] : [id];
    return NextResponse.json(await listChanges(db, ws, ids));
  } catch (err) {
    return errorResponse(err);
  }
}
