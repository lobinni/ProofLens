/**
 * GET /api/history  (Authorization: Bearer <privy token>)
 *
 * Returns the signed-in user's scan history from the server mirror.
 * Anonymous callers politely get an empty list — history without sign-in
 * lives in the browser (local persistence adapter).
 */

import { getAuthedUser } from "./_lib/auth";
import { ensureSchema, getPool } from "./_lib/db";

interface ReqLike {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
}
interface ResLike {
  status: (code: number) => ResLike;
  json: (body: unknown) => ResLike;
  setHeader: (name: string, value: string) => void;
}

export default async function handler(req: ReqLike, res: ResLike) {
  res.setHeader("cache-control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "method not allowed" });

  const user = await getAuthedUser(req);
  if (!user) {
    return res.status(200).json({ authenticated: false, scans: [] });
  }

  try {
    await ensureSchema();
    const result = await getPool().query(
      `SELECT id, wallet, ens_name, classification, risk_score, confidence,
              evidence_hash, genlayer_tx_hash, created_at
       FROM scans
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 24`,
      [user.userId],
    );
    return res.status(200).json({
      authenticated: true,
      email: user.email,
      scans: result.rows.map((row: Record<string, unknown>) => ({
        scanId: row.id,
        wallet: row.wallet,
        ensName: row.ens_name,
        classification: row.classification,
        riskScore: row.risk_score,
        confidence: row.confidence,
        evidenceHash: row.evidence_hash,
        genlayerTxHash: row.genlayer_tx_hash,
        createdAt: row.created_at ? new Date(String(row.created_at)).getTime() : null,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "history read failed";
    return res.status(500).json({ error: message });
  }
}
