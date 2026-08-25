/**
 * Cloud scan history — server-mirrored history for signed-in users.
 * Anonymous history continues to live in the local persistence adapter.
 */

import type { ScanHistoryEntry } from "./persistence";

interface CloudScanRow {
  scanId: string;
  wallet: string;
  ensName: string | null;
  classification: string | null;
  riskScore: number | null;
  confidence: number | null;
  evidenceHash: string | null;
  createdAt: number | null;
}

export async function fetchCloudHistory(token: string): Promise<ScanHistoryEntry[] | null> {
  try {
    const res = await fetch("/api/history", {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { authenticated: boolean; scans: CloudScanRow[] };
    if (!data.authenticated) return null;
    return data.scans
      .filter((s) => s.classification)
      .map((s) => ({
        scanId: s.scanId,
        wallet: s.wallet,
        ensName: s.ensName,
        chainsRequested: [],
        verdictModel: "genlayer-consensus" as const,
        classification: s.classification as ScanHistoryEntry["classification"],
        riskScore: s.riskScore ?? 0,
        confidence: s.confidence ?? 0,
        evidenceHash: s.evidenceHash ?? "",
        observedTx: 0,
        createdAt: s.createdAt ?? Date.now(),
      }));
  } catch {
    return null;
  }
}

/** Authorization headers helper for scan-commit calls. */
export function authHeaders(token: string | null): Record<string, string> {
  return token ? { authorization: `Bearer ${token}` } : {};
}
