"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useNotice } from "@/components/NoticeProvider";

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
  const { notify, confirm } = useNotice();
  const [rows, setRows] = useState<Row[]>([]);
  const [activeId, setActiveId] = useState("");

  const applySnapshot = useCallback((data: { profiles?: Row[]; activeId?: string }, deletedId?: string) => {
    const next = (data.profiles || []).filter((row) => row.id !== deletedId);
    setRows(next);
    setActiveId(data.activeId && data.activeId !== deletedId ? data.activeId : next[0]?.id || "");
  }, []);

  const load = useCallback(async () => {
    const res = await fetch("/api/profiles", { cache: "no-store" });
    const data = await res.json();
    applySnapshot(data);
  }, [applySnapshot]);

  useEffect(() => {
    void load();
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  async function create() {
    const res = await fetch("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New profile" }),
      cache: "no-store",
    });
    const profile = await res.json();
    if (!res.ok || !profile?.id) {
      notify("error", profile.error || "Could not create a profile.");
      return;
    }
    notify("success", "New profile created.");
    router.push(`/profiles/${profile.id}`);
  }

  async function activate(id: string) {
    const res = await fetch("/api/profiles", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      notify("error", data.error || "Could not switch the active profile.");
      return;
    }
    applySnapshot(data);
    notify("success", "This profile is now active.");
  }

  async function remove(id: string) {
    const ok = await confirm({
      title: "Delete this profile?",
      message: "The resume, jobs, schools, and saved answers on this profile will be removed.",
      confirmLabel: "Delete profile",
      danger: true,
    });
    if (!ok) return;
    setRows((current) => current.filter((row) => row.id !== id));
    setActiveId((current) => (current === id ? "" : current));
    const res = await fetch(`/api/profiles?id=${encodeURIComponent(id)}`, { method: "DELETE", cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      notify("error", data.error || "Could not delete this profile.");
      await load();
      return;
    }
    applySnapshot(data, id);
    notify("success", "Profile deleted.");
  }

  return (
    <div className="space-y-4">
      <Button variant="accent" icon={Plus} onClick={() => void create()}>
        New profile
      </Button>
      {!rows.length ? (
        <div className="rounded-2xl border border-dashed border-line bg-card px-5 py-8 text-sm text-muted">
          No profiles yet. Upload a resume or create a new profile.
        </div>
      ) : (
        <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center justify-between gap-4 px-5 py-4">
              <Link href={`/profiles/${row.id}`} className="min-w-0 rounded-lg transition hover:text-accent">
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
                  <Button variant="ghost" icon={Check} onClick={() => void activate(row.id)}>
                    Use
                  </Button>
                ) : null}
                <Button variant="danger" icon={Trash2} aria-label="Delete profile" onClick={() => void remove(row.id)} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
