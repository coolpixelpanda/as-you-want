import { NextRequest } from "next/server";
import { readProfile } from "@/lib/store";
import { mapQuestions } from "@/lib/ats/mapper";
import type { FormQuestion } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function cors(res: Response) {
  const headers = new Headers(res.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export async function OPTIONS() {
  return cors(new Response(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const profile = await readProfile(String(body.profileId || ""));
    const questions = (body.fields || []) as FormQuestion[];
    const mapped = await mapQuestions({
      questions,
      profile,
      jobTitle: String(body.jobTitle || ""),
      company: String(body.company || ""),
    });
    return cors(
      Response.json({
        answers: mapped.map((row) => ({
          id: row.id,
          name: row.name,
          label: row.label,
          description: row.description,
          value: row.value,
          type: row.type,
          required: row.required,
          options: row.options || [],
          source: row.source,
        })),
        profile: {
          id: profile.id,
          firstName: profile.firstName,
          lastName: profile.lastName,
          email: profile.email,
          phone: profile.phone,
        },
      }),
    );
  } catch (error) {
    return cors(
      Response.json(
        { error: error instanceof Error ? error.message : "Map failed" },
        { status: 400 },
      ),
    );
  }
}
