import { readProfile, type Education, type Experience, type Profile, type SavedAnswer } from "@/lib/store";

export type FullProfile = Profile;

export async function getProfile(): Promise<FullProfile> {
  return readProfile();
}

export function profileCompleteness(profile: FullProfile) {
  const required = [
    profile.firstName,
    profile.lastName,
    profile.email,
    profile.phone,
    profile.workAuthorizedUs,
    profile.requiresSponsorship,
    profile.resumePath,
  ];
  const filled = required.filter((v) => Boolean(v && String(v).trim())).length;
  return {
    filled,
    total: required.length,
    percent: Math.round((filled / required.length) * 100),
    ready: filled === required.length,
    missing: [
      !profile.firstName && "First name",
      !profile.lastName && "Last name",
      !profile.email && "Email",
      !profile.phone && "Phone",
      !profile.workAuthorizedUs && "Work authorization",
      !profile.requiresSponsorship && "Sponsorship",
      !profile.resumePath && "Resume",
    ].filter(Boolean) as string[],
  };
}

export function profileDossier(profile: FullProfile) {
  return {
    identity: {
      firstName: profile.firstName,
      lastName: profile.lastName,
      fullName: `${profile.firstName} ${profile.lastName}`.trim(),
      preferredName: profile.preferredName,
      pronouns: profile.pronouns,
      email: profile.email,
      phone: profile.phone,
      phoneCountry: profile.phoneCountry,
    },
    location: {
      street: profile.street,
      city: profile.city,
      state: profile.state,
      postalCode: profile.postalCode,
      country: profile.country,
      locationLine:
        profile.locationLine ||
        [profile.city, profile.state, profile.country].filter(Boolean).join(", "),
    },
    links: {
      linkedinUrl: profile.linkedinUrl,
      githubUrl: profile.githubUrl,
      portfolioUrl: profile.portfolioUrl,
      websiteUrl: profile.websiteUrl,
    },
    work: {
      currentCompany: profile.currentCompany,
      currentTitle: profile.currentTitle,
      workAuthorizedUs: profile.workAuthorizedUs,
      residesInUs: profile.residesInUs || "yes",
      requiresSponsorship: profile.requiresSponsorship,
      willingToRelocate: profile.willingToRelocate,
      availableStartDate: profile.availableStartDate,
      formerEmployee: profile.formerEmployee,
      relativesAtCompany: profile.relativesAtCompany,
    },
    compensation: {
      salaryAmount: profile.salaryAmount,
      salaryCurrency: profile.salaryCurrency,
      salaryPeriod: profile.salaryPeriod,
      salaryText: profile.salaryAmount
        ? `${profile.salaryCurrency} ${profile.salaryAmount} per ${profile.salaryPeriod}`
        : "",
    },
    howHeard: profile.howHeard,
    coverLetter: profile.coverLetter,
    additionalInfo: profile.additionalInfo,
    demographics: {
      gender: profile.gender,
      race: profile.race,
      disability: profile.disability,
      veteran: profile.veteran,
    },
    experiences: profile.experiences,
    educations: profile.educations,
    savedAnswers: profile.answers,
  };
}

export type { Education, Experience, SavedAnswer };
