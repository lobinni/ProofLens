/**
 * Privy configuration — hosted email sign-in, wallets fully disabled.
 *
 * The browser needs only the public App ID (dashboard.privy.io → your app →
 * App ID). Enable "Email" as the ONLY login method and disable embedded
 * wallets there as well; scanning never asks for a wallet connection.
 *
 * Server-side token verification uses Privy's public JWKS endpoint, so no
 * app secret is required anywhere in this repository.
 */

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

export const PRIVY_APP_ID = env.VITE_PRIVY_APP_ID ?? env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";

export function privyConfigured(): boolean {
  return PRIVY_APP_ID.length > 8;
}
