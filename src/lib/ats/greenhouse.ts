import type { FieldType, FormQuestion } from "@/lib/types";
import { detectJob } from "@/lib/ats/detect";

type GreenhouseField = {
  name?: string;
  type?: string;
  values?: { label?: string; value?: string | number }[];
};

type GreenhouseQuestion = {
  label?: string;
  required?: boolean;
  fields?: GreenhouseField[];
};

type GreenhouseJob = {
  id?: number;
  title?: string;
  company_name?: string;
  location?: { name?: string };
  questions?: GreenhouseQuestion[];
  location_questions?: GreenhouseQuestion[];
  compliance?: { type?: string; questions?: GreenhouseQuestion[] }[];
  demographic_questions?: {
    questions?: {
      id?: number;
      label?: string;
      required?: boolean;
      type?: string;
      answer_options?: {
        id?: number;
        label?: string;
        decline_to_answer?: boolean;
      }[];
    }[];
  };
  education?: string | null;
};

function mapGhType(type?: string): FieldType {
  switch (type) {
    case "textarea":
      return "textarea";
    case "input_file":
      return "file";
    case "multi_value_single_select":
      return "combobox";
    case "multi_value_multi_select":
      return "multiselect";
    case "input_hidden":
      return "hidden";
    default:
      return "text";
  }
}

function fromGhQuestion(q: GreenhouseQuestion, section?: string): FormQuestion[] {
  const field = q.fields?.[0];
  if (!field?.name || field.type === "input_hidden") return [];
  return [
    {
      id: field.name,
      name: field.name,
      label: q.label || field.name,
      required: Boolean(q.required),
      type: mapGhType(field.type),
      section,
      options: (field.values || [])
        .filter((v) => v.label != null)
        .map((v) => ({
          label: String(v.label),
          value: String(v.value ?? v.label),
        })),
    },
  ];
}

export async function fetchGreenhouseJob(jobUrl: string) {
  const detected = detectJob(jobUrl);
  if (detected.ats !== "greenhouse" || !detected.boardToken || !detected.jobId) {
    return null;
  }

  const endpoint = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(
    detected.boardToken,
  )}/jobs/${encodeURIComponent(detected.jobId)}?questions=true`;

  const res = await fetch(endpoint, { cache: "no-store" });
  if (!res.ok) return null;
  const data = (await res.json()) as GreenhouseJob;

  const questions: FormQuestion[] = [];
  for (const q of data.questions || []) {
    questions.push(...fromGhQuestion(q, "application"));
  }
  for (const q of data.location_questions || []) {
    questions.push(...fromGhQuestion(q, "location"));
  }
  for (const block of data.compliance || []) {
    for (const q of block.questions || []) {
      questions.push(...fromGhQuestion(q, "eeoc"));
    }
  }
  for (const q of data.demographic_questions?.questions || []) {
    questions.push({
      id: `demographic_${q.id}`,
      name: `demographic_${q.id}`,
      label: q.label || `demographic_${q.id}`,
      required: Boolean(q.required),
      type: q.type === "multi_select" ? "multiselect" : "combobox",
      section: "demographics",
      options: (q.answer_options || []).map((opt) => ({
        label: opt.label || String(opt.id),
        value: String(opt.id ?? opt.label),
      })),
    });
  }

  if (data.education === "education_required" || data.education === "education_optional") {
    questions.push({
      id: "education_school",
      name: "school_name",
      label: "School",
      required: data.education === "education_required",
      type: "text",
      section: "education",
    });
    questions.push({
      id: "education_degree",
      name: "degree",
      label: "Degree",
      required: false,
      type: "text",
      section: "education",
    });
    questions.push({
      id: "education_discipline",
      name: "discipline",
      label: "Discipline",
      required: false,
      type: "text",
      section: "education",
    });
  }

  return {
    title: data.title || "",
    company: data.company_name || detected.boardToken,
    location: data.location?.name || "",
    questions: questions.filter((q) => q.type !== "hidden"),
    applyUrl: detected.applyUrl,
  };
}
