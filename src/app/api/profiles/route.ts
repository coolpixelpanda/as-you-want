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
  const profiles = (await listProfiles()).map(profileSummary);
  return Response.json({ activeId: await getActiveProfileId(), profiles });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const name = String((body as { name?: string }).name || "New profile");
  const profile = await createProfile(name);
  return Response.json(profile, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const id = String(body.id || "");
  await setActiveProfile(id);
  return Response.json({ ok: true, activeId: id });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });
  try {
    await deleteProfile(id);
    return Response.json({ ok: true, activeId: await getActiveProfileId() });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not delete" },
      { status: 400 },
    );
  }
}
