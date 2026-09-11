import { NextRequest } from "next/server";
import {
  createProfile,
  deleteProfile,
  getActiveProfileId,
  listProfiles,
  profileSummary,
  setActiveProfile,
} from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  const profiles = listProfiles().map(profileSummary);
  return Response.json({ activeId: getActiveProfileId(), profiles });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const name = String((body as { name?: string }).name || "New profile");
  const profile = createProfile(name);
  return Response.json(profile, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const id = String(body.id || "");
  setActiveProfile(id);
  return Response.json({ ok: true, activeId: id });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });
  try {
    deleteProfile(id);
    return Response.json({ ok: true, activeId: getActiveProfileId() });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not delete" },
      { status: 400 },
    );
  }
}
