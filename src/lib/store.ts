import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { appDataDir } from "@/lib/paths";
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

export type Experience = {
  id: string;
  company: string;
  title: string;
  location: string;
  startMonth: string;
  startYear: string;
  endMonth: string;
  endYear: string;
  current: boolean;
  description: string;
  sortOrder: number;
};

export type Education = {
  id: string;
  school: string;
  degree: string;
  discipline: string;
  startYear: string;
  endYear: string;
  current: boolean;
  sortOrder: number;
};

export type SavedAnswer = {
  id: string;
  question: string;
  answer: string;
  source?: string;
  createdAt?: string;
};

export type Profile = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  preferredName: string;
  pronouns: string;
  email: string;
  phone: string;
  phoneCountry: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  locationLine: string;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
  websiteUrl: string;
  currentCompany: string;
  currentTitle: string;
  workAuthorizedUs: string;
  residesInUs: string;
  requiresSponsorship: string;
  salaryAmount: string;
  salaryCurrency: string;
  salaryPeriod: string;
  howHeard: string;
  coverLetter: string;
  additionalInfo: string;
  resumePath: string;
  resumeText: string;
  resumeFileName: string;
  tailoredResumePath: string;
  coverLetterPath: string;
  gender: string;
  race: string;
  disability: string;
  veteran: string;
  willingToRelocate: string;
  availableStartDate: string;
  formerEmployee: string;
  relativesAtCompany: string;
  autoSubmit: boolean;
  headedBrowser: boolean;
  fillAndSubmit: boolean;
  experiences: Experience[];
  educations: Education[];
  answers: SavedAnswer[];
  updatedAt: string;
};

export type Application = {
  id: string;
  profileId: string;
  jobUrl: string;
  applyUrl: string;
  ats: string;
  company: string;
  title: string;
  location: string;
  status: string;
  questions: string;
  mappedAnswers: string;
  logs: string;
  error: string | null;
  confirmationUrl: string | null;
  confirmationText: string | null;
  screenshotPath: string | null;
  createdAt: string;
  updatedAt: string;
};

function dataDir() {
  return appDataDir();
}
const profileFile = () => path.join(dataDir(), "profile.json");
const profilesFile = () => path.join(dataDir(), "profiles.json");
const appsFile = () => path.join(dataDir(), "applications.json");

type ProfileStore = {
  activeId: string;
  profiles: Profile[];
};

function ensureDir() {
  fs.mkdirSync(dataDir(), { recursive: true });
}

export function defaultProfile(partial: Partial<Profile> = {}): Profile {
  return {
    id: partial.id || crypto.randomUUID(),
    name: partial.name || "Profile",
    firstName: "",
    lastName: "",
    preferredName: "",
    pronouns: "",
    email: "",
    phone: "",
    phoneCountry: "United States",
    street: "",
    city: "",
    state: "",
    postalCode: "",
    country: "United States",
    locationLine: "",
    linkedinUrl: "",
    githubUrl: "",
    portfolioUrl: "",
    websiteUrl: "",
    currentCompany: "",
    currentTitle: "",
    workAuthorizedUs: "yes",
    residesInUs: "yes",
    requiresSponsorship: "no",
    salaryAmount: "",
    salaryCurrency: "USD",
    salaryPeriod: "year",
    howHeard: "LinkedIn",
    coverLetter: "",
    additionalInfo: "",
    resumePath: "",
    resumeText: "",
    resumeFileName: "",
    tailoredResumePath: "",
    coverLetterPath: "",
    gender: "decline",
    race: "decline",
    disability: "decline",
    veteran: "decline",
    willingToRelocate: "no",
    availableStartDate: "",
    formerEmployee: "no",
    relativesAtCompany: "no",
    autoSubmit: false,
    headedBrowser: true,
    fillAndSubmit: false,
    experiences: [],
    educations: [],
    answers: [],
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

function readProfileStore(): ProfileStore {
  try {
    return loadProfileStore();
  } catch {
    const profile = defaultProfile({ name: "Default profile" });
    return { activeId: profile.id, profiles: [profile] };
  }
}

function loadProfileStore(): ProfileStore {
  ensureDir();
  let store: ProfileStore;
  if (fs.existsSync(profilesFile())) {
    const raw = JSON.parse(fs.readFileSync(profilesFile(), "utf8")) as ProfileStore;
    const profiles = (raw.profiles || []).map((p) => defaultProfile(p));
    const activeId =
      raw.activeId && profiles.some((p) => p.id === raw.activeId)
        ? raw.activeId
        : profiles[0]?.id;
    if (!profiles.length) {
      const profile = defaultProfile({ name: "Default profile" });
      store = { activeId: profile.id, profiles: [profile] };
      writeProfileStore(store);
    } else {
      store = { activeId: activeId || profiles[0].id, profiles };
    }
  } else if (fs.existsSync(profileFile())) {
    const old = JSON.parse(fs.readFileSync(profileFile(), "utf8")) as Profile;
    const profile = defaultProfile({
      ...old,
      id: old.id || "me",
      name: `${old.firstName || "Default"} ${old.lastName || "profile"}`.trim(),
    });
    store = { activeId: profile.id, profiles: [profile] };
    writeProfileStore(store);
  } else {
    const profile = defaultProfile({ name: "Default profile" });
    store = { activeId: profile.id, profiles: [profile] };
    writeProfileStore(store);
  }
  migrateAnswersOnce(store.profiles);
  return store;
}

function writeProfileStore(store: ProfileStore) {
  ensureDir();
  fs.writeFileSync(profilesFile(), JSON.stringify(store, null, 2));
}

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

function syncDefaultAnswers(profile: Profile) {
  const bank = listAnswers(profile.id);
  for (const row of defaultAnswersFromProfile(profile)) {
    if (findExistingAnswer(row.question, bank)) continue;
    try {
      upsertAnswer({
        profileId: profile.id,
        question: row.question,
        answer: row.answer,
        source: "profile",
      });
    } catch {
      /* ignore */
    }
  }
  dedupeAnswers(profile.id);
}

let answersMigrated = false;
function migrateAnswersOnce(profiles: Profile[]) {
  if (answersMigrated) return;
  answersMigrated = true;
  try {
    importProfileAnswers(profiles);
    pruneBareChoiceAnswersDb();
    for (const profile of profiles) syncDefaultAnswers(profile);
    dedupeAnswers();
  } catch {
    /* storage can be unavailable on the first serverless boot */
  }
}

export function listProfiles() {
  return readProfileStore().profiles;
}

export function getActiveProfileId() {
  return readProfileStore().activeId;
}

export function readProfile(id?: string): Profile {
  const store = readProfileStore();
  const found = store.profiles.find((p) => p.id === (id || store.activeId));
  const profile = found || store.profiles[0];
  const dbAnswers = listAnswers(profile.id);
  profile.answers = dbAnswers.map((row) => ({
    id: row.id,
    question: row.question,
    answer: row.answer,
    source: row.source,
    createdAt: row.updatedAt,
  }));
  return profile;
}

export function writeProfile(profile: Profile, opts?: { replaceAnswers?: boolean }) {
  const store = readProfileStore();
  profile.updatedAt = new Date().toISOString();
  if (!profile.name) {
    profile.name = `${profile.firstName} ${profile.lastName}`.trim() || "Profile";
  }
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
  const index = store.profiles.findIndex((p) => p.id === profile.id);
  if (index >= 0) store.profiles[index] = defaultProfile(profile);
  else store.profiles.push(defaultProfile(profile));
  writeProfileStore(store);
  if (opts?.replaceAnswers) {
    replaceAnswersForProfile(profile.id, profile.answers);
  } else {
    importProfileAnswers([profile]);
    syncDefaultAnswers(profile);
  }
}

export function createProfile(name = "New profile") {
  const store = readProfileStore();
  const profile = defaultProfile({ name });
  store.profiles.push(profile);
  store.activeId = profile.id;
  writeProfileStore(store);
  syncDefaultAnswers(profile);
  return profile;
}

export function deleteProfile(id: string) {
  const store = readProfileStore();
  if (store.profiles.length <= 1) {
    throw new Error("Keep at least one profile.");
  }
  store.profiles = store.profiles.filter((p) => p.id !== id);
  if (store.activeId === id) store.activeId = store.profiles[0].id;
  writeProfileStore(store);
}

export function setActiveProfile(id: string) {
  const store = readProfileStore();
  if (!store.profiles.some((p) => p.id === id)) {
    throw new Error("Profile not found.");
  }
  store.activeId = id;
  writeProfileStore(store);
}

export function profileSummary(profile: Profile) {
  return {
    id: profile.id,
    name: profile.name || `${profile.firstName} ${profile.lastName}`.trim() || "Untitled",
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email,
    currentTitle: profile.currentTitle,
    hasResume: Boolean(profile.resumePath),
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

function readApps(): Application[] {
  ensureDir();
  if (!fs.existsSync(appsFile())) {
    fs.writeFileSync(appsFile(), "[]");
    return [];
  }
  return JSON.parse(fs.readFileSync(appsFile(), "utf8"));
}

function writeApps(apps: Application[]) {
  ensureDir();
  fs.writeFileSync(appsFile(), JSON.stringify(apps, null, 2));
}

export function listApplications() {
  return readApps().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getApplication(id: string) {
  return readApps().find((app) => app.id === id) || null;
}

export function createApplication(data: Partial<Application>) {
  const apps = readApps();
  const now = new Date().toISOString();
  const app: Application = {
    id: crypto.randomUUID(),
    profileId: "",
    jobUrl: "",
    applyUrl: "",
    ats: "unknown",
    company: "",
    title: "",
    location: "",
    status: "queued",
    questions: "[]",
    mappedAnswers: "[]",
    logs: "[]",
    error: null,
    confirmationUrl: null,
    confirmationText: null,
    screenshotPath: null,
    createdAt: now,
    updatedAt: now,
    ...data,
  };
  apps.unshift(app);
  writeApps(apps);
  return app;
}

export function updateApplication(id: string, data: Record<string, unknown>) {
  const apps = readApps();
  const index = apps.findIndex((app) => app.id === id);
  if (index < 0) return null;
  apps[index] = {
    ...apps[index],
    ...data,
    updatedAt: new Date().toISOString(),
  } as Application;
  writeApps(apps);
  return apps[index];
}

export function deleteApplication(id: string) {
  writeApps(readApps().filter((app) => app.id !== id));
}

export function newId() {
  return crypto.randomUUID();
}

function normQuestion(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function upsertSavedAnswer(
  profileId: string,
  question: string,
  answer: string,
  source = "extension",
) {
  const saved = upsertAnswer({ profileId, question, answer, source });
  const profile = readProfile(profileId);
  const match = profile.answers.find((row) => normQuestion(row.question) === normQuestion(saved.question));
  if (match) {
    match.id = saved.id;
    match.answer = saved.answer;
    match.source = saved.source;
    match.createdAt = saved.updatedAt;
  } else {
    profile.answers.push({
      id: saved.id,
      question: saved.question,
      answer: saved.answer,
      source: saved.source,
      createdAt: saved.updatedAt,
    });
  }
  writeProfile(profile);
  return {
    id: saved.id,
    question: saved.question,
    answer: saved.answer,
    source: saved.source,
    createdAt: saved.updatedAt,
  };
}

export function deleteSavedAnswer(profileId: string, answerId: string) {
  deleteAnswer(profileId, answerId);
  const profile = readProfile(profileId);
  profile.answers = profile.answers.filter((row) => row.id !== answerId);
  writeProfile(profile);
}

export function pruneBareChoiceAnswers() {
  pruneBareChoiceAnswersDb();
  dedupeAnswers();
  for (const profile of listProfiles()) {
    const next = (profile.answers || []).filter(
      (row) => !/^(yes|no|true|false|y|n)$/i.test((row.question || "").trim()),
    );
    if (next.length !== (profile.answers || []).length) {
      profile.answers = next;
      writeProfile(profile);
    }
  }
}

export function listAllSavedAnswers() {
  const names = new Map(
    listProfiles().map((profile) => [
      profile.id,
      profile.name || `${profile.firstName} ${profile.lastName}`.trim() || "Profile",
    ]),
  );
  return listAnswers()
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

export function listAskedApplicationQuestions() {
  const saved = new Set(listAllSavedAnswers().map((row) => normQuestion(row.question)));
  const rows: {
    question: string;
    answer: string;
    company: string;
    title: string;
    applicationId: string;
    createdAt: string;
    saved: boolean;
  }[] = [];
  for (const app of listApplications()) {
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
