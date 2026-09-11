"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoaderCircle, Upload } from "lucide-react";

export function ResumeStart() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  async function start(file: File) {
    setBusy(true);
    setError("");
    try {
      const created = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New profile" }),
      });
      const profile = await created.json();
      if (!profile?.id) throw new Error("Could not create a profile.");
      const form = new FormData();
      form.set("kind", "resume");
      form.set("file", file);
      form.set("profileId", profile.id);
      const parsed = await fetch("/api/profile/resume", { method: "POST", body: form });
      const data = await parsed.json();
      if (data.error && !data.profile) throw new Error(data.error);
      router.push(`/profiles/${profile.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that resume.");
      setBusy(false);
    }
  }

  return (
    <div className="mb-8 rounded-2xl border border-line bg-card p-6">
      <h2 className="font-serif text-2xl">Build a profile from a resume</h2>
      <p className="mt-1 text-sm text-muted">
        Upload a PDF, DOCX, or TXT file. We create the profile and fill name, contact, jobs, and schools.
      </p>
      <label
        className={`mt-4 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-4 py-8 text-center ${
          dragOver ? "border-accent bg-[#f7efe6]" : "border-line bg-paper/70"
        } ${busy ? "opacity-70" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void start(file);
        }}
      >
        {busy ? <LoaderCircle className="animate-spin text-accent" size={22} /> : <Upload size={22} />}
        <p className="mt-3 text-sm font-medium">{busy ? "Parsing resume…" : "Drop resume here or click to upload"}</p>
        <input
          type="file"
          className="hidden"
          accept=".pdf,.doc,.docx,.txt,.rtf"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void start(file);
          }}
        />
      </label>
      {error ? <p className="mt-3 text-sm text-bad">{error}</p> : null}
    </div>
  );
}
