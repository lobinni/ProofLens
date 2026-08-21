/**
 * GET /api/evidence/[scanId]
 *
 * THE validator-facing endpoint. Serves the committed canonical evidence
 * byte-for-byte — GenLayer validators hash this exact response body and
 * compare it against the commitment in attest_wallet(). Do not transform.
 */

import { ensureSchema, getPool } from "../_lib/db";

interface ReqLike {
  method?: string;
  query: Record<string, string | string[] | undefined>;
}
interface ResLike {
  status: (code: number) => ResLike;
  json: (body: unknown) => ResLike;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
}

export default async function handler(req: ReqLike, res: ResLike) {
  if (req.method !== "GET") {
    res.setHeader("content-type", "application/json; charset=utf-8");
    return res.status(405).json({ error: "method not allowed" });
  }

  const raw = req.query.scanId;
  const scanId = Array.isArray(raw) ? raw[0] : raw ?? "";
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(scanId)) {
    return res.status(400).json({ error: "invalid scanId" });
  }

  try {
    await ensureSchema();
    const result = await getPool().query(
      "SELECT canonical_json, sha256 FROM evidence_snapshots WHERE scan_id = $1",
      [scanId],
    );
    if (!result.rowCount) {
      return res.status(404).json({ error: "unknown scan id" });
    }
    const row = result.rows[0] as { canonical_json: string; sha256: string };
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("x-prooflens-evidence-hash", row.sha256);
    res.setHeader("cache-control", "no-store");
    res.setHeader("access-control-allow-origin", "*");
    return res.status(200).end(row.canonical_json);
  } catch (err) {
    const message = err instanceof Error ? err.message : "evidence read failed";
    return res.status(500).json({ error: message });
  }
}
