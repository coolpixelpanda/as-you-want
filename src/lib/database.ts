import crypto from "node:crypto";
import { usesPostgres, getPrisma } from "@/lib/prisma";
import {
  all,
  getDb,
  getMeta,
  loadProfileBlob as loadSqliteBlob,
  one,
  putMeta,
  run,
  saveProfileBlob as saveSqliteBlob,
  type StoredFile,
} from "@/lib/db";
import {
  defaultProfile,
  type Application,
  type Education,
  type Experience,
  type Profile,
  type SavedAnswer,
} from "@/lib/store-types";
import {
  jsonDeleteAnswer,
  jsonDeleteApplication,
  jsonDeleteProfile,
  jsonGetActiveProfileId,
  jsonListAnswers,
  jsonListApplications,
  jsonListProfiles,
  jsonLoadBlob,
  jsonSaveBlob,
  jsonSetActiveProfile,
  jsonUpsertAnswer,
  jsonWriteApplication,
  jsonWriteProfile,
} from "@/lib/json-store";

export { usesPostgres };
export type { StoredFile };

export function usesJsonStore() {
  return Boolean(process.env.VERCEL) && !usesPostgres();
}

export function storageMode() {
  if (usesPostgres()) return "postgres";
  if (usesJsonStore()) return "json";
  return "sqlite";
}

export async function ensureStorage() {
  if (usesPostgres()) {
    getPrisma();
    return;
  }
  if (usesJsonStore()) {
    jsonListProfiles();
    return;
  }
  getDb();
}

function asExperience(item: Record<string, unknown>, index: number): Experience {
  return {
    id: String(item.id || crypto.randomUUID()),
    company: String(item.company || ""),
    title: String(item.title || ""),
    location: String(item.location || ""),
    startMonth: String(item.startMonth ?? item.start_month ?? ""),
    startYear: String(item.startYear ?? item.start_year ?? ""),
    endMonth: String(item.endMonth ?? item.end_month ?? ""),
    endYear: String(item.endYear ?? item.end_year ?? ""),
    current: Boolean(item.current),
    description: String(item.description || ""),
    sortOrder: Number(item.sortOrder ?? item.sort_order ?? index),
  };
}

function asEducation(item: Record<string, unknown>, index: number): Education {
  return {
    id: String(item.id || crypto.randomUUID()),
    school: String(item.school || ""),
    degree: String(item.degree || ""),
    discipline: String(item.discipline || ""),
    startYear: String(item.startYear ?? item.start_year ?? ""),
    endYear: String(item.endYear ?? item.end_year ?? ""),
    current: Boolean(item.current),
    sortOrder: Number(item.sortOrder ?? item.sort_order ?? index),
  };
}

function asAnswer(item: Record<string, unknown>): SavedAnswer {
  return {
    id: String(item.id || crypto.randomUUID()),
    question: String(item.question || ""),
    answer: String(item.answer || ""),
    source: String(item.source || "profile"),
    createdAt: String(item.updatedAt ?? item.updated_at ?? item.createdAt ?? item.created_at ?? ""),
  };
}

function asProfile(row: Record<string, unknown>, experiences: Experience[], educations: Education[], answers: SavedAnswer[]): Profile {
  return defaultProfile({
    id: String(row.id || ""),
    name: String(row.name || "Profile"),
    firstName: String(row.first_name ?? row.firstName ?? ""),
    lastName: String(row.last_name ?? row.lastName ?? ""),
    preferredName: String(row.preferred_name ?? row.preferredName ?? ""),
    pronouns: String(row.pronouns || ""),
    email: String(row.email || ""),
    phone: String(row.phone || ""),
    phoneCountry: String(row.phone_country ?? row.phoneCountry ?? "United States"),
    street: String(row.street || ""),
    city: String(row.city || ""),
    state: String(row.state || ""),
    postalCode: String(row.postal_code ?? row.postalCode ?? ""),
    country: String(row.country || "United States"),
    locationLine: String(row.location_line ?? row.locationLine ?? ""),
    linkedinUrl: String(row.linkedin_url ?? row.linkedinUrl ?? ""),
    githubUrl: String(row.github_url ?? row.githubUrl ?? ""),
    portfolioUrl: String(row.portfolio_url ?? row.portfolioUrl ?? ""),
    websiteUrl: String(row.website_url ?? row.websiteUrl ?? ""),
    currentCompany: String(row.current_company ?? row.currentCompany ?? ""),
    currentTitle: String(row.current_title ?? row.currentTitle ?? ""),
    workAuthorizedUs: String(row.work_authorized_us ?? row.workAuthorizedUs ?? "yes"),
    residesInUs: String(row.resides_in_us ?? row.residesInUs ?? "yes"),
    requiresSponsorship: String(row.requires_sponsorship ?? row.requiresSponsorship ?? "no"),
    salaryAmount: String(row.salary_amount ?? row.salaryAmount ?? ""),
    salaryCurrency: String(row.salary_currency ?? row.salaryCurrency ?? "USD"),
    salaryPeriod: String(row.salary_period ?? row.salaryPeriod ?? "year"),
    howHeard: String(row.how_heard ?? row.howHeard ?? "LinkedIn"),
    coverLetter: String(row.cover_letter ?? row.coverLetter ?? ""),
    additionalInfo: String(row.additional_info ?? row.additionalInfo ?? ""),
    resumePath: String(row.resume_path ?? row.resumePath ?? ""),
    resumeText: String(row.resume_text ?? row.resumeText ?? ""),
    resumeFileName: String(row.resume_file_name ?? row.resumeFileName ?? ""),
    tailoredResumePath: String(row.tailored_resume_path ?? row.tailoredResumePath ?? ""),
    coverLetterPath: String(row.cover_letter_path ?? row.coverLetterPath ?? ""),
    gender: String(row.gender || "decline"),
    race: String(row.race || "decline"),
    disability: String(row.disability || "decline"),
    veteran: String(row.veteran || "decline"),
    willingToRelocate: String(row.willing_to_relocate ?? row.willingToRelocate ?? "no"),
    availableStartDate: String(row.available_start_date ?? row.availableStartDate ?? ""),
    formerEmployee: String(row.former_employee ?? row.formerEmployee ?? "no"),
    relativesAtCompany: String(row.relatives_at_company ?? row.relativesAtCompany ?? "no"),
    autoSubmit: Boolean(row.auto_submit ?? row.autoSubmit),
    headedBrowser: row.headed_browser === 0 || row.headedBrowser === false ? false : true,
    fillAndSubmit: Boolean(row.fill_and_submit ?? row.fillAndSubmit),
    experiences,
    educations,
    answers,
    updatedAt: String(row.updated_at ?? row.updatedAt ?? new Date().toISOString()),
  });
}

function hasResume(row: { resumePath?: string; resumeFileId?: string; resume_path?: string; resume_file_id?: string }) {
  return Boolean(row.resumePath || row.resume_path || row.resumeFileId || row.resume_file_id);
}

export async function dbListProfiles(): Promise<Profile[]> {
  await ensureStorage();
  if (usesJsonStore()) return jsonListProfiles();
  if (usesPostgres()) {
    const rows = await getPrisma().profile.findMany({
      include: { experiences: { orderBy: { sortOrder: "asc" } }, educations: { orderBy: { sortOrder: "asc" } }, answers: true },
      orderBy: { updatedAt: "desc" },
    });
    return rows.map((row: { experiences: Record<string, unknown>[]; educations: Record<string, unknown>[]; answers: Record<string, unknown>[] } & Record<string, unknown>) =>
      asProfile(
        row,
        row.experiences.map((item, index) => asExperience(item, index)),
        row.educations.map((item, index) => asEducation(item, index)),
        row.answers.map((item) => asAnswer(item)),
      ),
    );
  }
  const profiles = all("SELECT * FROM profiles ORDER BY updated_at DESC");
  return profiles.map((row) => hydrateSqliteProfile(row));
}

function hydrateSqliteProfile(row: Record<string, unknown>): Profile {
  const id = String(row.id);
  const experiences = all(
    "SELECT * FROM experiences WHERE profile_id = ? ORDER BY sort_order ASC",
    id,
  ).map((item, index) => asExperience(item, index));
  const educations = all(
    "SELECT * FROM educations WHERE profile_id = ? ORDER BY sort_order ASC",
    id,
  ).map((item, index) => asEducation(item, index));
  const answers = all(
    "SELECT * FROM saved_answers WHERE profile_id = ? ORDER BY updated_at DESC",
    id,
  ).map((item) => asAnswer(item));
  return asProfile(row, experiences, educations, answers);
}

export async function dbGetActiveProfileId(): Promise<string> {
  if (usesJsonStore()) {
    const profiles = jsonListProfiles();
    const active = jsonGetActiveProfileId();
    if (active && profiles.some((row) => row.id === active)) return active;
    jsonSetActiveProfile(profiles[0].id);
    return profiles[0].id;
  }
  const profiles = await dbListProfiles();
  if (!profiles.length) {
    const created = await dbCreateProfile("Default profile");
    return created.id;
  }
  if (usesPostgres()) {
    const meta = await getPrisma().appMeta.findUnique({ where: { key: "active_profile_id" } });
    if (meta?.value && profiles.some((row) => row.id === meta.value)) return meta.value;
  } else {
    const active = getMeta("active_profile_id");
    if (active && profiles.some((row) => row.id === active)) return active;
  }
  await dbSetActiveProfile(profiles[0].id);
  return profiles[0].id;
}

export async function dbSetActiveProfile(id: string) {
  await ensureStorage();
  if (usesJsonStore()) {
    jsonSetActiveProfile(id);
    return;
  }
  if (usesPostgres()) {
    await getPrisma().appMeta.upsert({
      where: { key: "active_profile_id" },
      update: { value: id },
      create: { key: "active_profile_id", value: id },
    });
    return;
  }
  putMeta("active_profile_id", id);
}

export async function dbReadProfile(id?: string): Promise<Profile> {
  const profiles = await dbListProfiles();
  if (id) {
    const found = profiles.find((row) => row.id === id);
    if (!found) {
      const error = new Error("PROFILE_NOT_FOUND");
      error.name = "ProfileNotFound";
      throw error;
    }
    return found;
  }
  const activeId = await dbGetActiveProfileId();
  return profiles.find((row) => row.id === activeId) || profiles[0];
}

export async function dbEnsureProfile(id: string, name = "New profile"): Promise<Profile> {
  const profiles = await dbListProfiles();
  const found = profiles.find((row) => row.id === id);
  if (found) return found;
  const profile = defaultProfile({ id, name });
  await dbWriteProfile(profile);
  await dbSetActiveProfile(profile.id);
  return dbReadProfile(profile.id);
}

export async function dbCreateProfile(name = "New profile"): Promise<Profile> {
  const profile = defaultProfile({ name });
  await dbWriteProfile(profile);
  await dbSetActiveProfile(profile.id);
  return dbReadProfile(profile.id);
}

export async function dbDeleteProfile(id: string) {
  await ensureStorage();
  const profiles = await dbListProfiles();
  if (!profiles.some((row) => row.id === id)) return;
  const remaining = profiles.filter((row) => row.id !== id);
  if (!remaining.length) {
    const blank = defaultProfile({ name: "New profile" });
    await dbWriteProfile(blank);
    await dbSetActiveProfile(blank.id);
  }
  if (usesJsonStore()) {
    jsonDeleteProfile(id);
  } else if (usesPostgres()) {
    await getPrisma().savedAnswer.deleteMany({ where: { profileId: id } });
    await getPrisma().experience.deleteMany({ where: { profileId: id } });
    await getPrisma().education.deleteMany({ where: { profileId: id } });
    await getPrisma().storedFile.deleteMany({ where: { profileId: id } });
    await getPrisma().profile.delete({ where: { id } });
  } else {
    run("DELETE FROM saved_answers WHERE profile_id = ?", id);
    run("DELETE FROM experiences WHERE profile_id = ?", id);
    run("DELETE FROM educations WHERE profile_id = ?", id);
    run("DELETE FROM files WHERE profile_id = ?", id);
    run("DELETE FROM profiles WHERE id = ?", id);
  }
  const next = (await dbListProfiles()).filter((row) => row.id !== id);
  if (!next.length) {
    const blank = defaultProfile({ name: "New profile" });
    await dbWriteProfile(blank);
    await dbSetActiveProfile(blank.id);
    return;
  }
  const active = await dbGetActiveProfileId();
  if (active === id || !next.some((row) => row.id === active)) await dbSetActiveProfile(next[0].id);
}

export async function dbWriteProfile(profile: Profile) {
  await ensureStorage();
  if (usesJsonStore()) {
    jsonWriteProfile(profile);
    return;
  }
  const now = new Date().toISOString();
  profile.updatedAt = now;
  if (!profile.name) profile.name = `${profile.firstName} ${profile.lastName}`.trim() || "Profile";
  const experiences = profile.experiences || [];
  const educations = profile.educations || [];

  if (usesPostgres()) {
    const prisma = getPrisma();
    await prisma.$transaction(async (tx) => {
      const data = prismaProfileData(profile, now);
      const { createdAt, ...updateData } = data;
      await tx.profile.upsert({
        where: { id: profile.id },
        create: data,
        update: updateData,
      });
      await tx.experience.deleteMany({ where: { profileId: profile.id } });
      if (experiences.length) {
        await tx.experience.createMany({
          data: experiences.map((row, index) => ({
            id: row.id || crypto.randomUUID(),
            profileId: profile.id,
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
          })),
        });
      }
      await tx.education.deleteMany({ where: { profileId: profile.id } });
      if (educations.length) {
        await tx.education.createMany({
          data: educations.map((row, index) => ({
            id: row.id || crypto.randomUUID(),
            profileId: profile.id,
            school: row.school || "",
            degree: row.degree || "",
            discipline: row.discipline || "",
            startYear: row.startYear || "",
            endYear: row.endYear || "",
            current: Boolean(row.current),
            sortOrder: index,
          })),
        });
      }
    });
    return;
  }

  const existing = one("SELECT id FROM profiles WHERE id = ?", profile.id);
  const payload = sqliteProfileValues(profile, now);
  if (existing) {
    run(
      `UPDATE profiles SET
        name=?, first_name=?, last_name=?, preferred_name=?, pronouns=?, email=?, phone=?, phone_country=?,
        street=?, city=?, state=?, postal_code=?, country=?, location_line=?, linkedin_url=?, github_url=?, portfolio_url=?, website_url=?,
        current_company=?, current_title=?, work_authorized_us=?, resides_in_us=?, requires_sponsorship=?,
        salary_amount=?, salary_currency=?, salary_period=?, how_heard=?, cover_letter=?, additional_info=?,
        resume_path=?, resume_text=?, resume_file_name=?, tailored_resume_path=?, cover_letter_path=?,
        gender=?, race=?, disability=?, veteran=?, willing_to_relocate=?, available_start_date=?, former_employee=?, relatives_at_company=?,
        auto_submit=?, headed_browser=?, fill_and_submit=?, updated_at=?
      WHERE id=?`,
      ...payload,
      profile.id,
    );
  } else {
    run(
      `INSERT INTO profiles (
        id, name, first_name, last_name, preferred_name, pronouns, email, phone, phone_country,
        street, city, state, postal_code, country, location_line, linkedin_url, github_url, portfolio_url, website_url,
        current_company, current_title, work_authorized_us, resides_in_us, requires_sponsorship,
        salary_amount, salary_currency, salary_period, how_heard, cover_letter, additional_info,
        resume_path, resume_text, resume_file_name, tailored_resume_path, cover_letter_path,
        gender, race, disability, veteran, willing_to_relocate, available_start_date, former_employee, relatives_at_company,
        auto_submit, headed_browser, fill_and_submit, created_at, updated_at
      ) VALUES (${Array(48).fill("?").join(",")})`,
      profile.id,
      ...payload.slice(0, -1),
      now,
      now,
    );
  }
  run("DELETE FROM experiences WHERE profile_id = ?", profile.id);
  experiences.forEach((row, index) => {
    run(
      `INSERT INTO experiences (id, profile_id, company, title, location, start_month, start_year, end_month, end_year, current, description, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id || crypto.randomUUID(),
      profile.id,
      row.company || "",
      row.title || "",
      row.location || "",
      row.startMonth || "",
      row.startYear || "",
      row.endMonth || "",
      row.endYear || "",
      row.current ? 1 : 0,
      row.description || "",
      index,
    );
  });
  run("DELETE FROM educations WHERE profile_id = ?", profile.id);
  educations.forEach((row, index) => {
    run(
      `INSERT INTO educations (id, profile_id, school, degree, discipline, start_year, end_year, current, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id || crypto.randomUUID(),
      profile.id,
      row.school || "",
      row.degree || "",
      row.discipline || "",
      row.startYear || "",
      row.endYear || "",
      row.current ? 1 : 0,
      index,
    );
  });
}

function prismaProfileData(profile: Profile, now: string) {
  return {
    id: profile.id,
    name: profile.name,
    firstName: profile.firstName,
    lastName: profile.lastName,
    preferredName: profile.preferredName,
    pronouns: profile.pronouns,
    email: profile.email,
    phone: profile.phone,
    phoneCountry: profile.phoneCountry,
    street: profile.street,
    city: profile.city,
    state: profile.state,
    postalCode: profile.postalCode,
    country: profile.country,
    locationLine: profile.locationLine,
    linkedinUrl: profile.linkedinUrl,
    githubUrl: profile.githubUrl,
    portfolioUrl: profile.portfolioUrl,
    websiteUrl: profile.websiteUrl,
    currentCompany: profile.currentCompany,
    currentTitle: profile.currentTitle,
    workAuthorizedUs: profile.workAuthorizedUs,
    residesInUs: profile.residesInUs,
    requiresSponsorship: profile.requiresSponsorship,
    salaryAmount: profile.salaryAmount,
    salaryCurrency: profile.salaryCurrency,
    salaryPeriod: profile.salaryPeriod,
    howHeard: profile.howHeard,
    coverLetter: profile.coverLetter,
    additionalInfo: profile.additionalInfo,
    resumePath: profile.resumePath,
    resumeText: profile.resumeText,
    resumeFileName: profile.resumeFileName,
    tailoredResumePath: profile.tailoredResumePath,
    coverLetterPath: profile.coverLetterPath,
    gender: profile.gender,
    race: profile.race,
    disability: profile.disability,
    veteran: profile.veteran,
    willingToRelocate: profile.willingToRelocate,
    availableStartDate: profile.availableStartDate,
    formerEmployee: profile.formerEmployee,
    relativesAtCompany: profile.relativesAtCompany,
    autoSubmit: Boolean(profile.autoSubmit),
    headedBrowser: profile.headedBrowser !== false,
    fillAndSubmit: Boolean(profile.fillAndSubmit),
    createdAt: now,
    updatedAt: now,
  };
}

function sqliteProfileValues(profile: Profile, now: string) {
  return [
    profile.name,
    profile.firstName,
    profile.lastName,
    profile.preferredName,
    profile.pronouns,
    profile.email,
    profile.phone,
    profile.phoneCountry,
    profile.street,
    profile.city,
    profile.state,
    profile.postalCode,
    profile.country,
    profile.locationLine,
    profile.linkedinUrl,
    profile.githubUrl,
    profile.portfolioUrl,
    profile.websiteUrl,
    profile.currentCompany,
    profile.currentTitle,
    profile.workAuthorizedUs,
    profile.residesInUs,
    profile.requiresSponsorship,
    profile.salaryAmount,
    profile.salaryCurrency,
    profile.salaryPeriod,
    profile.howHeard,
    profile.coverLetter,
    profile.additionalInfo,
    profile.resumePath,
    profile.resumeText,
    profile.resumeFileName,
    profile.tailoredResumePath,
    profile.coverLetterPath,
    profile.gender,
    profile.race,
    profile.disability,
    profile.veteran,
    profile.willingToRelocate,
    profile.availableStartDate,
    profile.formerEmployee,
    profile.relativesAtCompany,
    profile.autoSubmit ? 1 : 0,
    profile.headedBrowser === false ? 0 : 1,
    profile.fillAndSubmit ? 1 : 0,
    now,
  ];
}

export async function dbListApplications(): Promise<Application[]> {
  await ensureStorage();
  if (usesJsonStore()) return jsonListApplications();
  if (usesPostgres()) {
    const rows = await getPrisma().application.findMany({ orderBy: { createdAt: "desc" } });
    return rows as Application[];
  }
  return all("SELECT * FROM applications ORDER BY created_at DESC").map(sqliteApp);
}

function sqliteApp(row: Record<string, unknown>): Application {
  return {
    id: String(row.id),
    profileId: String(row.profile_id || ""),
    jobUrl: String(row.job_url || ""),
    applyUrl: String(row.apply_url || ""),
    ats: String(row.ats || "unknown"),
    company: String(row.company || ""),
    title: String(row.title || ""),
    location: String(row.location || ""),
    status: String(row.status || "queued"),
    questions: String(row.questions || "[]"),
    mappedAnswers: String(row.mapped_answers || "[]"),
    logs: String(row.logs || "[]"),
    error: row.error == null ? null : String(row.error),
    confirmationUrl: row.confirmation_url == null ? null : String(row.confirmation_url),
    confirmationText: row.confirmation_text == null ? null : String(row.confirmation_text),
    screenshotPath: row.screenshot_path == null ? null : String(row.screenshot_path),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

export async function dbGetApplication(id: string): Promise<Application | null> {
  const apps = await dbListApplications();
  return apps.find((row) => row.id === id) || null;
}

export async function dbCreateApplication(data: Partial<Application>): Promise<Application> {
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
  await ensureStorage();
  if (usesJsonStore()) {
    jsonWriteApplication(app);
    return app;
  }
  if (usesPostgres()) {
    await getPrisma().application.create({ data: app });
    return app;
  }
  run(
    `INSERT INTO applications
      (id, profile_id, job_url, apply_url, ats, company, title, location, status, questions, mapped_answers, logs, error, confirmation_url, confirmation_text, screenshot_path, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    app.id,
    app.profileId,
    app.jobUrl,
    app.applyUrl,
    app.ats,
    app.company,
    app.title,
    app.location,
    app.status,
    app.questions,
    app.mappedAnswers,
    app.logs,
    app.error,
    app.confirmationUrl,
    app.confirmationText,
    app.screenshotPath,
    app.createdAt,
    app.updatedAt,
  );
  return app;
}

export async function dbUpdateApplication(id: string, data: Record<string, unknown>): Promise<Application | null> {
  const current = await dbGetApplication(id);
  if (!current) return null;
  const next = { ...current, ...data, updatedAt: new Date().toISOString() } as Application;
  await ensureStorage();
  if (usesJsonStore()) {
    jsonWriteApplication(next);
    return next;
  }
  if (usesPostgres()) {
    const { id: _id, ...rest } = next;
    await getPrisma().application.update({ where: { id }, data: rest });
    return next;
  }
  run(
    `UPDATE applications SET
      profile_id=?, job_url=?, apply_url=?, ats=?, company=?, title=?, location=?, status=?, questions=?, mapped_answers=?,
      logs=?, error=?, confirmation_url=?, confirmation_text=?, screenshot_path=?, updated_at=?
     WHERE id=?`,
    next.profileId,
    next.jobUrl,
    next.applyUrl,
    next.ats,
    next.company,
    next.title,
    next.location,
    next.status,
    next.questions,
    next.mappedAnswers,
    next.logs,
    next.error,
    next.confirmationUrl,
    next.confirmationText,
    next.screenshotPath,
    next.updatedAt,
    id,
  );
  return next;
}

export async function dbDeleteApplication(id: string) {
  await ensureStorage();
  if (usesJsonStore()) {
    jsonDeleteApplication(id);
    return;
  }
  if (usesPostgres()) {
    await getPrisma().application.delete({ where: { id } }).catch(() => undefined);
    return;
  }
  run("DELETE FROM applications WHERE id = ?", id);
}

export async function dbListAnswers(profileId?: string) {
  await ensureStorage();
  if (usesJsonStore()) return jsonListAnswers(profileId);
  if (usesPostgres()) {
    const rows = await getPrisma().savedAnswer.findMany({
      where: profileId ? { profileId } : undefined,
      orderBy: { updatedAt: "desc" },
    });
    return rows.map((row: { id: string; profileId: string; question: string; questionNorm: string; answer: string; source: string; createdAt: string; updatedAt: string }) => ({
      id: row.id,
      profileId: row.profileId,
      question: row.question,
      questionNorm: row.questionNorm,
      answer: row.answer,
      source: row.source,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }
  const rows = profileId
    ? all("SELECT * FROM saved_answers WHERE profile_id = ? ORDER BY updated_at DESC", profileId)
    : all("SELECT * FROM saved_answers ORDER BY updated_at DESC");
  return rows.map((row) => ({
    id: String(row.id),
    profileId: String(row.profile_id),
    question: String(row.question),
    questionNorm: String(row.question_norm),
    answer: String(row.answer),
    source: String(row.source || "extension"),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
}

export async function dbUpsertAnswer(row: {
  id?: string;
  profileId: string;
  question: string;
  questionNorm: string;
  answer: string;
  source: string;
  createdAt: string;
  updatedAt: string;
}) {
  await ensureStorage();
  if (usesJsonStore()) {
    jsonUpsertAnswer({
      id: row.id || crypto.randomUUID(),
      profileId: row.profileId,
      question: row.question,
      questionNorm: row.questionNorm,
      answer: row.answer,
      source: row.source,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
    return;
  }
  if (usesPostgres()) {
    await getPrisma().savedAnswer.upsert({
      where: { id: row.id || crypto.randomUUID() },
      update: {
        question: row.question,
        questionNorm: row.questionNorm,
        answer: row.answer,
        source: row.source,
        updatedAt: row.updatedAt,
      },
      create: {
        id: row.id || crypto.randomUUID(),
        profileId: row.profileId,
        question: row.question,
        questionNorm: row.questionNorm,
        answer: row.answer,
        source: row.source,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
    });
    return;
  }
  const existing = row.id ? one("SELECT id FROM saved_answers WHERE id = ?", row.id) : null;
  if (existing) {
    run(
      "UPDATE saved_answers SET question=?, question_norm=?, answer=?, source=?, updated_at=? WHERE id=?",
      row.question,
      row.questionNorm,
      row.answer,
      row.source,
      row.updatedAt,
      row.id,
    );
    return;
  }
  run(
    `INSERT INTO saved_answers (id, profile_id, question, question_norm, answer, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    row.id || crypto.randomUUID(),
    row.profileId,
    row.question,
    row.questionNorm,
    row.answer,
    row.source,
    row.createdAt,
    row.updatedAt,
  );
}

export async function dbDeleteAnswer(profileId: string, id: string) {
  await ensureStorage();
  if (usesJsonStore()) {
    jsonDeleteAnswer(profileId, id);
    return;
  }
  if (usesPostgres()) {
    await getPrisma().savedAnswer.deleteMany({ where: { id, profileId } });
    return;
  }
  run("DELETE FROM saved_answers WHERE profile_id = ? AND id = ?", profileId, id);
}

export async function dbSaveBlob(input: {
  profileId: string;
  kind: "resume" | "tailored" | "cover" | "screenshot";
  filename: string;
  bytes: Buffer;
}) {
  await ensureStorage();
  if (usesJsonStore()) return jsonSaveBlob(input);
  if (!usesPostgres()) {
    return saveSqliteBlob(input);
  }
  const prisma = getPrisma();
  const ext = input.filename.toLowerCase();
  const mime = ext.endsWith(".pdf")
    ? "application/pdf"
    : ext.endsWith(".docx")
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : ext.endsWith(".doc")
        ? "application/msword"
        : "application/octet-stream";
  await prisma.storedFile.deleteMany({ where: { profileId: input.profileId, kind: input.kind } });
  const saved = await prisma.storedFile.create({
    data: {
      id: crypto.randomUUID(),
      profileId: input.profileId,
      kind: input.kind,
      filename: input.filename,
      mime,
      bytes: input.bytes,
      createdAt: new Date().toISOString(),
    },
  });
  const virtualPath = `db://files/${saved.id}`;
  const column =
    input.kind === "resume"
      ? { resumeFileId: saved.id, resumePath: virtualPath, resumeFileName: input.filename }
      : input.kind === "tailored"
        ? { tailoredResumeFileId: saved.id, tailoredResumePath: virtualPath }
        : input.kind === "cover"
          ? { coverLetterFileId: saved.id, coverLetterPath: virtualPath }
          : {};
  if (Object.keys(column).length) {
    await prisma.profile.update({ where: { id: input.profileId }, data: column });
  }
  return { id: saved.id, path: virtualPath };
}

export async function dbLoadBlob(profileId: string, kind: string): Promise<StoredFile | null> {
  await ensureStorage();
  if (usesJsonStore()) return jsonLoadBlob(profileId, kind);
  if (!usesPostgres()) return loadSqliteBlob(profileId, kind);
  const row = await getPrisma().storedFile.findFirst({
    where: { profileId, kind },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return null;
  return {
    id: row.id,
    profileId: row.profileId,
    kind: row.kind,
    filename: row.filename,
    mime: row.mime,
    bytes: Buffer.from(row.bytes),
  };
}

export function profileHasResume(profile: Profile) {
  return hasResume(profile);
}
