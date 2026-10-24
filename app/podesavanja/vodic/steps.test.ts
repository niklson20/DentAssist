import { describe, expect, it } from "vitest";

import { buildProgressForTests, guideProgressFromFacts } from "./load-guide";
import { deriveGuideStep, forwardGuideCookie, nextGuideStep, resolveGuideStep } from "./steps";

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

  it("stays on working hours when the cookie is ahead but hours are not saved", () => {
    const progress = buildProgressForTests({
      termsAccepted: true,
      profileComplete: true,
      seesPatientsChosen: true,
      ownerSeesPatients: true,
      ownerWorkingHoursSaved: false,
      schedulingSaved: true,
    });
    expect(resolveGuideStep(progress, "scheduling")).toBe("working_hours");
    expect(resolveGuideStep(progress, "notice")).toBe("working_hours");
  });

  it("opens notice, then online, when a seeing owner saved hours and the default type", () => {
    const saved = {
      termsAccepted: true,
      address: "Knez Mihailova 1",
      phone: "011123456",
      ownerSeesPatients: true,
      appointmentTypeCount: 1,
      ownerWorkingHoursSaved: true,
      defaultAppointmentTypeId: "type-1",
      pendingDentistInvite: false,
      hasDentistMember: false,
    };

    const beforeNotice = guideProgressFromFacts({ ...saved, cookieStep: "scheduling" });
    expect(resolveGuideStep(beforeNotice, "scheduling")).toBe("notice");

    const afterNotice = guideProgressFromFacts({ ...saved, cookieStep: "invite" });
    expect(resolveGuideStep(afterNotice, "invite")).toBe("online");
  });

  it("keeps scheduling for an owner who does not see patients even when a type exists", () => {
    const progress = guideProgressFromFacts({
      termsAccepted: true,
      address: "Knez Mihailova 1",
      phone: "011123456",
      ownerSeesPatients: false,
      appointmentTypeCount: 1,
      ownerWorkingHoursSaved: false,
      defaultAppointmentTypeId: "type-1",
      cookieStep: "scheduling",
      pendingDentistInvite: false,
      hasDentistMember: false,
    });
    expect(deriveGuideStep(progress)).toBe("scheduling");
    expect(resolveGuideStep(progress, "scheduling")).toBe("scheduling");
  });

  it("does not move the guide cookie backward", () => {
    expect(forwardGuideCookie("notice", "scheduling")).toBe("notice");
    expect(forwardGuideCookie("invite", "scheduling")).toBe("invite");
    expect(forwardGuideCookie("online", "scheduling")).toBe("online");
    expect(forwardGuideCookie("scheduling", "notice")).toBe("notice");
    expect(forwardGuideCookie(null, "scheduling")).toBe("scheduling");
  });
});
