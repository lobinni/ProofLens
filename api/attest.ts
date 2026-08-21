/**
 * POST /api/attest  { scanId }
 *
 * Relayer: loads the committed evidence snapshot itself (wallet + hash are
 * never taken from the client), then submits attest_wallet() to the deployed
 * ProofLensAttestation contract on StudioNet. Returns the transaction hash
 * immediately; consensus finalization is tracked via GET /api/report.
 */

import { appUrl } from "./_lib/env";
import { ensureSchema, getPool } from "./_lib/db";
import { contractAddress } from "./_lib/env";
import { relayerConfigured, submitAttestWallet } from "./_lib/genlayer";

interface ReqLike {
  method?: string;
  body?: unknown;
}
interface ResLike {
  status: (code: number) => ResLike;
  json: (body: unknown) => ResLike;
}

export default async function handler(req: ReqLike, res: ResLike) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  try {
    const body = (req.body ?? {}) as { scanId?: unknown };
    const scanId = typeof body.scanId === "string" ? body.scanId : "";
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(scanId)) {
      return res.status(400).json({ error: "invalid scanId" });
    }

    if (!relayerConfigured()) {
      return res.status(503).json({
        error: "The attestation service is not fully provisioned yet — please retry shortly.",
      });
    }

    await ensureSchema();
    const snap = await getPool().query(
      "SELECT canonical_json, sha256 FROM evidence_snapshots WHERE scan_id = $1",
      [scanId],
    );
    if (!snap.rowCount) {
      return res.status(404).json({ error: "commit the evidence first (POST /api/evidence)" });
    }
    const row = snap.rows[0] as { canonical_json: string; sha256: string };
    const bundle = JSON.parse(row.canonical_json) as { wallet?: string };
    if (!bundle.wallet) return res.status(400).json({ error: "stored evidence is missing wallet" });

    const evidenceUrl = `${appUrl()}/api/evidence/${scanId}`;
    const transactionHash = await submitAttestWallet({
      scanId,
      wallet: String(bundle.wallet).toLowerCase(),
      evidenceUrl,
      evidenceHash: row.sha256,
    });

    await getPool().query(
      `UPDATE scans SET genlayer_tx_hash = $2, status = 'running' WHERE id = $1`,
      [scanId, transactionHash],
    );

    return res.status(200).json({
      scanId,
      transactionHash,
      contractAddress: contractAddress(),
      evidenceUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "attestation failed";
    return res.status(502).json({ error: message });
  }
}
