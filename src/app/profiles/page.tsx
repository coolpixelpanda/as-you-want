import { ProfileList } from "@/components/ProfileList";
import { ResumeStart } from "@/components/ResumeStart";

export default function ProfilesPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm uppercase tracking-[0.2em] text-muted">People</p>
      <h1 className="mt-2 font-serif text-5xl tracking-tight">Profiles</h1>
      <p className="mt-3 max-w-xl text-muted">
        Keep more than one applicant profile. The Chrome extension uses whichever
        profile you pick in its popup.
      </p>
      <div className="mt-8">
        <ResumeStart />
        <ProfileList />
      </div>
    </div>
  );
}
