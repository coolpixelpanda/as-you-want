import { NextRequest } from "next/server";
import { storageMode, usesPostgres } from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  return Response.json({
    ok: true,
    storage: storageMode(),
    postgres: usesPostgres(),
    vercel: Boolean(process.env.VERCEL),
    openai: Boolean(process.env.OPENAI_API_KEY),
  });
}
