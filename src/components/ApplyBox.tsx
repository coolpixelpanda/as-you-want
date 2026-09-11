"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";

export function ApplyBox() {
  const router = useRouter();
  const [jobUrl, setJobUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start");
      router.push(`/applications/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start");
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-line bg-card p-5 shadow-[0_10px_40px_rgba(80,50,20,0.06)]"
    >
      <label className="block font-serif text-xl">Job link</label>
      <p className="mt-1 text-sm text-muted">
        Greenhouse, Lever, Ashby, Workday, or a company careers page.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          value={jobUrl}
          onChange={(e) => setJobUrl(e.target.value)}
          placeholder="https://job-boards.greenhouse.io/acme/jobs/123"
          className="h-12 flex-1 rounded-xl border border-line bg-paper px-4 outline-none ring-accent/30 focus:ring-2"
        />
        <button
          type="submit"
          disabled={busy || !jobUrl.trim()}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-accent px-5 font-medium text-white hover:bg-accent-dark disabled:opacity-50"
        >
          {busy ? <LoaderCircle className="animate-spin" size={18} /> : <ArrowRight size={18} />}
          Apply
        </button>
      </div>
      {error ? <p className="mt-3 text-sm text-bad">{error}</p> : null}
    </form>
  );
}
