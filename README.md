# JobLink

Local app plus a Chrome extension for applying from a job page. Save one or more profiles here, then apply from LinkedIn, Workday (including GN Careers / myworkdayjobs.com), Greenhouse, and similar boards.

## Setup

```bash
npm install
npx playwright install chromium
npm run dev
```

Open [http://localhost:3001](http://localhost:3001). Put your OpenAI key in `.env` as `OPENAI_API_KEY`.

## Profiles

Create as many applicant profiles as you need. Upload a resume to parse contact info, experience, and education. The Chrome extension uses the profile you select in its popup.

## Chrome extension

1. Chrome → Extensions → Developer mode → **Load unpacked**.
2. Choose the `extension` folder in this project.
3. Keep JobLink running on port 3001.
4. Open a job (LinkedIn, GN Careers, myworkdayjobs.com, …).
5. Pick a profile, leave **Autofill with resume** on if you want Workday to use the CV, then **Apply on this page**.

The extension clicks Apply, attaches the resume when that control exists, fills inputs/dropdowns/yes-no from the profile, uses OpenAI for questions like “why this company,” then Next through every step and Submit on the last page.

If the board asks you to sign in, complete that in the tab and click Apply in the extension again.

## Notes

- Submitting is permanent. Review answers when the overlay is working if a field looks wrong.
- Respect each site’s terms. This is for applying as yourself with information you provided.
