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

export async function extractResumeTextFromBuffer(buffer: Buffer, filename: string): Promise<string> {
  const ext = path.extname(filename || "").toLowerCase();

  if (ext === ".txt" || ext === ".rtf" || !ext) {
    const raw = buffer.toString("utf8");
    if (raw.trim().length >= 40) return raw;
  }

  if (ext === ".docx" || ext === ".doc") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value || "";
  }

  if (ext === ".pdf" || !ext) {
    const { extractText } = await import("unpdf");
    const { text } = await extractText(new Uint8Array(buffer), { mergePages: true });
    return Array.isArray(text) ? text.join("\n") : text || "";
  }

  throw new Error("Use a PDF, DOCX, or TXT resume.");
}

export async function extractResumeText(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  return extractResumeTextFromBuffer(buffer, filePath);
}

function firstMatch(text: string, re: RegExp) {
  return text.match(re)?.[0] || "";
}

export function heuristicParse(text: string): ParsedResume {
  const email = firstMatch(text, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const linkedinUrl = firstMatch(text, /https?:\/\/(?:www\.)?linkedin\.com\/[^\s)]+/i)
    || (text.match(/linkedin\.com\/in\/[A-Za-z0-9_-]+/i)?.[0]
      ? `https://${text.match(/linkedin\.com\/in\/[A-Za-z0-9_-]+/i)?.[0]}`
      : "");
  const githubUrl = firstMatch(text, /https?:\/\/(?:www\.)?github\.com\/[A-Za-z0-9_-]+/i);
  const websiteUrl = firstMatch(text, /https?:\/\/(?!www\.linkedin\.com|linkedin\.com|github\.com)[^\s)]+/i);
  const phone = (firstMatch(text, /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/) || "").replace(/[^\d+]/g, "");
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const nameLine =
    lines.find((line) => {
      if (line.includes("@") || /https?:/i.test(line)) return false;
      if (line.length > 48 || line.length < 3) return false;
      const words = line.split(" ").filter((w) => /^[A-Za-z.'-]+$/.test(w));
      return words.length >= 2 && words.length <= 4;
    }) || "";
  const [firstName, ...rest] = nameLine.split(" ");
  const locationLine =
    lines.find((line) =>
      /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|United States|USA)\b/i.test(
        line,
      ) && line.length < 80,
    ) || "";

  return ParsedSchema.parse({
    firstName: firstName || "",
    lastName: rest.join(" "),
    email,
    phone,
    locationLine,
    linkedinUrl,
    githubUrl,
    websiteUrl,
    portfolioUrl: websiteUrl,
  });
}

function mergeParsed(base: ParsedResume, overlay: ParsedResume): ParsedResume {
  const pick = (key: keyof ParsedResume) => {
    const next = overlay[key];
    const prev = base[key];
    if (Array.isArray(next) && next.length) return next;
    if (Array.isArray(prev)) return prev;
    return String(next || "").trim() || prev;
  };
  return ParsedSchema.parse({
    firstName: pick("firstName"),
    lastName: pick("lastName"),
    preferredName: pick("preferredName"),
    email: pick("email"),
    phone: pick("phone"),
    street: pick("street"),
    city: pick("city"),
    state: pick("state"),
    postalCode: pick("postalCode"),
    country: pick("country"),
    locationLine: pick("locationLine"),
    linkedinUrl: pick("linkedinUrl"),
    githubUrl: pick("githubUrl"),
    portfolioUrl: pick("portfolioUrl"),
    websiteUrl: pick("websiteUrl"),
    currentCompany: pick("currentCompany"),
    currentTitle: pick("currentTitle"),
    summary: pick("summary"),
    experiences: overlay.experiences?.length ? overlay.experiences : base.experiences,
    educations: overlay.educations?.length ? overlay.educations : base.educations,
  });
}

export async function parseResumeText(text: string): Promise<ParsedResume> {
  const cleaned = text.replace(/\s+\n/g, "\n").trim();
  if (cleaned.length < 40) {
    throw new Error("Could not read enough text from the resume.");
  }

  const fallback = heuristicParse(cleaned);
  try {
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
    const parsed = ParsedSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return fallback;
    return mergeParsed(fallback, parsed.data);
  } catch {
    if (fallback.email || fallback.firstName || fallback.phone) return fallback;
    throw new Error("Could not parse the resume. Add OPENAI_API_KEY or try a text-based PDF/DOCX.");
  }
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
