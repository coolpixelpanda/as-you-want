"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";

type Saved = {
  id: string;
  question: string;
  answer: string;
  source: string;
  createdAt: string;
  profileId: string;
  profileName: string;
};

type Asked = {
  question: string;
  answer: string;
  company: string;
  title: string;
  applicationId: string;
  createdAt: string;
  saved: boolean;
};

export function AnswersBoard() {
  const [saved, setSaved] = useState<Saved[]>([]);
  const [asked, setAsked] = useState<Asked[]>([]);

  async function load() {
    const res = await fetch("/api/answers");
    const data = await res.json();
    setSaved(data.saved || []);
    setAsked(data.asked || []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function remove(row: Saved) {
    await fetch(`/api/answers?profileId=${encodeURIComponent(row.profileId)}&id=${encodeURIComponent(row.id)}`, {
      method: "DELETE",
    });
    await load();
  }

  return (
    <div className="space-y-10">
      <section>
        <h2 className="font-serif text-2xl">Saved for reuse</h2>
        <p className="mt-1 text-sm text-muted">
          Each question keeps one answer. Saving the same question again replaces the previous answer.{" "}
          <Link href="/profiles" className="text-accent hover:underline">
            Default answers are listed on your profile
          </Link>
          .
        </p>
        {!saved.length ? (
          <p className="mt-4 text-sm text-muted">
            Nothing saved yet. When a question has no match, answer it on the form and click Save.
          </p>
        ) : (
          <div className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
            {saved.map((row) => (
              <div key={`${row.profileId}-${row.id}`} className="flex items-start justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wide text-muted">Question</p>
                  <p className="font-medium">{row.question}</p>
                  <p className="mt-3 text-xs uppercase tracking-wide text-muted">Answer</p>
                  <p className="mt-1 text-sm">{row.answer}</p>
                  <p className="mt-2 text-xs text-muted">
                    {row.profileName}
                    {row.source === "profile" ? " · profile default" : row.source ? ` · ${row.source}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-lg p-2 text-muted hover:bg-paper hover:text-bad"
                  onClick={() => void remove(row)}
                  aria-label="Delete saved answer"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-serif text-2xl">Seen on applications</h2>
        <p className="mt-1 text-sm text-muted">
          Questions the extension has encountered while applying.
        </p>
        {!asked.length ? (
          <p className="mt-4 text-sm text-muted">No application questions recorded yet.</p>
        ) : (
          <div className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
            {asked.map((row, i) => (
              <Link
                key={`${row.applicationId}-${i}`}
                href={`/applications/${row.applicationId}`}
                className="block px-5 py-4 hover:bg-paper/70"
              >
                <p className="font-medium">{row.question}</p>
                <p className="mt-1 text-sm text-muted">{row.answer || "Not answered yet"}</p>
                <p className="mt-2 text-xs text-muted">
                  {row.title || "Untitled role"}
                  {row.company ? ` · ${row.company}` : ""}
                  {row.saved ? " · saved" : ""}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
