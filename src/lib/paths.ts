import path from "node:path";

export function appDataDir() {
  if (process.env.VERCEL) return path.join("/tmp", "joblink-data");
  return path.join(process.cwd(), "data");
}
