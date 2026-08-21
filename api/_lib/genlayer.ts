/**
 * Server-side GenLayer client (relayer).
 *
 * Submits attest_wallet() to the deployed ProofLensAttestation contract on
 * StudioNet and reads finalized reports back. The relayer private key must
 * be the contract owner and must only exist in server environment variables.
 */

import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { contractAddress, relayerKey } from "./env";

type GenLayerClient = ReturnType<typeof createClient>;

let cachedClient: GenLayerClient | null = null;

function getSigningClient(): GenLayerClient {
  const key = relayerKey();
  if (!key) {
    throw new Error("The attestation service is not fully provisioned yet — please retry shortly.");
  }
  if (!cachedClient) {
    const account = createAccount(key as `0x${string}`);
    cachedClient = createClient({ chain: studionet, account });
  }
  return cachedClient;
}

function getReadClient(): GenLayerClient {
  const key = relayerKey();
  if (key) return getSigningClient();
  // Reads do not require an account.
  return createClient({ chain: studionet });
}

export function relayerConfigured(): boolean {
  return relayerKey() !== null;
}

export async function submitAttestWallet(args: {
  scanId: string;
  wallet: string;
  evidenceUrl: string;
  evidenceHash: string;
}): Promise<string> {
  const client = getSigningClient();
  const hash = await client.writeContract({
    address: contractAddress() as `0x${string}`,
    functionName: "attest_wallet",
    args: [args.scanId, args.wallet, args.evidenceUrl, args.evidenceHash],
    value: 0,
  });
  return hash as unknown as string;
}

export async function readReport(scanId: string): Promise<string> {
  const client = getReadClient();
  const result = await client.readContract({
    address: contractAddress() as `0x${string}`,
    functionName: "get_report",
    args: [scanId],
  });
  if (typeof result === "string") return result;
  return result ? String(result) : "";
}

export async function readLatestReportId(wallet: string): Promise<string> {
  const client = getReadClient();
  const result = await client.readContract({
    address: contractAddress() as `0x${string}`,
    functionName: "get_latest_report_id",
    args: [wallet.toLowerCase()],
  });
  if (typeof result === "string") return result;
  return result ? String(result) : "";
}
