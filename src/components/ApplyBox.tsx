"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useNotice } from "@/components/NoticeProvider";

export function ApplyBox() {
  const router = useRouter();
  const { notify } = useNotice();
  const [jobUrl, setJobUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!jobUrl.trim()) {
      notify("error", "Paste a job link first.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start that application.");
      notify("success", "Application started.");
      router.push(`/applications/${data.id}`);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Could not start that application.");
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
          className="h-11 flex-1 rounded-xl border border-line bg-paper px-4 outline-none ring-accent/30 focus:ring-2"
        />
        <Button type="submit" variant="accent" icon={ArrowRight} loading={busy} disabled={!jobUrl.trim()}>
          Apply
        </Button>
      </div>
    </form>
  );
}
