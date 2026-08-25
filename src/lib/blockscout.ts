import type { ChainConfig } from "./chains";

/* ------------------------------------------------------------------ */
/* Loose-but-shaped responses for the Blockscout v2 API surface we use */
/* ------------------------------------------------------------------ */

export interface BsAddressMeta {
  hash: string;
  is_contract?: boolean;
  is_verified?: boolean;
  name?: string | null;
  ens_domain_name?: string | null;
  metadata?: { tags?: { name?: string }[] } | null;
}

export interface BsTx {
  hash: string;
  block?: number;
  block_number?: number;
  timestamp: string | null;
  status: string | null;
  method: string | null;
  tx_types?: string[];
  transaction_types?: string[];
  from: BsAddressMeta;
  to: BsAddressMeta | null;
  value: string;
  fee?: { value?: string | null } | null;
  result?: string | null;
}

export interface BsListResponse<T> {
  items: T[];
  next_page_params: Record<string, string | number> | null;
}

export interface BsTokenTransfer {
  transaction_hash: string;
  timestamp: string | null;
  block_number?: number | null;
  method?: string | null;
  type: string;
  token: {
    address?: string;
    address_hash?: string;
    name: string | null;
    symbol: string | null;
    decimals: string | null;
    type: string;
    exchange_rate: string | null;
    icon_url?: string | null;
  };
  total: { value: string; decimals?: string | null; token_id?: string | null } | null;
  from: BsAddressMeta;
  to: BsAddressMeta | null;
}

export interface BsCounters {
  transactions_count?: string;
  token_transfers_count?: string;
  gas_usage_count?: string;
}

export interface BsAddressInfo {
  hash: string;
  is_contract?: boolean;
  coin_balance?: string;
  ens_domain_name?: string | null;
}

export interface ChainFetchResult {
  addressInfo: BsAddressInfo | null;
  counters: BsCounters | null;
  coinPrice: number | null;
  txs: BsTx[];
  transfers: BsTokenTransfer[];
}

// A verdict needs a representative bounded sample, not a full indexer dump.
// One transaction page per chain comfortably feeds the 16-proof commitment;
// one transfer page is enough for the concise user report. Holdings are not
// fetched in the critical path because they do not affect contract evidence.
const MAX_TX_PAGES = 1;
const MAX_TRANSFER_PAGES = 1;
const REQUEST_TIMEOUT_MS = 12_000;

function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(new DOMException("timeout", "TimeoutError")), ms);
  if (signal) {
    if (signal.aborted) ctrl.abort(signal.reason);
    else signal.addEventListener("abort", () => ctrl.abort(signal.reason), { once: true });
  }
  ctrl.signal.addEventListener("abort", () => clearTimeout(t), { once: true });
  return ctrl.signal;
}

async function fetchJson<T>(url: string, signal?: AbortSignal, attempt = 0): Promise<T> {
  const res = await fetch(url, {
    signal: withTimeout(signal, REQUEST_TIMEOUT_MS),
    headers: { accept: "application/json" },
  });
  if (res.status === 429 && attempt < 2) {
    await sleep(900 + attempt * 900);
    return fetchJson<T>(url, signal, attempt + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

function pageParams(params: Record<string, string | number> | null): string {
  if (!params) return "";
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) q.set(k, String(v));
  return `&${q.toString()}`;
}

/* Resolve an ENS name / free text to an address through Blockscout search. */
export async function resolveSubject(input: string): Promise<{ address: string; ensName: string | null } | null> {
  const trimmed = input.trim();
  if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) return { address: trimmed.toLowerCase(), ensName: null };
  const host = "https://eth.blockscout.com";
  try {
    const data = await fetchJson<{
      items?: { type: string; address?: string; address_hash?: string; name?: string; ens_info?: { address_hash?: string; name?: string } }[];
    }>(`${host}/api/v2/search?q=${encodeURIComponent(trimmed)}`);
    const items = data.items ?? [];
    for (const item of items) {
      if (item.type === "ens_domain" && item.ens_info?.address_hash) {
        return { address: item.ens_info.address_hash.toLowerCase(), ensName: item.ens_info.name ?? trimmed };
      }
      if (item.type === "address" && (item.address_hash || item.address)) {
        return { address: String(item.address_hash ?? item.address).toLowerCase(), ensName: null };
      }
      if (item.type === "label" && (item.address_hash || item.address)) {
        return { address: String(item.address_hash ?? item.address).toLowerCase(), ensName: null };
      }
    }
    return null;
  } catch {
    return null;
  }
}

export interface FetchProgress {
  txs: number;
  transfers: number;
  step: string;
}

export async function fetchChainData(
  cfg: ChainConfig,
  address: string,
  onProgress: (p: FetchProgress) => void,
  signal?: AbortSignal,
): Promise<ChainFetchResult> {
  const base = `${cfg.host}/api/v2`;
  const result: ChainFetchResult = {
    addressInfo: null,
    counters: null,
    coinPrice: null,
    txs: [],
    transfers: [],
  };

  const progress: FetchProgress = { txs: 0, transfers: 0, step: "address" };
  onProgress({ ...progress });

  // --- address info, counters, chain stats (independent, parallel) ---
  const [addrInfo, counters, stats] = await Promise.allSettled([
    fetchJson<BsAddressInfo>(`${base}/addresses/${address}`, signal),
    fetchJson<BsCounters>(`${base}/addresses/${address}/counters`, signal),
    fetchJson<{ coin_price?: string | null }>(`${base}/stats`, signal),
  ]);

  if (addrInfo.status === "fulfilled") result.addressInfo = addrInfo.value;
  if (counters.status === "fulfilled") result.counters = counters.value;
  if (stats.status === "fulfilled") {
    const p = Number(stats.value?.coin_price);
    result.coinPrice = Number.isFinite(p) ? p : null;
  }

  // Transactions and token transfers are independent; fetch them in parallel
  // so the slowest explorer determines scan time, not the sum of both calls.
  await Promise.all([
    (async () => {
      progress.step = "transactions";
      try {
        let params: Record<string, string | number> | null = null;
        for (let page = 0; page < MAX_TX_PAGES; page++) {
          const url: string = `${base}/addresses/${address}/transactions${params ? `?${new URLSearchParams(Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))).toString()}` : ""}`;
          const data: BsListResponse<BsTx> = await fetchJson<BsListResponse<BsTx>>(url, signal);
          result.txs.push(...(data.items ?? []));
          progress.txs = result.txs.length;
          onProgress({ ...progress });
          if (!data.next_page_params) break;
          params = data.next_page_params;
        }
      } catch (err) {
        if (isAbort(err)) throw err;
      }
    })(),
    (async () => {
      progress.step = "transfers";
      try {
        let params: Record<string, string | number> | null = null;
        for (let page = 0; page < MAX_TRANSFER_PAGES; page++) {
          const url: string = `${base}/addresses/${address}/token-transfers?type=ERC-20%2CERC-721%2CERC-1155${pageParams(params)}`;
          const data: BsListResponse<BsTokenTransfer> = await fetchJson<BsListResponse<BsTokenTransfer>>(url, signal);
          result.transfers.push(...(data.items ?? []));
          progress.transfers = result.transfers.length;
          onProgress({ ...progress });
          if (!data.next_page_params) break;
          params = data.next_page_params;
        }
      } catch (err) {
        if (isAbort(err)) throw err;
      }
    })(),
  ]);

  progress.step = "done";
  onProgress({ ...progress });
  return result;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}
