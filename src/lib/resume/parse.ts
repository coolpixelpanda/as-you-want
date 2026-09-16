import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { normalizeStateCode } from "@/lib/us-states";
import { newId, type Profile } from "@/lib/store";

const textField = z.union([z.string(), z.number(), z.null()]).optional().transform((v) =>
  v == null ? "" : String(v).trim(),
);
const boolField = z
  .union([z.boolean(), z.string(), z.number(), z.null()])
  .optional()
  .transform((v) => v === true || v === "true" || v === 1 || v === "1" || /^present|current|now$/i.test(String(v || "")));

const ExperienceSchema = z.object({
  company: textField,
  title: textField,
  location: textField,
  startMonth: textField,
  startYear: textField,
  endMonth: textField,
  endYear: textField,
  current: boolField,
  description: textField,
});

const EducationSchema = z.object({
  school: textField,
  degree: textField,
  discipline: textField,
  startYear: textField,
  endYear: textField,
  current: boolField,
});

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
  skills: textField,
  certifications: textField,
  projects: textField,
  experiences: z.array(ExperienceSchema).optional().default([]),
  educations: z.array(EducationSchema).optional().default([]),
});

export type ParsedResume = z.infer<typeof ParsedSchema>;

const MONTHS: Record<string, string> = {
  jan: "January",
  january: "January",
  feb: "February",
  february: "February",
  mar: "March",
  march: "March",
  apr: "April",
  april: "April",
  may: "May",
  jun: "June",
  june: "June",
  jul: "July",
  july: "July",
  aug: "August",
  august: "August",
  sep: "September",
  sept: "September",
  september: "September",
  oct: "October",
  october: "October",
  nov: "November",
  november: "November",
  dec: "December",
  december: "December",
};

const MONTH_NAME =
  "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";

const YEAR = "(?:19|20)\\d{2}";
const DATE_TOKEN = `(?:(?:${MONTH_NAME}[.]?|\\d{1,2})[./\\-]?\\s*)?${YEAR}`;
const DATE_CHUNK = new RegExp(`((?:${MONTH_NAME}[.]?|\\d{1,2})[./\\-]?\\s*)?(${YEAR})`, "i");

const DATE_RANGE = new RegExp(
  `(${DATE_TOKEN})\\s*(?:–|—|-|to|until|thru|through)\\s*(Present|Current|Now|Ongoing|${DATE_TOKEN})`,
  "i",
);

const TITLE_RE =
  /\b(engineer|developer|manager|analyst|intern|designer|consultant|lead|director|founder|officer|scientist|specialist|coordinator|architect|administrator|associate|assistant|president|head of|product|software|full[ -]?stack|front[ -]?end|back[ -]?end|data scientist|qa|sde|swe|researcher|teacher|nurse|writer|editor|recruiter|accountant|counsel|attorney|owner|co-founder|staff|principal)\b/i;

const SCHOOL_RE = /university|college|institute|school|academy|polytechnic|universidad/i;
const DEGREE_RE = /bachelor|master|associate|doctor|ph\.?d|b\.?s\.?|m\.?s\.?|b\.?a\.?|m\.?b\.?a|m\.?eng|b\.?eng|diploma|high school|ged\b|ll\.?b|j\.?d\.?/i;

function monthName(raw: string) {
  if (!raw) return "";
  const key = raw.replace(/\./g, "").trim().toLowerCase();
  if (MONTHS[key]) return MONTHS[key];
  if (/^\d{1,2}$/.test(key)) return monthFromNumber(key);
  return "";
}

function monthFromNumber(value: string) {
  const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const index = Number(value) - 1;
  return names[index] || "";
}

function parseLooseDate(value: string) {
  const text = String(value || "").trim();
  if (!text) return { month: "", year: "" };
  const iso = text.match(/^(\d{4})-(\d{1,2})/);
  if (iso) return { month: monthFromNumber(iso[2]), year: iso[1] };
  const us = text.match(/^(\d{1,2})[/-](\d{4})$/);
  if (us) return { month: monthFromNumber(us[1]), year: us[2] };
  const chunk = text.match(DATE_CHUNK);
  const monthRaw = String(chunk?.[1] || "").replace(/[./\-]/g, "").trim();
  return { month: monthName(monthRaw) || monthFromNumber(monthRaw), year: chunk?.[2] || "" };
}

function splitDateRange(value: string) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  const current = /present|current|now|ongoing/i.test(text);
  const range = text.match(DATE_RANGE);
  const source = range?.[0] || text;
  const parts = source.split(/\s*(?:–|—|-|to|until|thru|through)\s*/i);
  const start = parseLooseDate(parts[0] || "");
  const end = current ? { month: "", year: "" } : parseLooseDate(parts.slice(1).join(" "));
  return {
    startMonth: start.month,
    startYear: start.year,
    endMonth: end.month,
    endYear: end.year,
    current,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  return [];
}

function pickText(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function splitParts(text: string) {
  const protectedText = text.replace(/([A-Za-z.]+),\s*([A-Z]{2})\b/g, "$1@@ST@@$2");
  return protectedText
    .split(/\s*(?:\||•|·|—|–|,)\s*/)
    .map((part) => part.replace(/@@ST@@/g, ", ").trim())
    .filter(Boolean);
}

function isLocation(text: string) {
  return /,\s*[A-Z]{2}\b|united states|usa\b|remote|hybrid/i.test(text);
}

function isBullet(line: string) {
  return /^[-•●▪‣*]\s+/.test(line) || /^(developed|built|led|created|implemented|designed|managed|worked|responsible|improved|owned|collaborated|supported|reduced|increased|launched)\b/i.test(line);
}

function isRoleHeader(line: string) {
  if (!line || line.length > 100) return false;
  if (isBullet(line)) return false;
  if (/[.!?]$/.test(line) && line.length > 50) return false;
  return true;
}

function lookLikeEducation(text: string) {
  return SCHOOL_RE.test(text) || DEGREE_RE.test(text) || /\bgpa\b/i.test(text);
}

function assignJobHeaders(parts: string[]) {
  const tokens = parts.map((part) => part.replace(/\s+/g, " ").trim()).filter(Boolean);
  const atMatch = tokens.map((token) => token.match(/^(.+?)\s+at\s+(.+)$/i)).find(Boolean);
  let title = "";
  let company = "";
  let location = tokens.find(isLocation) || "";
  const unused = tokens.filter((token) => token !== location);

  if (atMatch) {
    title = atMatch[1].trim();
    company = atMatch[2].trim();
  } else {
    title = unused.find((token) => TITLE_RE.test(token)) || "";
    company = unused.find((token) => token !== title) || "";
    if (!title && unused[0]) title = unused[0];
    if (!company && unused[1] && unused[1] !== title) company = unused[1];
  }

  if (TITLE_RE.test(company) && !TITLE_RE.test(title) && title) {
    [title, company] = [company, title];
  }

  return { title, company, location };
}

function nestedName(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  return pickText(value as Record<string, unknown>, ["name", "company", "school", "title", "value"]);
}

function normalizeExperience(raw: unknown) {
  const row = asRecord(raw);
  const startLoose = parseLooseDate(pickText(row, ["startDate", "start"]));
  const endLoose = parseLooseDate(pickText(row, ["endDate", "end"]));
  const dates = splitDateRange(
    pickText(row, ["dates", "date", "dateRange", "tenure", "period"]) ||
      `${pickText(row, ["startMonth"])} ${pickText(row, ["startYear"])} - ${pickText(row, ["endMonth"])} ${pickText(row, ["endYear"])}`,
  );
  const bullets = asArray(row.bullets)
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  const description = pickText(row, ["description", "summary", "details", "highlights"]) || bullets.join("\n");
  return {
    company:
      pickText(row, ["company", "companyName", "employer", "organization", "org"]) ||
      nestedName(row.company) ||
      nestedName(row.employer),
    title: pickText(row, ["title", "role", "position", "jobTitle"]) || nestedName(row.title),
    location: pickText(row, ["location", "city", "place"]) || nestedName(row.location),
    startMonth: pickText(row, ["startMonth"]) || dates.startMonth || startLoose.month,
    startYear: pickText(row, ["startYear"]) || dates.startYear || startLoose.year,
    endMonth: pickText(row, ["endMonth"]) || dates.endMonth || endLoose.month,
    endYear: pickText(row, ["endYear"]) || dates.endYear || endLoose.year,
    current: row.current ?? dates.current,
    description,
  };
}

function normalizeEducation(raw: unknown) {
  const row = asRecord(raw);
  const dates = splitDateRange(
    pickText(row, ["dates", "date", "dateRange", "years"]) ||
      `${pickText(row, ["startYear", "startDate"])} - ${pickText(row, ["endYear", "endDate", "graduationYear", "gradYear"])}`,
  );
  const degree = pickText(row, ["degree", "degreeName", "qualification"]);
  const discipline =
    pickText(row, ["discipline", "major", "field", "fieldOfStudy", "concentration"]) ||
    (degree.match(/\bin\s+(.+)$/i)?.[1] || "");
  return {
    school:
      pickText(row, ["school", "schoolName", "university", "college", "institution"]) ||
      nestedName(row.school) ||
      nestedName(row.university),
    degree,
    discipline,
    startYear: pickText(row, ["startYear"]) || dates.startYear,
    endYear: pickText(row, ["endYear", "graduationYear", "gradYear"]) || dates.endYear,
    current: row.current ?? dates.current,
  };
}

function parseLocationLine(line: string) {
  const text = String(line || "").trim();
  if (!text) return { city: "", state: "", postalCode: "", country: "" };
  const postalCode = text.match(/\b\d{5}(?:-\d{4})?\b/)?.[0] || "";
  const parts = text.split(",").map((part) => part.replace(/\b\d{5}(?:-\d{4})?\b/, "").trim()).filter(Boolean);
  const last = parts[parts.length - 1] || "";
  const country = /united states|usa|u\.s\.a?\.?$/i.test(last) ? "United States" : parts.length > 2 ? last : "";
  const city = parts[0] && !/united states|usa/i.test(parts[0]) ? parts[0] : "";
  const stateRaw = parts[1] && !/united states|usa/i.test(parts[1]) ? parts[1] : "";
  const state = normalizeStateCode(stateRaw);
  return { city, state, postalCode, country };
}

function firstFilledArray(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const items = asArray(row[key]);
    if (items.length) return items;
  }
  return [];
}

function coerceParsed(raw: unknown): ParsedResume {
  const row = asRecord(raw);
  const experiences = firstFilledArray(row, [
    "experiences",
    "experience",
    "workExperience",
    "work_experience",
    "jobs",
    "employment",
    "positions",
    "workHistory",
  ])
    .map(normalizeExperience)
    .filter((item) => item.company || item.title);
  const educations = firstFilledArray(row, ["educations", "education", "schools", "academic", "academics"])
    .map(normalizeEducation)
    .filter((item) => item.school);
  const locationLine = pickText(row, ["locationLine", "location"]);
  const fromLine = parseLocationLine(locationLine);
  const skills = Array.isArray(row.skills) ? row.skills.filter(Boolean).join(", ") : pickText(row, ["skills"]);
  const certifications = Array.isArray(row.certifications)
    ? row.certifications.filter(Boolean).join(", ")
    : pickText(row, ["certifications"]);
  const projects = Array.isArray(row.projects) ? row.projects.filter(Boolean).join("\n") : pickText(row, ["projects"]);
  return ParsedSchema.parse({
    firstName: pickText(row, ["firstName", "first_name"]),
    lastName: pickText(row, ["lastName", "last_name"]),
    preferredName: pickText(row, ["preferredName"]),
    email: pickText(row, ["email"]),
    phone: pickText(row, ["phone", "phoneNumber", "mobile"]),
    street: pickText(row, ["street", "address"]),
    city: pickText(row, ["city"]) || fromLine.city,
    state: normalizeStateCode(pickText(row, ["state", "region"]) || fromLine.state),
    postalCode: pickText(row, ["postalCode", "zip", "zipCode"]) || fromLine.postalCode,
    country: pickText(row, ["country"]) || fromLine.country,
    locationLine,
    linkedinUrl: pickText(row, ["linkedinUrl", "linkedin"]),
    githubUrl: pickText(row, ["githubUrl", "github"]),
    portfolioUrl: pickText(row, ["portfolioUrl", "portfolio"]),
    websiteUrl: pickText(row, ["websiteUrl", "website"]),
    currentCompany: pickText(row, ["currentCompany"]),
    currentTitle: pickText(row, ["currentTitle"]),
    summary: pickText(row, ["summary", "objective", "about"]),
    skills,
    certifications,
    projects,
    experiences,
    educations,
  });
}

const SECTION_HEADERS =
  "Work Experience|Professional Experience|Employment History|Technical Skills|Academic Background|Core Skills|Experience|Internships|Employment|Education|Skills|Projects|Certifications|Summary|Objective|Awards|Languages";

export function normalizeResumeText(text: string) {
  return text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(new RegExp(`([a-z0-9.])(${SECTION_HEADERS})\\b`, "gi"), "$1\n$2")
    .replace(new RegExp(`\\b(${SECTION_HEADERS})(?=[A-Z][a-z])`, "g"), "$1\n")
    .replace(new RegExp(`(?:^|\\n)[ \\t]*(${SECTION_HEADERS})\\s*:?[ \\t]*`, "gi"), "\n\n$1\n")
    .replace(new RegExp(`(${DATE_TOKEN}\\s*(?:–|—|-|to)\\s*(?:Present|Current|Now|${DATE_TOKEN}))`, "gi"), "\n$1\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractResumeTextFromBuffer(buffer: Buffer, filename: string): Promise<string> {
  const ext = path.extname(filename || "").toLowerCase();
  let text = "";

  if (ext === ".txt" || ext === ".rtf") {
    text = buffer.toString("utf8");
  } else if (ext === ".docx" || ext === ".doc") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    text = result.value || "";
  } else if (ext === ".pdf" || !ext) {
    const { extractText } = await import("unpdf");
    const extracted = await extractText(new Uint8Array(buffer), { mergePages: false });
    const pages = extracted.text;
    text = Array.isArray(pages) ? pages.filter(Boolean).join("\n\n") : pages || "";
    if (text.trim().length < 40) {
      const merged = await extractText(new Uint8Array(buffer), { mergePages: true });
      const one = merged.text;
      text = Array.isArray(one) ? one.join("\n") : one || text;
    }
  } else {
    throw new Error("Use a PDF, DOCX, or TXT resume.");
  }

  const cleaned = normalizeResumeText(text);
  if (cleaned.length < 40) throw new Error("Could not read enough text from the resume.");
  return cleaned;
}

export async function extractResumeText(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  return extractResumeTextFromBuffer(buffer, filePath);
}

function firstMatch(text: string, re: RegExp) {
  return text.match(re)?.[0] || "";
}

function sliceSection(text: string, starts: string[], stops: string[]) {
  const startRe = new RegExp(`(?:^|\\n)\\s*(?:${starts.join("|")})\\s*:?\\s*(?:\\n|$)`, "i");
  const start = text.search(startRe);
  if (start < 0) return "";
  const after = text.slice(start).replace(startRe, "\n");
  const stopRe = new RegExp(`(?:^|\\n)\\s*(?:${stops.join("|")})\\s*:?\\s*(?:\\n|$)`, "i");
  const stop = after.search(stopRe);
  return (stop >= 0 ? after.slice(0, stop) : after).trim();
}

function cleanLines(block: string) {
  return block
    .split(/\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((line) => !new RegExp(`^(${SECTION_HEADERS})$`, "i").test(line));
}

function findDateRange(line: string) {
  const match = line.match(DATE_RANGE);
  if (!match || match.index == null) return null;
  const rest = `${line.slice(0, match.index)} ${line.slice(match.index + match[0].length)}`.replace(/\s+/g, " ").trim();
  return { text: match[0], rest, dates: splitDateRange(match[0]) };
}

function heuristicExperiences(text: string) {
  const headed = sliceSection(
    text,
    ["Work Experience", "Professional Experience", "Employment History", "Internships", "Employment", "Experience"],
    ["Education", "Academic", "Skills", "Projects", "Certifications", "Awards", "Languages"],
  );
  const education = sliceSection(text, ["Education", "Academic Background", "Academic"], ["Experience", "Skills", "Projects"]);
  const block = headed || text.replace(education, "");
  const lines = cleanLines(block);
  const starts: { from: number; dateIndex: number }[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (!findDateRange(lines[i])) continue;
    const window = lines.slice(Math.max(0, i - 2), i + 3).join(" ");
    if (lookLikeEducation(window) && !TITLE_RE.test(window)) continue;
    let from = i;
    let look = i - 1;
    let taken = 0;
    while (look >= 0 && taken < 3 && !findDateRange(lines[look]) && isRoleHeader(lines[look]) && !starts.some((row) => row.from === look)) {
      from = look;
      look -= 1;
      taken += 1;
    }
    starts.push({ from, dateIndex: i });
  }

  if (!starts.length) {
    for (let i = 0; i < lines.length; i += 1) {
      if (!TITLE_RE.test(lines[i]) || !isRoleHeader(lines[i]) || lookLikeEducation(lines[i])) continue;
      starts.push({ from: i, dateIndex: i });
    }
  }

  return starts
    .map((start, index) => {
      const end = starts[index + 1]?.from ?? lines.length;
      const body = lines.slice(start.from, end);
      const dateIndex = start.dateIndex - start.from;
      const dated = findDateRange(body[dateIndex] || "");
      const before = body.slice(0, dateIndex);
      const after = body.slice(dateIndex + 1);
      const headers: string[] = [...before];
      const bullets: string[] = [];
      let seenBullet = false;
      for (const line of after) {
        if (!seenBullet && isRoleHeader(line) && headers.length < 4 && !findDateRange(line)) {
          headers.push(line);
        } else {
          seenBullet = true;
          bullets.push(line.replace(/^[-•●▪‣*]\s*/, ""));
        }
      }
      if (dated?.rest) headers.unshift(dated.rest);
      else if (body[dateIndex] && !dated) headers.unshift(body[dateIndex]);
      const assigned = assignJobHeaders(headers.flatMap(splitParts));
      return normalizeExperience({
        ...assigned,
        ...dated?.dates,
        description: bullets.join("\n"),
      });
    })
    .filter((job) => job.company || job.title);
}

function educationYears(text: string) {
  const grad = text.match(/(?:class of|graduated|expected|graduation)\s*((?:19|20)\d{2})/i);
  if (grad) return { startMonth: "", startYear: "", endMonth: "", endYear: grad[1], current: /expected/i.test(text) };
  const dates = splitDateRange(text);
  if (dates.startYear || dates.endYear) return dates;
  const year = text.match(/\b((?:19|20)\d{2})\b/);
  return { startMonth: "", startYear: "", endMonth: "", endYear: year?.[1] || "", current: false };
}

function heuristicEducations(text: string) {
  const headed = sliceSection(
    text,
    ["Education", "Academic Background", "Academic"],
    ["Experience", "Skills", "Projects", "Certifications", "Awards", "Languages"],
  );
  const block = headed || text;
  const lines = cleanLines(block);
  const starts: number[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!SCHOOL_RE.test(lines[i])) continue;
    const from = i > 0 && DEGREE_RE.test(lines[i - 1]) && !SCHOOL_RE.test(lines[i - 1]) ? i - 1 : i;
    if (!starts.includes(from)) starts.push(from);
  }
  const groups = (starts.length ? starts : [0]).map((from, index) => {
    const end = starts[index + 1] ?? lines.length;
    return lines.slice(from, starts.length ? end : Math.min(end, from + 6));
  });

  return groups
    .map((group) => {
      const joined = group.join(" | ");
      if (!SCHOOL_RE.test(joined) && !DEGREE_RE.test(joined)) return null;
      const dates = educationYears(joined);
      const school = group.find((line) => SCHOOL_RE.test(line)) || "";
      const degreeLine = group.find((line) => DEGREE_RE.test(line)) || "";
      const degree = degreeLine.replace(/\b((?:19|20)\d{2}|class of.*)$/i, "").trim();
      const discipline =
        degree.match(/\bin\s+(.+)$/i)?.[1] ||
        group.find((line) => /\bmajor\b/i.test(line) && line !== school)?.replace(/.*\bmajor\b[:\s]*/i, "") ||
        "";
      return normalizeEducation({
        school: school.replace(DATE_RANGE, "").replace(/\s*[|•·—–]\s*$/, "").trim() || school,
        degree,
        discipline,
        startYear: dates.startYear,
        endYear: dates.endYear,
        current: dates.current,
      });
    })
    .filter((row): row is ReturnType<typeof normalizeEducation> => Boolean(row?.school));
}

export function heuristicParse(text: string): ParsedResume {
  const email = firstMatch(text, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const linkedinUrl =
    firstMatch(text, /https?:\/\/(?:www\.)?linkedin\.com\/[^\s)]+/i) ||
    (text.match(/linkedin\.com\/in\/[A-Za-z0-9_-]+/i)?.[0] ? `https://${text.match(/linkedin\.com\/in\/[A-Za-z0-9_-]+/i)?.[0]}` : "");
  const githubUrl = firstMatch(text, /https?:\/\/(?:www\.)?github\.com\/[A-Za-z0-9_-]+/i);
  const websiteUrl = firstMatch(text, /https?:\/\/(?!www\.linkedin\.com|linkedin\.com|github\.com)[^\s)]+/i);
  const rawPhone = firstMatch(text, /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/);
  const phone = rawPhone ? rawPhone.replace(/[^\d+]/g, "") : "";
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const nameLine =
    lines.find((line) => {
      if (line.includes("@") || /https?:/i.test(line)) return false;
      if (line.length > 48 || line.length < 3) return false;
      const words = line.split(" ").filter((word) => /^[A-Za-z.'-]+$/.test(word));
      return words.length >= 2 && words.length <= 4;
    }) || "";
  const [firstName, ...rest] = nameLine.split(" ");
  const locationLine =
    lines.find(
      (line) =>
        /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|United States|USA|Remote)\b/i.test(
          line,
        ) && line.length < 80,
    ) || "";
  const experiences = heuristicExperiences(text);
  const educations = heuristicEducations(text);
  const current = experiences.find((row) => row.current) || experiences[0];
  const skillsBlock = sliceSection(text, ["Skills", "Technical Skills", "Core Skills"], ["Experience", "Education", "Projects", "Certifications"]);
  const certsBlock = sliceSection(text, ["Certifications", "Certificates"], ["Experience", "Education", "Skills", "Projects"]);
  const projectsBlock = sliceSection(text, ["Projects"], ["Experience", "Education", "Skills", "Certifications"]);
  const summaryBlock = sliceSection(text, ["Summary", "Objective"], ["Experience", "Education", "Skills", "Projects"]);

  return coerceParsed({
    firstName: firstName || "",
    lastName: rest.join(" "),
    email,
    phone,
    locationLine,
    linkedinUrl,
    githubUrl,
    websiteUrl,
    portfolioUrl: websiteUrl,
    currentCompany: current?.company || "",
    currentTitle: current?.title || "",
    summary: summaryBlock,
    skills: skillsBlock.replace(/\n/g, ", ").replace(/,\s*,/g, ", ").trim(),
    certifications: certsBlock.replace(/\n/g, ", ").trim(),
    projects: projectsBlock,
    experiences,
    educations,
  });
}

function jobKey(row: { company?: string; title?: string }) {
  return `${row.company || ""}|${row.title || ""}`.toLowerCase().replace(/\s+/g, " ").trim();
}

function schoolKey(row: { school?: string; degree?: string }) {
  return `${row.school || ""}|${row.degree || ""}`.toLowerCase().replace(/\s+/g, " ").trim();
}

function preferText(primary: string, fallback: string) {
  return String(primary || "").trim() || String(fallback || "").trim();
}

function unionByKey<T>(primary: T[], fallback: T[], keyFn: (row: T) => string, mergeFn: (a: T, b: T) => T) {
  const out: T[] = [];
  const used = new Set<string>();
  const extras = new Map<string, T>();
  for (const row of fallback) {
    const key = keyFn(row);
    if (key && key !== "|") extras.set(key, row);
  }
  for (const row of primary) {
    const key = keyFn(row);
    if (!key || key === "|") continue;
    const extra = extras.get(key);
    out.push(extra ? mergeFn(row, extra) : row);
    used.add(key);
  }
  for (const row of fallback) {
    const key = keyFn(row);
    if (!key || key === "|" || used.has(key)) continue;
    out.push(row);
  }
  return out;
}

function mergeParsed(base: ParsedResume, overlay: ParsedResume): ParsedResume {
  const pick = (key: keyof ParsedResume) => {
    const next = overlay[key];
    const prev = base[key];
    if (Array.isArray(next) || Array.isArray(prev)) return next;
    return String(next || "").trim() || prev;
  };
  return coerceParsed({
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
    skills: pick("skills"),
    certifications: pick("certifications"),
    projects: pick("projects"),
    experiences: unionByKey(overlay.experiences, base.experiences, jobKey, (a, b) => ({
      company: preferText(a.company, b.company),
      title: preferText(a.title, b.title),
      location: preferText(a.location, b.location),
      startMonth: preferText(a.startMonth, b.startMonth),
      startYear: preferText(a.startYear, b.startYear),
      endMonth: preferText(a.endMonth, b.endMonth),
      endYear: preferText(a.endYear, b.endYear),
      current: Boolean(a.current || b.current),
      description: (a.description || "").length >= (b.description || "").length ? a.description : b.description,
    })),
    educations: unionByKey(overlay.educations, base.educations, schoolKey, (a, b) => ({
      school: preferText(a.school, b.school),
      degree: preferText(a.degree, b.degree),
      discipline: preferText(a.discipline, b.discipline),
      startYear: preferText(a.startYear, b.startYear),
      endYear: preferText(a.endYear, b.endYear),
      current: Boolean(a.current || b.current),
    })),
  });
}

export async function parseResumeText(text: string): Promise<ParsedResume> {
  const cleaned = normalizeResumeText(text);
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
          content: `You extract EVERY listed fact from a resume into JSON. Do not skip jobs, internships, contract roles, volunteer roles listed as work, or schools.
Return only JSON with this shape:
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
  "skills": "",
  "certifications": "",
  "projects": "",
  "experiences": [{"company":"","title":"","location":"","startMonth":"","startYear":"","endMonth":"","endYear":"","current":false,"description":""}],
  "educations": [{"school":"","degree":"","discipline":"","startYear":"","endYear":"","current":false}]
}
Rules:
- Copy only facts from the resume. Never invent employers, schools, dates, or degrees.
- Include every work item under Experience / Work History / Internships, newest first. One object per role.
- startMonth/endMonth: full month name when the resume has it (January, not 01). startYear/endYear: 4 digits.
- If the resume says Jan 2022 – Present, set startMonth=January, startYear=2022, current=true, endMonth and endYear empty.
- description: keep the resume bullets, one per line, without adding new achievements.
- Include every school under Education. discipline is the major / field of study.
- skills: comma-separated list of skills exactly as listed.
- certifications and projects: keep listed items, separated clearly.
- phone: digits, keep a leading + if shown.
- URLs must be full https links when they can be reconstructed.`,
        },
        {
          role: "user",
          content: cleaned.slice(0, 40000),
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    const json = JSON.parse(raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim());
    return mergeParsed(fallback, coerceParsed(json));
  } catch {
    if (fallback.experiences.length || fallback.educations.length || fallback.email || fallback.firstName) {
      return fallback;
    }
    throw new Error("Could not parse the resume. Add OPENAI_API_KEY or try a text-based PDF/DOCX.");
  }
}

function filled(value: unknown) {
  return Boolean(String(value || "").trim());
}

function inferPhoneCountry(phone: string, fallback: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10 || (digits.length === 11 && digits.startsWith("1"))) return fallback || "United States";
  return fallback;
}

export function mergeParsedResume(profile: Profile, parsed: ParsedResume): Profile {
  const pick = (
    key: Exclude<keyof ParsedResume, "experiences" | "educations" | "skills" | "certifications" | "projects">,
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

  const extras = [
    parsed.summary?.trim(),
    parsed.skills?.trim() ? `Skills: ${parsed.skills.trim()}` : "",
    parsed.certifications?.trim() ? `Certifications: ${parsed.certifications.trim()}` : "",
    parsed.projects?.trim() ? `Projects:\n${parsed.projects.trim()}` : "",
  ].filter(Boolean);
  const additionalInfo = extras.join("\n\n") || profile.additionalInfo;
  const current = experiences.find((row) => row.current) || experiences[0];
  const phone = pick("phone", profile.phone);
  const locationLine = pick("locationLine", profile.locationLine);
  const fromLine = parseLocationLine(locationLine);

  return {
    ...profile,
    firstName: pick("firstName", profile.firstName),
    lastName: pick("lastName", profile.lastName),
    preferredName: pick("preferredName", profile.preferredName),
    email: pick("email", profile.email),
    phone,
    phoneCountry: inferPhoneCountry(phone, profile.phoneCountry),
    street: pick("street", profile.street),
    city: pick("city", profile.city) || fromLine.city,
    state: normalizeStateCode(pick("state", profile.state) || fromLine.state),
    postalCode: pick("postalCode", profile.postalCode) || fromLine.postalCode,
    country: pick("country", profile.country) || fromLine.country || profile.country,
    locationLine,
    linkedinUrl: pick("linkedinUrl", profile.linkedinUrl),
    githubUrl: pick("githubUrl", profile.githubUrl),
    portfolioUrl: pick("portfolioUrl", profile.portfolioUrl),
    websiteUrl: pick("websiteUrl", profile.websiteUrl),
    currentCompany: pick("currentCompany", current?.company || profile.currentCompany),
    currentTitle: pick("currentTitle", current?.title || profile.currentTitle),
    additionalInfo,
    experiences: experiences.length ? experiences : profile.experiences.filter((row) => row.company || row.title),
    educations: educations.length ? educations : profile.educations.filter((row) => row.school),
  };
}

export function parseSummary(parsed: ParsedResume) {
  const bits = [
    filled(parsed.firstName) && "name",
    filled(parsed.email) && "email",
    filled(parsed.phone) && "phone",
    filled(parsed.linkedinUrl) && "LinkedIn",
    filled(parsed.skills) && "skills",
    (parsed.experiences?.length || 0) > 0 && `${parsed.experiences.length} job(s)`,
    (parsed.educations?.length || 0) > 0 && `${parsed.educations.length} school(s)`,
  ].filter(Boolean);
  return bits.length ? `Filled ${bits.join(", ")} from the resume.` : "Resume saved, but little could be extracted.";
}
