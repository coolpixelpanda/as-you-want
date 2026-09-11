import { getActiveProfileId } from "@/lib/store";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function ProfileRedirect() {
  redirect(`/profiles/${getActiveProfileId()}`);
}
