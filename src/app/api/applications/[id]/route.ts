import { NextRequest } from "next/server";
import { deleteApplication, getApplication } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const application = getApplication(id);
  if (!application) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json({
    ...application,
    questions: JSON.parse(application.questions || "[]"),
    mappedAnswers: JSON.parse(application.mappedAnswers || "[]"),
    logs: JSON.parse(application.logs || "[]"),
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  deleteApplication(id);
  return Response.json({ ok: true });
}
