import type { FormQuestion, MappedAnswer } from "@/lib/types";
import { getModel, getOpenAI } from "@/lib/openai";
import { profileDossier, type FullProfile } from "@/lib/profile";
import { type AnswerRow, findBestSavedAnswer, listAnswers } from "@/lib/answers-db";

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function pickOption(options: { label: string; value: string }[] | undefined, guess: string) {
  if (!options?.length) return guess;
  const g = norm(guess);
  const exact = options.find((o) => norm(o.label) === g || norm(o.value) === g);
  if (exact) return exact.label;
  const partial = options.find(
    (o) => norm(o.label).includes(g) || g.includes(norm(o.label)),
  );
  return partial?.label || guess;
}

function yesNoLabel(value: string, options?: { label: string; value: string }[]) {
  const yes = value === "yes";
  if (!options?.length) return yes ? "Yes" : "No";
  const wanted = yes
    ? options.find((o) => /^(yes|true|authorized|i am)/i.test(o.label) && !/not|no\b/i.test(o.label))
    : options.find((o) => /^(no|false|i am not|i do not)/i.test(o.label) || /\bno\b/i.test(o.label));
  return wanted?.label || (yes ? "Yes" : "No");
}

function declineLabel(
  value: string,
  kind: "gender" | "disability" | "veteran" | "race",
  options?: { label: string; value: string }[],
) {
  if (!options?.length) return value;
  if (value === "decline") {
    return (
      options.find((o) =>
        /decline|don't wish|do not wish|prefer not|i don't wish/i.test(o.label),
      )?.label || options[options.length - 1].label
    );
  }
  if (kind === "gender") {
    if (value === "man") return pickOption(options, "Man") || pickOption(options, "Male");
    if (value === "woman") return pickOption(options, "Woman") || pickOption(options, "Female");
    if (value === "non_binary") return pickOption(options, "Non-binary");
  }
  if (kind === "disability" || kind === "veteran") {
    return yesNoLabel(value, options);
  }
  return pickOption(options, value);
}

function matchSaved(label: string, bank: AnswerRow[]) {
  return findBestSavedAnswer(label, bank);
}

export function deterministicMap(
  question: FormQuestion,
  profile: FullProfile,
  bank: AnswerRow[] = [],
): MappedAnswer | null {
  const label = norm(question.label);
  const name = norm(question.name || "");
  const key = `${name} ${label}`;
  const options = question.options;

  const make = (
    value: string,
    confidence: MappedAnswer["confidence"] = "high",
    source: MappedAnswer["source"] = "profile",
  ): MappedAnswer => ({
    ...question,
    value,
    confidence,
    source,
  });

  if (question.type === "file" && (label.includes("resume") || label.includes("cv") || name === "resume")) {
    return profile.resumePath ? make(profile.resumePath) : null;
  }
  if (question.type === "file" && label.includes("cover")) {
    return profile.coverLetterPath ? make(profile.coverLetterPath) : profile.coverLetter ? make(profile.coverLetter, "medium") : null;
  }

  if (name === "first name" || label === "first name" || label.includes("first name")) {
    return profile.firstName ? make(profile.firstName) : null;
  }
  if (name === "last name" || label === "last name" || label.includes("last name")) {
    return profile.lastName ? make(profile.lastName) : null;
  }
  if (label.includes("full name") || name === "name" || label === "name") {
    const full = `${profile.firstName} ${profile.lastName}`.trim();
    return full ? make(full) : null;
  }
  if (label.includes("preferred name")) {
    return profile.preferredName ? make(profile.preferredName) : make(profile.firstName, "medium");
  }
  if (label.includes("pronoun")) {
    return profile.pronouns ? make(profile.pronouns) : null;
  }
  if (name === "email" || label.includes("email")) {
    return profile.email ? make(pickOption(options, profile.email)) : null;
  }
  if (
    label.includes("country code") ||
    label.includes("phone country") ||
    key.includes("phonecountry") ||
    key.includes("phone country")
  ) {
    const country = profile.phoneCountry || profile.country || "United States";
    return make(pickOption(options, country) || country);
  }
  if (label.includes("phone") && !label.includes("type") && !label.includes("country")) {
    return profile.phone ? make(profile.phone) : null;
  }
  if (label.includes("linkedin")) return profile.linkedinUrl ? make(profile.linkedinUrl) : null;
  if (label.includes("github")) return profile.githubUrl ? make(profile.githubUrl) : null;
  if (label.includes("portfolio") || (label.includes("website") && !label.includes("company"))) {
    return profile.portfolioUrl || profile.websiteUrl
      ? make(profile.portfolioUrl || profile.websiteUrl)
      : null;
  }
  if (label.includes("current company") || label.includes("current employer")) {
    return profile.currentCompany ? make(profile.currentCompany) : null;
  }
  if (label.includes("current title") || label.includes("current role")) {
    return profile.currentTitle ? make(profile.currentTitle) : null;
  }
  if (
    /you/.test(key) &&
    /(reside|residing|live|living) in/.test(key) &&
    /(us|u s|usa|united states)\b/.test(key)
  ) {
    return make(yesNoLabel(profile.residesInUs || "yes", options));
  }
  if (
    (key.includes("authorized") || key.includes("legally authorized")) &&
    key.includes("sponsorship")
  ) {
    const ok = profile.workAuthorizedUs !== "no" && profile.requiresSponsorship !== "yes";
    return make(yesNoLabel(ok ? "yes" : "no", options));
  }
  if (
    key.includes("authorized to work") ||
    key.includes("legally authorized") ||
    key.includes("eligible to work") ||
    key.includes("work authorization")
  ) {
    return make(yesNoLabel(profile.workAuthorizedUs, options));
  }
  if (key.includes("sponsorship") || key.includes("visa") || key.includes("employment authorization")) {
    if (/if no|specify|type of visa|what visa/i.test(question.label)) {
      if (profile.requiresSponsorship !== "yes") return make("N/A");
      return null;
    }
    return make(yesNoLabel(profile.requiresSponsorship, options));
  }
  if (key.includes("salary") || key.includes("compensation") || key.includes("pay expectation")) {
    if (!profile.salaryAmount) return null;
    const text = `${profile.salaryCurrency} ${profile.salaryAmount} per ${profile.salaryPeriod}`;
    return make(pickOption(options, profile.salaryAmount) || text);
  }
  if (key.includes("hear about")) {
    return profile.howHeard ? make(pickOption(options, profile.howHeard)) : null;
  }
  if (label.includes("gender") || name.includes("gender")) {
    return make(declineLabel(profile.gender, "gender", options));
  }
  if (label.includes("disability") || name.includes("disability")) {
    return make(declineLabel(profile.disability, "disability", options));
  }
  if (label.includes("veteran") || name.includes("veteran")) {
    return make(declineLabel(profile.veteran, "veteran", options));
  }
  if (label.includes("race") || label.includes("ethnicity") || name.includes("race")) {
    return make(declineLabel(profile.race, "race", options));
  }
  if (label.includes("relocate")) {
    return make(yesNoLabel(profile.willingToRelocate, options));
  }
  if (label.includes("start date") || label.includes("available to start")) {
    return profile.availableStartDate ? make(profile.availableStartDate) : null;
  }
  if (label.includes("former employee") || label.includes("previously employed")) {
    return make(yesNoLabel(profile.formerEmployee, options));
  }
  if (label.includes("relative") || label.includes("know anyone") || label.includes("work at")) {
    if (label.includes("relative") || label.includes("anyone at")) {
      return make(yesNoLabel(profile.relativesAtCompany, options));
    }
  }
  if (label === "location" || label.includes("city") || name === "location") {
    const line =
      profile.locationLine ||
      [profile.city, profile.state, profile.country].filter(Boolean).join(", ");
    return line ? make(line) : null;
  }
  if (label.includes("country") && question.section === "location") {
    return profile.country ? make(pickOption(options, profile.country)) : null;
  }
  if (label.includes("cover letter") && question.type !== "file") {
    return profile.coverLetter ? make(profile.coverLetter, "medium") : null;
  }
  if (label.includes("additional information") || label.includes("anything else")) {
    return profile.additionalInfo ? make(profile.additionalInfo, "medium") : null;
  }
  if (label.includes("school") && question.section === "education") {
    return profile.educations[0]?.school ? make(profile.educations[0].school) : null;
  }
  if (label.includes("degree")) {
    return profile.educations[0]?.degree ? make(profile.educations[0].degree) : null;
  }
  if (label.includes("discipline") || label.includes("major") || label.includes("field of study")) {
    return profile.educations[0]?.discipline ? make(profile.educations[0].discipline) : null;
  }

  const saved = matchSaved(question.label, bank);
  if (saved) {
    return make(pickOption(options, saved.answer), "high", "saved");
  }
  return null;
}

export async function mapQuestions(params: {
  questions: FormQuestion[];
  profile: FullProfile;
  jobTitle: string;
  company: string;
}): Promise<MappedAnswer[]> {
  const mapped: MappedAnswer[] = [];
  const leftover: FormQuestion[] = [];
  const bank = listAnswers(params.profile.id);

  for (const question of params.questions) {
    const hit = deterministicMap(question, params.profile, bank);
    if (hit?.value) {
      mapped.push(hit);
    } else leftover.push(question);
  }

  if (!leftover.length) return mapped;

  const matched = await matchLeftoverToSaved(leftover, bank);
  const matchedIds = new Set(matched.map((row) => row.id));
  mapped.push(...matched);

  const stillOpen = leftover.filter((question) => !matchedIds.has(question.id));
  if (stillOpen.length) {
    const generated = await generateLeftoverAnswers(stillOpen, params);
    mapped.push(...generated);
  }

  return mapped;
}

async function generateLeftoverAnswers(
  questions: FormQuestion[],
  params: { profile: FullProfile; jobTitle: string; company: string },
): Promise<MappedAnswer[]> {
  try {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: getModel(),
      response_format: { type: "json_object" },
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: `You fill LinkedIn Easy Apply questions from a candidate profile.
Return JSON: {"answers":[{"id":"...","value":"","confidence":"high|medium|low","source":"profile|generated|unknown"}]}
Rules:
- Use ONLY facts from the profile. Do not invent employers, degrees, dates, or visas.
- If options are provided, value MUST be exactly one of those option labels.
- For yes/no, answer Yes or No using the closest option label.
- For “why this company/role”, write 2-5 truthful sentences from the profile and the job.
- If the person does not need a visa, answer N/A for visa follow-ups.
- If you cannot answer without guessing, value="".
- Keep answers concise. No markdown.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            jobTitle: params.jobTitle,
            company: params.company,
            profile: profileDossier(params.profile),
            questions: questions.map((q) => ({
              id: q.id,
              question: q.label,
              description: q.description || "",
              type: q.type,
              required: q.required,
              options: (q.options || []).map((o) => o.label || o.value).filter(Boolean),
            })),
          }),
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw) as {
      answers?: { id?: string; value?: string; confidence?: MappedAnswer["confidence"]; source?: MappedAnswer["source"] }[];
    };
    const byId = new Map((parsed.answers || []).map((a) => [String(a.id || ""), a]));
    return questions.map((question) => {
      const llm = byId.get(question.id);
      const value = pickOption(question.options, (llm?.value || "").trim());
      return {
        ...question,
        value,
        confidence: value ? llm?.confidence || "medium" : "low",
        source: value ? llm?.source || "generated" : "unknown",
        note: value ? undefined : "No saved answer and the model could not fill this.",
      };
    });
  } catch (error) {
    const note = error instanceof Error ? error.message : "Could not auto-answer this field.";
    return questions.map((question) => ({
      ...question,
      value: "",
      confidence: "low" as const,
      source: "unknown" as const,
      note,
    }));
  }
}

async function matchLeftoverToSaved(questions: FormQuestion[], bank: AnswerRow[]): Promise<MappedAnswer[]> {
  if (!questions.length || !bank.length) return [];
  try {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: getModel(),
      response_format: { type: "json_object" },
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `Match application questions to a saved answer list.
Return JSON: {"matches":[{"id":"questionId","savedId":"savedAnswerId"}]}
Rules:
- Only match if the saved question means the same thing.
- Never invent an answer. Never rewrite an answer.
- If nothing is clearly the same, omit that question.
- savedId must be one of the provided saved answer ids.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            questions: questions.map((q) => ({
              id: q.id,
              question: q.label,
              description: q.description || "",
            })),
            savedAnswers: bank.map((row) => ({
              id: row.id,
              question: row.question,
              answer: row.answer,
            })),
          }),
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw) as { matches?: { id?: string; savedId?: string }[] };
    const byQuestion = new Map(questions.map((q) => [q.id, q]));
    const bySaved = new Map(bank.map((row) => [row.id, row]));
    const out: MappedAnswer[] = [];
    for (const match of parsed.matches || []) {
      const question = byQuestion.get(String(match.id || ""));
      const saved = bySaved.get(String(match.savedId || ""));
      if (!question || !saved?.answer) continue;
      out.push({
        ...question,
        value: pickOption(question.options, saved.answer),
        confidence: "high",
        source: "saved",
      });
    }
    return out;
  } catch {
    return [];
  }
}
