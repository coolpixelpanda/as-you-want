import { execSync } from "node:child_process";

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
if (!/^postgres(ql)?:\/\//i.test(url)) {
  console.log("Skipping prisma db push (no Postgres DATABASE_URL).");
  process.exit(0);
}
if (!process.env.DIRECT_URL) process.env.DIRECT_URL = url;
execSync("npx prisma db push", { stdio: "inherit", env: process.env });
