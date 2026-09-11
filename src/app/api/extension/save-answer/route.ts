import { NextRequest } from "next/server";
import { upsertSavedAnswer } from "@/lib/store";

export const runtime = "nodejs";

function cors(res: Response) {
  const headers = new Headers(res.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export async function OPTIONS() {
  return cors(new Response(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const saved = upsertSavedAnswer(
      String(body.profileId || ""),
      String(body.question || ""),
      String(body.answer || ""),
      "extension",
    );
    return cors(Response.json({ ok: true, saved }));
  } catch (error) {
    return cors(
      Response.json(
        { error: error instanceof Error ? error.message : "Could not save answer" },
        { status: 400 },
      ),
    );
  }
}
