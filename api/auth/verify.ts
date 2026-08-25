/**
 * POST /api/auth/verify  { email, code }
 *
 * Verifies the OTP, upserts the user, and issues an HMAC session token.
 */

import { ensureSchema, getPool } from "../_lib/db";
import { hashCode, issueSessionToken } from "../_lib/auth";

interface ReqLike {
  method?: string;
  body?: unknown;
}
interface ResLike {
  status: (code: number) => ResLike;
  json: (body: unknown) => ResLike;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_ATTEMPTS = 5;

export default async function handler(req: ReqLike, res: ResLike) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  try {
    const body = (req.body ?? {}) as { email?: unknown; code?: unknown };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const code = typeof body.code === "string" ? body.code.replace(/\D/g, "") : "";
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "enter a valid email address" });
    if (code.length !== 6) return res.status(400).json({ error: "enter the 6-digit code" });

    await ensureSchema();
    const pool = getPool();
    const found = await pool.query(
      "SELECT code_hash, expires_at, attempts FROM email_codes WHERE email = $1",
      [email],
    );
    if (!found.rowCount) {
      return res.status(400).json({ error: "no code requested for this email — request one first" });
    }
    const row = found.rows[0] as { code_hash: string; expires_at: string; attempts: number };

    if (row.attempts >= MAX_ATTEMPTS) {
      return res.status(429).json({ error: "too many attempts — request a fresh code" });
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ error: "code expired — request a fresh one" });
    }

    const ok = row.code_hash === hashCode(email, code);
    if (!ok) {
      await pool.query("UPDATE email_codes SET attempts = attempts + 1 WHERE email = $1", [email]);
      return res.status(400).json({ error: "wrong code — check the digits and try again" });
    }

    // Success: burn the code, upsert the user, issue a session.
    await pool.query("DELETE FROM email_codes WHERE email = $1", [email]);
    const userId = `u_${hashCode(email, "prooflens-user").slice(0, 24)}`;
    await pool.query(
      `INSERT INTO users (id, email) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email`,
      [userId, email],
    );

    const session = issueSessionToken(email, userId);
    return res.status(200).json({
      ok: true,
      token: session.token,
      expiresAt: session.expiresAt,
      email,
      userId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "verification failed";
    return res.status(500).json({ error: message });
  }
}
