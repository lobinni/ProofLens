import { CHAIN_MAP, type ChainId } from "./chains";
import { fetchChainData, resolveSubject } from "./blockscout";
import {
  computeAnalytics,
  normalizeHoldings,
  normalizeTransactions,
  normalizeTransfers,
} from "./analytics";
import { buildEvidence, canonicalStringify, makeScanId, sha256Hex } from "./evidence";
import {
  checkBackendHealth,
  commitEvidence,
  fetchConsensusReport,
  requestAttestation,
} from "./relayer";
import type {
  AttestationInfo,
  AttestedReport,
  ChainScanInfo,
  HoldingStat,
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
const TX_PAGE_CAP = 5 * 50;
/** Consensus can take minutes; the overlay waits patiently, the report page keeps polling after. */
const CONSENSUS_POLL_ATTEMPTS = 16;
const CONSENSUS_POLL_INTERVAL_MS = 7_000;

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
  const holdings: HoldingStat[] = [];
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
        const holds = normalizeHoldings(cfg, data.holdings);

        activity.push(...acts);
        tokenTransfers.push(...trs);
        holdings.push(...holds);

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
  await sleep(420);

  const coinPrices: Partial<Record<ChainId, number>> = {};
  for (const i of infos) if (i.coinPrice !== null) coinPrices[i.chain] = i.coinPrice;

  const analytics = computeAnalytics({
    address,
    ensName,
    activity,
    transfers: tokenTransfers,
    holdings,
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
    requestedChains: selectedChains,
    chains: infos,
    activity,
    analytics,
  });
  const canonicalEvidence = canonicalStringify(evidence);
  const evidenceHash = await sha256Hex(canonicalEvidence);
  log(
    cb,
    `evidence prooflens.v2 · verification blockscout.v1 · ${evidence.verification.transactionProofs.length} proofs · ${evidence.verification.sourceRefs.length} counter sources`,
    "info",
  );
  log(cb, `sha256 commitment ${evidenceHash.slice(0, 18)}…${evidenceHash.slice(-8)}`, "ok");
  await sleep(300);

  /* ---------- server commit + attestation (never aborts the scan) ---------- */
  cb.onStage("attesting");
  let attestation: AttestationInfo | null = null;
  let attestError: string | null = null;
  try {
    const health = await checkBackendHealth();
    if (health === null) {
      throw new Error("The attestation service is offline — the sealed evidence is kept so you can retry.");
    }
    if (!health.ok) {
      throw new Error(
        "The attestation service is still being provisioned — retry once it is live.",
      );
    }

    log(cb, "committing canonical evidence to the relayer");
    const commit = await commitEvidence({ scanId, canonical: canonicalEvidence });
    if (commit.sha256 !== evidenceHash) {
      log(cb, "warning: server sha-256 differs from client seal", "warn");
    }
    log(cb, `evidence live at ${commit.evidenceUrl}`, "ok");

    log(cb, "submitting attest_wallet() to StudioNet");
    const attest = await requestAttestation(scanId);
    attestation = {
      evidenceUrl: attest.evidenceUrl || commit.evidenceUrl,
      evidenceHash: commit.sha256,
      transactionHash: attest.transactionHash,
      contractAddress: attest.contractAddress,
    };
    log(cb, `attestation tx ${attest.transactionHash.slice(0, 18)}…`, "ok");
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    attestError = err instanceof Error ? err.message : "attestation failed";
    log(cb, `attestation not completed: ${attestError}`, "err");
    log(cb, "continuing with analytics + sealed evidence — retry attestation from the report", "warn");
  }

  /* ---------- consensus wait (bounded; report page keeps polling) ---------- */
  let consensus: AttestedReport | null = null;
  if (attestation) {
    cb.onStage("consensus");
    log(cb, "validators are fetching evidence and replaying proofs…");
    for (let attempt = 1; attempt <= CONSENSUS_POLL_ATTEMPTS; attempt++) {
      if (signal?.aborted) throw new DOMException("aborted", "AbortError");
      await sleep(CONSENSUS_POLL_INTERVAL_MS);
      try {
        consensus = await fetchConsensusReport(scanId);
      } catch {
        consensus = null;
      }
      if (consensus) break;
      if (attempt % 4 === 0) log(cb, `consensus still running · poll ${attempt}/${CONSENSUS_POLL_ATTEMPTS}`, "info");
    }
  }

  if (consensus) {
    log(
      cb,
      `consensus finalized · ${consensus.verdict.classification} · risk ${consensus.verdict.risk_score}/100`,
      "ok",
    );
  } else {
    log(cb, "consensus still finalizing — the report page keeps polling in the background", "warn");
  }
  await sleep(400);
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
    attestation,
    attestError,
    consensus,
  };
}

/** Page-cap info for honest coverage notes. */
export const SCAN_PAGE_CAP = TX_PAGE_CAP;
