"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Plus, RefreshCw, Save, Trash2, Upload } from "lucide-react";
import { US_STATES, normalizeStateCode } from "@/lib/us-states";
import { Button } from "@/components/ui/Button";
import { useNotice } from "@/components/NoticeProvider";

type Exp = {
  company: string;
  title: string;
  location: string;
  startMonth: string;
  startYear: string;
  endMonth: string;
  endYear: string;
  current: boolean;
  description: string;
};

type Edu = {
  school: string;
  degree: string;
  discipline: string;
  startYear: string;
  endYear: string;
  current: boolean;
};

type Saved = { id?: string; question: string; answer: string };

const emptyExp = (): Exp => ({
  company: "",
  title: "",
  location: "",
  startMonth: "",
  startYear: "",
  endMonth: "",
  endYear: "",
  current: false,
  description: "",
});

const emptyEdu = (): Edu => ({
  school: "",
  degree: "",
  discipline: "",
  startYear: "",
  endYear: "",
  current: false,
});

function asExp(row: Record<string, unknown> | Exp): Exp {
  return {
    company: String(row.company || ""),
    title: String(row.title || ""),
    location: String(row.location || ""),
    startMonth: String(row.startMonth || ""),
    startYear: String(row.startYear || ""),
    endMonth: String(row.endMonth || ""),
    endYear: String(row.endYear || ""),
    current: Boolean(row.current),
    description: String(row.description || ""),
  };
}

function asEdu(row: Record<string, unknown> | Edu): Edu {
  return {
    school: String(row.school || ""),
    degree: String(row.degree || ""),
    discipline: String(row.discipline || ""),
    startYear: String(row.startYear || ""),
    endYear: String(row.endYear || ""),
    current: Boolean(row.current),
  };
}

function listFrom(data: Record<string, unknown>, key: string) {
  const value = data[key];
  return Array.isArray(value) ? value : [];
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-muted">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "h-11 w-full rounded-lg border border-line bg-paper px-3 text-ink outline-none ring-accent/30 focus:ring-2";
const areaClass =
  "min-h-28 w-full rounded-lg border border-line bg-paper px-3 py-2 text-ink outline-none ring-accent/30 focus:ring-2";

export function ProfileForm({ profileId }: { profileId?: string }) {
  const router = useRouter();
  const { notify, confirm } = useNotice();
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [experiences, setExperiences] = useState<Exp[]>([]);
  const [educations, setEducations] = useState<Edu[]>([]);
  const [answers, setAnswers] = useState<Saved[]>([]);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const loadGen = useRef(0);

  const idQuery = profileId ? `?id=${encodeURIComponent(profileId)}` : "";

  function applyProfile(data: Record<string, unknown>, source: "load" | "parse" | "save" = "load") {
    if (!data || typeof data !== "object") return;
    if (profileId && data.id && String(data.id) !== String(profileId)) return;
    const nextExp = listFrom(data, "experiences").map((row) => asExp(row as Record<string, unknown>));
    const nextEdu = listFrom(data, "educations").map((row) => asEdu(row as Record<string, unknown>));
    const nextAns = listFrom(data, "answers") as Saved[];
    const filledExp = nextExp.filter((row) => row.company || row.title);
    const filledEdu = nextEdu.filter((row) => row.school);
    setProfile({
      ...data,
      id: profileId || data.id,
      state: normalizeStateCode(String(data.state || "")),
    });
    setExperiences(() => {
      if (source === "parse") return filledExp.length ? filledExp : [emptyExp()];
      if (filledExp.length) return filledExp;
      return [emptyExp()];
    });
    setEducations(() => {
      if (source === "parse") return filledEdu.length ? filledEdu : [emptyEdu()];
      if (filledEdu.length) return filledEdu;
      return [emptyEdu()];
    });
    setAnswers(nextAns.length ? nextAns : [{ question: "", answer: "" }]);
  }

  useEffect(() => {
    const gen = ++loadGen.current;
    setStatus("");
    const cached = profileId ? sessionStorage.getItem(`joblink-parsed-${profileId}`) : "";
    if (cached) {
      try {
        applyProfile(JSON.parse(cached) as Record<string, unknown>, "parse");
      } catch {
        /* ignore bad cache */
      }
      sessionStorage.removeItem(`joblink-parsed-${profileId}`);
      loadGen.current += 1;
    }
    const ac = new AbortController();
    fetch(`/api/profile${idQuery}`, { signal: ac.signal, cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((data) => {
        if (!data || data.error) return;
        if (gen !== loadGen.current) return;
        if (profileId && data.id && String(data.id) !== String(profileId)) return;
        applyProfile(data as Record<string, unknown>, "load");
      })
      .catch(() => {
        /* aborted or network */
      });
    return () => ac.abort();
  }, [idQuery, profileId]);

  function set(key: string, value: unknown) {
    setProfile((p) => ({ ...(p || {}), [key]: value }));
  }

  async function upload(kind: "resume" | "cover" | "tailored", file: File) {
    const form = new FormData();
    form.set("kind", kind);
    form.set("file", file);
    if (profileId) form.set("profileId", profileId);
    if (kind === "resume") {
      setParsing(true);
      setStatus("Reading resume with OpenAI…");
    }
    try {
      const res = await fetch("/api/profile/resume", { method: "POST", body: form });
      const data = await res.json();
      if (data.profile) {
        loadGen.current += 1;
        applyProfile(
          {
            ...data.profile,
            experiences: data.profile.experiences?.length ? data.profile.experiences : data.experiences,
            educations: data.profile.educations?.length ? data.profile.educations : data.educations,
          },
          kind === "resume" ? "parse" : "save",
        );
        if (kind === "resume") {
          requestAnimationFrame(() => document.getElementById("experience")?.scrollIntoView({ behavior: "smooth", block: "start" }));
        }
      }
      else if (kind === "resume") set("resumePath", data.path);
      else if (kind === "tailored") set("tailoredResumePath", data.path);
      else set("coverLetterPath", data.path);
      setStatus(
        data.error ||
          data.message ||
          (kind === "resume"
            ? "Original resume uploaded."
            : kind === "tailored"
              ? "Tailored resume uploaded."
              : "Cover letter uploaded."),
      );
      if (data.error) notify("error", data.error);
      else notify("success", data.message || (kind === "resume" ? "Resume parsed." : "File uploaded."));
    } catch {
      setStatus("Could not upload that file.");
      notify("error", "Could not upload that file.");
    } finally {
      setParsing(false);
    }
  }

  async function reparse() {
    setParsing(true);
    setStatus("Reading resume with OpenAI…");
    try {
      const res = await fetch("/api/profile/parse-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId }),
      });
      const data = await res.json();
      if (data.profile) {
        loadGen.current += 1;
        applyProfile(
          {
            ...data.profile,
            experiences: data.profile.experiences?.length ? data.profile.experiences : data.experiences,
            educations: data.profile.educations?.length ? data.profile.educations : data.educations,
          },
          "parse",
        );
      }
      setStatus(data.error || data.message || "Parsed.");
      if (data.error) notify("error", data.error);
      else notify("success", data.message || "Resume parsed.");
    } catch {
      setStatus("Could not parse the resume.");
      notify("error", "Could not parse the resume.");
    } finally {
      setParsing(false);
    }
  }

  async function save() {
    if (!profile) return;
    setSaving(true);
    setStatus("");
    try {
      const res = await fetch(`/api/profile${idQuery}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...profile,
          experiences: experiences.filter((e) => e.company || e.title),
          educations: educations.filter((e) => e.school),
          answers: answers.filter((a) => a.question && a.answer),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.profile) applyProfile(data.profile, "save");
      setStatus(res.ok ? "Saved." : data.error || "Could not save.");
      notify(res.ok ? "success" : "error", res.ok ? "Profile saved." : data.error || "Could not save.");
    } catch {
      setStatus("Could not save.");
      notify("error", "Could not save this profile.");
    } finally {
      setSaving(false);
    }
  }

  async function removeProfile() {
    if (!profileId) return;
    const ok = await confirm({
      title: "Delete this profile?",
      message: "This draft, including the resume, jobs, and schools, will be removed.",
      confirmLabel: "Delete profile",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/profiles?id=${encodeURIComponent(profileId)}`, { method: "DELETE", cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      notify("error", data.error || "Could not delete this profile.");
      return;
    }
    notify("success", "Profile deleted.");
    router.push("/profiles");
    router.refresh();
  }

  if (!profile) {
    return (
      <div className="flex items-center gap-2 text-muted">
        <LoaderCircle className="animate-spin" size={16} /> Loading profile
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-line bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="font-serif text-2xl">Start from a resume</h2>
          {profileId ? (
            <Button variant="danger" icon={Trash2} onClick={() => void removeProfile()}>
              Delete profile
            </Button>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-muted">
          Drop a PDF, DOCX, or TXT resume. We fill name, contact, links, jobs, and schools, then you can edit anything below.
        </p>
        <div className="mt-4">
          <Field label="Profile name">
            <input className={inputClass} value={String(profile.name || "")} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Software engineer — US" />
          </Field>
        </div>
        <label
          className={`mt-4 flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-4 py-8 text-center transition hover:border-accent hover:bg-[#f7efe6] ${
            dragOver ? "border-accent bg-[#f7efe6]" : "border-line bg-paper/70"
          } ${parsing ? "opacity-70" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void upload("resume", file);
          }}
        >
          {parsing ? <LoaderCircle className="animate-spin text-accent" size={22} /> : <Upload size={22} />}
          <p className="mt-3 text-sm font-medium">{parsing ? "Reading resume and filling the profile…" : "Drop resume here or click to upload"}</p>
          <p className="mt-1 text-xs text-muted">
            {profile.resumeFileName ? `Current file: ${String(profile.resumeFileName)}` : "PDF, DOCX, or TXT"}
          </p>
          <input
            type="file"
            className="hidden"
            accept=".pdf,.doc,.docx,.txt,.rtf"
            disabled={parsing}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void upload("resume", file);
            }}
          />
        </label>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {profile.resumePath || profile.resumeText ? (
            <Button variant="secondary" icon={RefreshCw} loading={parsing} onClick={() => void reparse()}>
              Parse again
            </Button>
          ) : null}
        </div>
        {status ? <p className="mt-3 text-sm text-muted">{status}</p> : null}
        {profile.firstName || profile.email ? (
          <p className="mt-3 text-sm">
            Autofilled{" "}
            {[
              profile.firstName && "name",
              profile.email && "email",
              profile.phone && "phone",
              profile.currentTitle && "title",
              Array.isArray(experiences) && experiences.some((row) => row.company) && "experience",
              Array.isArray(educations) && educations.some((row) => row.school) && "education",
            ]
              .filter(Boolean)
              .join(", ")}
            . Review the fields below, then save.
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-line bg-card p-6">
        <h2 className="font-serif text-2xl">Identity</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="First name">
            <input className={inputClass} value={String(profile.firstName || "")} onChange={(e) => set("firstName", e.target.value)} />
          </Field>
          <Field label="Last name">
            <input className={inputClass} value={String(profile.lastName || "")} onChange={(e) => set("lastName", e.target.value)} />
          </Field>
          <Field label="Preferred name">
            <input className={inputClass} value={String(profile.preferredName || "")} onChange={(e) => set("preferredName", e.target.value)} />
          </Field>
          <Field label="Pronouns">
            <input className={inputClass} value={String(profile.pronouns || "")} onChange={(e) => set("pronouns", e.target.value)} />
          </Field>
          <Field label="Email">
            <input className={inputClass} type="email" value={String(profile.email || "")} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Phone country">
            <input className={inputClass} value={String(profile.phoneCountry || "United States")} onChange={(e) => set("phoneCountry", e.target.value)} placeholder="United States" />
          </Field>
          <Field label="Phone">
            <input className={inputClass} value={String(profile.phone || "")} onChange={(e) => set("phone", e.target.value)} />
          </Field>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-card p-6">
        <h2 className="font-serif text-2xl">Location</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Street">
            <input className={inputClass} value={String(profile.street || "")} onChange={(e) => set("street", e.target.value)} />
          </Field>
          <Field label="City">
            <input className={inputClass} value={String(profile.city || "")} onChange={(e) => set("city", e.target.value)} />
          </Field>
          <Field label="State">
            <select
              className={inputClass}
              value={normalizeStateCode(String(profile.state || ""))}
              onChange={(e) => {
                const code = e.target.value;
                const named = US_STATES.find((row) => row.code === code);
                set("state", code);
                const city = String(profile.city || "");
                if (city && named) set("locationLine", `${city}, ${named.name}, United States`);
              }}
            >
              <option value="">Select a state</option>
              {US_STATES.map((row) => (
                <option key={row.code} value={row.code}>
                  {row.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Postal code">
            <input className={inputClass} value={String(profile.postalCode || "")} onChange={(e) => set("postalCode", e.target.value)} />
          </Field>
          <Field label="Country">
            <input className={inputClass} value={String(profile.country || "")} onChange={(e) => set("country", e.target.value)} />
          </Field>
          <Field label="Location line (city typeaheads)">
            <input
              className={inputClass}
              placeholder="Austin, Texas, United States"
              value={String(profile.locationLine || "")}
              onChange={(e) => set("locationLine", e.target.value)}
            />
          </Field>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-card p-6">
        <h2 className="font-serif text-2xl">Links</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="LinkedIn URL">
            <input className={inputClass} value={String(profile.linkedinUrl || "")} onChange={(e) => set("linkedinUrl", e.target.value)} />
          </Field>
          <Field label="GitHub URL">
            <input className={inputClass} value={String(profile.githubUrl || "")} onChange={(e) => set("githubUrl", e.target.value)} />
          </Field>
          <Field label="Portfolio URL">
            <input className={inputClass} value={String(profile.portfolioUrl || "")} onChange={(e) => set("portfolioUrl", e.target.value)} />
          </Field>
          <Field label="Website">
            <input className={inputClass} value={String(profile.websiteUrl || "")} onChange={(e) => set("websiteUrl", e.target.value)} />
          </Field>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-card p-6">
        <h2 className="font-serif text-2xl">Work eligibility</h2>
        <p className="mt-1 text-sm text-muted">
          These map to the common yes/no questions: whether you live in the United States, authorized to work there, and whether you need sponsorship.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Do you currently reside in the US?">
            <select className={inputClass} value={String(profile.residesInUs ?? "yes")} onChange={(e) => set("residesInUs", e.target.value)}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </Field>
          <Field label="Authorized to work in the United States?">
            <select className={inputClass} value={String(profile.workAuthorizedUs)} onChange={(e) => set("workAuthorizedUs", e.target.value)}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </Field>
          <Field label="Will you now or in the future require sponsorship?">
            <select className={inputClass} value={String(profile.requiresSponsorship)} onChange={(e) => set("requiresSponsorship", e.target.value)}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </Field>
          <Field label="Willing to relocate?">
            <select className={inputClass} value={String(profile.willingToRelocate)} onChange={(e) => set("willingToRelocate", e.target.value)}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </Field>
          <Field label="Available start date">
            <input className={inputClass} value={String(profile.availableStartDate || "")} onChange={(e) => set("availableStartDate", e.target.value)} />
          </Field>
          <Field label="Current company">
            <input className={inputClass} value={String(profile.currentCompany || "")} onChange={(e) => set("currentCompany", e.target.value)} />
          </Field>
          <Field label="Current title">
            <input className={inputClass} value={String(profile.currentTitle || "")} onChange={(e) => set("currentTitle", e.target.value)} />
          </Field>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-card p-6">
        <h2 className="font-serif text-2xl">Compensation and source</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Salary expectation">
            <input className={inputClass} placeholder="120000" value={String(profile.salaryAmount || "")} onChange={(e) => set("salaryAmount", e.target.value)} />
          </Field>
          <Field label="Period">
            <select className={inputClass} value={String(profile.salaryPeriod)} onChange={(e) => set("salaryPeriod", e.target.value)}>
              <option value="year">Year</option>
              <option value="hour">Hour</option>
            </select>
          </Field>
          <Field label="How did you hear about this job? (default)">
            <input
              className={inputClass}
              list="heard-options"
              value={String(profile.howHeard || "")}
              onChange={(e) => set("howHeard", e.target.value)}
            />
            <datalist id="heard-options">
              <option value="LinkedIn" />
              <option value="Indeed" />
              <option value="Glassdoor" />
              <option value="Company Website" />
              <option value="Employee Referral" />
              <option value="Recruiter" />
              <option value="University" />
              <option value="Other" />
            </datalist>
          </Field>
        </div>
      </section>

      <section id="experience" className="rounded-2xl border border-line bg-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-2xl">Experience</h2>
          <Button variant="ghost" size="sm" icon={Plus} onClick={() => setExperiences((rows) => [...rows, emptyExp()])}>
            Add
          </Button>
        </div>
        <p className="mt-1 text-sm text-muted">
          {experiences.filter((row) => row.company || row.title).length
            ? `${experiences.filter((row) => row.company || row.title).length} role(s) from the resume.`
            : "Upload a resume to fill every job listed there."}
        </p>
        <div className="mt-4 space-y-6">
          {experiences.map((row, i) => (
            <div key={`${row.company}-${row.title}-${i}`} className="rounded-xl border border-line p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <input className={inputClass} placeholder="Company" value={row.company || ""} onChange={(e) => setExperiences(patch(experiences, i, { company: e.target.value }))} />
                <input className={inputClass} placeholder="Title" value={row.title || ""} onChange={(e) => setExperiences(patch(experiences, i, { title: e.target.value }))} />
                <input className={inputClass} placeholder="Location" value={row.location || ""} onChange={(e) => setExperiences(patch(experiences, i, { location: e.target.value }))} />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={Boolean(row.current)} onChange={(e) => setExperiences(patch(experiences, i, { current: e.target.checked }))} />
                  Current role
                </label>
                <input className={inputClass} placeholder="Start month" value={row.startMonth || ""} onChange={(e) => setExperiences(patch(experiences, i, { startMonth: e.target.value }))} />
                <input className={inputClass} placeholder="Start year" value={row.startYear || ""} onChange={(e) => setExperiences(patch(experiences, i, { startYear: e.target.value }))} />
                <input className={inputClass} placeholder="End month" value={row.endMonth || ""} onChange={(e) => setExperiences(patch(experiences, i, { endMonth: e.target.value }))} />
                <input className={inputClass} placeholder="End year" value={row.endYear || ""} onChange={(e) => setExperiences(patch(experiences, i, { endYear: e.target.value }))} />
              </div>
              <textarea className={`${areaClass} mt-3`} placeholder="What you did" value={row.description || ""} onChange={(e) => setExperiences(patch(experiences, i, { description: e.target.value }))} />
              <Button
                variant="danger"
                size="sm"
                icon={Trash2}
                className="mt-3"
                onClick={() => setExperiences(experiences.filter((_, idx) => idx !== i))}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section id="education" className="rounded-2xl border border-line bg-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-2xl">Education</h2>
          <Button variant="ghost" size="sm" icon={Plus} onClick={() => setEducations((rows) => [...rows, emptyEdu()])}>
            Add
          </Button>
        </div>
        <p className="mt-1 text-sm text-muted">
          {educations.filter((row) => row.school).length
            ? `${educations.filter((row) => row.school).length} school(s) from the resume.`
            : "Upload a resume to fill every school listed there."}
        </p>
        <div className="mt-4 space-y-4">
          {educations.map((row, i) => (
            <div key={`${row.school}-${row.degree}-${i}`} className="rounded-xl border border-line p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <input className={inputClass} placeholder="School" value={row.school || ""} onChange={(e) => setEducations(patch(educations, i, { school: e.target.value }))} />
                <input className={inputClass} placeholder="Degree" value={row.degree || ""} onChange={(e) => setEducations(patch(educations, i, { degree: e.target.value }))} />
                <input className={inputClass} placeholder="Discipline / major" value={row.discipline || ""} onChange={(e) => setEducations(patch(educations, i, { discipline: e.target.value }))} />
                <input className={inputClass} placeholder="Start year" value={row.startYear || ""} onChange={(e) => setEducations(patch(educations, i, { startYear: e.target.value }))} />
                <input className={inputClass} placeholder="End year" value={row.endYear || ""} onChange={(e) => setEducations(patch(educations, i, { endYear: e.target.value }))} />
              </div>
              <Button
                variant="danger"
                size="sm"
                icon={Trash2}
                className="mt-3"
                onClick={() => setEducations(educations.filter((_, idx) => idx !== i))}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-card p-6">
        <h2 className="font-serif text-2xl">Demographics</h2>
        <p className="mt-1 text-sm text-muted">
          Voluntary on most US boards. Used for gender, disability, veteran, and race/ethnicity dropdowns. “Decline” is the safe default.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Gender">
            <select className={inputClass} value={String(profile.gender)} onChange={(e) => set("gender", e.target.value)}>
              <option value="decline">Decline to self-identify</option>
              <option value="man">Man</option>
              <option value="woman">Woman</option>
              <option value="non_binary">Non-binary</option>
            </select>
          </Field>
          <Field label="Disability">
            <select className={inputClass} value={String(profile.disability)} onChange={(e) => set("disability", e.target.value)}>
              <option value="decline">Decline to self-identify</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </Field>
          <Field label="Veteran">
            <select className={inputClass} value={String(profile.veteran)} onChange={(e) => set("veteran", e.target.value)}>
              <option value="decline">Decline to self-identify</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </Field>
          <Field label="Race / ethnicity default">
            <select className={inputClass} value={String(profile.race)} onChange={(e) => set("race", e.target.value)}>
              <option value="decline">Decline to self-identify</option>
              <option value="White or European">White or European</option>
              <option value="Black or of African descent">Black or of African descent</option>
              <option value="Hispanic, Latinx or of Spanish Origin">Hispanic, Latinx or of Spanish Origin</option>
              <option value="East Asian">East Asian</option>
              <option value="South Asian">South Asian</option>
              <option value="Southeast Asian">Southeast Asian</option>
              <option value="Middle Eastern or North African">Middle Eastern or North African</option>
              <option value="Indigenous, American Indian or Alaska Native">Indigenous, American Indian or Alaska Native</option>
              <option value="Native Hawaiian or Pacific Islander">Native Hawaiian or Pacific Islander</option>
            </select>
          </Field>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-card p-6">
        <h2 className="font-serif text-2xl">Documents and letters</h2>
        <div className="mt-4 grid gap-4">
          <p className="text-sm text-muted">
            Easy Apply attaches this file as <span className="text-ink">FirstName_LastName.pdf</span> or .docx. Pick original or tailored in the extension.
          </p>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-line p-4 transition hover:border-accent hover:bg-[#f7efe6]">
            <Upload size={16} />
            <span className="text-sm">
              Original resume {profile.resumePath ? <span className="text-muted">· uploaded</span> : <span className="text-bad">· required</span>}
            </span>
            <input
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.txt,.rtf"
              disabled={parsing}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void upload("resume", file);
              }}
            />
          </label>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-line p-4 transition hover:border-accent hover:bg-[#f7efe6]">
            <Upload size={16} />
            <span className="text-sm">
              Tailored resume {profile.tailoredResumePath ? <span className="text-muted">· uploaded</span> : <span className="text-muted">· optional</span>}
            </span>
            <input
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.txt,.rtf"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void upload("tailored", file);
              }}
            />
          </label>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-line p-4 transition hover:border-accent hover:bg-[#f7efe6]">
            <Upload size={16} />
            <span className="text-sm">
              Cover letter file {profile.coverLetterPath ? <span className="text-muted">· uploaded</span> : null}
            </span>
            <input type="file" className="hidden" accept=".pdf,.doc,.docx,.txt,.rtf" onChange={(e) => e.target.files?.[0] && upload("cover", e.target.files[0])} />
          </label>
          <Field label="Cover letter text (used when a form asks for it)">
            <textarea className={areaClass} value={String(profile.coverLetter || "")} onChange={(e) => set("coverLetter", e.target.value)} />
          </Field>
          <Field label="Additional information">
            <textarea className={areaClass} value={String(profile.additionalInfo || "")} onChange={(e) => set("additionalInfo", e.target.value)} />
          </Field>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-2xl">Saved answers</h2>
          <Button variant="ghost" size="sm" icon={Plus} onClick={() => setAnswers((rows) => [...rows, { question: "", answer: "" }])}>
            Add
          </Button>
        </div>
        <p className="mt-1 text-sm text-muted">
          Default answers from this profile are listed here. Each question keeps one answer — saving the same question again replaces the previous answer.
        </p>
        <div className="mt-4 space-y-4">
          {answers.map((row, i) => (
            <div key={row.id || i} className="rounded-xl border border-line bg-paper/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-3">
                  <Field label="Question">
                    <input
                      className={inputClass}
                      placeholder="Question"
                      value={row.question}
                      onChange={(e) => setAnswers(patch(answers, i, { question: e.target.value }))}
                    />
                  </Field>
                  <Field label="Answer">
                    <textarea
                      className={areaClass}
                      placeholder="Answer"
                      value={row.answer}
                      onChange={(e) => setAnswers(patch(answers, i, { answer: e.target.value }))}
                    />
                  </Field>
                </div>
                <Button
                  variant="danger"
                  icon={Trash2}
                  className="mt-7 shrink-0"
                  onClick={() => setAnswers(answers.filter((_, idx) => idx !== i))}
                  aria-label="Remove saved answer"
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-card p-6">
        <h2 className="font-serif text-2xl">Automation</h2>
        <div className="mt-4 space-y-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={Boolean(profile.headedBrowser)} onChange={(e) => set("headedBrowser", e.target.checked)} />
            Show the browser while applying (recommended so you can finish captchas)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={Boolean(profile.fillAndSubmit)} onChange={(e) => set("fillAndSubmit", e.target.checked)} />
            After mapping, fill and submit without waiting
          </label>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" icon={Save} loading={saving} onClick={() => void save()}>
          Save profile
        </Button>
        {profileId ? (
          <Button variant="danger" icon={Trash2} onClick={() => void removeProfile()}>
            Delete profile
          </Button>
        ) : null}
        {status ? <span className="text-sm text-muted">{status}</span> : null}
      </div>
    </div>
  );
}

function patch<T>(rows: T[], i: number, part: Partial<T>) {
  return rows.map((row, idx) => (idx === i ? { ...row, ...part } : row));
}
