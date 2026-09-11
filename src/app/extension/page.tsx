export default function ExtensionPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm uppercase tracking-[0.2em] text-muted">Chrome</p>
      <h1 className="mt-2 font-serif text-5xl tracking-tight">LinkedIn Easy Apply</h1>
      <p className="mt-4 max-w-xl text-lg text-muted">
        Search jobs on LinkedIn, click one on the left, then use the extension on
        the Easy Apply button next to Save.
      </p>

      <ol className="mt-8 space-y-4 text-sm leading-6">
        <li className="rounded-2xl border border-line bg-card p-5">
          <p className="font-medium">1. Load the unpacked extension</p>
          <p className="mt-1 text-muted">
            Chrome → Extensions → Developer mode → Load unpacked → choose the
            <code className="mx-1 rounded bg-paper px-1">extension</code> folder
            in this project. Reload it after updates (now 0.5.0).
          </p>
        </li>
        <li className="rounded-2xl border border-line bg-card p-5">
          <p className="font-medium">2. Save a profile and resume</p>
          <p className="mt-1 text-muted">
            On this site, upload an original resume and optionally a tailored
            resume. Easy Apply attaches it as
            <code className="mx-1 rounded bg-paper px-1">FirstName_LastName.pdf</code>
            or .docx. In the extension, pick the profile and Original or Tailored.
          </p>
        </li>
        <li className="rounded-2xl border border-line bg-card p-5">
          <p className="font-medium">3. Easy Apply on the job</p>
          <p className="mt-1 text-muted">
            Click a job in the left list so it opens on the right. In the
            extension, click Easy Apply on this job. It clicks Easy Apply, fills
            first name, last name, email, phone country, and phone from the
            profile, attaches the resume, skips the optional “top choice” page,
            asks OpenAI for remaining questions, then clicks Review and Submit.
          </p>
        </li>
      </ol>
    </div>
  );
}
