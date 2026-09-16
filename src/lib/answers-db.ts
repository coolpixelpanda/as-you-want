import crypto from "node:crypto";
import { dbDeleteAnswer, dbListAnswers, dbUpsertAnswer } from "@/lib/database";

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

export async function listAnswers(profileId?: string): Promise<AnswerRow[]> {
  return dbListAnswers(profileId);
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
    const idx = out.findIndex((existing) =>
      findExistingAnswer(question, [
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
      ]),
    );
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

export async function upsertAnswer(input: {
  profileId: string;
  question: string;
  answer: string;
  source?: string;
}): Promise<AnswerRow> {
  const question = input.question.trim();
  const answer = input.answer.trim();
  if (!input.profileId) throw new Error("Profile is required.");
  if (!question || !answer) throw new Error("Question and answer are required.");
  if (/^(yes|no|true|false|y|n)$/i.test(question)) {
    throw new Error("That looked like a Yes/No choice, not the question text.");
  }

  const now = new Date().toISOString();
  const questionNorm = normQuestion(question);
  const bank = await listAnswers(input.profileId);
  const existing = findExistingAnswer(question, bank) || bank.find((row) => row.questionNorm === questionNorm);
  if (existing) {
    const storedQuestion = question.length > existing.question.length ? question : existing.question;
    const next: AnswerRow = {
      ...existing,
      question: storedQuestion,
      questionNorm: normQuestion(storedQuestion),
      answer,
      source: input.source || existing.source || "extension",
      updatedAt: now,
    };
    await dbUpsertAnswer(next);
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
  await dbUpsertAnswer(created);
  return created;
}

export async function replaceAnswersForProfile(
  profileId: string,
  rows: { question: string; answer: string; source?: string }[],
) {
  const merged = mergeLatestAnswers(rows);
  const existing = await listAnswers(profileId);
  const keepIds = new Set<string>();
  for (const row of merged) {
    const saved = await upsertAnswer({
      profileId,
      question: row.question,
      answer: row.answer,
      source: row.source || "profile",
    });
    keepIds.add(saved.id);
  }
  for (const old of existing) {
    if (!keepIds.has(old.id)) await deleteAnswer(profileId, old.id);
  }
  return listAnswers(profileId);
}

export async function dedupeAnswers(profileId?: string) {
  const rows = await listAnswers(profileId);
  const ids = profileId ? [profileId] : [...new Set(rows.map((row) => row.profileId))];
  for (const id of ids) {
    const current = await listAnswers(id);
    const keep: AnswerRow[] = [];
    for (const row of current) {
      const match = findExistingAnswer(row.question, keep);
      if (match) await deleteAnswer(id, row.id);
      else keep.push(row);
    }
  }
}

export async function deleteAnswer(profileId: string, id: string) {
  await dbDeleteAnswer(profileId, id);
}

export async function pruneBareChoiceAnswersDb() {
  const rows = await listAnswers();
  for (const row of rows) {
    if (["yes", "no", "true", "false", "y", "n"].includes(row.questionNorm)) {
      await deleteAnswer(row.profileId, row.id);
    }
  }
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

export async function importProfileAnswers(
  profiles: { id: string; answers?: { question: string; answer: string; source?: string }[] }[],
) {
  for (const profile of profiles) {
    for (const row of profile.answers || []) {
      if (!row.question || !row.answer) continue;
      try {
        await upsertAnswer({
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
