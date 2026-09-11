import { NextRequest } from "next/server";
import {
  deleteSavedAnswer,
  listAllSavedAnswers,
  listAskedApplicationQuestions,
  pruneBareChoiceAnswers,
  upsertSavedAnswer,
} from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  pruneBareChoiceAnswers();
  return Response.json({
    saved: listAllSavedAnswers(),
    asked: listAskedApplicationQuestions(),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const saved = upsertSavedAnswer(
      String(body.profileId || ""),
      String(body.question || ""),
      String(body.answer || ""),
      String(body.source || "manual"),
    );
    return Response.json({ ok: true, saved });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not save answer" },
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const profileId = request.nextUrl.searchParams.get("profileId") || "";
  const id = request.nextUrl.searchParams.get("id") || "";
  if (!profileId || !id) {
    return Response.json({ error: "Missing id" }, { status: 400 });
  }
  deleteSavedAnswer(profileId, id);
  return Response.json({ ok: true });
}

