import { getActiveProfileId, listProfiles } from "@/lib/store";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ProfileRedirect() {
  const profiles = await listProfiles();
  if (!profiles.length) redirect("/profiles");
  const activeId = await getActiveProfileId();
  redirect(`/profiles/${activeId || profiles[0].id}`);
}
