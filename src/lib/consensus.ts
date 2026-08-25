/** Consensus polling — direct contract read first, optional server mirror second. */

import type { AttestedReport } from "./types";
import { readOnChainReport } from "./genlayer";

export async function fetchConsensusReport(scanId: string): Promise<AttestedReport | null> {
  // Primary path: browser → StudioNet contract, no backend and no credentials.
  const direct = await readOnChainReport(scanId);
  if (direct) return direct;

  // Optional read-only server mirror for restrictive browser environments.
  try {
    const res = await fetch(`/api/report/${encodeURIComponent(scanId)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { finalized?: boolean; report?: AttestedReport };
    return data.finalized && data.report ? data.report : null;
  } catch {
    return null;
  }
}