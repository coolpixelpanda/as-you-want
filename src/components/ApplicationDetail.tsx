"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, Play, Save, Send } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/Button";
import { useNotice } from "@/components/NoticeProvider";
import { atsLabel } from "@/lib/ats/detect";
import type { ApplyLog, AtsKind, MappedAnswer } from "@/lib/types";

type AppRecord = {
  id: string;
  jobUrl: string;
  applyUrl: string;
  ats: AtsKind;
  company: string;
  title: string;
  location: string;
  status: string;
  mappedAnswers: MappedAnswer[];
  logs: ApplyLog[];
  error?: string | null;
  confirmationUrl?: string | null;
  confirmationText?: string | null;
};

export function ApplicationDetail({ id }: { id: string }) {
  const { notify } = useNotice();
  const [app, setApp] = useState<AppRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [answers, setAnswers] = useState<MappedAnswer[]>([]);

  async function refresh() {
    const res = await fetch(`/api/applications/${id}`, { cache: "no-store" });
    const data = await res.json();
    setApp(data);
    if (Array.isArray(data.mappedAnswers)) setAnswers(data.mappedAnswers);
  }

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 2000);
    return () => clearInterval(timer);
  }, [id]);

  const live = useMemo(
    () =>
      ["queued", "inspecting", "mapping", "applying"].includes(app?.status || ""),
    [app?.status],
  );

  async function saveAnswers() {
    setBusy(true);
    try {
      const res = await fetch(`/api/applications/${id}/answers`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      if (!res.ok) throw new Error("Could not save answers.");
      await refresh();
      notify("success", "Answers saved.");
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Could not save answers.");
    } finally {
      setBusy(false);
    }
  }

  async function run(submit: boolean) {
    setBusy(true);
    try {
      const saved = await fetch(`/api/applications/${id}/answers`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      if (!saved.ok) throw new Error("Could not save answers.");
      const res = await fetch(`/api/applications/${id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submit }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not start the browser fill.");
      await refresh();
      notify("success", submit ? "Filling and submitting in the browser." : "Filling the form in the browser.");
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Could not run that action.");
    } finally {
      setBusy(false);
    }
  }

  if (!app) {
    return (
      <div className="flex items-center gap-2 text-muted">
        <LoaderCircle className="animate-spin" size={16} /> Loading application
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-sm text-muted hover:text-ink">
          ← All applications
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-serif text-4xl tracking-tight">
              {app.title || "Reading the job…"}
            </h1>
            <p className="mt-2 text-muted">
              {app.company || "Company"} · {atsLabel(app.ats)}
              {app.location ? ` · ${app.location}` : ""}
            </p>
            <a href={app.jobUrl} className="mt-1 inline-block text-sm text-accent" target="_blank" rel="noreferrer">
              Open original posting
            </a>
          </div>
          <StatusBadge status={app.status} />
        </div>
      </div>

      {app.error ? (
        <div className="rounded-xl border border-[#ead0c8] bg-[#fbf1ee] px-4 py-3 text-sm text-bad">
          {app.error}
        </div>
      ) : null}

      {app.status === "submitted" ? (
        <div className="rounded-xl border border-[#cfe3d6] bg-[#f1f7f3] px-4 py-3 text-sm text-good">
          Submitted.
          {app.confirmationUrl ? (
            <>
              {" "}
              <a className="underline" href={app.confirmationUrl} target="_blank" rel="noreferrer">
                Confirmation page
              </a>
            </>
          ) : null}
        </div>
      ) : null}

      {answers.length ? (
        <section className="rounded-2xl border border-line bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-serif text-2xl">Answers</h2>
            {live ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted">
                <LoaderCircle className="animate-spin" size={12} /> Working
              </span>
            ) : null}
          </div>
          <div className="mt-4 space-y-4">
            {answers.map((answer, i) => (
              <label key={answer.id} className="block">
                <span className="mb-1 flex items-center justify-between gap-3 text-sm">
                  <span>
                    {answer.label}
                    {answer.required ? <span className="ml-1 text-bad">*</span> : null}
                  </span>
                  <span className="text-xs text-muted">{answer.source}</span>
                </span>
                {answer.options?.length ? (
                  <select
                    className="h-11 w-full rounded-lg border border-line bg-paper px-3"
                    value={answer.value}
                    onChange={(e) =>
                      setAnswers((rows) =>
                        rows.map((row, idx) =>
                          idx === i ? { ...row, value: e.target.value, source: "user" } : row,
                        ),
                      )
                    }
                  >
                    <option value="">Select…</option>
                    {answer.options.map((opt) => (
                      <option key={opt.label} value={opt.label}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : answer.type === "textarea" ? (
                  <textarea
                    className="min-h-24 w-full rounded-lg border border-line bg-paper px-3 py-2"
                    value={answer.value}
                    onChange={(e) =>
                      setAnswers((rows) =>
                        rows.map((row, idx) =>
                          idx === i ? { ...row, value: e.target.value, source: "user" } : row,
                        ),
                      )
                    }
                  />
                ) : (
                  <input
                    className="h-11 w-full rounded-lg border border-line bg-paper px-3"
                    value={answer.value}
                    onChange={(e) =>
                      setAnswers((rows) =>
                        rows.map((row, idx) =>
                          idx === i ? { ...row, value: e.target.value, source: "user" } : row,
                        ),
                      )
                    }
                  />
                )}
              </label>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="secondary" icon={Save} loading={busy} onClick={() => void saveAnswers()}>
              Save answers
            </Button>
            <Button variant="secondary" icon={Play} loading={busy} onClick={() => void run(false)}>
              Fill in browser
            </Button>
            <Button variant="accent" icon={Send} loading={busy} onClick={() => void run(true)}>
              Fill and submit
            </Button>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-line bg-card p-5 text-sm text-muted">
          {live
            ? "Reading the application form and matching your profile…"
            : "No form fields yet. If this stays empty, the job page may require a login or a different apply URL."}
        </section>
      )}

      <section className="rounded-2xl border border-line bg-card p-5">
        <h2 className="font-serif text-2xl">Activity</h2>
        <ol className="mt-3 space-y-2 text-sm">
          {(app.logs || []).slice().reverse().map((log, i) => (
            <li key={`${log.t}-${i}`} className="flex gap-3">
              <span className="w-16 shrink-0 text-xs text-muted">
                {new Date(log.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className={log.level === "error" ? "text-bad" : log.level === "warn" ? "text-warn" : ""}>
                {log.message}
              </span>
            </li>
          ))}
          {!app.logs?.length ? <li className="text-muted">Waiting to start.</li> : null}
        </ol>
      </section>
    </div>
  );
}
