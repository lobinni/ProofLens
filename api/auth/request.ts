/**
 * POST /api/auth/request  { email }
 *
 * Generates a 6-digit sign-in code. Delivery: Resend API when RESEND_API_KEY
 * is set. Without a provider the endpoint runs in dev mode and returns the
 * code in the response — perfect for local testing, obviously never for
 * production (set RESEND_API_KEY to disable dev mode).
 */

import { ensureSchema, getPool } from "../_lib/db";
import { EMAIL_CODE_TTL_MS, hashCode, makeEmailCode } from "../_lib/auth";

interface ReqLike {
  method?: string;
  body?: unknown;
}
interface ResLike {
  status: (code: number) => ResLike;
  json: (body: unknown) => ResLike;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function deliverByEmail(email: string, code: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  const from = process.env.AUTH_EMAIL_FROM || "ProofLens <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from,
      to: [email],
      subject: `${code} — your ProofLens sign-in code`,
      html: `
        <div style="font-family:ui-monospace,monospace;background:#08090a;color:#ece9df;padding:32px;border-radius:12px;max-width:420px">
          <p style="letter-spacing:3px;color:#ffb224;font-size:11px;margin:0 0 16px">PROOFLENS · SIGN IN</p>
          <p style="font-size:13px;color:#8b9097;margin:0 0 20px">Your one-time sign-in code — valid for 10 minutes.</p>
          <p style="font-size:38px;letter-spacing:10px;font-weight:700;margin:0 0 20px">${escapeHtml(code)}</p>
          <p style="font-size:11px;color:#565d66;margin:0">If you did not request this, ignore the email. Nothing was accessed.</p>
        </div>`,
    }),
  });
  return res.ok;
}

export default async function handler(req: ReqLike, res: ResLike) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  try {
    const body = (req.body ?? {}) as { email?: unknown };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "enter a valid email address" });

    const code = makeEmailCode();
    const codeHash = hashCode(email, code);
    const expiresAt = new Date(Date.now() + EMAIL_CODE_TTL_MS).toISOString();

    await ensureSchema();
    const pool = getPool();
    // Fresh request invalidates previous codes for this email.
    await pool.query("DELETE FROM email_codes WHERE email = $1", [email]);
    await pool.query(
      "INSERT INTO email_codes (email, code_hash, expires_at, attempts) VALUES ($1, $2, $3, 0)",
      [email, codeHash, expiresAt],
    );

    const delivered = await deliverByEmail(email, code);
    if (!delivered) {
      // Dev mode: no email provider configured — surface the code locally.
      return res.status(200).json({
        ok: true,
        delivered: false,
        devCode: code,
        note: "RESEND_API_KEY not configured — dev mode returned the code in this response",
      });
    }
    return res.status(200).json({ ok: true, delivered: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "code request failed";
    return res.status(500).json({ error: message });
  }
}
