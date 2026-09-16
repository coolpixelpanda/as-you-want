import { NextRequest } from "next/server";
import { readProfile, writeProfile } from "@/lib/store";
import fs from "node:fs";
import { dbLoadBlob } from "@/lib/database";
import {
  extractResumeText,
  extractResumeTextFromBuffer,
  mergeParsedResume,
  parseResumeText,
  parseSummary,
} from "@/lib/resume/parse";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const profileId = String((body as { profileId?: string }).profileId || "");
  const profile = await readProfile(profileId || undefined);
  if (!profile.resumePath && !profile.resumeText) {
    return Response.json({ error: "Upload a resume first." }, { status: 400 });
  }

  try {
    let text = profile.resumeText;
    if (!text && profile.resumePath && fs.existsSync(profile.resumePath)) {
      text = await extractResumeText(profile.resumePath);
    }
    if (!text) {
      const blob = await dbLoadBlob(profile.id, "resume");
      if (blob?.bytes?.length) text = await extractResumeTextFromBuffer(blob.bytes, blob.filename);
    }
    if (!text) {
      return Response.json({ error: "Upload the resume again so it can be parsed." }, { status: 400 });
    }
    const parsed = await parseResumeText(text);
    const merged = mergeParsedResume(profile, parsed);
    merged.resumeText = text;
    await writeProfile(merged);
    return Response.json({
      parsed: true,
      message: parseSummary(parsed),
      profile: merged,
      experiences: merged.experiences,
      educations: merged.educations,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not parse the resume." },
      { status: 400 },
    );
  }
}
