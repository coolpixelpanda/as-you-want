import { ProfileForm } from "@/components/ProfileForm";
import Link from "next/link";

export default async function EditProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/profiles" className="text-sm text-muted hover:text-ink">
        ← All profiles
      </Link>
      <p className="mt-4 text-sm uppercase tracking-[0.2em] text-muted">Setup</p>
      <h1 className="mt-2 font-serif text-5xl tracking-tight">Applicant profile</h1>
      <p className="mt-3 max-w-xl text-muted">
        Drop a resume to autofill this profile. You can still edit every field before you save.
      </p>
      <div className="mt-8">
        <ProfileForm key={id} profileId={id} />
      </div>
    </div>
  );
}
