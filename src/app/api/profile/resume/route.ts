import { NextRequest } from "next/server";
import { ensureProfile, readProfile, writeProfile } from "@/lib/store";
import { dbSaveBlob } from "@/lib/database";
import {
  extractResumeTextFromBuffer,
  mergeParsedResume,
  parseResumeText,
  parseSummary,
} from "@/lib/resume/parse";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const file = form.get("file");
  const kind = String(form.get("kind") || "resume");
  const shouldParse = String(form.get("parse") || "true") !== "false";
  const profileId = String(form.get("profileId") || request.nextUrl.searchParams.get("id") || "");
  if (!(file instanceof File)) {
    return Response.json({ error: "No file uploaded" }, { status: 400 });
  }

  const profile = profileId ? await ensureProfile(profileId) : await readProfile();
  const buffer = Buffer.from(await file.arrayBuffer());
  const saved = await dbSaveBlob({
    profileId: profile.id,
    kind: kind === "cover" ? "cover" : kind === "tailored" ? "tailored" : "resume",
    filename: file.name,
    bytes: buffer,
  });

  if (kind === "cover") {
    profile.coverLetterPath = saved.path;
    await writeProfile(profile);
    return Response.json({ path: saved.path, name: file.name, profile: await readProfile(profile.id) });
  }

  if (kind === "tailored") {
    profile.tailoredResumePath = saved.path;
    await writeProfile(profile);
    return Response.json({
      path: saved.path,
      name: file.name,
      profile: await readProfile(profile.id),
      message: "Tailored resume saved. Choose it in the extension to use it on Easy Apply.",
    });
  }

  profile.resumePath = saved.path;
  profile.resumeFileName = file.name;
  await writeProfile(profile);

  if (!shouldParse) {
    return Response.json({ path: saved.path, name: file.name, profile: await readProfile(profile.id) });
  }

  try {
    const text = await extractResumeTextFromBuffer(buffer, file.name);
    profile.resumeText = text;
    const parsed = await parseResumeText(text);
    const merged = mergeParsedResume(await readProfile(profile.id), parsed);
    merged.resumePath = saved.path;
    merged.resumeText = text;
    merged.resumeFileName = file.name;
    if (!merged.name || merged.name === "New profile" || merged.name === "Profile") {
      merged.name = `${merged.firstName} ${merged.lastName}`.trim() || merged.name;
    }
    await writeProfile(merged);
    const savedProfile = await readProfile(merged.id);
    return Response.json({
      path: saved.path,
      name: file.name,
      parsed: true,
      message: parseSummary(parsed),
      profile: savedProfile,
      experiences: savedProfile.experiences,
      educations: savedProfile.educations,
    });
  } catch (error) {
    return Response.json(
      {
        path: saved.path,
        name: file.name,
        parsed: false,
        profile: await readProfile(profile.id),
        error: error instanceof Error ? error.message : "Could not parse the resume.",
      },
      { status: 200 },
    );
  }
}
