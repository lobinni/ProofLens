/**
 * Persistence — client adapter.
 *
 * Mirrors the `scans` table row shape from `src/db/schema.ts`, backed by
 * localStorage. In the Next.js deployment this module is swapped for the
 * Postgres-backed adapter with the identical interface.
 */

import type { ChainId } from "./chains";
import type { VerdictClass } from "./types";

export interface ScanHistoryEntry {
  scanId: string;
  wallet: string;
  ensName: string | null;
  chainsRequested: ChainId[];
  verdictModel: "genlayer-consensus";
  classification: VerdictClass;
  riskScore: number;
  confidence: number;
  evidenceHash: string;
  observedTx: number;
  createdAt: number;
}

const HISTORY_KEY = "prooflens.scan-history.v1";
const MAX_ENTRIES = 12;

function read(): ScanHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ScanHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function write(entries: ScanHistoryEntry[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    /* storage full or blocked — history is a convenience, never fatal */
  }
}

export function listHistory(): ScanHistoryEntry[] {
  return read();
}

export function addHistoryEntry(entry: ScanHistoryEntry): void {
  const entries = read().filter((e) => e.scanId !== entry.scanId);
  entries.unshift(entry);
  write(entries);
}

export function removeHistoryEntry(scanId: string): void {
  write(read().filter((e) => e.scanId !== scanId));
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    /* noop */
  }
}
