import { NextRequest } from "next/server";
import { createApplication, updateApplication } from "@/lib/store";

export const runtime = "nodejs";

function cors(res: Response) {
  const headers = new Headers(res.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(res.body, { status: res.status, headers });
}

export async function OPTIONS() {
  return cors(new Response(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const id = String(body.id || "");
  if (id) {
    updateApplication(id, {
      status: body.status,
      error: body.error || null,
      confirmationUrl: body.confirmationUrl || null,
      title: body.title,
      company: body.company,
      ...(body.questions ? { questions: JSON.stringify(body.questions) } : {}),
      ...(body.mappedAnswers ? { mappedAnswers: JSON.stringify(body.mappedAnswers) } : {}),
    });
    return cors(Response.json({ ok: true, id }));
  }
  const app = createApplication({
    profileId: String(body.profileId || ""),
    jobUrl: String(body.jobUrl || ""),
    applyUrl: String(body.jobUrl || ""),
    ats: String(body.ats || "generic"),
    title: String(body.title || ""),
    company: String(body.company || ""),
    status: String(body.status || "applying"),
  });
  return cors(Response.json(app));
}
