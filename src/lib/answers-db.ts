import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";

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

const dbPath = path.join(process.cwd(), "data", "joblink.sqlite");

let db: DatabaseSync | null = null;

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

function getDb() {
  if (db) return db;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new DatabaseSync(dbPath);
  db.exec(`
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
  return db;
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
  const database = getDb();
  const rows = profileId
    ? database.prepare("SELECT * FROM saved_answers WHERE profile_id = ? ORDER BY updated_at DESC").all(profileId)
    : database.prepare("SELECT * FROM saved_answers ORDER BY updated_at DESC").all();
  return (rows as Record<string, string>[]).map(rowFrom);
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

  const database = getDb();
  const now = new Date().toISOString();
  const questionNorm = normQuestion(question);
  const bank = listAnswers(input.profileId);
  const existingRow = findExistingAnswer(question, bank);
  const existing = existingRow
    ? (database.prepare("SELECT * FROM saved_answers WHERE id = ?").get(existingRow.id) as Record<string, string> | undefined)
    : (database
        .prepare("SELECT * FROM saved_answers WHERE profile_id = ? AND question_norm = ?")
        .get(input.profileId, questionNorm) as Record<string, string> | undefined);

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
  getDb().prepare("DELETE FROM saved_answers WHERE profile_id = ? AND id = ?").run(profileId, id);
}

export function pruneBareChoiceAnswersDb() {
  getDb().prepare("DELETE FROM saved_answers WHERE question_norm IN ('yes', 'no', 'true', 'false', 'y', 'n')").run();
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
