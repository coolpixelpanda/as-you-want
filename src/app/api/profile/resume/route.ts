import fs from "node:fs";
import path from "node:path";
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
  const form = await request.formData();
  const file = form.get("file");
  const kind = String(form.get("kind") || "resume");
  const shouldParse = String(form.get("parse") || "true") !== "false";
  const profileId = String(form.get("profileId") || request.nextUrl.searchParams.get("id") || "");
  if (!(file instanceof File)) {
    return Response.json({ error: "No file uploaded" }, { status: 400 });
  }

  const profile = readProfile(profileId || undefined);
  const ext = path.extname(file.name) || ".pdf";
  const dir = path.join(process.cwd(), "data", "uploads");
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `${profile.id}-${kind}${ext}`);
  fs.writeFileSync(dest, Buffer.from(await file.arrayBuffer()));

  if (kind === "cover") {
    profile.coverLetterPath = dest;
    writeProfile(profile);
    return Response.json({ path: dest, name: file.name, profile });
  }

  if (kind === "tailored") {
    profile.tailoredResumePath = dest;
    writeProfile(profile);
    return Response.json({
      path: dest,
      name: file.name,
      profile,
      message: "Tailored resume saved. Choose it in the extension to use it on Easy Apply.",
    });
  }

  profile.resumePath = dest;
  writeProfile(profile);

  if (!shouldParse) {
    return Response.json({ path: dest, name: file.name, profile });
  }

  try {
    const text = await extractResumeText(dest);
    const parsed = await parseResumeText(text);
    const merged = mergeParsedResume(readProfile(profile.id), parsed);
    merged.resumePath = dest;
    writeProfile(merged);
    return Response.json({
      path: dest,
      name: file.name,
      parsed: true,
      message: parseSummary(parsed),
      profile: merged,
    });
  } catch (error) {
    return Response.json(
      {
        path: dest,
        name: file.name,
        parsed: false,
        profile: readProfile(profile.id),
        error: error instanceof Error ? error.message : "Could not parse the resume.",
      },
      { status: 200 },
    );
  }
}
