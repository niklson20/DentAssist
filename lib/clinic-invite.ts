import { createHmac, randomBytes, randomInt } from "node:crypto";

import { argon2Verify, argon2id } from "hash-wasm";

export const CLINIC_INVITE_SUBJECT = "Otvorite ordinaciju";

const CODE_HASH =
  /^\$argon2id\$v=19\$m=[0-9]+,t=[0-9]+,p=[0-9]+\$[A-Za-z0-9+/_-]+={0,2}\$[A-Za-z0-9+/_-]+={0,2}$/;

const CODE_MEMORY_KIB = 19456;
const CODE_ITERATIONS = 2;
const CODE_PARALLELISM = 1;
const CODE_HASH_BYTES = 32;
const CODE_SALT_BYTES = 16;

/** HMAC of the decoded link token. The same string must be hashed when the invite is sent. */
export function hashInviteToken(token: string, pepper: string | undefined): string | null {
  const secret = pepper?.trim() ?? "";
  const value = token.trim();
  if (!secret || !value) {
    return null;
  }
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function clinicInviteText(link: string, code: string): string {
  return `Link važi 7 dana: ${link}. Kod: ${code}. Na stranici potvrdite mejl i postavite lozinku.`;
}

export function clinicInviteLink(
  token: string,
  staffUrl: string | undefined,
  origin: string | null,
): string | null {
  const base = absoluteOrigin(staffUrl) ?? absoluteOrigin(origin);
  const value = token.trim();
  if (!base || !value) {
    return null;
  }
  return `${base}/poziv/${encodeURIComponent(value)}`;
}

export function randomInviteCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function isInviteCodeHash(value: string): boolean {
  return CODE_HASH.test(value) && value.length <= 300;
}

export async function hashInviteCode(code: string): Promise<string> {
  return argon2id({
    password: code,
    salt: randomBytes(CODE_SALT_BYTES),
    parallelism: CODE_PARALLELISM,
    iterations: CODE_ITERATIONS,
    memorySize: CODE_MEMORY_KIB,
    hashLength: CODE_HASH_BYTES,
    outputType: "encoded",
  });
}

export async function verifyInviteCode(codeHash: string, code: string): Promise<boolean> {
  if (!isInviteCodeHash(codeHash) || !/^\d{6}$/.test(code)) {
    return false;
  }
  try {
    return await argon2Verify({ password: code, hash: codeHash });
  } catch {
    return false;
  }
}

function absoluteOrigin(value: string | null | undefined): string | null {
  if (!value?.trim()) {
    return null;
  }
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}
