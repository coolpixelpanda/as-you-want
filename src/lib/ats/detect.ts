import type { AtsKind, DetectedJob } from "@/lib/types";

function safeUrl(raw: string): URL {
  const trimmed = raw.trim();
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return new URL(withProto);
}

export function detectJob(jobUrl: string): DetectedJob {
  const url = safeUrl(jobUrl);
  const host = url.hostname.toLowerCase();
  const path = url.pathname.replace(/\/+$/, "");
  const listingUrl = url.toString();

  if (host.includes("greenhouse.io")) {
    const embedFor = url.searchParams.get("for");
    const embedToken = url.searchParams.get("token") || url.searchParams.get("gh_jid");
    const parts = path.split("/").filter(Boolean);
    const boardToken = embedFor || parts[0];
    const jobId = embedToken || parts[parts.length - 1];
    return {
      ats: "greenhouse",
      boardToken,
      jobId,
      listingUrl,
      applyUrl: `https://job-boards.greenhouse.io/${boardToken}/jobs/${jobId}`,
    };
  }

  if (host.includes("lever.co")) {
    const parts = path.split("/").filter(Boolean);
    const company = parts[0];
    const jobId = parts[1];
    const applyUrl = path.endsWith("/apply")
      ? listingUrl
      : `https://jobs.lever.co/${company}/${jobId}/apply`;
    return { ats: "lever", boardToken: company, jobId, listingUrl, applyUrl };
  }

  if (host.includes("ashbyhq.com")) {
    return { ats: "ashby", listingUrl, applyUrl: listingUrl };
  }

  if (host.includes("myworkdayjobs.com") || host.includes("workday.com")) {
    return { ats: "workday", listingUrl, applyUrl: listingUrl };
  }

  if (host.includes("smartrecruiters.com")) {
    return { ats: "smartrecruiters", listingUrl, applyUrl: listingUrl };
  }

  if (host.includes("workable.com")) {
    return { ats: "workable", listingUrl, applyUrl: listingUrl };
  }

  if (host.includes("icims.com")) {
    return { ats: "icims", listingUrl, applyUrl: listingUrl };
  }

  const ghJid = url.searchParams.get("gh_jid");
  if (ghJid) {
    return {
      ats: "greenhouse",
      jobId: ghJid,
      listingUrl,
      applyUrl: listingUrl,
    };
  }

  return { ats: "generic", listingUrl, applyUrl: listingUrl };
}

export function atsLabel(ats: AtsKind): string {
  const labels: Record<AtsKind, string> = {
    greenhouse: "Greenhouse",
    lever: "Lever",
    ashby: "Ashby",
    workday: "Workday",
    smartrecruiters: "SmartRecruiters",
    workable: "Workable",
    icims: "iCIMS",
    generic: "Job site",
  };
  return labels[ats];
}
