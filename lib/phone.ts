const STORED_PHONE = /^\+381[1-9]\d{7,9}$/;

export function normalizePhone(input: string): string | null {
  const compact = input.replace(/[\s/–—-]/g, "");
  let value = compact;
  if (value.startsWith("00")) {
    value = `+${value.slice(2)}`;
  } else if (value.startsWith("0")) {
    value = `+381${value.slice(1)}`;
  }
  if (!STORED_PHONE.test(value)) {
    return null;
  }
  return value;
}
