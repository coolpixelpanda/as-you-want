import { ApplyBox } from "@/components/ApplyBox";
import { ApplicationList } from "@/components/ApplicationList";
import { getProfile, profileCompleteness } from "@/lib/profile";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let completeness = { ready: true, percent: 100, missing: [] as string[] };
  try {
    const profile = await getProfile();
    completeness = profileCompleteness(profile);
  } catch {
    completeness = { ready: false, percent: 0, missing: ["profile storage"] };
  }

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm uppercase tracking-[0.2em] text-muted">Auto apply</p>
      <h1 className="mt-2 font-serif text-5xl leading-tight tracking-tight">
        One profile. Any job link.
      </h1>
      <p className="mt-4 max-w-xl text-lg text-muted">
        Keep profiles here, then apply from LinkedIn or Workday with the Chrome
        extension — or paste a job URL below.
      </p>

      {!completeness.ready ? (
        <div className="mt-6 rounded-xl border border-[#ead0c8] bg-[#fbf1ee] px-4 py-3 text-sm">
          Profile is {completeness.percent}% ready. Still need{" "}
          {completeness.missing.join(", ")}.{" "}
          <Link href="/profiles" className="text-accent underline">
            Finish setup
          </Link>
        </div>
      ) : null}

      <div className="mt-8">
        <ApplyBox />
      </div>

      <h2 className="mt-12 font-serif text-2xl">Applications</h2>
      <div className="mt-4">
        <ApplicationList />
      </div>
    </div>
  );
}
