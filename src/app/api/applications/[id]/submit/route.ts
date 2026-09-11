import { NextRequest } from "next/server";
import { submitPreparedApplication } from "@/lib/apply/engine";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({ submit: true }));
  const submit = body.submit !== false;
  void submitPreparedApplication(id, { submit });
  return Response.json({ ok: true, submit });
}
