import { execSync } from "node:child_process";

const url = process.env.DATABASE_URL || "";
if (!url || url.startsWith("file:")) {
  process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/joblink?schema=public";
}
if (!process.env.DIRECT_URL) process.env.DIRECT_URL = process.env.DATABASE_URL;

execSync("npx prisma generate", { stdio: "inherit", env: process.env });
