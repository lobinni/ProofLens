/**
 * GenLayer user-wallet integration — standard EVM MetaMask connection.
 *
 * IMPORTANT ARCHITECTURE FACT (from genlayer-js custom transport):
 * When the client account is a plain ADDRESS, an on-chain write flows
 * through the OFFICIAL EIP-155 `eth_sendTransaction` RPC method — there is
 * NO GenLayer Snap involved and `assertChainMatch()` returns early for
 * StudioNet. So the ONLY things the browser needs to act as the signer are:
 *   1. MetaMask connected (account approved), and
 *   2. StudioNet registered as an EVM network in MetaMask (chain id 61999).
 *
 * Installing the GenLayer Snap is therefore NOT part of the critical path and
 * was the source of the connection failures seen here. This module does a
 * clean, conventional EVM connect + EVM network registration.
 */

import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import type { TransactionHash } from "genlayer-js/types";
import { deployedContractAddress, inspectBrowserContract } from "./genlayer";

type BrowserClient = ReturnType<typeof createClient>;
type RpcErrorLike = {
  message?: string;
  code?: number;
  data?: { message?: string } | string;
  name?: string;
};

function eth(): EthProvider | undefined {
  return (window as Window & { ethereum?: unknown }).ethereum as EthProvider | undefined;
}

type EthProvider = {
  isMetaMask?: boolean;
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

/** Pull a human-readable reason out of a MetaMask/JSON-RPC failure object. */
export function extractRpcError(err: unknown): { message: string; code?: number } {
  if (err instanceof Error) return { message: err.message };
  if (err && typeof err === "object") {
    const e = err as RpcErrorLike;
    const inner =
      (typeof e.data === "object" && e.data?.message) ||
      (typeof e.data === "string" && e.data) ||
      null;
    const text = e.message || inner || e.name || null;
    if (text) return { message: text, code: e.code };
    try {
      return { message: JSON.stringify(err), code: e.code };
    } catch {
      return { message: String(err), code: e.code };
    }
  }
  return { message: String(err) };
}

function toError(err: unknown, prefix: string): Error {
  const { message, code } = extractRpcError(err);
  if (code === 4001) return new Error(`${prefix}: declined in MetaMask.`);
  return new Error(`${prefix}: ${message}`);
}

export interface WalletConnection {
  address: string;
  client: BrowserClient;
}

/** StudioNet EVM chain.id — derived from the genlayer-js chain definition (61999 = 0xF22F). */
const STUDIONET_CHAIN_ID_HEX = `0x${studionet.id.toString(16)}` as const;

const studionetChainParams = {
  chainId: STUDIONET_CHAIN_ID_HEX,
  chainName: studionet.name,
  nativeCurrency: studionet.nativeCurrency,
  rpcUrls: studionet.rpcUrls.default.http,
  blockExplorerUrls: [studionet.blockExplorers?.default.url].filter(Boolean) as string[],
};

/** Ensure StudioNet exists in MetaMask and is the active network. */
async function ensureStudionetNetwork(provider: EthProvider): Promise<void> {
  let current: string;
  try {
    current = (await provider.request({ method: "eth_chainId" })) as string;
  } catch (err) {
    throw toError(err, "Could not read your current MetaMask network");
  }
  if (current === STUDIONET_CHAIN_ID_HEX) return;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: STUDIONET_CHAIN_ID_HEX }],
    });
    return;
  } catch (err) {
    const { code } = extractRpcError(err);
    if (code === 4001) throw toError(err, "Switch to GenLayer StudioNet declined");
    // 4902 = chain not added yet → fall through to add it below.
    if (code !== 4902) {
      // Some builds throw a generic error; still attempt to add.
    }
  }

  try {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [studionetChainParams],
    });
  } catch (err) {
    const parsed = extractRpcError(err);
    if (parsed.code === 4001) throw toError(err, "Adding GenLayer StudioNet declined");
    // If chain registration fails due to RPC pre-validation, STILL continue —
    // StudioNet skips strict chain matching, so eth_sendTransaction may route
    // anyway once the GenLayer Snap is present, and the write will surface a
    // precise error if the network still cannot be used.
    console.warn("wallet_addEthereumChain could not register StudioNet, continuing:", parsed.message);
  }
}

/**
 * Connect the user's MetaMask. Plain EVM flow:
 *   1. Prompt account approval (eth_requestAccounts)
 *   2. Register + switch to StudioNet EVM network (chain id 61999)
 *   3. Return the address + a genlayer-js client bound to it (string account)
 *
 * Transaction signing happens natively in MetaMask (eth_sendTransaction);
 * the GenLayer Snap is NOT required for this core operation.
 */
export async function connectGenLayerWallet(): Promise<WalletConnection> {
  const provider = eth();
  if (typeof window === "undefined" || !provider?.isMetaMask) {
    throw new Error("MetaMask is required to sign the GenLayer transaction.");
  }

  let accounts: unknown;
  try {
    accounts = await provider.request({ method: "eth_requestAccounts" });
  } catch (err) {
    throw toError(err, "MetaMask account approval");
  }
  const list = accounts as string[];
  if (!list || list.length === 0) throw new Error("No MetaMask account was approved.");
  const address = list[0];

  await ensureStudionetNetwork(provider);
  void tryInstallGenLayerSnap(provider); // best-effort, non-blocking for GenLayer account mgmt

  const client = createClient({ chain: studionet, account: address as `0x${string}` });
  return { address, client };
}

/**
 * Best-effort attempt to also install the GenLayer Snap for account
 * management/faucet features in MetaMask. Never throws to the caller —
 * ProofLens core transaction flow does not depend on it.
 */
function tryInstallGenLayerSnap(provider: EthProvider): void {
  void provider
    .request({ method: "wallet_getSnaps" })
    .then((snapsRaw) => {
      const id = "npm:genlayer-wallet-plugin";
      const snaps = (snapsRaw ?? {}) as Record<string, unknown>;
      if (Object.values(snaps).some((s) => (s as { id?: string })?.id === id)) return;
      return provider.request({
        method: "wallet_requestSnaps",
        params: { [id]: {} },
      });
    })
    .catch(() => undefined);
}

/**
 * Submit analyze_wallet() signed by the USER's wallet. genlayer-js routes it
 * as a standard `eth_sendTransaction` to the GenLayer consensus contract on
 * StudioNet — MetaMask shows the confirmation and takes the gas payment.
 */
export async function submitAnalysisFromWallet(
  conn: WalletConnection,
  args: { scanId: string; wallet: string; evidenceJson: string; evidenceHash: string },
): Promise<string> {
  const inspection = await inspectBrowserContract();
  if (!inspection.reachable) {
    throw new Error("The ProofLens contract cannot be reached on GenLayer StudioNet.");
  }
  if (!inspection.compatible) {
    throw new Error(
      `The deployed contract does not expose the expected analyze_wallet method. Found: ${
        inspection.methods.join(", ") || "no methods"
      }`,
    );
  }

  let hash: unknown;
  try {
    hash = await conn.client.writeContract({
      address: deployedContractAddress() as `0x${string}`,
      functionName: "analyze_wallet",
      args: [args.scanId, args.wallet, args.evidenceJson, args.evidenceHash],
      value: 0n,
      consensusMaxRotations: 5,
    } as Parameters<BrowserClient["writeContract"]>[0]);
  } catch (err) {
    throw toError(err, "Transaction submission");
  }

  const text = String(hash as TransactionHash);
  if (!/^0x[a-fA-F0-9]{64}$/.test(text)) {
    throw new Error("GenLayer did not return a transaction hash.");
  }
  return text;
}

/** Listen for account changes and report the new address (or null). */
export function onAccountsChanged(cb: (address: string | null) => void): () => void {
  const provider = eth();
  if (!provider?.on) return () => undefined;
  const handler = (accounts: unknown) => {
    const list = accounts as string[];
    cb(list && list.length > 0 ? list[0] : null);
  };
  provider.on("accountsChanged", handler);
  return () => provider.removeListener?.("accountsChanged", handler);
}
