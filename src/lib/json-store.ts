import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { appDataDir } from "@/lib/paths";
import { defaultProfile, newId, type Application, type Profile } from "@/lib/store-types";
import type { StoredFile } from "@/lib/db";

type AnswerRecord = {
  id: string;
  profileId: string;
  question: string;
  questionNorm: string;
  answer: string;
  source: string;
  createdAt: string;
  updatedAt: string;
};

type JsonState = {
  activeProfileId: string;
  profiles: Profile[];
  applications: Application[];
  answers: AnswerRecord[];
};

function statePath() {
  return path.join(appDataDir(), "joblink.json");
}

function filesDir() {
  return path.join(appDataDir(), "files");
}

function loadState(): JsonState {
  fs.mkdirSync(appDataDir(), { recursive: true });
  if (!fs.existsSync(statePath())) {
    const profile = defaultProfile({ name: "New profile" });
    const state: JsonState = {
      activeProfileId: profile.id,
      profiles: [profile],
      applications: [],
      answers: [],
    };
    saveState(state);
    return state;
  }
  const parsed = JSON.parse(fs.readFileSync(statePath(), "utf8")) as JsonState;
  parsed.profiles = Array.isArray(parsed.profiles) ? parsed.profiles.map((row) => defaultProfile(row)) : [];
  parsed.applications = Array.isArray(parsed.applications) ? parsed.applications : [];
  parsed.answers = Array.isArray(parsed.answers) ? parsed.answers : [];
  if (!parsed.profiles.length) {
    const profile = defaultProfile({ name: "New profile" });
    parsed.profiles = [profile];
    parsed.activeProfileId = profile.id;
    saveState(parsed);
  }
  if (!parsed.activeProfileId || !parsed.profiles.some((row) => row.id === parsed.activeProfileId)) {
    parsed.activeProfileId = parsed.profiles[0].id;
  }
  return parsed;
}

function saveState(state: JsonState) {
  fs.mkdirSync(appDataDir(), { recursive: true });
  fs.writeFileSync(statePath(), JSON.stringify(state));
}

export function jsonListProfiles(): Profile[] {
  return loadState().profiles.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export function jsonGetActiveProfileId(): string {
  return loadState().activeProfileId;
}

export function jsonSetActiveProfile(id: string) {
  const state = loadState();
  if (!state.profiles.some((row) => row.id === id)) return;
  state.activeProfileId = id;
  saveState(state);
}

export function jsonWriteProfile(profile: Profile) {
  const state = loadState();
  const index = state.profiles.findIndex((row) => row.id === profile.id);
  const next = defaultProfile({ ...profile, updatedAt: new Date().toISOString() });
  if (index >= 0) state.profiles[index] = next;
  else state.profiles.unshift(next);
  saveState(state);
}

export function jsonDeleteProfile(id: string) {
  const state = loadState();
  state.profiles = state.profiles.filter((row) => row.id !== id);
  state.answers = state.answers.filter((row) => row.profileId !== id);
  if (state.activeProfileId === id) state.activeProfileId = state.profiles[0]?.id || "";
  saveState(state);
}

export function jsonListApplications(): Application[] {
  return loadState().applications.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function jsonWriteApplication(app: Application) {
  const state = loadState();
  const index = state.applications.findIndex((row) => row.id === app.id);
  if (index >= 0) state.applications[index] = app;
  else state.applications.unshift(app);
  saveState(state);
}

export function jsonDeleteApplication(id: string) {
  const state = loadState();
  state.applications = state.applications.filter((row) => row.id !== id);
  saveState(state);
}

export function jsonListAnswers(profileId?: string) {
  const rows = loadState().answers;
  return (profileId ? rows.filter((row) => row.profileId === profileId) : rows).sort((a, b) =>
    String(b.updatedAt).localeCompare(String(a.updatedAt)),
  );
}

export function jsonUpsertAnswer(row: AnswerRecord) {
  const state = loadState();
  const id = row.id || newId();
  const index = state.answers.findIndex((item) => item.id === id);
  const next = { ...row, id };
  if (index >= 0) state.answers[index] = next;
  else state.answers.unshift(next);
  saveState(state);
}

export function jsonDeleteAnswer(profileId: string, id: string) {
  const state = loadState();
  state.answers = state.answers.filter((row) => !(row.id === id && row.profileId === profileId));
  saveState(state);
}

function mimeFor(filename: string) {
  const ext = filename.toLowerCase();
  if (ext.endsWith(".pdf")) return "application/pdf";
  if (ext.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext.endsWith(".doc")) return "application/msword";
  return "application/octet-stream";
}

export function jsonSaveBlob(input: {
  profileId: string;
  kind: "resume" | "tailored" | "cover" | "screenshot";
  filename: string;
  bytes: Buffer;
}) {
  fs.mkdirSync(filesDir(), { recursive: true });
  const id = crypto.randomUUID();
  const stored = path.join(filesDir(), `${input.profileId}-${input.kind}`);
  fs.writeFileSync(stored, input.bytes);
  fs.writeFileSync(
    `${stored}.meta.json`,
    JSON.stringify({ id, filename: input.filename, mime: mimeFor(input.filename), kind: input.kind }),
  );
  const virtualPath = `json://files/${input.profileId}/${input.kind}`;
  const state = loadState();
  const profile = state.profiles.find((row) => row.id === input.profileId);
  if (profile) {
    if (input.kind === "resume") {
      profile.resumePath = virtualPath;
      profile.resumeFileName = input.filename;
    } else if (input.kind === "tailored") {
      profile.tailoredResumePath = virtualPath;
    } else if (input.kind === "cover") {
      profile.coverLetterPath = virtualPath;
    }
    profile.updatedAt = new Date().toISOString();
    saveState(state);
  }
  return { id, path: virtualPath };
}

export function jsonLoadBlob(profileId: string, kind: string): StoredFile | null {
  const stored = path.join(filesDir(), `${profileId}-${kind}`);
  if (!fs.existsSync(stored)) return null;
  const meta = fs.existsSync(`${stored}.meta.json`)
    ? (JSON.parse(fs.readFileSync(`${stored}.meta.json`, "utf8")) as { id?: string; filename?: string; mime?: string })
    : {};
  return {
    id: String(meta.id || `${profileId}-${kind}`),
    profileId,
    kind,
    filename: String(meta.filename || "resume"),
    mime: String(meta.mime || "application/octet-stream"),
    bytes: fs.readFileSync(stored),
  };
}
