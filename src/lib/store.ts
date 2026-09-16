import {
  dbCreateApplication,
  dbCreateProfile,
  dbDeleteApplication,
  dbDeleteProfile,
  dbGetActiveProfileId,
  dbGetApplication,
  dbListApplications,
  dbListProfiles,
  dbReadProfile,
  dbSetActiveProfile,
  dbUpdateApplication,
  dbWriteProfile,
  profileHasResume,
} from "@/lib/database";
import {
  dedupeAnswers,
  deleteAnswer,
  findExistingAnswer,
  importProfileAnswers,
  listAnswers,
  mergeLatestAnswers,
  pruneBareChoiceAnswersDb,
  replaceAnswersForProfile,
  upsertAnswer,
} from "@/lib/answers-db";
import { defaultProfile, newId, type Application, type Education, type Experience, type Profile, type SavedAnswer } from "@/lib/store-types";

export type { Application, Education, Experience, Profile, SavedAnswer };
export { defaultProfile, newId };

function yesNo(value: string) {
  return value === "no" ? "No" : "Yes";
}

export function defaultAnswersFromProfile(profile: Profile) {
  const rows: { question: string; answer: string; source: string }[] = [];
  const add = (question: string, answer: string) => {
    if (!answer.trim()) return;
    rows.push({ question, answer: answer.trim(), source: "profile" });
  };
  add("Do you currently reside in the US?", yesNo(profile.residesInUs || "yes"));
  if (profile.workAuthorizedUs) add("Are you authorized to work in the United States?", yesNo(profile.workAuthorizedUs));
  if (profile.requiresSponsorship) {
    add("Will you now or in the future require sponsorship?", yesNo(profile.requiresSponsorship));
  }
  if (profile.willingToRelocate) add("Are you willing to relocate?", yesNo(profile.willingToRelocate));
  if (profile.howHeard) add("How did you hear about this job?", profile.howHeard);
  if (profile.salaryAmount) {
    add(
      "What are your salary expectations?",
      `${profile.salaryAmount}${profile.salaryPeriod ? ` per ${profile.salaryPeriod}` : ""}`,
    );
  }
  if (profile.availableStartDate) add("When can you start?", profile.availableStartDate);
  if (profile.currentCompany) add("What is your current company?", profile.currentCompany);
  if (profile.currentTitle) add("What is your current title?", profile.currentTitle);
  return rows;
}

async function syncDefaultAnswers(profile: Profile) {
  const bank = await listAnswers(profile.id);
  for (const row of defaultAnswersFromProfile(profile)) {
    if (findExistingAnswer(row.question, bank)) continue;
    try {
      await upsertAnswer({
        profileId: profile.id,
        question: row.question,
        answer: row.answer,
        source: "profile",
      });
    } catch {
      /* ignore */
    }
  }
  await dedupeAnswers(profile.id);
}

export async function listProfiles() {
  return dbListProfiles();
}

export async function getActiveProfileId() {
  return dbGetActiveProfileId();
}

export async function readProfile(id?: string): Promise<Profile> {
  const profile = await dbReadProfile(id);
  const dbAnswers = await listAnswers(profile.id);
  profile.answers = dbAnswers.map((row) => ({
    id: row.id,
    question: row.question,
    answer: row.answer,
    source: row.source,
    createdAt: row.updatedAt,
  }));
  return profile;
}

export async function writeProfile(profile: Profile, opts?: { replaceAnswers?: boolean }) {
  if (opts?.replaceAnswers) {
    profile.answers = mergeLatestAnswers([
      ...(profile.answers || []),
      ...defaultAnswersFromProfile(profile),
    ]).map((row) => ({
      id: "id" in row ? String((row as { id?: string }).id || "") : "",
      question: row.question,
      answer: row.answer,
      source: "source" in row ? String((row as { source?: string }).source || "profile") : "profile",
      createdAt: new Date().toISOString(),
    }));
  }
  await dbWriteProfile(profile);
  if (opts?.replaceAnswers) {
    await replaceAnswersForProfile(profile.id, profile.answers);
  } else {
    await importProfileAnswers([profile]);
    await syncDefaultAnswers(profile);
  }
}

export async function createProfile(name = "New profile") {
  const profile = await dbCreateProfile(name);
  await syncDefaultAnswers(profile);
  return readProfile(profile.id);
}

export async function deleteProfile(id: string) {
  await dbDeleteProfile(id);
}

export async function setActiveProfile(id: string) {
  const profiles = await listProfiles();
  if (!profiles.some((p) => p.id === id)) throw new Error("Profile not found.");
  await dbSetActiveProfile(id);
}

export function profileSummary(profile: Profile) {
  return {
    id: profile.id,
    name: profile.name || `${profile.firstName} ${profile.lastName}`.trim() || "Untitled",
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email,
    currentTitle: profile.currentTitle,
    hasResume: profileHasResume(profile),
    hasTailoredResume: Boolean(profile.tailoredResumePath),
    updatedAt: profile.updatedAt,
  };
}

export function resumeDownloadName(profile: Profile, ext: string) {
  const first = (profile.firstName || "resume").replace(/[^\w]+/g, "");
  const last = (profile.lastName || "").replace(/[^\w]+/g, "");
  const suffix = ext.startsWith(".") ? ext : `.${ext || "pdf"}`;
  return last ? `${first}_${last}${suffix}` : `${first}${suffix}`;
}

export async function listApplications() {
  return (await dbListApplications()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getApplication(id: string) {
  return dbGetApplication(id);
}

export async function createApplication(data: Partial<Application>) {
  return dbCreateApplication(data);
}

export async function updateApplication(id: string, data: Record<string, unknown>) {
  return dbUpdateApplication(id, data);
}

export async function deleteApplication(id: string) {
  await dbDeleteApplication(id);
}

function normQuestion(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export async function upsertSavedAnswer(profileId: string, question: string, answer: string, source = "extension") {
  const saved = await upsertAnswer({ profileId, question, answer, source });
  return {
    id: saved.id,
    question: saved.question,
    answer: saved.answer,
    source: saved.source,
    createdAt: saved.updatedAt,
  };
}

export async function deleteSavedAnswer(profileId: string, answerId: string) {
  await deleteAnswer(profileId, answerId);
}

export async function pruneBareChoiceAnswers() {
  await pruneBareChoiceAnswersDb();
  await dedupeAnswers();
}

export async function listAllSavedAnswers() {
  const names = new Map(
    (await listProfiles()).map((profile) => [
      profile.id,
      profile.name || `${profile.firstName} ${profile.lastName}`.trim() || "Profile",
    ]),
  );
  return (await listAnswers())
    .map((row) => ({
      id: row.id,
      question: row.question,
      answer: row.answer,
      source: row.source || "saved",
      createdAt: row.updatedAt || row.createdAt,
      profileId: row.profileId,
      profileName: names.get(row.profileId) || "Profile",
    }))
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export async function listAskedApplicationQuestions() {
  const saved = new Set((await listAllSavedAnswers()).map((row) => normQuestion(row.question)));
  const rows: {
    question: string;
    answer: string;
    company: string;
    title: string;
    applicationId: string;
    createdAt: string;
    saved: boolean;
  }[] = [];
  for (const app of await listApplications()) {
    let questions: { label?: string; question?: string; value?: string; answer?: string }[] = [];
    try {
      questions = JSON.parse(app.questions || "[]");
    } catch {
      questions = [];
    }
    if (!questions.length) {
      try {
        questions = JSON.parse(app.mappedAnswers || "[]");
      } catch {
        questions = [];
      }
    }
    for (const q of questions) {
      const question = String(q.label || q.question || "").trim();
      if (!question || question.length < 8) continue;
      if (/^(first name|last name|preferred|email|phone|country|city|state|linkedin|resume)/i.test(question)) continue;
      rows.push({
        question,
        answer: String(q.value || q.answer || "").trim(),
        company: app.company || "",
        title: app.title || "",
        applicationId: app.id,
        createdAt: app.updatedAt,
        saved: saved.has(normQuestion(question)),
      });
    }
  }
  return rows;
}
