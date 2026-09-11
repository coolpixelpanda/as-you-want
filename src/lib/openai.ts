import OpenAI from "openai";

export function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing. Add it to your .env file.");
  }
  return new OpenAI({ apiKey });
}

export function getModel() {
  return process.env.OPENAI_MODEL || "gpt-4o-mini";
}
