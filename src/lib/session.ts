/**
 * Email session — unified client store.
 *
 * Active provider is chosen at runtime:
 *   1. Privy (hosted, email-only) — AuthProvider syncs Privy's access token
 *      into this store; sign-in UI is Privy's own modal.
 *   2. Self-hosted OTP (/api/auth/*) — used when Privy isn't configured and
 *      the serverless backend exists (dev mode returns the code inline).
 */

export interface EmailSession {
  token: string;
  email: string;
  expiresAt: number;
}

const KEY = "prooflens.email-session.v1";
const EVENT = "prooflens:session-changed";

let memory: EmailSession | null | undefined;

function load(): EmailSession | null {
  if (memory !== undefined) return memory;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as EmailSession) : null;
    memory = parsed && parsed.token ? parsed : null;
  } catch {
    memory = null;
  }
  return memory;
}

export function getSession(): EmailSession | null {
  return load();
}

export function setSession(session: EmailSession | null): void {
  memory = session;
  try {
    if (session) localStorage.setItem(KEY, JSON.stringify(session));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked — memory session still works */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function onSessionChange(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

/* ------------------------------------------------------------------ */
/* Self-hosted OTP fallback                                            */
/* ------------------------------------------------------------------ */

const CONFIG_GUIDANCE =
  "Email sign-in is temporarily unavailable on this deployment. Every scan works fully without an account — sign in only syncs your history.";

export interface CodeRequestResult {
  delivered: boolean;
  devCode?: string;
}

export async function requestEmailCode(email: string): Promise<CodeRequestResult> {
  let res: Response;
  try {
    res = await fetch("/api/auth/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
  } catch {
    throw new Error(CONFIG_GUIDANCE);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (data?.error) throw new Error(String(data.error));
    throw new Error(CONFIG_GUIDANCE);
  }
  return { delivered: Boolean(data.delivered), devCode: data.devCode };
}

export async function verifyEmailCode(email: string, code: string): Promise<EmailSession> {
  let res: Response;
  try {
    res = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
  } catch {
    throw new Error(CONFIG_GUIDANCE);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (data?.error) throw new Error(String(data.error));
    throw new Error(CONFIG_GUIDANCE);
  }
  const session: EmailSession = {
    token: data.token,
    email: data.email,
    expiresAt: data.expiresAt,
  };
  setSession(session);
  return session;
}

/** Kept for API compatibility — the Privy bridge owns token refresh. */
export async function refreshSessionIfNeeded(): Promise<void> {
  return;
}
