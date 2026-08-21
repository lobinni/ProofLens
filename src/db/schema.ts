/**
 * Database schema — single source of truth.
 *
 * The same definitions power two things:
 *   1. `TABLE_DDL` — lazily applied by the server on first use.
 *   2. drizzle-kit push migrations (wire these interfaces to drizzle/pg-core
 *      in the Next.js deployment).
 *
 * This client build ships without a database connection; the local
 * persistence adapter (`src/lib/persistence.ts`) mirrors the `scans`
 * row shape so server and client stay structurally identical.
 */

export interface UserRow {
  id: string;
  email: string | null;
  createdAt: string;
}

export interface ScanRow {
  id: string;
  userId: string | null;
  wallet: string;
  ensName: string | null;
  chainsRequested: string[];
  chainsIncluded: string[];
  status: "queued" | "running" | "done" | "error";
  verdictModel: "genlayer-consensus";
  classification: string | null;
  riskScore: number | null;
  confidence: number | null;
  evidenceHash: string | null;
  genlayerTxHash: string | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface EvidenceSnapshotRow {
  scanId: string;
  canonicalJson: string;
  sha256: string;
  createdAt: string;
}

export interface ChainScanRow {
  scanId: string;
  chain: string;
  status: "done" | "empty" | "error";
  collectedTx: number;
  collectedTransfers: number;
  countersTx: number | null;
  error: string | null;
}

export interface RateLimitRow {
  key: string;
  windowStart: string;
  count: number;
}

export interface EmailCodeRow {
  email: string;
  codeHash: string;
  expiresAt: string;
  attempts: number;
}

export const TABLE_DDL: Record<string, string> = {
  users: `
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  scans: `
    CREATE TABLE IF NOT EXISTS scans (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      wallet TEXT NOT NULL,
      ens_name TEXT,
      chains_requested JSONB NOT NULL,
      chains_included JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      verdict_model TEXT NOT NULL DEFAULT 'genlayer-consensus',
      classification TEXT,
      risk_score INTEGER,
      confidence INTEGER,
      evidence_hash TEXT,
      genlayer_tx_hash TEXT,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      finished_at TIMESTAMPTZ
    )`,
  evidence_snapshots: `
    CREATE TABLE IF NOT EXISTS evidence_snapshots (
      scan_id TEXT PRIMARY KEY REFERENCES scans(id),
      canonical_json TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  chain_scans: `
    CREATE TABLE IF NOT EXISTS chain_scans (
      scan_id TEXT NOT NULL REFERENCES scans(id),
      chain TEXT NOT NULL,
      status TEXT NOT NULL,
      collected_tx INTEGER NOT NULL DEFAULT 0,
      collected_transfers INTEGER NOT NULL DEFAULT 0,
      counters_tx INTEGER,
      error TEXT,
      PRIMARY KEY (scan_id, chain)
    )`,
  rate_limits: `
    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT NOT NULL,
      window_start TIMESTAMPTZ NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (key, window_start)
    )`,
  email_codes: `
    CREATE TABLE IF NOT EXISTS email_codes (
      email TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0
    )`,
};

export const TABLE_NAMES = Object.keys(TABLE_DDL) as (keyof typeof TABLE_DDL)[];
