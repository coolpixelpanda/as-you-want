import type { ApplicationStatus } from "@/lib/types";

const styles: Record<ApplicationStatus, string> = {
  queued: "bg-[#ece6d8] text-ink",
  inspecting: "bg-[#e7eef5] text-info",
  mapping: "bg-[#e7eef5] text-info",
  ready: "bg-[#e4f0e8] text-good",
  needs_input: "bg-[#f8ead6] text-warn",
  applying: "bg-[#f8ead6] text-warn",
  needs_action: "bg-[#f8ead6] text-warn",
  submitted: "bg-[#e4f0e8] text-good",
  failed: "bg-[#f8e2e0] text-bad",
};

const labels: Record<ApplicationStatus, string> = {
  queued: "Queued",
  inspecting: "Reading form",
  mapping: "Matching fields",
  ready: "Ready",
  needs_input: "Needs answers",
  applying: "Applying",
  needs_action: "Needs you",
  submitted: "Submitted",
  failed: "Failed",
};

export function StatusBadge({ status }: { status: string }) {
  const key = (status in styles ? status : "queued") as ApplicationStatus;
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${styles[key]}`}
    >
      {labels[key]}
    </span>
  );
}
