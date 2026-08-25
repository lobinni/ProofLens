/**
 * Server environment — secrets live here only, never in the browser bundle.
 * Copy .env.example to .env (local) or configure the same names in the
 * Vercel project settings (production).
 */

/** Pinned live v3 deployment. Keep in sync with deployments/studionet.json. */
const PINNED_V3_CONTRACT = "0xC4CeEd79FcB9Eda180e961099aa96E0f2eDE6EB5";

function resolveContractAddress(): string {
  return PINNED_V3_CONTRACT;
}

export function contractAddress(): string {
  return resolveContractAddress();
}

export function contractConfigured(): boolean {
  // Always configured now that a live V2 default is pinned.
  return true;
}

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("The evidence store is not available yet — please retry shortly.");
  return url;
}
