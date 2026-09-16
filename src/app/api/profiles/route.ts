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
export const dynamic = "force-dynamic";

function payload(extra: Record<string, unknown> = {}) {
  return Response.json(extra, { headers: { "Cache-Control": "no-store" } });
}

async function snapshot() {
  const profiles = (await listProfiles()).map(profileSummary);
  return { activeId: await getActiveProfileId(), profiles };
}

export async function GET() {
  return payload(await snapshot());
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const name = String((body as { name?: string }).name || "New profile");
  const profile = await createProfile(name);
  return Response.json(profile, { status: 201, headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const id = String(body.id || "");
  await setActiveProfile(id);
  return payload({ ok: true, ...(await snapshot()) });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "Missing id" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  try {
    await deleteProfile(id);
    return payload({ ok: true, deletedId: id, ...(await snapshot()) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not delete" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
