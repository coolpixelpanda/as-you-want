import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { getModel, getOpenAI } from "@/lib/openai";
import { newId, type Profile } from "@/lib/store";

const textField = z.union([z.string(), z.number(), z.null()]).optional().transform((v) =>
  v == null ? "" : String(v),
);
const boolField = z
  .union([z.boolean(), z.string(), z.null()])
  .optional()
  .transform((v) => v === true || v === "true");

const ParsedSchema = z.object({
  firstName: textField,
  lastName: textField,
  preferredName: textField,
  email: textField,
  phone: textField,
  street: textField,
  city: textField,
  state: textField,
  postalCode: textField,
  country: textField,
  locationLine: textField,
  linkedinUrl: textField,
  githubUrl: textField,
  portfolioUrl: textField,
  websiteUrl: textField,
  currentCompany: textField,
  currentTitle: textField,
  summary: textField,
  experiences: z
    .array(
      z.object({
        company: textField,
        title: textField,
        location: textField,
        startMonth: textField,
        startYear: textField,
        endMonth: textField,
        endYear: textField,
        current: boolField,
        description: textField,
      }),
    )
    .optional()
    .default([]),
  educations: z
    .array(
      z.object({
        school: textField,
        degree: textField,
        discipline: textField,
        startYear: textField,
        endYear: textField,
        current: boolField,
      }),
    )
    .optional()
    .default([]),
});

export type ParsedResume = z.infer<typeof ParsedSchema>;

export async function extractResumeText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  const buffer = fs.readFileSync(filePath);

  if (ext === ".txt" || ext === ".rtf") {
    return buffer.toString("utf8");
  }

  if (ext === ".docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value || "";
  }

  if (ext === ".pdf") {
    const { extractText } = await import("unpdf");
    const { text } = await extractText(new Uint8Array(buffer), { mergePages: true });
    return Array.isArray(text) ? text.join("\n") : text || "";
  }

  throw new Error("Use a PDF, DOCX, or TXT resume.");
}

export async function parseResumeText(text: string): Promise<ParsedResume> {
  const cleaned = text.replace(/\s+\n/g, "\n").trim();
  if (cleaned.length < 40) {
    throw new Error("Could not read enough text from the resume.");
  }

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: getModel(),
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Extract a job-applicant profile from a resume. Return JSON only with this shape:
{
  "firstName": "",
  "lastName": "",
  "preferredName": "",
  "email": "",
  "phone": "",
  "street": "",
  "city": "",
  "state": "",
  "postalCode": "",
  "country": "",
  "locationLine": "",
  "linkedinUrl": "",
  "githubUrl": "",
  "portfolioUrl": "",
  "websiteUrl": "",
  "currentCompany": "",
  "currentTitle": "",
  "summary": "",
  "experiences": [{"company":"","title":"","location":"","startMonth":"","startYear":"","endMonth":"","endYear":"","current":false,"description":""}],
  "educations": [{"school":"","degree":"","discipline":"","startYear":"","endYear":"","current":false}]
}
Rules:
- Use only facts in the resume. Empty string if unknown. Never invent employers, dates, or degrees.
- phone: digits with country code if present.
- locationLine: "City, State, Country" when possible.
- experiences: newest first. current=true if it is the present role. description: 2-6 short sentences or bullet-like lines.
- currentCompany/currentTitle from the newest current role.
- URLs must be full https links when you can reconstruct them from the resume.`,
      },
      {
        role: "user",
        content: cleaned.slice(0, 24000),
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content || "{}";
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("OpenAI did not return valid resume JSON.");
  }
  const parsed = ParsedSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error("Could not map the resume into profile fields.");
  }
  return parsed.data;
}

function filled(value: unknown) {
  return Boolean(String(value || "").trim());
}

export function mergeParsedResume(profile: Profile, parsed: ParsedResume): Profile {
  const pick = (
    key: Exclude<keyof ParsedResume, "experiences" | "educations">,
    current: string,
  ) => {
    const next = String(parsed[key] || "").trim();
    return next || current;
  };

  const experiences = (parsed.experiences || [])
    .filter((row) => row.company || row.title)
    .map((row, index) => ({
      id: newId(),
      company: row.company || "",
      title: row.title || "",
      location: row.location || "",
      startMonth: row.startMonth || "",
      startYear: row.startYear || "",
      endMonth: row.endMonth || "",
      endYear: row.endYear || "",
      current: Boolean(row.current),
      description: row.description || "",
      sortOrder: index,
    }));

  const educations = (parsed.educations || [])
    .filter((row) => row.school)
    .map((row, index) => ({
      id: newId(),
      school: row.school || "",
      degree: row.degree || "",
      discipline: row.discipline || "",
      startYear: row.startYear || "",
      endYear: row.endYear || "",
      current: Boolean(row.current),
      sortOrder: index,
    }));

  return {
    ...profile,
    firstName: pick("firstName", profile.firstName),
    lastName: pick("lastName", profile.lastName),
    preferredName: pick("preferredName", profile.preferredName),
    email: pick("email", profile.email),
    phone: pick("phone", profile.phone),
    street: pick("street", profile.street),
    city: pick("city", profile.city),
    state: pick("state", profile.state),
    postalCode: pick("postalCode", profile.postalCode),
    country: pick("country", profile.country) || profile.country,
    locationLine: pick("locationLine", profile.locationLine),
    linkedinUrl: pick("linkedinUrl", profile.linkedinUrl),
    githubUrl: pick("githubUrl", profile.githubUrl),
    portfolioUrl: pick("portfolioUrl", profile.portfolioUrl),
    websiteUrl: pick("websiteUrl", profile.websiteUrl),
    currentCompany: pick("currentCompany", profile.currentCompany),
    currentTitle: pick("currentTitle", profile.currentTitle),
    additionalInfo: parsed.summary?.trim() || profile.additionalInfo,
    experiences: experiences.length ? experiences : profile.experiences,
    educations: educations.length ? educations : profile.educations,
  };
}

export function parseSummary(parsed: ParsedResume) {
  const bits = [
    filled(parsed.firstName) && "name",
    filled(parsed.email) && "email",
    filled(parsed.phone) && "phone",
    filled(parsed.linkedinUrl) && "LinkedIn",
    (parsed.experiences?.length || 0) > 0 && `${parsed.experiences.length} job(s)`,
    (parsed.educations?.length || 0) > 0 && `${parsed.educations.length} school(s)`,
  ].filter(Boolean);
  return bits.length ? `Filled ${bits.join(", ")} from the resume.` : "Resume saved, but little could be extracted.";
}
