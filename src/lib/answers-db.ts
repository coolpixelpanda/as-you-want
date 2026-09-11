import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { appDataDir } from "@/lib/paths";

export type AnswerRow = {
  id: string;
  profileId: string;
  question: string;
  questionNorm: string;
  answer: string;
  source: string;
  createdAt: string;
  updatedAt: string;
};

const jsonPath = () => path.join(appDataDir(), "answers.json");
const sqlitePath = () => path.join(appDataDir(), "joblink.sqlite");

type SqliteDb = {
  prepare: (sql: string) => {
    all: (...params: unknown[]) => Record<string, string>[];
    get: (...params: unknown[]) => Record<string, string> | undefined;
    run: (...params: unknown[]) => unknown;
  };
  exec: (sql: string) => void;
};

let sqlite: SqliteDb | null | undefined;

export function normQuestion(s: string) {
  return s
    .toLowerCase()
    .replace(/united states/g, "us")
    .replace(/\busa\b/g, "us")
    .replace(/\bu\.?s\.?a?\.?\b/g, "us")
    .replace(/residing|residence|live|living/g, "reside")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function readJsonRows(): AnswerRow[] {
  fs.mkdirSync(appDataDir(), { recursive: true });
  if (!fs.existsSync(jsonPath())) return [];
  try {
    return JSON.parse(fs.readFileSync(jsonPath(), "utf8")) as AnswerRow[];
  } catch {
    return [];
  }
}

function writeJsonRows(rows: AnswerRow[]) {
  fs.mkdirSync(appDataDir(), { recursive: true });
  fs.writeFileSync(jsonPath(), JSON.stringify(rows, null, 2));
}

function getSqlite(): SqliteDb | null {
  if (sqlite !== undefined) return sqlite;
  if (process.env.VERCEL) {
    sqlite = null;
    return null;
  }
  try {
    const { DatabaseSync } = require("node:sqlite") as {
      DatabaseSync: new (path: string) => SqliteDb;
    };
    fs.mkdirSync(appDataDir(), { recursive: true });
    const database = new DatabaseSync(sqlitePath());
    database.exec(`
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
    `);
    sqlite = database;
    return sqlite;
  } catch {
    sqlite = null;
    return null;
  }
}

function rowFrom(raw: Record<string, string>): AnswerRow {
  return {
    id: raw.id,
    profileId: raw.profile_id,
    question: raw.question,
    questionNorm: raw.question_norm,
    answer: raw.answer,
    source: raw.source,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

export function listAnswers(profileId?: string): AnswerRow[] {
  const database = getSqlite();
  if (database) {
    const rows = profileId
      ? database.prepare("SELECT * FROM saved_answers WHERE profile_id = ? ORDER BY updated_at DESC").all(profileId)
      : database.prepare("SELECT * FROM saved_answers ORDER BY updated_at DESC").all();
    return rows.map(rowFrom);
  }
  const rows = readJsonRows().sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  return profileId ? rows.filter((row) => row.profileId === profileId) : rows;
}

export function findExistingAnswer(question: string, bank: AnswerRow[]): AnswerRow | null {
  const n = normQuestion(question);
  if (!n) return null;
  return bank.find((row) => row.questionNorm === n) || findBestSavedAnswer(question, bank);
}

export function mergeLatestAnswers<T extends { question: string; answer: string }>(rows: T[]): T[] {
  const out: T[] = [];
  for (const row of rows) {
    const question = row.question.trim();
    const answer = row.answer.trim();
    if (!question || !answer) continue;
    const idx = out.findIndex((existing) => findExistingAnswer(question, [
      {
        id: "x",
        profileId: "",
        question: existing.question,
        questionNorm: normQuestion(existing.question),
        answer: existing.answer,
        source: "",
        createdAt: "",
        updatedAt: "",
      },
    ]));
    if (idx >= 0) {
      const prev = out[idx];
      out[idx] = {
        ...prev,
        ...row,
        question: question.length > prev.question.length ? question : prev.question,
        answer,
      };
    } else {
      out.push({ ...row, question, answer });
    }
  }
  return out;
}

export function upsertAnswer(input: {
  profileId: string;
  question: string;
  answer: string;
  source?: string;
}): AnswerRow {
  const question = input.question.trim();
  const answer = input.answer.trim();
  if (!input.profileId) throw new Error("Profile is required.");
  if (!question || !answer) throw new Error("Question and answer are required.");
  if (/^(yes|no|true|false|y|n)$/i.test(question)) {
    throw new Error("That looked like a Yes/No choice, not the question text.");
  }

  const now = new Date().toISOString();
  const questionNorm = normQuestion(question);
  const bank = listAnswers(input.profileId);
  const existingRow = findExistingAnswer(question, bank);
  const database = getSqlite();

  if (database) {
    const existing = existingRow
      ? database.prepare("SELECT * FROM saved_answers WHERE id = ?").get(existingRow.id)
      : database
          .prepare("SELECT * FROM saved_answers WHERE profile_id = ? AND question_norm = ?")
          .get(input.profileId, questionNorm);

    if (existing) {
      const storedQuestion = question.length > existing.question.length ? question : existing.question;
      database
        .prepare(
          "UPDATE saved_answers SET question = ?, question_norm = ?, answer = ?, source = ?, updated_at = ? WHERE id = ?",
        )
        .run(
          storedQuestion,
          normQuestion(storedQuestion),
          answer,
          input.source || existing.source || "extension",
          now,
          existing.id,
        );
      return {
        id: existing.id,
        profileId: input.profileId,
        question: storedQuestion,
        questionNorm: normQuestion(storedQuestion),
        answer,
        source: input.source || existing.source || "extension",
        createdAt: existing.created_at,
        updatedAt: now,
      };
    }

    const id = crypto.randomUUID();
    database
      .prepare(
        `INSERT INTO saved_answers
          (id, profile_id, question, question_norm, answer, source, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.profileId, question, questionNorm, answer, input.source || "extension", now, now);
    return {
      id,
      profileId: input.profileId,
      question,
      questionNorm,
      answer,
      source: input.source || "extension",
      createdAt: now,
      updatedAt: now,
    };
  }

  const rows = readJsonRows();
  const match = existingRow || rows.find((row) => row.profileId === input.profileId && row.questionNorm === questionNorm);
  if (match) {
    const storedQuestion = question.length > match.question.length ? question : match.question;
    const next: AnswerRow = {
      ...match,
      question: storedQuestion,
      questionNorm: normQuestion(storedQuestion),
      answer,
      source: input.source || match.source || "extension",
      updatedAt: now,
    };
    writeJsonRows(rows.map((row) => (row.id === match.id ? next : row)));
    return next;
  }

  const created: AnswerRow = {
    id: crypto.randomUUID(),
    profileId: input.profileId,
    question,
    questionNorm,
    answer,
    source: input.source || "extension",
    createdAt: now,
    updatedAt: now,
  };
  writeJsonRows([created, ...rows]);
  return created;
}

export function replaceAnswersForProfile(
  profileId: string,
  rows: { question: string; answer: string; source?: string }[],
) {
  const merged = mergeLatestAnswers(rows);
  const existing = listAnswers(profileId);
  const keepIds = new Set<string>();
  for (const row of merged) {
    const saved = upsertAnswer({
      profileId,
      question: row.question,
      answer: row.answer,
      source: row.source || "profile",
    });
    keepIds.add(saved.id);
  }
  for (const old of existing) {
    if (!keepIds.has(old.id)) deleteAnswer(profileId, old.id);
  }
  return listAnswers(profileId);
}

export function dedupeAnswers(profileId?: string) {
  const ids = profileId
    ? [profileId]
    : [...new Set(listAnswers().map((row) => row.profileId))];
  for (const id of ids) {
    const rows = listAnswers(id);
    const keep: AnswerRow[] = [];
    for (const row of rows) {
      const match = findExistingAnswer(row.question, keep);
      if (match) deleteAnswer(id, row.id);
      else keep.push(row);
    }
  }
}

export function deleteAnswer(profileId: string, id: string) {
  const database = getSqlite();
  if (database) {
    database.prepare("DELETE FROM saved_answers WHERE profile_id = ? AND id = ?").run(profileId, id);
    return;
  }
  writeJsonRows(readJsonRows().filter((row) => !(row.profileId === profileId && row.id === id)));
}

export function pruneBareChoiceAnswersDb() {
  const database = getSqlite();
  if (database) {
    database.prepare("DELETE FROM saved_answers WHERE question_norm IN ('yes', 'no', 'true', 'false', 'y', 'n')").run();
    return;
  }
  writeJsonRows(
    readJsonRows().filter((row) => !["yes", "no", "true", "false", "y", "n"].includes(row.questionNorm)),
  );
}

const STOP = new Set(["the", "and", "for", "are", "was", "you", "your", "this", "that", "with", "from", "have", "has"]);

function tokens(s: string) {
  return normQuestion(s)
    .split(" ")
    .filter((w) => w.length > 2 && !STOP.has(w));
}

export function findBestSavedAnswer(question: string, bank: AnswerRow[]): AnswerRow | null {
  const n = normQuestion(question);
  if (!n) return null;
  const exact = bank.find((row) => row.questionNorm === n);
  if (exact) return exact;

  let best: { row: AnswerRow; score: number } | null = null;
  const qTokens = tokens(question);
  for (const row of bank) {
    const r = row.questionNorm;
    let score = 0;
    if (n.includes(r) || r.includes(n)) {
      const shorter = n.length < r.length ? n : r;
      if (shorter.length >= 18 || shorter.split(" ").filter(Boolean).length >= 4) score = 0.86;
    } else if (qTokens.length) {
      const rTokens = tokens(row.question);
      const overlap = qTokens.filter((t) => rTokens.includes(t)).length;
      score = overlap / Math.max(qTokens.length, rTokens.length, 1);
    }
    if (score >= 0.62 && (!best || score > best.score)) best = { row, score };
  }
  return best?.row || null;
}

export function importProfileAnswers(
  profiles: { id: string; answers?: { question: string; answer: string; source?: string }[] }[],
) {
  for (const profile of profiles) {
    for (const row of profile.answers || []) {
      if (!row.question || !row.answer) continue;
      try {
        upsertAnswer({
          profileId: profile.id,
          question: row.question,
          answer: row.answer,
          source: row.source || "profile",
        });
      } catch {
        /* skip invalid */
      }
    }
  }
}
