import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireMember: vi.fn(),
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
  from: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireMember: mocks.requireMember }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createClient,
}));

import { saveWorkingHours } from "./actions";

const clinicId = "11111111-1111-4111-8111-111111111111";
const ownerUserId = "10000000-0000-4000-8000-000000000002";
const dentistUserId = "10000000-0000-4000-8000-000000000003";
const ownerMemberId = "22222222-2222-4222-8222-222222222222";
const dentistMemberId = "33333333-3333-4333-8333-333333333333";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
}

function weekdayFields(): Record<string, string> {
  const fields: Record<string, string> = { memberId: dentistMemberId };
  for (let isoDow = 1; isoDow <= 7; isoDow += 1) {
    const weekday = isoDow <= 5;
    if (!weekday) {
      fields[`closed_${isoDow}`] = "true";
      continue;
    }
    fields[`opens_${isoDow}`] = "09:00";
    fields[`closes_${isoDow}`] = "17:00";
    fields[`breakStart_${isoDow}`] = "12:00";
    fields[`breakEnd_${isoDow}`] = "12:30";
  }
  return fields;
}

beforeEach(() => {
  mocks.requireMember.mockReset();
  mocks.createClient.mockReset();
  mocks.revalidatePath.mockReset();
  mocks.from.mockReset();
  mocks.upsert.mockReset();
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.createClient.mockResolvedValue({ from: mocks.from });
  mocks.from.mockImplementation((table: string) => {
    if (table === "clinic_members") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: dentistMemberId, user_id: dentistUserId, sees_patients: true },
                error: null,
              }),
            }),
          }),
        }),
      };
    }
    if (table === "working_hours") {
      return { upsert: mocks.upsert };
    }
    throw new Error(`unexpected table ${table}`);
  });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("saveWorkingHours", () => {
  it("lets the owner save a dentist week", async () => {
    mocks.requireMember.mockResolvedValue({
      userId: ownerUserId,
      clinicId,
      role: "owner",
    });
    const result = await saveWorkingHours(null, form(weekdayFields()));
    expect(result.ok).toBe(true);
    expect(mocks.upsert).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/podesavanja/radno-vreme");
  });

  it("blocks a dentist from saving someone else schedule", async () => {
    mocks.requireMember.mockResolvedValue({
      userId: dentistUserId,
      clinicId,
      role: "dentist",
    });
    mocks.from.mockImplementation((table: string) => {
      if (table === "clinic_members") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: ownerMemberId, user_id: ownerUserId, sees_patients: true },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      return { upsert: mocks.upsert };
    });
    const result = await saveWorkingHours(
      null,
      form({ ...weekdayFields(), memberId: ownerMemberId }),
    );
    expect(result.ok).toBe(false);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
