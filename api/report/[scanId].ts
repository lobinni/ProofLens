/**
 * GET /api/report/[scanId]
 *
 * Reads get_report(scan_id) from the deployed contract. Returns
 * { finalized: false } while GenLayer consensus is still running, and the
 * stored report (validator verdict included) once available.
 */

import { ensureSchema, getPool } from "../_lib/db";
import { readReport } from "../_lib/genlayer";

interface ReqLike {
  method?: string;
  query: Record<string, string | string[] | undefined>;
}
interface ResLike {
  status: (code: number) => ResLike;
  json: (body: unknown) => ResLike;
}

export default async function handler(req: ReqLike, res: ResLike) {
  if (req.method !== "GET") return res.status(405).json({ error: "method not allowed" });

  const raw = req.query.scanId;
  const scanId = Array.isArray(raw) ? raw[0] : raw ?? "";
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(scanId)) return res.status(400).json({ error: "invalid scanId" });

  try {
    const rawReport = await readReport(scanId);
    if (!rawReport) {
      return res.status(200).json({ finalized: false, scanId });
    }
    const report = JSON.parse(rawReport) as {
      verdict?: { classification?: string; risk_score?: number; confidence?: number };
    };

    try {
      await ensureSchema();
      await getPool().query(
        `UPDATE scans
         SET status = 'done', classification = $2, risk_score = $3, confidence = $4, finished_at = now()
         WHERE id = $1`,
        [
          scanId,
          report.verdict?.classification ?? null,
          report.verdict?.risk_score ?? null,
          report.verdict?.confidence ?? null,
        ],
      );
    } catch {
      /* reporting must never fail because the mirror write did */
    }

    return res.status(200).json({ finalized: true, scanId, report });
  } catch (err) {
    const message = err instanceof Error ? err.message : "report read failed";
    return res.status(502).json({ error: message });
  }
}
