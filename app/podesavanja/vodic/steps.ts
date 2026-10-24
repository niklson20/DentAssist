export const GUIDE_STEP_ORDER = [
  "terms",
  "profile",
  "sees_patients",
  "working_hours",
  "scheduling",
  "notice",
  "invite",
  "online",
] as const;

export type GuideStep = (typeof GUIDE_STEP_ORDER)[number];

export type GuideProgressSnapshot = {
  termsAccepted: boolean;
  profileComplete: boolean;
  seesPatientsChosen: boolean;
  ownerSeesPatients: boolean;
  ownerWorkingHoursSaved: boolean;
  schedulingSaved: boolean;
  noticeSaved: boolean;
  inviteSatisfied: boolean;
};

export function guideStepIndex(step: GuideStep): number {
  return GUIDE_STEP_ORDER.indexOf(step);
}

export function isGuideStep(value: string): value is GuideStep {
  return (GUIDE_STEP_ORDER as readonly string[]).includes(value);
}

export function forwardGuideCookie(current: GuideStep | null, requested: GuideStep): GuideStep {
  if (current && guideStepIndex(current) > guideStepIndex(requested)) {
    return current;
  }
  return requested;
}

export function resolveGuideStep(
  progress: GuideProgressSnapshot,
  cookieStep: GuideStep | null,
): GuideStep {
  const derived = deriveGuideStep(progress);
  if (!cookieStep) {
    return derived;
  }
  if (guideStepIndex(cookieStep) < guideStepIndex(derived)) {
    return derived;
  }
  if (!stepPrerequisitesMet(cookieStep, progress)) {
    return derived;
  }
  return cookieStep;
}

export function deriveGuideStep(progress: GuideProgressSnapshot): GuideStep {
  if (!progress.termsAccepted) {
    return "terms";
  }
  if (!progress.profileComplete) {
    return "profile";
  }
  if (!progress.seesPatientsChosen) {
    return "sees_patients";
  }
  if (progress.ownerSeesPatients && !progress.ownerWorkingHoursSaved) {
    return "working_hours";
  }
  if (!progress.schedulingSaved) {
    return "scheduling";
  }
  if (!progress.noticeSaved) {
    return "notice";
  }
  if (!progress.inviteSatisfied) {
    return "invite";
  }
  return "online";
}

export function nextGuideStep(current: GuideStep, progress: GuideProgressSnapshot): GuideStep {
  const start = guideStepIndex(current);
  for (let index = start + 1; index < GUIDE_STEP_ORDER.length; index += 1) {
    const candidate = GUIDE_STEP_ORDER[index];
    if (candidate === "working_hours" && !progress.ownerSeesPatients) {
      continue;
    }
    return candidate;
  }
  return "online";
}

function stepPrerequisitesMet(step: GuideStep, progress: GuideProgressSnapshot): boolean {
  return guideStepIndex(step) <= guideStepIndex(deriveGuideStep(progress));
}
