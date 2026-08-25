import { CHAIN_MAP, type ChainId } from "./chains";
import { fetchChainData, resolveSubject } from "./blockscout";
import {
  computeAnalytics,
  normalizeTransactions,
  normalizeTransfers,
} from "./analytics";
import { buildEvidence, canonicalStringify, makeScanId, sha256Hex } from "./evidence";
import type {
  ChainScanInfo,
  NormalizedActivity,
  NormalizedTokenTransfer,
  ScanLogLine,
  ScanResult,
  ScanStage,
} from "./types";

export interface ScanCallbacks {
  onStage: (stage: ScanStage) => void;
  onChain: (info: ChainScanInfo) => void;
  onLog: (line: ScanLogLine) => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const TX_PAGE_CAP = 50;

function log(cb: ScanCallbacks, text: string, tone: ScanLogLine["tone"] = "info") {
  cb.onLog({ at: Date.now(), text, tone });
}

export async function runScan(
  rawInput: string,
  selectedChains: ChainId[],
  cb: ScanCallbacks,
  signal?: AbortSignal,
): Promise<ScanResult> {
  const startedAt = Date.now();

  /* ---------- resolve subject ---------- */
  cb.onStage("resolving");
  log(cb, `resolving subject "${rawInput.trim()}"`);
  const subject = await resolveSubject(rawInput);
  if (!subject) {
    throw new Error("Could not resolve that input. Use a 0x address or an ENS name.");
  }
  const address = subject.address;
  log(
    cb,
    subject.ensName
      ? `resolved ${subject.ensName} → ${address}`
      : `subject locked ${address}`,
    "ok",
  );

  /* ---------- collection ---------- */
  cb.onStage("collecting");
  const chainInfo = new Map<ChainId, ChainScanInfo>();
  for (const id of selectedChains) {
    const info: ChainScanInfo = { chain: id, status: "queued", collectedTx: 0, collectedTransfers: 0, counters: null, coinPrice: null };
    chainInfo.set(id, info);
    cb.onChain({ ...info });
  }

  const activity: NormalizedActivity[] = [];
  const tokenTransfers: NormalizedTokenTransfer[] = [];
  let ensName: string | null = subject.ensName;

  await Promise.all(
    selectedChains.map(async (id) => {
      const cfg = CHAIN_MAP[id];
      const base: ChainScanInfo = { ...chainInfo.get(id)!, status: "scanning" };
      chainInfo.set(id, base);
      cb.onChain({ ...base });
      log(cb, `collecting ${cfg.name} · ${cfg.host.replace("https://", "")}`);
      try {
        const data = await fetchChainData(
          cfg,
          address,
          (p) => {
            const cur = chainInfo.get(id);
            if (!cur) return;
            cur.collectedTx = p.txs;
            cur.collectedTransfers = p.transfers;
            cb.onChain({ ...cur });
          },
          signal,
        );

        if (!ensName && data.addressInfo?.ens_domain_name) ensName = data.addressInfo.ens_domain_name;

        const txTimes = new Map<string, number>();
        const acts = normalizeTransactions(cfg, address, data.txs, data.coinPrice);
        for (const a of acts) txTimes.set(a.hash.toLowerCase(), a.timestamp);
        const trs = normalizeTransfers(cfg, address, data.transfers, txTimes);
        activity.push(...acts);
        tokenTransfers.push(...trs);

        const counters = data.counters
          ? {
              chain: id,
              transactions: Number(data.counters.transactions_count ?? 0) || 0,
              tokenTransfers: Number(data.counters.token_transfers_count ?? 0) || 0,
              gasUsed: Number(data.counters.gas_usage_count ?? 0) || 0,
            }
          : null;

        const hasAny = acts.length > 0 || trs.length > 0 || (counters?.transactions ?? 0) > 0;
        const done: ChainScanInfo = {
          ...chainInfo.get(id)!,
          status: hasAny ? "done" : "empty",
          counters,
          coinPrice: data.coinPrice,
          collectedTx: acts.length,
          collectedTransfers: trs.length,
        };
        chainInfo.set(id, done);
        cb.onChain({ ...done });
        log(
          cb,
          hasAny
            ? `${cfg.name}: ${acts.length} tx · ${trs.length} token moves · counters ${counters?.transactions ?? "?"}`
            : `${cfg.name}: no visible activity`,
          hasAny ? "ok" : "info",
        );
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") throw err;
        const reason = err instanceof Error ? err.message : "request failed";
        const failed: ChainScanInfo = { ...chainInfo.get(id)!, status: "error", error: reason };
        chainInfo.set(id, failed);
        cb.onChain({ ...failed });
        log(cb, `${cfg.name} collection failed: ${reason} · coverage note recorded`, "warn");
      }
    }),
  );

  if (signal?.aborted) throw new DOMException("aborted", "AbortError");

  const infos = selectedChains.map((id) => chainInfo.get(id)!);
  const okChains = infos.filter((i) => i.status === "done" || i.status === "empty");
  if (okChains.length === 0) {
    throw new Error("Every selected explorer failed to respond. Try again in a moment.");
  }

  const authoritativeTxTotal = infos.reduce(
    (sum, i) => sum + (i.counters?.transactions ?? 0),
    0,
  );

  /* ---------- analytics ---------- */
  cb.onStage("analyzing");
  log(cb, `normalizing ${activity.length} transactions · ${tokenTransfers.length} token transfers`);
  await sleep(120);

  const coinPrices: Partial<Record<ChainId, number>> = {};
  for (const i of infos) if (i.coinPrice !== null) coinPrices[i.chain] = i.coinPrice;

  const analytics = computeAnalytics({
    address,
    ensName,
    activity,
    transfers: tokenTransfers,
    authoritativeTxTotal: Math.max(authoritativeTxTotal, activity.length),
    coinPrices,
  });
  log(
    cb,
    `analytics ready · age ${analytics.window.ageDays.toFixed(0)}d · ${analytics.derived.uniqueCounterparties} counterparties`,
    "ok",
  );

  /* ---------- evidence commitment ---------- */
  cb.onStage("committing");
  const scanId = makeScanId();
  const evidence = buildEvidence({
    scanId,
    address,
    chains: infos,
    activity,
  });
  const canonicalEvidence = canonicalStringify(evidence);
  const evidenceHash = await sha256Hex(canonicalEvidence);
  log(
    cb,
    `evidence report ready · ${evidence.verification.transactionProofs.length} transaction proofs across ${evidence.verification.sourceRefs.length} chains`,
    "info",
  );
  log(cb, `report sealed`, "ok");
  await sleep(300);

  // The report is ready now. Do not make the user wait for serverless startup
  // or GenLayer consensus; submission begins in the background from useScan,
  // while this report appears immediately and polls the contract itself.
  cb.onStage("done");

  return {
    scanId,
    address,
    ensName,
    startedAt,
    finishedAt: Date.now(),
    chains: infos,
    activity,
    tokenTransfers,
    analytics,
    evidence,
    evidenceHash,
    canonicalEvidence,
    attestation: null,
    attestError: null,
    consensus: null,
  };
}

/** Page-cap info for honest coverage notes. */
export const SCAN_PAGE_CAP = TX_PAGE_CAP;
