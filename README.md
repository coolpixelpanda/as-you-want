# JobLink

Local app plus a Chrome extension for applying from a job page. Profiles, resumes, answers, and applications are stored in a database — SQLite on your machine, Postgres on Vercel.

## Setup

```bash
npm install
npx playwright install chromium
npm run dev
```

Open [http://localhost:3001](http://localhost:3001). Put your OpenAI key in `.env` as `OPENAI_API_KEY`.

Locally, JobLink uses SQLite in `data/joblink.sqlite` (created automatically). You do not need Postgres until you deploy.

## Database on Vercel

Vercel’s filesystem is temporary, so production **must** use Postgres. JSON files and SQLite will not keep profiles or resumes after a deploy.

1. Create a free Postgres database: [Neon](https://neon.tech), [Vercel Postgres](https://vercel.com/storage/postgres), or Prisma Postgres from the Vercel Storage tab.
2. Copy the connection string (`postgresql://...`).
3. In the Vercel project → Settings → Environment Variables, add:
   - `DATABASE_URL` — the Postgres URL
   - `OPENAI_API_KEY` — your OpenAI key
   - `OPENAI_MODEL` — optional, defaults to `gpt-4o-mini`
4. Redeploy.

The build runs `prisma generate` and `prisma db push` so tables for profiles, experience, education, resumes, answers, and applications are created automatically.

Resumes are stored as file blobs in the same database, not on disk.

## Profiles

Create as many applicant profiles as you need. Upload a resume to parse contact info, experience, and education. The Chrome extension uses the profile you select in its popup.

## Chrome extension

1. Chrome → Extensions → Developer mode → **Load unpacked**.
2. Choose the `extension` folder in this project.
3. Keep JobLink running on port 3001 (or point the extension at your Vercel URL).
4. Open a job (LinkedIn, GN Careers, myworkdayjobs.com, …).
5. Pick a profile, leave **Autofill with resume** on if you want Workday to use the CV, then **Apply on this page**.

The extension clicks Apply, attaches the resume when that control exists, fills inputs/dropdowns/yes-no from the profile, uses OpenAI for questions like “why this company,” then Next through every step and Submit on the last page.

If the board asks you to sign in, complete that in the tab and click Apply in the extension again.

## Notes

- Submitting is permanent. Review answers when the overlay is working if a field looks wrong.
- Respect each site’s terms. This is for applying as yourself with information you provided.
