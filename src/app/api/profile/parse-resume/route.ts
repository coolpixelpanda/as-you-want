import { NextRequest } from "next/server";
import { readProfile, writeProfile } from "@/lib/store";
import {
  extractResumeText,
  mergeParsedResume,
  parseResumeText,
  parseSummary,
} from "@/lib/resume/parse";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const profileId = String((body as { profileId?: string }).profileId || "");
  const profile = readProfile(profileId || undefined);
  if (!profile.resumePath) {
    return Response.json({ error: "Upload a resume first." }, { status: 400 });
  }

  try {
    const text = await extractResumeText(profile.resumePath);
    const parsed = await parseResumeText(text);
    const merged = mergeParsedResume(profile, parsed);
    writeProfile(merged);
    return Response.json({
      parsed: true,
      message: parseSummary(parsed),
      profile: merged,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not parse the resume." },
      { status: 400 },
    );
  }
}
