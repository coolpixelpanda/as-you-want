import { NextRequest } from "next/server";
import { readProfile, writeProfile } from "@/lib/store";
import fs from "node:fs";
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
  if (!profile.resumePath && !profile.resumeText) {
    return Response.json({ error: "Upload a resume first." }, { status: 400 });
  }

  try {
    const text =
      profile.resumeText ||
      (profile.resumePath && fs.existsSync(profile.resumePath) ? await extractResumeText(profile.resumePath) : "");
    if (!text) {
      return Response.json({ error: "Upload the resume again so it can be parsed." }, { status: 400 });
    }
    const parsed = await parseResumeText(text);
    const merged = mergeParsedResume(profile, parsed);
    merged.resumeText = text;
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
