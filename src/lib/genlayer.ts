/**
 * GenLayer client (browser).
 *
 * The dapp talks to the GenLayer network DIRECTLY from the user's browser:
 * reads hit the deployed ProofLensIntelligence contract on
 * StudioNet via genlayer-js (public views need no signing, no account —
 * anyone can audit what the contract holds).
 *
 * Writes use a funded signing relay, but analyze_wallet is public and validates
 * its evidence inside consensus; this module reads the result from chain.
 */

import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { GENLAYER } from "./config";
import type { AttestedReport, EvidenceBundle } from "./types";

/* ------------------------------------------------------------------ */
/* Contract surface                                                    */
/* ------------------------------------------------------------------ */

export const CONTRACT_WRITE_METHOD = "analyze_wallet" as const;
export const CONTRACT_VIEW_METHODS = [
  "get_report",
  "get_latest_report_id",
  "get_report_count",
] as const;

export const CONSENSUS_CLASSES = [
  "low_risk",
  "ordinary",
  "bot_like",
  "sybil_like",
  "high_risk",
  "inconclusive",
] as const;

export function deployedContractAddress(): string {
  return GENLAYER.deployment.address;
}

export function contractExplorerUrl(address: string): string {
  if (!address) return "https://explorer-studio.genlayer.com";
  return `https://explorer-studio.genlayer.com/address/${address}`;
}

export function studionetTxUrl(hash: string): string {
  return `https://explorer-studio.genlayer.com/transactions/${hash}`;
}

/* ------------------------------------------------------------------ */
/* Direct contract reads (browser → GenLayer network, no backend)      */
/* ------------------------------------------------------------------ */

type GenClient = ReturnType<typeof createClient>;

let browserClient: GenClient | null = null;
let browserSchemaPromise: Promise<BrowserContractInspection> | null = null;

function getClient(): GenClient {
  if (!browserClient) {
    browserClient = createClient({ chain: studionet });
  }
  return browserClient;
}

export interface BrowserContractInspection {
  reachable: boolean;
  compatible: boolean;
  methods: string[];
}

/** Verify in the browser that the pinned address really exposes the V2 API. */
export async function inspectBrowserContract(): Promise<BrowserContractInspection> {
  if (!browserSchemaPromise) {
    browserSchemaPromise = (async () => {
      try {
        const schema = await getClient().getContractSchema(
          deployedContractAddress() as `0x${string}`,
        );
        const methods = Object.keys(schema.methods ?? {}).sort();
        const analyze = schema.methods?.analyze_wallet;
        const params = (analyze?.params ?? []).map(([name]) => name);
        return {
          reachable: true,
          compatible:
            Boolean(analyze) &&
            analyze?.readonly === false &&
            params.join(",") === "scan_id,wallet,evidence_json,evidence_hash" &&
            methods.includes("get_report") &&
            methods.includes("get_latest_report_id") &&
            methods.includes("get_report_count"),
          methods,
        };
      } catch {
        return { reachable: false, compatible: false, methods: [] };
      }
    })();
  }
  return browserSchemaPromise;
}

export type ConsensusState = "pending" | "complete" | "failed";

export interface ConsensusStatus {
  state: ConsensusState;
  networkStatus: string;
  transactionHash: string;
  error?: string;
}

/**
 * getTransaction(hash) — reads the LIVE consensus status straight from the
 * GenLayer network (PENDING → PROPAGATING → ACCEPTED → FINALIZED, or
 * CANCELED / UNDETERMINED). This is a direct dapp → network call.
 */
export async function readTransactionStatus(transactionHash: string): Promise<ConsensusStatus> {
  const client = getClient();
  const tx = (await client.getTransaction({
    hash: transactionHash as `0x${string}`,
  } as Parameters<GenClient["getTransaction"]>[0])) as {
    statusName?: string;
    status_name?: string;
    status?: string;
  };

  const networkStatus =
    tx.statusName ?? tx.status_name ?? (typeof tx.status === "string" ? tx.status : "PENDING");

  if (networkStatus === "CANCELED" || networkStatus === "UNDETERMINED") {
    return {
      state: "failed",
      transactionHash,
      networkStatus,
      error: `GenLayer ended the verdict as ${networkStatus.toLowerCase()}.`,
    };
  }
  if (networkStatus !== "FINALIZED") {
    return { state: "pending", transactionHash, networkStatus };
  }
  return { state: "complete", transactionHash, networkStatus };
}

async function readView(functionName: string, args: unknown[]): Promise<unknown> {
  const client = getClient();
  return client.readContract({
    address: deployedContractAddress() as `0x${string}`,
    functionName,
    args,
  } as Parameters<GenClient["readContract"]>[0]);
}

/** get_report(scan_id) → parsed on-chain report, or null while consensus runs. */
export async function readOnChainReport(scanId: string): Promise<AttestedReport | null> {
  try {
    const raw = await readView("get_report", [scanId]);
    const text = typeof raw === "string" ? raw : raw ? String(raw) : "";
    if (!text) return null;
    const parsed = JSON.parse(text) as AttestedReport;
    if (!parsed?.verdict?.classification) return null;
    if (parsed.scan_id !== scanId) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** get_latest_report_id(wallet) → newest scan id recorded for the wallet. */
export async function readLatestReportIdFor(wallet: string): Promise<string | null> {
  try {
    const raw = await readView("get_latest_report_id", [wallet.toLowerCase()]);
    const text = typeof raw === "string" ? raw : "";
    return text || null;
  } catch {
    return null;
  }
}

/** get_report_count() → total verdicts stored on-chain. */
export async function readOnChainReportCount(): Promise<number | null> {
  try {
    const raw = await readView("get_report_count", []);
    const n = Number(raw as number | string | bigint);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Evidence preconditions (mirrors the contract's strict checks)       */
/* ------------------------------------------------------------------ */

/**
 * A bundle is attestable only when the contract's strict preconditions hold:
 * 1–6 unique counter sources, ≤16 proofs, every proof bound to a committed
 * counter source, and a 64-char lowercase hex hash.
 */
export function isAttestable(evidence: EvidenceBundle, evidenceHash: string): boolean {
  const v = evidence.verification;
  if (v.sourceRefs.length < 1 || v.sourceRefs.length > 6) return false;
  if (v.transactionProofs.length > 16) return false;
  if (!/^[a-f0-9]{64}$/.test(evidenceHash)) return false;
  const boundChains = new Set(v.sourceRefs.map((s) => s.chainId));
  for (const p of v.transactionProofs) {
    if (!boundChains.has(p.chainId)) return false;
  }
  if (new Set(v.sourceRefs.map((s) => s.chainId)).size !== v.sourceRefs.length) return false;
  return true;
}
