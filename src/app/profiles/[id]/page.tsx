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
        Upload a resume (PDF, DOCX, or TXT). We parse it with OpenAI and fill the fields below.
      </p>
      <div className="mt-8">
        <ProfileForm profileId={id} />
      </div>
    </div>
  );
}
