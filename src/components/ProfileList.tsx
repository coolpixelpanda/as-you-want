"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

type Row = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  currentTitle: string;
  hasResume: boolean;
  updatedAt: string;
};

export function ProfileList() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [activeId, setActiveId] = useState("");

  async function load() {
    const res = await fetch("/api/profiles");
    const data = await res.json();
    setRows(data.profiles || []);
    setActiveId(data.activeId || "");
  }

  useEffect(() => {
    void load();
  }, []);

  async function create() {
    const res = await fetch("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New profile" }),
    });
    const profile = await res.json();
    router.push(`/profiles/${profile.id}`);
  }

  async function activate(id: string) {
    await fetch("/api/profiles", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setActiveId(id);
  }

  async function remove(id: string) {
    if (!confirm("Delete this profile?")) return;
    await fetch(`/api/profiles?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => void create()}
        className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm text-white hover:bg-accent-dark"
      >
        <Plus size={16} /> New profile
      </button>
      <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center justify-between gap-4 px-5 py-4">
            <Link href={`/profiles/${row.id}`} className="min-w-0">
              <p className="font-medium">
                {row.name}
                {row.id === activeId ? (
                  <span className="ml-2 rounded-full bg-[#e4f0e8] px-2 py-0.5 text-xs text-good">
                    Active
                  </span>
                ) : null}
              </p>
              <p className="truncate text-sm text-muted">
                {row.currentTitle || "No title"} · {row.email || "No email"}
                {row.hasResume ? " · Resume ready" : " · No resume"}
              </p>
            </Link>
            <div className="flex shrink-0 gap-2">
              {row.id !== activeId ? (
                <button type="button" className="text-sm text-accent" onClick={() => void activate(row.id)}>
                  Use
                </button>
              ) : null}
              <button type="button" className="text-sm text-bad" onClick={() => void remove(row.id)}>
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
