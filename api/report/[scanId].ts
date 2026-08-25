/** GET /api/report/[scanId] — optional server-side mirror of get_report. */

import { readReport } from "../_lib/genlayer";

interface ReqLike {
  method?: string;
  query: Record<string, string | string[] | undefined>;
}
interface ResLike {
  status: (code: number) => ResLike;
  json: (body: unknown) => ResLike;
  setHeader: (name: string, value: string) => void;
}

export default async function handler(req: ReqLike, res: ResLike) {
  res.setHeader("cache-control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "method not allowed" });

  const raw = req.query.scanId;
  const scanId = Array.isArray(raw) ? raw[0] : raw ?? "";
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(scanId)) {
    return res.status(400).json({ error: "invalid scan id" });
  }

  try {
    const rawReport = await readReport(scanId);
    if (!rawReport) return res.status(200).json({ finalized: false, scanId });
    return res.status(200).json({
      finalized: true,
      scanId,
      report: JSON.parse(rawReport),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "report read failed";
    return res.status(502).json({ error: message });
  }
}