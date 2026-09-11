import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { readProfile, resumeDownloadName } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const profile = readProfile(id);
  const kind = request.nextUrl.searchParams.get("kind") || "original";
  const filePath =
    kind === "tailored"
      ? profile.tailoredResumePath || profile.resumePath
      : profile.resumePath;
  if (!profile || !filePath || !fs.existsSync(filePath)) {
    return Response.json(
      { error: kind === "tailored" ? "No tailored resume on this profile." : "No resume on this profile." },
      { status: 404 },
    );
  }
  const file = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase() || ".pdf";
  const type =
    ext === ".pdf"
      ? "application/pdf"
      : ext === ".docx"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : ext === ".doc"
          ? "application/msword"
          : "application/octet-stream";
  const filename = resumeDownloadName(profile, ext);
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Access-Control-Allow-Origin": "*",
    },
  });
}
