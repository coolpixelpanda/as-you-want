import { NextRequest } from "next/server";
import { getApplication, updateApplication } from "@/lib/store";
import type { MappedAnswer } from "@/lib/types";

export const runtime = "nodejs";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const incoming = (body.answers || []) as MappedAnswer[];
  const app = getApplication(id);
  if (!app) return Response.json({ error: "Not found" }, { status: 404 });

  const current = JSON.parse(app.mappedAnswers || "[]") as MappedAnswer[];
  const byId = new Map(incoming.map((a) => [a.id, a]));
  const next = current.map((row) => {
    const patch = byId.get(row.id);
    if (!patch) return row;
    return {
      ...row,
      value: patch.value,
      source: "user" as const,
      confidence: patch.value ? ("high" as const) : row.confidence,
    };
  });
  const missing = next.filter((a) => a.required && !a.value);
  updateApplication(id, {
    mappedAnswers: JSON.stringify(next),
    status: missing.length ? "needs_input" : "ready",
    error: missing.length
      ? `${missing.length} required field(s) still need an answer.`
      : null,
  });
  return Response.json({ ok: true, missing: missing.length });
}
