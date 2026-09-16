import { getActiveProfileId } from "@/lib/store";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ProfileRedirect() {
  redirect(`/profiles/${await getActiveProfileId()}`);
}
