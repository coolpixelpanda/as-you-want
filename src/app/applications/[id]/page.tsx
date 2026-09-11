import { ApplicationDetail } from "@/components/ApplicationDetail";

export default async function ApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-3xl">
      <ApplicationDetail id={id} />
    </div>
  );
}
