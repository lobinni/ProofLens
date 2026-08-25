/**
 * Postgres access for serverless functions.
 *
 * A single pooled connection is reused across warm invocations. Tables are
 * created lazily from the shared schema in `src/db/schema.ts`, so local dev
 * and production always agree on structure without a migration step.
 */

import { Pool } from "pg";
import { TABLE_DDL } from "../../src/db/schema";
import { databaseUrl } from "./env";

declare global {
  // eslint-disable-next-line no-var
  var __prooflensPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __prooflensSchemaReady: boolean | undefined;
}

export function getPool(): Pool {
  if (!global.__prooflensPool) {
    global.__prooflensPool = new Pool({
      connectionString: databaseUrl(),
      ssl: process.env.PGSSLMODE === "disable" ? undefined : { rejectUnauthorized: false },
      max: 2,
      idleTimeoutMillis: 8_000,
      connectionTimeoutMillis: 12_000,
      keepAlive: true,
    });
  }
  return global.__prooflensPool;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Free Postgres tiers (e.g. Neon) suspend when idle; the very first
 * connection after a pause can take several seconds or fail once. Retry
 * with a short backoff so a cold start reads as "warming up", not a 500.
 */
export async function ensureSchema(): Promise<void> {
  if (global.__prooflensSchemaReady) return;
  const pool = getPool();
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      for (const name of Object.keys(TABLE_DDL)) {
        await pool.query(TABLE_DDL[name]);
      }
      global.__prooflensSchemaReady = true;
      return;
    } catch (err) {
      lastError = err;
      if (attempt < 2) await sleep(400 * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function sha256Of(text: string): Promise<string> {
  const { createHash } = await import("crypto");
  return createHash("sha256").update(text, "utf8").digest("hex");
}
