export type YesNo = "yes" | "no";
export type DeclineChoice = "yes" | "no" | "decline";

export type ApplicationStatus =
  | "queued"
  | "inspecting"
  | "mapping"
  | "ready"
  | "needs_input"
  | "applying"
  | "needs_action"
  | "submitted"
  | "failed";

export type AtsKind =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "workday"
  | "smartrecruiters"
  | "workable"
  | "icims"
  | "generic";

export type FieldType =
  | "text"
  | "textarea"
  | "email"
  | "tel"
  | "url"
  | "number"
  | "select"
  | "multiselect"
  | "radio"
  | "checkbox"
  | "file"
  | "date"
  | "combobox"
  | "hidden";

export type FormQuestion = {
  id: string;
  label: string;
  required: boolean;
  type: FieldType;
  name?: string;
  description?: string;
  options?: { label: string; value: string }[];
  section?: string;
};

export type MappedAnswer = {
  id: string;
  label: string;
  required: boolean;
  type: FieldType;
  name?: string;
  description?: string;
  options?: { label: string; value: string }[];
  value: string;
  values?: string[];
  confidence: "high" | "medium" | "low";
  source: "profile" | "generated" | "saved" | "user" | "unknown";
  note?: string;
};

export type ApplyLog = {
  t: string;
  level: "info" | "warn" | "error";
  message: string;
};

export type DetectedJob = {
  ats: AtsKind;
  boardToken?: string;
  jobId?: string;
  applyUrl: string;
  listingUrl: string;
};
