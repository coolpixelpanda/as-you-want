import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { appDataDir } from "@/lib/paths";

export type SqlDatabase = {
  prepare: (sql: string) => {
    all: (...params: unknown[]) => Record<string, unknown>[];
    get: (...params: unknown[]) => Record<string, unknown> | undefined;
    run: (...params: unknown[]) => unknown;
  };
  exec: (sql: string) => void;
};

let db: SqlDatabase | null | undefined;

export function sqlitePath() {
  return path.join(appDataDir(), "joblink.sqlite");
}

export function getDb(): SqlDatabase {
  if (db) return db;
  fs.mkdirSync(appDataDir(), { recursive: true });
  const { DatabaseSync } = require("node:sqlite") as {
    DatabaseSync: new (file: string) => SqlDatabase;
  };
  const database = new DatabaseSync(sqlitePath());
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;
  `);
  database.exec(SCHEMA_SQL);
  db = database;
  migrateJsonOnce(database);
  return database;
}

export function run(sql: string, ...params: unknown[]) {
  getDb().prepare(sql).run(...params);
}

export function all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

export function one<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined;
}

export function withTransaction<T>(fn: () => T): T {
  const database = getDb();
  database.exec("BEGIN");
  try {
    const value = fn();
    database.exec("COMMIT");
    return value;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  preferred_name TEXT NOT NULL DEFAULT '',
  pronouns TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  phone_country TEXT NOT NULL DEFAULT 'United States',
  street TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT '',
  postal_code TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT 'United States',
  location_line TEXT NOT NULL DEFAULT '',
  linkedin_url TEXT NOT NULL DEFAULT '',
  github_url TEXT NOT NULL DEFAULT '',
  portfolio_url TEXT NOT NULL DEFAULT '',
  website_url TEXT NOT NULL DEFAULT '',
  current_company TEXT NOT NULL DEFAULT '',
  current_title TEXT NOT NULL DEFAULT '',
  work_authorized_us TEXT NOT NULL DEFAULT 'yes',
  resides_in_us TEXT NOT NULL DEFAULT 'yes',
  requires_sponsorship TEXT NOT NULL DEFAULT 'no',
  salary_amount TEXT NOT NULL DEFAULT '',
  salary_currency TEXT NOT NULL DEFAULT 'USD',
  salary_period TEXT NOT NULL DEFAULT 'year',
  how_heard TEXT NOT NULL DEFAULT 'LinkedIn',
  cover_letter TEXT NOT NULL DEFAULT '',
  additional_info TEXT NOT NULL DEFAULT '',
  resume_path TEXT NOT NULL DEFAULT '',
  resume_text TEXT NOT NULL DEFAULT '',
  resume_file_name TEXT NOT NULL DEFAULT '',
  tailored_resume_path TEXT NOT NULL DEFAULT '',
  cover_letter_path TEXT NOT NULL DEFAULT '',
  resume_file_id TEXT NOT NULL DEFAULT '',
  tailored_resume_file_id TEXT NOT NULL DEFAULT '',
  cover_letter_file_id TEXT NOT NULL DEFAULT '',
  gender TEXT NOT NULL DEFAULT 'decline',
  race TEXT NOT NULL DEFAULT 'decline',
  disability TEXT NOT NULL DEFAULT 'decline',
  veteran TEXT NOT NULL DEFAULT 'decline',
  willing_to_relocate TEXT NOT NULL DEFAULT 'no',
  available_start_date TEXT NOT NULL DEFAULT '',
  former_employee TEXT NOT NULL DEFAULT 'no',
  relatives_at_company TEXT NOT NULL DEFAULT 'no',
  auto_submit INTEGER NOT NULL DEFAULT 0,
  headed_browser INTEGER NOT NULL DEFAULT 1,
  fill_and_submit INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS experiences (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  company TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  start_month TEXT NOT NULL DEFAULT '',
  start_year TEXT NOT NULL DEFAULT '',
  end_month TEXT NOT NULL DEFAULT '',
  end_year TEXT NOT NULL DEFAULT '',
  current INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS educations (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  school TEXT NOT NULL DEFAULT '',
  degree TEXT NOT NULL DEFAULT '',
  discipline TEXT NOT NULL DEFAULT '',
  start_year TEXT NOT NULL DEFAULT '',
  end_year TEXT NOT NULL DEFAULT '',
  current INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS saved_answers (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  question TEXT NOT NULL,
  question_norm TEXT NOT NULL,
  answer TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'extension',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_answers_profile_norm
  ON saved_answers(profile_id, question_norm);

CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL DEFAULT '',
  job_url TEXT NOT NULL DEFAULT '',
  apply_url TEXT NOT NULL DEFAULT '',
  ats TEXT NOT NULL DEFAULT 'unknown',
  company TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'queued',
  questions TEXT NOT NULL DEFAULT '[]',
  mapped_answers TEXT NOT NULL DEFAULT '[]',
  logs TEXT NOT NULL DEFAULT '[]',
  error TEXT,
  confirmation_url TEXT,
  confirmation_text TEXT,
  screenshot_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes BLOB NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_files_profile_kind ON files(profile_id, kind);
`;

function meta(database: SqlDatabase, key: string) {
  return String(database.prepare("SELECT value FROM app_meta WHERE key = ?").get(key)?.value || "");
}

function setMeta(database: SqlDatabase, key: string, value: string) {
  database.prepare("INSERT INTO app_meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

function migrateJsonOnce(database: SqlDatabase) {
  if (meta(database, "json_imported") === "1") return;
  try {
    importJsonFiles(database);
    setMeta(database, "json_imported", "1");
  } catch {
    /* first boot can race with an empty data dir */
  }
}

function importJsonFiles(database: SqlDatabase) {
  const dir = appDataDir();
  const profilesFile = path.join(dir, "profiles.json");
  const profileFile = path.join(dir, "profile.json");
  const appsFile = path.join(dir, "applications.json");
  const answersFile = path.join(dir, "answers.json");

  const existing = database.prepare("SELECT COUNT(*) AS n FROM profiles").get() as { n?: number } | undefined;
  const count = Number(existing?.n || 0);
  if (count === 0) {
    let store: { activeId?: string; profiles?: Record<string, unknown>[] } | null = null;
    if (fs.existsSync(profilesFile)) {
      store = JSON.parse(fs.readFileSync(profilesFile, "utf8")) as { activeId?: string; profiles?: Record<string, unknown>[] };
    } else if (fs.existsSync(profileFile)) {
      const old = JSON.parse(fs.readFileSync(profileFile, "utf8")) as Record<string, unknown>;
      store = { activeId: String(old.id || "me"), profiles: [old] };
    }
    for (const raw of store?.profiles || []) {
      insertImportedProfile(database, raw);
    }
    if (store?.activeId) setMeta(database, "active_profile_id", String(store.activeId));
  }

  if (fs.existsSync(appsFile)) {
    const apps = JSON.parse(fs.readFileSync(appsFile, "utf8")) as Record<string, unknown>[];
    const insert = database.prepare(
      `INSERT OR IGNORE INTO applications
        (id, profile_id, job_url, apply_url, ats, company, title, location, status, questions, mapped_answers, logs, error, confirmation_url, confirmation_text, screenshot_path, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const app of apps) {
      insert.run(
        String(app.id || ""),
        String(app.profileId || ""),
        String(app.jobUrl || ""),
        String(app.applyUrl || ""),
        String(app.ats || "unknown"),
        String(app.company || ""),
        String(app.title || ""),
        String(app.location || ""),
        String(app.status || "queued"),
        String(app.questions || "[]"),
        String(app.mappedAnswers || "[]"),
        String(app.logs || "[]"),
        app.error == null ? null : String(app.error),
        app.confirmationUrl == null ? null : String(app.confirmationUrl),
        app.confirmationText == null ? null : String(app.confirmationText),
        app.screenshotPath == null ? null : String(app.screenshotPath),
        String(app.createdAt || new Date().toISOString()),
        String(app.updatedAt || new Date().toISOString()),
      );
    }
  }

  if (fs.existsSync(answersFile)) {
    const rows = JSON.parse(fs.readFileSync(answersFile, "utf8")) as Record<string, unknown>[];
    const insert = database.prepare(
      `INSERT OR IGNORE INTO saved_answers
        (id, profile_id, question, question_norm, answer, source, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const row of rows) {
      insert.run(
        String(row.id || ""),
        String(row.profileId || ""),
        String(row.question || ""),
        String(row.questionNorm || ""),
        String(row.answer || ""),
        String(row.source || "profile"),
        String(row.createdAt || new Date().toISOString()),
        String(row.updatedAt || new Date().toISOString()),
      );
    }
  }
}

function insertImportedProfile(database: SqlDatabase, raw: Record<string, unknown>) {
  const now = new Date().toISOString();
  const id = String(raw.id || crypto.randomUUID());
  database.prepare(
    `INSERT OR IGNORE INTO profiles (
      id, name, first_name, last_name, preferred_name, pronouns, email, phone, phone_country,
      street, city, state, postal_code, country, location_line, linkedin_url, github_url, portfolio_url, website_url,
      current_company, current_title, work_authorized_us, resides_in_us, requires_sponsorship,
      salary_amount, salary_currency, salary_period, how_heard, cover_letter, additional_info,
      resume_path, resume_text, resume_file_name, tailored_resume_path, cover_letter_path,
      gender, race, disability, veteran, willing_to_relocate, available_start_date, former_employee, relatives_at_company,
      auto_submit, headed_browser, fill_and_submit, created_at, updated_at
    ) VALUES (${Array(48).fill("?").join(",")})`,
  ).run(
    id,
    String(raw.name || "Profile"),
    String(raw.firstName || ""),
    String(raw.lastName || ""),
    String(raw.preferredName || ""),
    String(raw.pronouns || ""),
    String(raw.email || ""),
    String(raw.phone || ""),
    String(raw.phoneCountry || "United States"),
    String(raw.street || ""),
    String(raw.city || ""),
    String(raw.state || ""),
    String(raw.postalCode || ""),
    String(raw.country || "United States"),
    String(raw.locationLine || ""),
    String(raw.linkedinUrl || ""),
    String(raw.githubUrl || ""),
    String(raw.portfolioUrl || ""),
    String(raw.websiteUrl || ""),
    String(raw.currentCompany || ""),
    String(raw.currentTitle || ""),
    String(raw.workAuthorizedUs || "yes"),
    String(raw.residesInUs || "yes"),
    String(raw.requiresSponsorship || "no"),
    String(raw.salaryAmount || ""),
    String(raw.salaryCurrency || "USD"),
    String(raw.salaryPeriod || "year"),
    String(raw.howHeard || "LinkedIn"),
    String(raw.coverLetter || ""),
    String(raw.additionalInfo || ""),
    String(raw.resumePath || ""),
    String(raw.resumeText || ""),
    String(raw.resumeFileName || ""),
    String(raw.tailoredResumePath || ""),
    String(raw.coverLetterPath || ""),
    String(raw.gender || "decline"),
    String(raw.race || "decline"),
    String(raw.disability || "decline"),
    String(raw.veteran || "decline"),
    String(raw.willingToRelocate || "no"),
    String(raw.availableStartDate || ""),
    String(raw.formerEmployee || "no"),
    String(raw.relativesAtCompany || "no"),
    raw.autoSubmit ? 1 : 0,
    raw.headedBrowser === false ? 0 : 1,
    raw.fillAndSubmit ? 1 : 0,
    String(raw.createdAt || now),
    String(raw.updatedAt || now),
  );

  const experiences = Array.isArray(raw.experiences) ? raw.experiences : [];
  experiences.forEach((row, index) => {
    const item = row as Record<string, unknown>;
    database.prepare(
      `INSERT OR IGNORE INTO experiences
        (id, profile_id, company, title, location, start_month, start_year, end_month, end_year, current, description, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      String(item.id || crypto.randomUUID()),
      id,
      String(item.company || ""),
      String(item.title || ""),
      String(item.location || ""),
      String(item.startMonth || ""),
      String(item.startYear || ""),
      String(item.endMonth || ""),
      String(item.endYear || ""),
      item.current ? 1 : 0,
      String(item.description || ""),
      Number(item.sortOrder ?? index),
    );
  });

  const educations = Array.isArray(raw.educations) ? raw.educations : [];
  educations.forEach((row, index) => {
    const item = row as Record<string, unknown>;
    database.prepare(
      `INSERT OR IGNORE INTO educations
        (id, profile_id, school, degree, discipline, start_year, end_year, current, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      String(item.id || crypto.randomUUID()),
      id,
      String(item.school || ""),
      String(item.degree || ""),
      String(item.discipline || ""),
      String(item.startYear || ""),
      String(item.endYear || ""),
      item.current ? 1 : 0,
      Number(item.sortOrder ?? index),
    );
  });

  importDiskFile(database, id, "resume", String(raw.resumePath || ""), String(raw.resumeFileName || "resume.pdf"));
  importDiskFile(database, id, "tailored", String(raw.tailoredResumePath || ""), "tailored-resume.pdf");
  importDiskFile(database, id, "cover", String(raw.coverLetterPath || ""), "cover-letter.pdf");
}

function importDiskFile(database: SqlDatabase, profileId: string, kind: string, filePath: string, filename: string) {
  if (!filePath || !fs.existsSync(filePath)) return;
  const bytes = fs.readFileSync(filePath);
  const id = crypto.randomUUID();
  const ext = path.extname(filePath || filename).toLowerCase();
  database.prepare(
    `INSERT INTO files (id, profile_id, kind, filename, mime, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, profileId, kind, filename || path.basename(filePath), mimeFor(ext), bytes, new Date().toISOString());
  const column = kind === "resume" ? "resume_file_id" : kind === "tailored" ? "tailored_resume_file_id" : "cover_letter_file_id";
  database.prepare(`UPDATE profiles SET ${column} = ? WHERE id = ?`).run(id, profileId);
}

export function mimeFor(ext: string) {
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === ".doc") return "application/msword";
  if (ext === ".txt") return "text/plain";
  return "application/octet-stream";
}

export function getMeta(key: string, fallback = "") {
  return meta(getDb(), key) || fallback;
}

export function putMeta(key: string, value: string) {
  setMeta(getDb(), key, value);
}

export type StoredFile = {
  id: string;
  profileId: string;
  kind: string;
  filename: string;
  mime: string;
  bytes: Buffer;
};

function asBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === "string") return Buffer.from(value, "base64");
  return Buffer.alloc(0);
}

export function saveProfileBlob(input: {
  profileId: string;
  kind: "resume" | "tailored" | "cover" | "screenshot";
  filename: string;
  bytes: Buffer;
  destPath?: string;
}): { id: string; path: string } {
  const id = crypto.randomUUID();
  const ext = path.extname(input.filename || input.destPath || "") || ".pdf";
  const dest =
    input.destPath ||
    path.join(appDataDir(), "uploads", `${input.profileId}-${input.kind}${ext}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, input.bytes);
  run(
    `DELETE FROM files WHERE profile_id = ? AND kind = ?`,
    input.profileId,
    input.kind,
  );
  run(
    `INSERT INTO files (id, profile_id, kind, filename, mime, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.profileId,
    input.kind,
    input.filename || path.basename(dest),
    mimeFor(ext),
    input.bytes,
    new Date().toISOString(),
  );
  const column =
    input.kind === "resume"
      ? "resume_file_id"
      : input.kind === "tailored"
        ? "tailored_resume_file_id"
        : input.kind === "cover"
          ? "cover_letter_file_id"
          : "";
  if (column) {
    run(`UPDATE profiles SET ${column} = ? WHERE id = ?`, id, input.profileId);
  }
  return { id, path: dest };
}

export function loadProfileBlob(profileId: string, kind: string): StoredFile | null {
  const row = one<{
    id: string;
    profile_id: string;
    kind: string;
    filename: string;
    mime: string;
    bytes: unknown;
  }>(`SELECT * FROM files WHERE profile_id = ? AND kind = ? ORDER BY created_at DESC LIMIT 1`, profileId, kind);
  if (!row) return null;
  return {
    id: String(row.id),
    profileId: String(row.profile_id),
    kind: String(row.kind),
    filename: String(row.filename),
    mime: String(row.mime),
    bytes: asBuffer(row.bytes),
  };
}

export function materializeFile(filePath: string, profileId: string, kind: string): string {
  if (filePath && fs.existsSync(filePath)) return filePath;
  const blob = loadProfileBlob(profileId, kind);
  if (!blob?.bytes.length) return filePath;
  const ext = path.extname(blob.filename) || ".pdf";
  const dest = filePath || path.join(appDataDir(), "uploads", `${profileId}-${kind}${ext}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, blob.bytes);
  return dest;
}
