"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { atsLabel } from "@/lib/ats/detect";
import type { AtsKind } from "@/lib/types";

type Row = {
  id: string;
  title: string;
  company: string;
  ats: AtsKind;
  status: string;
  createdAt: string;
};

export function ApplicationList() {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    const load = () =>
      fetch("/api/applications")
        .then((r) => r.json())
        .then(setRows);
    void load();
    const timer = setInterval(() => void load(), 4000);
    return () => clearInterval(timer);
  }, []);

  if (!rows.length) {
    return <p className="text-sm text-muted">No applications yet.</p>;
  }

  return (
    <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
      {rows.map((row) => (
        <Link
          key={row.id}
          href={`/applications/${row.id}`}
          className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-paper/70"
        >
          <div>
            <p className="font-medium">{row.title || "Untitled role"}</p>
            <p className="text-sm text-muted">
              {row.company || "Company"} · {atsLabel(row.ats)}
            </p>
          </div>
          <StatusBadge status={row.status} />
        </Link>
      ))}
    </div>
  );
}
