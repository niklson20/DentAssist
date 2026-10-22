export type OwnPinWriteStatus = "ok" | "already_set" | "invalid";

export type OwnPinState = "set" | "unset" | "unavailable";

export function ownPinWriteStatus(value: unknown): OwnPinWriteStatus | null {
  const record = asRecord(value);
  const status = record?.status;
  if (status === "ok" || status === "already_set" || status === "invalid") {
    return status;
  }
  return null;
}

export function ownPinState(value: unknown): OwnPinState {
  if (value === true) {
    return "set";
  }
  if (value === false) {
    return "unset";
  }
  return "unavailable";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      return asRecord(JSON.parse(value) as unknown);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}
