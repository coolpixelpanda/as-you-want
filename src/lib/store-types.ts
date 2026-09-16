import crypto from "node:crypto";

export type Experience = {
  id: string;
  company: string;
  title: string;
  location: string;
  startMonth: string;
  startYear: string;
  endMonth: string;
  endYear: string;
  current: boolean;
  description: string;
  sortOrder: number;
};

export type Education = {
  id: string;
  school: string;
  degree: string;
  discipline: string;
  startYear: string;
  endYear: string;
  current: boolean;
  sortOrder: number;
};

export type SavedAnswer = {
  id: string;
  question: string;
  answer: string;
  source?: string;
  createdAt?: string;
};

export type Profile = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  preferredName: string;
  pronouns: string;
  email: string;
  phone: string;
  phoneCountry: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  locationLine: string;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
  websiteUrl: string;
  currentCompany: string;
  currentTitle: string;
  workAuthorizedUs: string;
  residesInUs: string;
  requiresSponsorship: string;
  salaryAmount: string;
  salaryCurrency: string;
  salaryPeriod: string;
  howHeard: string;
  coverLetter: string;
  additionalInfo: string;
  resumePath: string;
  resumeText: string;
  resumeFileName: string;
  tailoredResumePath: string;
  coverLetterPath: string;
  gender: string;
  race: string;
  disability: string;
  veteran: string;
  willingToRelocate: string;
  availableStartDate: string;
  formerEmployee: string;
  relativesAtCompany: string;
  autoSubmit: boolean;
  headedBrowser: boolean;
  fillAndSubmit: boolean;
  experiences: Experience[];
  educations: Education[];
  answers: SavedAnswer[];
  updatedAt: string;
};

export type Application = {
  id: string;
  profileId: string;
  jobUrl: string;
  applyUrl: string;
  ats: string;
  company: string;
  title: string;
  location: string;
  status: string;
  questions: string;
  mappedAnswers: string;
  logs: string;
  error: string | null;
  confirmationUrl: string | null;
  confirmationText: string | null;
  screenshotPath: string | null;
  createdAt: string;
  updatedAt: string;
};

export function defaultProfile(partial: Partial<Profile> = {}): Profile {
  return {
    id: partial.id || crypto.randomUUID(),
    name: partial.name || "Profile",
    firstName: "",
    lastName: "",
    preferredName: "",
    pronouns: "",
    email: "",
    phone: "",
    phoneCountry: "United States",
    street: "",
    city: "",
    state: "",
    postalCode: "",
    country: "United States",
    locationLine: "",
    linkedinUrl: "",
    githubUrl: "",
    portfolioUrl: "",
    websiteUrl: "",
    currentCompany: "",
    currentTitle: "",
    workAuthorizedUs: "yes",
    residesInUs: "yes",
    requiresSponsorship: "no",
    salaryAmount: "",
    salaryCurrency: "USD",
    salaryPeriod: "year",
    howHeard: "LinkedIn",
    coverLetter: "",
    additionalInfo: "",
    resumePath: "",
    resumeText: "",
    resumeFileName: "",
    tailoredResumePath: "",
    coverLetterPath: "",
    gender: "decline",
    race: "decline",
    disability: "decline",
    veteran: "decline",
    willingToRelocate: "no",
    availableStartDate: "",
    formerEmployee: "no",
    relativesAtCompany: "no",
    autoSubmit: false,
    headedBrowser: true,
    fillAndSubmit: false,
    experiences: [],
    educations: [],
    answers: [],
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

export function newId() {
  return crypto.randomUUID();
}
