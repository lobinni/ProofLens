/**
 * GenLayer client-side helpers.
 *
 * The browser never signs StudioNet transactions — the owner-gated relayer
 * (/api/attest) does. These helpers cover what the UI legitimately needs:
 * explorer links, the contract's public surface, and checking whether a
 * sealed evidence bundle satisfies the contract's attestation preconditions.
 */

import { GENLAYER } from "./config";
import type { EvidenceBundle } from "./types";

/** The exact write surface of the deployed contract. */
export const CONTRACT_WRITE_METHOD = "attest_wallet" as const;
export const CONTRACT_VIEW_METHODS = [
  "get_report",
  "get_latest_report_id",
  "get_report_count",
] as const;

/** Consensus verdict taxonomy (underscore form, as stored on-chain). */
export const CONSENSUS_CLASSES = [
  "low_risk",
  "ordinary",
  "bot_like",
  "sybil_like",
  "high_risk",
  "inconclusive",
] as const;

export function contractExplorerUrl(address: string): string {
  if (!address) return "https://explorer-studio.genlayer.com";
  return `https://explorer-studio.genlayer.com/address/${address}`;
}

export function studionetTxUrl(hash: string): string {
  return `https://explorer-studio.genlayer.com/transactions/${hash}`;
}

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

export function deployedContractAddress(): string {
  return GENLAYER.deployment.address;
}
