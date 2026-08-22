import { createHmac, timingSafeEqual } from "crypto";

/**
 * Stateless, dependency-free session token: `base64url(payload).hmac`.
 *
 * There is no database and exactly one configured user (AUTH_USERNAME /
 * AUTH_PASSWORD in .env.local — see .env.example), so a signed cookie is
 * enough: no session store to read on every request. The HMAC key is
 * derived from those same two env vars, which is why changing either one
 * invalidates every existing session — there's nothing else this app's
 * "identity" is anchored to.
 *
 * Runs in `proxy.ts` (Next.js 16's replacement for middleware.ts — see
 * https://nextjs.org/docs/messages/middleware-to-proxy) and in the
 * app/api/auth/* route handlers. Both run in the Node.js runtime, so the
 * built-in `crypto` module is available in both places.
 */

export const SESSION_COOKIE_NAME = "tc_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

function signingKey(): string {
  const { AUTH_USERNAME, AUTH_PASSWORD } = process.env;
  if (!AUTH_USERNAME || !AUTH_PASSWORD) {
    throw new Error(
      "AUTH_USERNAME / AUTH_PASSWORD are not set — add them to .env.local (see .env.example).",
    );
  }
  return `${AUTH_USERNAME}:${AUTH_PASSWORD}`;
}

function sign(encodedPayload: string): string {
  return createHmac("sha256", signingKey()).update(encodedPayload).digest("base64url");
}

export function createSessionToken(
  username: string,
  maxAgeSeconds = SESSION_MAX_AGE_SECONDS,
): string {
  const payload = JSON.stringify({
    u: username,
    exp: Date.now() + maxAgeSeconds * 1000,
  });
  const encodedPayload = Buffer.from(payload, "utf8").toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

/** Verifies signature and expiry. Never throws — a malformed/missing token
 * just reads as "not authenticated" to every caller. */
export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token) return false;

  const dotIndex = token.indexOf(".");
  if (dotIndex < 1) return false;
  const encodedPayload = token.slice(0, dotIndex);
  const signature = token.slice(dotIndex + 1);
  if (!signature) return false;

  let expectedSig: string;
  try {
    expectedSig = sign(encodedPayload);
  } catch {
    return false;
  }

  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSig);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return false;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    return typeof payload.exp === "number" && payload.exp > Date.now();
  } catch {
    return false;
  }
}

/** Constant-time string comparison for the login route's credential check —
 * ordinary `===` leaks timing information about how many leading characters
 * matched, which is exactly what you don't want for a password compare. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Burn a comparable amount of time so a length mismatch doesn't return
    // measurably faster than a same-length mismatch.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
