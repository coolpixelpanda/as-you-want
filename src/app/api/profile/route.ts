import { NextRequest } from "next/server";
import { mergeLatestAnswers } from "@/lib/answers-db";
import { newId, readProfile, writeProfile, type Education, type Experience, type Profile, type SavedAnswer } from "@/lib/store";

export const runtime = "nodejs";

function applyBody(current: Profile, body: Record<string, unknown>): Profile {
  const fields = { ...body };
  delete fields.experiences;
  delete fields.educations;
  delete fields.answers;
  delete fields.id;
  delete fields.updatedAt;

  const experiences = Array.isArray(body.experiences)
    ? body.experiences.map((row: Record<string, unknown>, index: number) => ({
        id: String(row.id || newId()),
        company: String(row.company || ""),
        title: String(row.title || ""),
        location: String(row.location || ""),
        startMonth: String(row.startMonth || ""),
        startYear: String(row.startYear || ""),
        endMonth: String(row.endMonth || ""),
        endYear: String(row.endYear || ""),
        current: Boolean(row.current),
        description: String(row.description || ""),
        sortOrder: index,
      }))
    : current.experiences;

  const educations = Array.isArray(body.educations)
    ? body.educations.map((row: Record<string, unknown>, index: number) => ({
        id: String(row.id || newId()),
        school: String(row.school || ""),
        degree: String(row.degree || ""),
        discipline: String(row.discipline || ""),
        startYear: String(row.startYear || ""),
        endYear: String(row.endYear || ""),
        current: Boolean(row.current),
        sortOrder: index,
      }))
    : current.educations;

  const answers = mergeLatestAnswers(
    Array.isArray(body.answers)
      ? body.answers
          .filter((row: Record<string, unknown>) => row.question && row.answer)
          .map((row: Record<string, unknown>) => ({
            id: String(row.id || newId()),
            question: String(row.question),
            answer: String(row.answer),
            source: String(row.source || "profile"),
          }))
      : current.answers,
  );

  return {
    ...current,
    ...fields,
    experiences: experiences as Experience[],
    educations: educations as Education[],
    answers: answers as SavedAnswer[],
  };
}

export function profileFromBody(current: Profile, body: Record<string, unknown>) {
  return applyBody(current, body);
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") || undefined;
  return Response.json(readProfile(id));
}

export async function PUT(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") || undefined;
  const body = (await request.json()) as Record<string, unknown>;
  const current = readProfile(id);
  const next = applyBody(current, body);
  writeProfile(next, { replaceAnswers: true });
  return Response.json({ ok: true, profile: readProfile(next.id), id: next.id });
}
