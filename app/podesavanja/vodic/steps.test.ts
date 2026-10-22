import { describe, expect, it } from "vitest";

import { buildProgressForTests } from "./load-guide";
import { deriveGuideStep, nextGuideStep, resolveGuideStep } from "./steps";

describe("guide steps", () => {
  it("starts on terms when nothing is done", () => {
    const progress = buildProgressForTests({});
    expect(deriveGuideStep(progress)).toBe("terms");
  });

  it("requires dentist invite when the owner does not see patients", () => {
    const progress = buildProgressForTests({
      termsAccepted: true,
      profileComplete: true,
      seesPatientsChosen: true,
      ownerSeesPatients: false,
      schedulingSaved: true,
      noticeSaved: true,
      inviteSatisfied: false,
    });
    expect(deriveGuideStep(progress)).toBe("invite");
  });

  it("skips working hours when the owner does not see patients", () => {
    const progress = buildProgressForTests({
      termsAccepted: true,
      profileComplete: true,
      seesPatientsChosen: true,
      ownerSeesPatients: false,
    });
    expect(nextGuideStep("sees_patients", progress)).toBe("scheduling");
  });

  it("opens online booking after invite requirements are met", () => {
    const progress = buildProgressForTests({
      termsAccepted: true,
      profileComplete: true,
      seesPatientsChosen: true,
      ownerSeesPatients: false,
      schedulingSaved: true,
      noticeSaved: true,
      inviteSatisfied: true,
    });
    expect(deriveGuideStep(progress)).toBe("online");
  });

  it("does not let the cookie move ahead of saved progress", () => {
    const progress = buildProgressForTests({ termsAccepted: true });
    expect(resolveGuideStep(progress, "online")).toBe("profile");
  });
});
