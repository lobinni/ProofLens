/**
 * Server environment — secrets live here only, never in the browser bundle.
 * Copy .env.example to .env (local) or configure the same names in the
 * Vercel project settings (production).
 */

export const DEPLOYED_CONTRACT = "0xeC345794B787fEb03Bb05dB374B0624591608977";

export function appUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

export function contractAddress(): string {
  const override = process.env.GENLAYER_CONTRACT_ADDRESS;
  return override && /^0x[a-fA-F0-9]{40}$/.test(override) ? override : DEPLOYED_CONTRACT;
}

export function relayerKey(): string | null {
  const key = process.env.GENLAYER_PRIVATE_KEY;
  return key && key.replace(/^0x/, "").length === 64 ? key : null;
}

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  // User-facing message: internal config names are diagnosed at /api/health.
  if (!url) throw new Error("The evidence store is not available yet — please retry shortly.");
  return url;
}
