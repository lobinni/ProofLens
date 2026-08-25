/**
 * Auth — anonymous session, degrading gracefully.
 *
 * The full application signs users in with a one-time email code (Privy,
 * email-only, wallets disabled) purely to save scan history. Without those
 * credentials every feature falls back to an anonymous identity — exactly
 * the mode this client build runs in. Scanning never requires sign in.
 */

const ANON_KEY = "prooflens.anon-id.v1";

export type AuthMode = "anonymous" | "email";

export const AUTH_MODE: AuthMode = "anonymous";

export function getAnonymousId(): string {
  try {
    const existing = localStorage.getItem(ANON_KEY);
    if (existing && existing.length >= 12) return existing;
  } catch {
    /* storage unavailable — fall through to memory id */
  }
  const id = `anon_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  try {
    localStorage.setItem(ANON_KEY, id);
  } catch {
    /* noop */
  }
  return id;
}

/** Human description surfaced in UI copy when needed. */
export const AUTH_NOTE =
  "Anonymous mode — scans are private to this browser. Email sign in (server deployment only) only saves history.";
