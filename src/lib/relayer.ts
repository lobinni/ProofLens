/**
 * Relayer client — talks to the serverless backend (/api/*).
 *
 * The browser seals the evidence; the server stores it, submits
 * attest_wallet() with the owner key it alone holds, and reads the
 * finalized consensus report back from the contract.
 */

import type { AttestedReport } from "./types";
import { getSession } from "./session";

export interface CommitResult {
  scanId: string;
  sha256: string;
  evidenceUrl: string;
}

function sessionHeaders(): Record<string, string> {
  const session = getSession();
  return session ? { authorization: `Bearer ${session.token}` } : {};
}

export interface AttestResult {
  scanId: string;
  transactionHash: string;
  contractAddress: string;
  evidenceUrl: string;
}

function withTimeout(ms: number): AbortSignal {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

async function request<T>(url: string, init?: RequestInit, timeoutMs = 20_000): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: withTimeout(timeoutMs) });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new Error("The attestation service is unreachable right now — please retry in a moment.");
  }

  const text = await res.text();
  let data: unknown = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }

  if (!res.ok) {
    if (data && typeof data === "object" && "error" in data) {
      throw new Error(String((data as { error: unknown }).error));
    }
    if (data === null) {
      throw new Error(
        "The attestation service did not respond as expected — it may be restarting. Please retry in a moment.",
      );
    }
    throw new Error("The attestation service is temporarily unavailable — please retry in a moment.");
  }
  return data as T;
}

export interface HealthResult {
  ok: boolean;
  checks: { functions: boolean; database: boolean; relayerKey: boolean };
  databaseError: string | null;
  hint: string | null;
}

/** Deployment diagnostic — never throws; reports false flags instead. */
export async function checkBackendHealth(): Promise<HealthResult | null> {
  try {
    return await request<HealthResult>("/api/health", undefined, 12_000);
  } catch {
    return null;
  }
}

export async function commitEvidence(args: {
  scanId: string;
  canonical: string;
}): Promise<CommitResult> {
  const session = getSession();
  return request<CommitResult>("/api/evidence", {
    method: "POST",
    headers: { "content-type": "application/json", ...sessionHeaders() },
    body: JSON.stringify({
      scanId: args.scanId,
      canonical: args.canonical,
      claimEmail: session?.email ?? undefined,
    }),
  });
}

export async function requestAttestation(scanId: string): Promise<AttestResult> {
  return request<AttestResult>("/api/attest", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scanId }),
  });
}

export async function fetchConsensusReport(scanId: string): Promise<AttestedReport | null> {
  const res = await request<{ finalized: boolean; report?: AttestedReport }>(
    `/api/report/${encodeURIComponent(scanId)}`,
    undefined,
    25_000,
  );
  return res.finalized && res.report ? res.report : null;
}
