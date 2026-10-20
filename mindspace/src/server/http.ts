import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { OpError } from "@/core/ops";

/** Uniform JSON error responses for route handlers. */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof ZodError)
    return NextResponse.json({ error: "validation", issues: err.issues.slice(0, 20) }, { status: 400 });
  if (err instanceof OpError)
    return NextResponse.json({ error: err.code, message: err.message }, { status: err.code === "not_found" ? 404 : 409 });
  console.error("[mindspace] unexpected error", err);
  return NextResponse.json({ error: "internal", message: "Unexpected server error" }, { status: 500 });
}
