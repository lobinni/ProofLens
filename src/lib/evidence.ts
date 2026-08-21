import { CHAIN_MAP, type ChainId } from "./chains";
import type {
  ChainScanInfo,
  EvidenceBundle,
  NormalizedActivity,
  VerificationMetrics,
  VerificationProof,
  VerificationSourceRef,
  WalletAnalytics,
} from "./types";

/**
 * Evidence builder — produces the canonical `prooflens.v2` bundle whose
 * `verification` section is byte-compatible with the deployed
 * ProofLensAttestation Intelligent Contract. Validators re-fetch every
 * committed proof, canonicalize it the same way, and recompute `metrics`
 * themselves; anything that drifts fails consensus, so every transformation
 * below mirrors the contract exactly.
 */

/* ------------------------------------------------------------------ */
/* Canonical JSON: stable key ordering, deterministic byte output      */
/* ------------------------------------------------------------------ */

export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(obj[k])}`).join(",")}}`;
}

/* ------------------------------------------------------------------ */
/* SHA-256 commitment (WebCrypto)                                      */
/* ------------------------------------------------------------------ */

export async function sha256Hex(text: string): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  throw new Error("WebCrypto SHA-256 unavailable — evidence cannot be sealed here.");
}

export function makeScanId(): string {
  // Contract-accepted charset: ^[a-zA-Z0-9_-]{1,80}$
  return `pl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/* ------------------------------------------------------------------ */
/* Proof selection — bounded (≤16), only chains with committed counters */
/* ------------------------------------------------------------------ */

export const MAX_PROOFS = 16;
const FAILED_MARKERS = ["error", "failure", "reverted"];

function isFailedStatus(status: string | null): boolean {
  const s = (status ?? "").toLowerCase();
  return FAILED_MARKERS.some((m) => s.includes(m));
}

export function buildVerificationProofs(
  activity: NormalizedActivity[],
  allowedChains: ReadonlySet<ChainId>,
): VerificationProof[] {
  const candidates = activity
    .filter(
      (a) =>
        allowedChains.has(a.chain) &&
        // Contract creations resolve `to` from created_contract server-side;
        // keep the proof set strictly to records the contract canonicalizes
        // identically from a list-view fetch.
        a.category !== "contract-creation",
    )
    .sort((a, b) => a.timestamp - b.timestamp);
  if (!candidates.length) return [];

  const chosen = new Map<string, NormalizedActivity>();

  // Largest value flows carry the most behavioral weight.
  const byValue = [...candidates].sort(
    (x, y) => (y.usdValue ?? y.nativeValue) - (x.usdValue ?? x.nativeValue),
  );
  for (const a of byValue.slice(0, MAX_PROOFS / 2)) chosen.set(a.id, a);

  // Evenly spaced across the whole record so the sample spans the history.
  const stride = Math.max(1, Math.floor(candidates.length / (MAX_PROOFS / 2)));
  for (let i = 0; i < candidates.length && chosen.size < MAX_PROOFS; i += stride) {
    chosen.set(candidates[i].id, candidates[i]);
  }

  return [...chosen.values()]
    .slice(0, MAX_PROOFS)
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((a) => ({
      chainId: a.chain,
      hash: a.hash.toLowerCase(),
      url: `${CHAIN_MAP[a.chain].host}/api/v2/transactions/${a.hash.toLowerCase()}`,
      blockNumber: a.block > 0 ? a.block : null,
      timestamp: a.timestampRaw,
      from: a.from,
      to: a.to,
      value: a.valueRaw,
      status: a.statusRaw,
      method: a.method,
      targetIsContract: a.toIsContract,
      createdContract: false,
    }));
}

/* ------------------------------------------------------------------ */
/* Metrics — replicates the contract's recomputation over the proofs    */
/* ------------------------------------------------------------------ */

export function computeVerificationMetrics(
  proofs: VerificationProof[],
  wallet: string,
): VerificationMetrics {
  const w = wallet.toLowerCase();
  const direction = (p: VerificationProof): "self" | "outbound" | "inbound" => {
    if (p.from === w && p.to === w) return "self";
    if (p.from === w) return "outbound";
    return "inbound";
  };

  const outbound = proofs.filter((p) => direction(p) === "outbound");
  const timestamps = proofs
    .map((p) => p.timestamp)
    .filter((t): t is string => t !== null && t.length > 0)
    .sort();

  return {
    sampledTransactions: proofs.length,
    sampledOutbound: outbound.length,
    sampledInbound: proofs.filter((p) => direction(p) === "inbound").length,
    sampledSelf: proofs.filter((p) => direction(p) === "self").length,
    sampledFailed: proofs.filter((p) => isFailedStatus(p.status)).length,
    sampledContractCalls: outbound.filter(
      (p) => !p.createdContract && (p.targetIsContract || p.method !== null),
    ).length,
    sampledContractCreations: outbound.filter((p) => p.createdContract).length,
    sampledChains: new Set(proofs.map((p) => p.chainId)).size,
    firstActivityAt: timestamps.length ? timestamps[0] : null,
    lastActivityAt: timestamps.length ? timestamps[timestamps.length - 1] : null,
  };
}

function buildSourceRefs(chains: ChainScanInfo[], wallet: string): VerificationSourceRef[] {
  return chains
    .filter((c) => (c.status === "done" || c.status === "empty") && c.counters !== null)
    .map((c) => ({
      chainId: c.chain,
      countersUrl: `${CHAIN_MAP[c.chain].host}/api/v2/addresses/${wallet.toLowerCase()}/counters`,
    }));
}

/* ------------------------------------------------------------------ */
/* Bundle                                                              */
/* ------------------------------------------------------------------ */

export function buildEvidence(args: {
  scanId: string;
  address: string;
  requestedChains: ChainId[];
  chains: ChainScanInfo[];
  activity: NormalizedActivity[];
  analytics: WalletAnalytics;
}): EvidenceBundle {
  const { chains, analytics: a } = args;
  const wallet = args.address.toLowerCase();

  const chainsIncluded = chains
    .filter((c) => c.status === "done" || c.status === "empty")
    .map((c) => c.chain);
  const chainIssues = chains
    .filter((c) => c.status === "error")
    .map((c) => ({ chain: c.chain, reason: c.error ?? "collection failed" }));

  const sourceRefs = buildSourceRefs(chains, wallet);
  const allowedChains = new Set(sourceRefs.map((s) => s.chainId));
  const transactionProofs = buildVerificationProofs(args.activity, allowedChains);
  const metrics = computeVerificationMetrics(transactionProofs, wallet);

  const summary: Record<string, unknown> = {
    window: {
      firstAt: a.window.firstAt ? new Date(a.window.firstAt).toISOString() : null,
      lastAt: a.window.lastAt ? new Date(a.window.lastAt).toISOString() : null,
      ageDays: round2(a.window.ageDays),
      activeDays: a.window.activeDays,
    },
    counts: a.counts,
    timing: {
      medianGapMinutes: a.timing.medianGapMinutes !== null ? round2(a.timing.medianGapMinutes) : null,
      longestQuietDays: round2(a.timing.longestQuietDays),
      burstMax10m: a.timing.burstMax10m,
      regularity: round2(a.timing.regularity),
      txsPerActiveDay: round2(a.timing.txsPerActiveDay),
    },
    volume: {
      usdInKnown: round2(a.volume.usdInKnown),
      usdOutKnown: round2(a.volume.usdOutKnown),
      feesUsdKnown: round2(a.volume.feesUsd),
      nativeInBySymbol: roundRecord(a.volume.nativeInBySymbol),
      nativeOutBySymbol: roundRecord(a.volume.nativeOutBySymbol),
    },
    derived: {
      uniqueCounterparties: a.derived.uniqueCounterparties,
      uniqueInboundSenders: a.derived.uniqueInboundSenders,
      dustReceiveShare: round3(a.derived.dustReceiveShare),
      topCounterpartyShare: round3(a.derived.topCounterpartyShare),
      inboundRatio: round3(a.derived.inboundRatio),
      failRate: round3(a.derived.failRate),
    },
  };

  return {
    schemaVersion: "prooflens.v2",
    scanId: args.scanId,
    createdAt: new Date().toISOString(),
    mode: "attestation",
    wallet,
    chainsRequested: args.requestedChains,
    chainsIncluded,
    chainIssues,
    summary,
    signals: {
      automation: round3(a.signals.automation),
      sybil: round3(a.signals.sybil),
      concentration: round3(a.signals.concentration),
      failure: round3(a.signals.failure),
      dormancy: round3(a.signals.dormancy),
      repetition: round3(a.signals.repetition),
    },
    verification: {
      schemaVersion: "blockscout.v1",
      sourceRefs,
      transactionProofs,
      metrics,
    },
  };
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
function roundRecord(r: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, round2(v)]));
}
