/**
 * Email sign-in (OTP) — zero-dependency session auth.
 *
 * Flow:
 *   POST /api/auth/request { email }  → 6-digit code, hashed_at_rest, 10 min TTL
 *   POST /api/auth/verify  { email, code } → HMAC-signed session token
 *
 * Sessions are stateless HMAC tokens — no table, no cookie. The secret comes
 * from SESSION_SECRET, with a deterministic development fallback derived
 * from DATABASE_URL (same rule the rate limiter uses). Email login only
 * saves scan history; anonymous scanning always works.
 */

import { createHash, createHmac, timingSafeEqual } from "crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";

export interface AuthedUser {
  userId: string;
  email: string | null;
}

interface AuthedRequestLike {
  headers: Record<string, string | string[] | undefined>;
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const CODE_TTL_MS = 10 * 60 * 1000;

function sessionSecret(): string {
  const explicit = process.env.SESSION_SECRET;
  if (explicit && explicit.length >= 16) return explicit;
  const seed = process.env.DATABASE_URL || "prooflens-dev-secret";
  return createHash("sha256").update(seed, "utf8").digest("hex");
}

export function hashCode(email: string, code: string): string {
  return createHash("sha256")
    .update(`${code}:${email.toLowerCase()}:${sessionSecret()}`, "utf8")
    .digest("hex");
}

export function makeEmailCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export const EMAIL_CODE_TTL_MS = CODE_TTL_MS;

function sign(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(payload, "utf8").digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

function b64url(text: string): string {
  return Buffer.from(text, "utf8").toString("base64url");
}

function fromB64url(text: string): string {
  return Buffer.from(text, "base64url").toString("utf8");
}

export function issueSessionToken(email: string, userId: string): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = `${userId}|${email.toLowerCase()}|${expiresAt}`;
  const token = `pl1_${b64url(payload)}.${sign(payload)}`;
  return { token, expiresAt };
}

export function verifySessionToken(token: string): AuthedUser | null {
  if (!token.startsWith("pl1_")) return null;
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;
  const encoded = token.slice(4, dot);
  const signature = token.slice(dot + 1);
  let payload: string;
  try {
    payload = fromB64url(encoded);
  } catch {
    return null;
  }
  if (!safeEqual(sign(payload), signature)) return null;
  const [userId, email, exp] = payload.split("|");
  if (!userId || !exp) return null;
  if (Number(exp) < Date.now()) return null;
  return { userId, email: email || null };
}

function bearerToken(req: AuthedRequestLike): string | null {
  const header = req.headers["authorization"];
  const value = Array.isArray(header) ? header[0] : header;
  if (!value || !value.startsWith("Bearer ")) return null;
  return value.slice(7);
}

/* ------------------------------------------------------------------ */
/* Hosted provider verification (Privy JWT via public JWKS)            */
/* ------------------------------------------------------------------ */

function privyAppId(): string | null {
  return (
    process.env.VITE_PRIVY_APP_ID ||
    process.env.PRIVY_APP_ID ||
    process.env.NEXT_PUBLIC_PRIVY_APP_ID ||
    null
  );
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  if (!jwks) {
    const appId = privyAppId();
    if (!appId) return null;
    jwks = createRemoteJWKSet(new URL(`https://auth.privy.io/api/v1/apps/${appId}/jwks.json`));
  }
  return jwks;
}

/**
 * Verifies a Privy access token against Privy's public JWKS endpoint.
 * No app secret is needed anywhere: the signature itself proves the
 * identity; only the app id (public) selects the key set.
 */
async function verifyPrivyToken(token: string): Promise<AuthedUser | null> {
  const keys = getJwks();
  const appId = privyAppId();
  if (!keys || !appId) return null;
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer: "privy.io",
      audience: appId,
    });
    if (!payload.sub) return null;
    return { userId: payload.sub, email: null };
  } catch {
    return null;
  }
}

/** Returns the verified user, or null when anonymous / unverifiable. */
export async function getAuthedUser(req: AuthedRequestLike): Promise<AuthedUser | null> {
  const token = bearerToken(req);
  if (!token) return null;
  // Hosted Privy token first (JWT, never starts with our pl1_ prefix),
  // then the self-hosted HMAC session fallback.
  const privyUser = await verifyPrivyToken(token);
  if (privyUser) return privyUser;
  return verifySessionToken(token);
}
