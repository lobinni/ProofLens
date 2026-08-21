/**
 * GET /api/health
 *
 * Deployment diagnostic — answers "which part of the backend is configured?"
 * so setup failures are visible instead of a bare 500. Safe to expose: it
 * reports booleans, never values.
 */

import { ensureSchema, getPool } from "./_lib/db";
import { contractAddress } from "./_lib/env";
import { relayerConfigured } from "./_lib/genlayer";

interface ReqLike {
  method?: string;
}
interface ResLike {
  status: (code: number) => ResLike;
  json: (body: unknown) => ResLike;
  setHeader: (name: string, value: string) => void;
}

export default async function handler(req: ReqLike, res: ResLike) {
  res.setHeader("cache-control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "method not allowed" });

  const checks = {
    functions: true,
    database: false,
    relayerKey: relayerConfigured(),
  };

  let databaseError: string | null = null;
  try {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    await ensureSchema();
    await getPool().query("SELECT 1");
    checks.database = true;
  } catch (err) {
    databaseError = err instanceof Error ? err.message : "database check failed";
  }

  const ok = checks.database && checks.relayerKey;
  return res.status(ok ? 200 : 503).json({
    ok,
    checks,
    contract: contractAddress(),
    databaseError,
    hint: !checks.database
      ? "Set DATABASE_URL (neon.tech free tier works) in .env / Vercel → Settings → Environment Variables"
      : !checks.relayerKey
        ? "Set GENLAYER_PRIVATE_KEY to the contract-owner relayer key"
        : null,
  });
}
