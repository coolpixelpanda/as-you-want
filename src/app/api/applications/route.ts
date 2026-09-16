import { NextRequest } from "next/server";
import { createApplication, getActiveProfileId, listApplications } from "@/lib/store";
import { detectJob } from "@/lib/ats/detect";
import { prepareApplication } from "@/lib/apply/engine";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  return Response.json(await listApplications());
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const jobUrl = String(body.jobUrl || "").trim();
  if (!jobUrl) {
    return Response.json({ error: "Paste a job link first." }, { status: 400 });
  }

  let detected;
  try {
    detected = detectJob(jobUrl);
  } catch {
    return Response.json({ error: "That does not look like a valid URL." }, { status: 400 });
  }

  const application = await createApplication({
    profileId: await getActiveProfileId(),
    jobUrl,
    applyUrl: detected.applyUrl,
    ats: detected.ats,
    status: "queued",
  });

  void prepareApplication(application.id);
  return Response.json(application, { status: 201 });
}
