import { describe, expect, it } from "vitest";

import { deviceSecretHash, randomDeviceSecret } from "./device-cookie";

describe("device cookie helpers", () => {
  it("hashes secrets with the pepper", () => {
    const secret = randomDeviceSecret();
    expect(secret.length).toBeGreaterThan(20);
    const hash = deviceSecretHash(secret, "pepper");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns null without a pepper", () => {
    expect(deviceSecretHash("secret", "")).toBeNull();
  });
});
