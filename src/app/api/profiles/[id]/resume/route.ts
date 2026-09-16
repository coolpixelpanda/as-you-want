import { NextRequest } from "next/server";
import { readProfile, resumeDownloadName } from "@/lib/store";
import { dbLoadBlob } from "@/lib/database";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let profile;
  try {
    profile = await readProfile(id);
  } catch (error) {
    if (error instanceof Error && error.name === "ProfileNotFound") {
      return Response.json({ error: "Profile not found" }, { status: 404 });
    }
    throw error;
  }
  const kind = request.nextUrl.searchParams.get("kind") || "original";
  const blobKind = kind === "tailored" ? "tailored" : "resume";
  const file = await dbLoadBlob(profile.id, blobKind) || (blobKind === "tailored" ? await dbLoadBlob(profile.id, "resume") : null);
  if (!file?.bytes?.length) {
    return Response.json(
      { error: kind === "tailored" ? "No tailored resume on this profile." : "No resume on this profile." },
      { status: 404 },
    );
  }
  const ext = file.filename.toLowerCase().endsWith(".docx")
    ? ".docx"
    : file.filename.toLowerCase().endsWith(".doc")
      ? ".doc"
      : ".pdf";
  const filename = resumeDownloadName(profile, ext);
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.mime || "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Access-Control-Allow-Origin": "*",
    },
  });
}
