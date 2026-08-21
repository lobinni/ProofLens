/**
 * POST /api/evidence
 *
 * Commits a canonical prooflens.v2 evidence bundle. Server recomputes the
 * SHA-256 itself (the client hash is never trusted) and stores the exact
 * byte string that GET /api/evidence/[scanId] will later serve to GenLayer
 * validators — the hash must match the response body byte-for-byte.
 */

import { appUrl } from "../_lib/env";
import { ensureSchema, getPool, sha256Of } from "../_lib/db";
import { getAuthedUser } from "../_lib/auth";

interface ReqLike {
  method?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
}
interface ResLike {
  status: (code: number) => ResLike;
  json: (body: unknown) => ResLike;
}

const SCAN_ID_RE = /^[a-zA-Z0-9_-]{1,80}$/;
const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;

export default async function handler(req: ReqLike, res: ResLike) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  try {
    const body = (req.body ?? {}) as {
      scanId?: unknown;
      canonical?: unknown;
      claimEmail?: unknown;
    };
    const scanId = typeof body.scanId === "string" ? body.scanId : "";
    const canonical = typeof body.canonical === "string" ? body.canonical : "";
    // Display-only decoration: the verified userId is the security boundary;
    // the claimed email just labels the account row.
    const claimEmail =
      typeof body.claimEmail === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(body.claimEmail)
        ? body.claimEmail.toLowerCase()
        : null;

    if (!SCAN_ID_RE.test(scanId)) return res.status(400).json({ error: "invalid scanId" });
    if (!canonical) return res.status(400).json({ error: "canonical evidence body is required" });
    if (canonical.length > 600_000) {
      return res.status(413).json({ error: "evidence body exceeds the 600KB contract ceiling" });
    }

    let bundle: Record<string, unknown>;
    try {
      bundle = JSON.parse(canonical);
    } catch {
      return res.status(400).json({ error: "canonical body is not valid JSON" });
    }

    if (bundle.schemaVersion !== "prooflens.v2") {
      return res.status(400).json({ error: "schemaVersion must be prooflens.v2" });
    }
    if (bundle.scanId !== scanId) return res.status(400).json({ error: "scanId mismatch" });

    const wallet = String(bundle.wallet ?? "");
    if (!WALLET_RE.test(wallet)) return res.status(400).json({ error: "invalid wallet" });

    const verification = bundle.verification as
      | { sourceRefs?: unknown[]; transactionProofs?: unknown[] }
      | undefined;
    const sourceRefs = verification?.sourceRefs ?? [];
    const proofs = verification?.transactionProofs ?? [];
    if (!Array.isArray(sourceRefs) || sourceRefs.length < 1 || sourceRefs.length > 6) {
      return res.status(400).json({ error: "verification.sourceRefs must contain 1-6 entries" });
    }
    if (!Array.isArray(proofs) || proofs.length > 16) {
      return res.status(400).json({ error: "verification.transactionProofs must not exceed 16" });
    }

    const sha256 = await sha256Of(canonical);
    await ensureSchema();

    // Email sign-in is optional: link the scan to the verified user so their
    // history follows the account. Anonymous commits keep user_id NULL.
    const authed = await getAuthedUser(req);
    if (authed) {
      await getPool().query(
        `INSERT INTO users (id, email) VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email`,
        [authed.userId, authed.email ?? claimEmail],
      );
    }

    await getPool().query(
      `INSERT INTO evidence_snapshots (scan_id, canonical_json, sha256)
       VALUES ($1, $2, $3)
       ON CONFLICT (scan_id) DO NOTHING`,
      [scanId, canonical, sha256],
    );
    await getPool().query(
      `INSERT INTO scans (id, user_id, wallet, chains_requested, chains_included, status, verdict_model, evidence_hash, created_at)
       VALUES ($1, $2, $3, $4, $5, 'done', 'genlayer-consensus', $6, now())
       ON CONFLICT (id) DO UPDATE SET user_id = COALESCE(scans.user_id, EXCLUDED.user_id)`,
      [
        scanId,
        authed?.userId ?? null,
        wallet.toLowerCase(),
        JSON.stringify(bundle.chainsRequested ?? []),
        JSON.stringify(bundle.chainsIncluded ?? []),
        sha256,
      ],
    );

    return res.status(200).json({
      scanId,
      sha256,
      evidenceUrl: `${appUrl()}/api/evidence/${scanId}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "evidence commit failed";
    return res.status(500).json({ error: message });
  }
}
