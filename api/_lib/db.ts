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
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000,
    });
  }
  return global.__prooflensPool;
}

export async function ensureSchema(): Promise<void> {
  if (global.__prooflensSchemaReady) return;
  const pool = getPool();
  for (const name of Object.keys(TABLE_DDL)) {
    await pool.query(TABLE_DDL[name]);
  }
  global.__prooflensSchemaReady = true;
}

export async function sha256Of(text: string): Promise<string> {
  const { createHash } = await import("crypto");
  return createHash("sha256").update(text, "utf8").digest("hex");
}
