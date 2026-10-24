import { cookies } from "next/headers";

import { forwardGuideCookie, isGuideStep, type GuideStep } from "./steps";

const COOKIE_NAME = "clinic_setup_step";

export async function readGuideStepCookie(): Promise<GuideStep | null> {
  const store = await cookies();
  const value = store.get(COOKIE_NAME)?.value;
  if (!value || !isGuideStep(value)) {
    return null;
  }
  return value;
}

export async function writeGuideStepCookie(step: GuideStep): Promise<void> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  const current = raw && isGuideStep(raw) ? raw : null;
  if (current && forwardGuideCookie(current, step) === current) {
    return;
  }
  store.set(COOKIE_NAME, step, {
    httpOnly: true,
    sameSite: "lax",
    path: "/podesavanja",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearGuideStepCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
