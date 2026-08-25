import type { ChainConfig, ChainId } from "./chains";
import type { BsTokenTransfer, BsTx } from "./blockscout";
import type {
  ActivityCategory,
  AssetStat,
  BehaviorSignals,
  ContractStat,
  CounterpartyStat,
  DerivedFacts,
  NormalizedActivity,
  NormalizedTokenTransfer,
  ValueRef,
  WalletAnalytics,
} from "./types";
import { clamp } from "./format";

const APPROVAL_RE = /^(approve|increaseallowance|decreaseallowance|setapprovalforall)$/i;
const SWAP_RE = /(swap|exactinput|exactoutput)/i;
const BRIDGE_RE = /(bridge|depositeth|depositfor|withdrawto|relaymessage|outboundtransfer|provewithdrawal|finalizewithdrawal)/i;

function norm(x: number, lo: number, hi: number): number {
  if (hi <= lo) return 0;
  return clamp((x - lo) / (hi - lo));
}

function metaLabel(meta: { name?: string | null; metadata?: { tags?: { name?: string }[] } | null } | null | undefined): string | null {
  if (!meta) return null;
  if (meta.name) return meta.name;
  const tag = meta.metadata?.tags?.find((t) => t.name)?.name;
  return tag ?? null;
}

/* ------------------------------------------------------------------ */
/* Normalization                                                       */
/* ------------------------------------------------------------------ */

export function normalizeTransactions(
  cfg: ChainConfig,
  wallet: string,
  txs: BsTx[],
  coinPrice: number | null,
): NormalizedActivity[] {
  const w = wallet.toLowerCase();
  const out: NormalizedActivity[] = [];
  for (const tx of txs) {
    if (!tx?.hash) continue;
    const from = (tx.from?.hash ?? "").toLowerCase();
    const to = tx.to?.hash ? tx.to.hash.toLowerCase() : null;
    const outbound = from === w;
    const ts = tx.timestamp ? Date.parse(tx.timestamp) : NaN;
    if (!Number.isFinite(ts)) continue;

    const method = tx.method || null;
    const toIsContract = Boolean(tx.to?.is_contract);
    const creation = outbound && !to;

    let category: ActivityCategory;
    if (creation) category = "contract-creation";
    else if (outbound && method && APPROVAL_RE.test(method)) category = "approval";
    else if (outbound && method && SWAP_RE.test(method)) category = "swap";
    else if (outbound && method && BRIDGE_RE.test(method)) category = "bridge";
    else if (outbound && (toIsContract || method)) category = "contract-call";
    else if (outbound) category = "send";
    else category = "receive";

    const valueRaw = typeof tx.value === "string" ? tx.value : "0";
    const nativeValue = Number(valueRaw) / 10 ** cfg.nativeDecimals;
    const feeNative = tx.fee?.value ? Number(tx.fee.value) / 10 ** cfg.nativeDecimals : 0;
    const usdValue = coinPrice !== null && nativeValue > 0 ? nativeValue * coinPrice : null;

    const counterMeta = outbound ? tx.to : tx.from;
    out.push({
      id: `${cfg.id}:${tx.hash}`,
      chain: cfg.id,
      hash: tx.hash,
      timestamp: ts,
      timestampRaw: tx.timestamp ?? new Date(ts).toISOString(),
      block: Number(tx.block_number ?? tx.block ?? 0) || 0,
      status: tx.status === "ok" ? "ok" : "failed",
      statusRaw:
        tx.status !== null && tx.status !== undefined
          ? String(tx.status)
          : tx.result ?? null,
      category,
      method,
      from,
      to,
      fromIsContract: Boolean(tx.from?.is_contract),
      toIsContract,
      counterparty: outbound ? to : from || null,
      counterpartyLabel: metaLabel(counterMeta),
      counterpartyIsContract: Boolean(counterMeta?.is_contract),
      nativeValue,
      valueRaw,
      usdValue,
      feeNative,
      explorerUrl: cfg.explorerTx(tx.hash),
    });
  }
  return out;
}

export function normalizeTransfers(
  cfg: ChainConfig,
  wallet: string,
  items: BsTokenTransfer[],
  txTimes: Map<string, number>,
): NormalizedTokenTransfer[] {
  const w = wallet.toLowerCase();
  const out: NormalizedTokenTransfer[] = [];
  for (const it of items) {
    if (!it?.transaction_hash) continue;
    const from = (it.from?.hash ?? "").toLowerCase();
    const to = (it.to?.hash ?? "").toLowerCase();
    const direction = from === w && to === w ? "self" : to === w ? "in" : "out";
    const tokenType = (it.token?.type as NormalizedTokenTransfer["tokenType"]) ?? "unknown";
    const decimals = it.total?.decimals ?? it.token?.decimals ?? null;
    let amount: number | null = null;
    if (it.total?.value && decimals !== null && tokenType === "ERC-20") {
      const d = Number(decimals);
      if (Number.isFinite(d) && d >= 0 && d <= 36) amount = Number(it.total.value) / 10 ** d;
    }
    const rate = it.token?.exchange_rate ? Number(it.token.exchange_rate) : null;
    const usdValue = amount !== null && rate !== null && Number.isFinite(rate) ? amount * rate : null;
    const ts = it.timestamp ? Date.parse(it.timestamp) : txTimes.get(it.transaction_hash.toLowerCase());
    if (ts === undefined || !Number.isFinite(ts)) continue;

    out.push({
      id: `${cfg.id}:${it.transaction_hash}:${out.length}`,
      chain: cfg.id,
      txHash: it.transaction_hash,
      timestamp: ts,
      tokenType,
      direction,
      tokenAddress: (it.token?.address_hash ?? it.token?.address ?? "").toLowerCase(),
      tokenSymbol: it.token?.symbol ?? metaLabel(null) ?? "UNKNOWN",
      tokenName: it.token?.name ?? "Unknown token",
      amount,
      usdValue,
      from,
      to,
      counterparty: direction === "in" ? from : to,
      explorerUrl: cfg.explorerTx(it.transaction_hash),
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Analytics                                                           */
/* ------------------------------------------------------------------ */

interface AnalyticsInput {
  address: string;
  ensName: string | null;
  activity: NormalizedActivity[];
  transfers: NormalizedTokenTransfer[];
  authoritativeTxTotal: number;
  coinPrices?: Partial<Record<ChainId, number>>;
}

export function computeAnalytics(input: AnalyticsInput): WalletAnalytics {
  const { activity, transfers } = input;
  const sorted = [...activity].sort((a, b) => a.timestamp - b.timestamp);
  const now = Date.now();

  const counts = {
    observedTx: sorted.length,
    authoritativeTx: input.authoritativeTxTotal,
    sends: 0,
    receives: 0,
    contractCalls: 0,
    contractCreations: 0,
    approvals: 0,
    swaps: 0,
    bridges: 0,
    failed: 0,
    tokenIn: 0,
    tokenOut: 0,
    nftTransfers: 0,
  };

  const nativeInBySymbol: Record<string, number> = {};
  const nativeOutBySymbol: Record<string, number> = {};
  const feesBySymbol: Record<string, number> = {};

  const hourHistogram = new Array<number>(24).fill(0);
  const weekdayHistogram = new Array<number>(7).fill(0);
  const monthMap = new Map<string, number>();
  const daySet = new Set<string>();

  let usdInKnown = 0;
  let usdOutKnown = 0;
  let feesUsd = 0;

  const cpMap = new Map<string, CounterpartyStat>();
  const contractMap = new Map<string, ContractStat>();
  const methodMap = new Map<string, number>();
  const coinPrices: Partial<Record<ChainId, number>> = input.coinPrices ?? {};

  const bumpCp = (
    addr: string,
    init: Omit<CounterpartyStat, "address">
  ) => {
    const existing = cpMap.get(addr);
    if (!existing) {
      cpMap.set(addr, { address: addr, ...init });
      return;
    }
    existing.interactions += init.interactions;
    existing.sent += init.sent;
    existing.received += init.received;
    existing.nativeIn += init.nativeIn;
    existing.nativeOut += init.nativeOut;
    existing.usdIn += init.usdIn;
    existing.usdOut += init.usdOut;
    if (!existing.label && init.label) existing.label = init.label;
    if (init.isContract) existing.isContract = true;
    for (const c of init.chains) if (!existing.chains.includes(c)) existing.chains.push(c);
  };

  const sendValuesKey: { key: string; usd: number | null; native: number; hash: string; chain: ChainId; at: number; party: string | null }[] = [];
  const receiveValuesKey: typeof sendValuesKey = [];

  const outboundValues: number[] = [];
  let dustReceives = 0;
  let pricedOrTinyReceives = 0;

  for (const a of sorted) {
    if (a.status === "failed") counts.failed++;
    switch (a.category) {
      case "send": counts.sends++; break;
      case "receive": counts.receives++; break;
      case "contract-call": counts.contractCalls++; break;
      case "contract-creation": counts.contractCreations++; break;
      case "approval": counts.approvals++; break;
      case "swap": counts.swaps++; break;
      case "bridge": counts.bridges++; break;
    }

    const d = new Date(a.timestamp);
    hourHistogram[d.getUTCHours()]++;
    weekdayHistogram[d.getUTCDay()]++;
    const mk = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    monthMap.set(mk, (monthMap.get(mk) ?? 0) + 1);
    daySet.add(`${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`);

    const sym = symbolOf(a.chain);
    const outbound = a.from === input.address.toLowerCase();

    if (outbound) {
      nativeOutBySymbol[sym] = (nativeOutBySymbol[sym] ?? 0) + a.nativeValue;
      feesBySymbol[sym] = (feesBySymbol[sym] ?? 0) + a.feeNative;
      if (a.usdValue) usdOutKnown += a.usdValue;
      const price = coinPrices[a.chain];
      if (price && a.feeNative > 0) feesUsd += a.feeNative * price;
      if (a.nativeValue > 0) outboundValues.push(a.usdValue ?? a.nativeValue);
      sendValuesKey.push({ key: a.usdValue !== null ? "usd" : "native", usd: a.usdValue, native: a.nativeValue, hash: a.hash, chain: a.chain, at: a.timestamp, party: a.to });
    } else {
      nativeInBySymbol[sym] = (nativeInBySymbol[sym] ?? 0) + a.nativeValue;
      if (a.usdValue) usdInKnown += a.usdValue;
      if (a.nativeValue > 0) {
        pricedOrTinyReceives++;
        const isDust = a.usdValue !== null ? a.usdValue < 2 : a.nativeValue < 0.0005;
        if (isDust) dustReceives++;
      }
      receiveValuesKey.push({ key: a.usdValue !== null ? "usd" : "native", usd: a.usdValue, native: a.nativeValue, hash: a.hash, chain: a.chain, at: a.timestamp, party: a.from });
    }

    if (a.counterparty) {
      bumpCp(a.counterparty, {
        label: a.counterpartyLabel,
        isContract: a.counterpartyIsContract,
        interactions: 1,
        sent: outbound ? 1 : 0,
        received: outbound ? 0 : 1,
        nativeIn: outbound ? 0 : a.nativeValue,
        nativeOut: outbound ? a.nativeValue : 0,
        usdIn: outbound ? 0 : (a.usdValue ?? 0),
        usdOut: outbound ? a.usdValue ?? 0 : 0,
        chains: [a.chain],
      });
    }

    if (outbound && a.method) {
      methodMap.set(a.method, (methodMap.get(a.method) ?? 0) + 1);
    }

    if (outbound && a.to && (a.toIsContract || a.category === "contract-call" || a.category === "approval" || a.category === "swap" || a.category === "bridge")) {
      const c = contractMap.get(a.to);
      if (!c) {
        contractMap.set(a.to, {
          address: a.to,
          name: a.counterpartyLabel,
          interactions: 1,
          failed: a.status === "failed" ? 1 : 0,
          methods: a.method ? [a.method] : [],
          chains: [a.chain],
        });
      } else {
        c.interactions++;
        if (a.status === "failed") c.failed++;
        if (a.method && !c.methods.includes(a.method)) c.methods.push(a.method);
        if (!c.chains.includes(a.chain)) c.chains.push(a.chain);
        if (!c.name && a.counterpartyLabel) c.name = a.counterpartyLabel;
      }
    }
  }

  // token transfer aggregates
  const assetMap = new Map<string, AssetStat>();
  for (const t of transfers) {
    if (t.direction === "in") {
      counts.tokenIn++;
      if (t.usdValue) usdInKnown += t.usdValue;
    } else if (t.direction === "out") {
      counts.tokenOut++;
      if (t.usdValue) usdOutKnown += t.usdValue;
      if (t.usdValue !== null) outboundValues.push(t.usdValue);
    }
    if (t.tokenType !== "ERC-20") counts.nftTransfers++;

    const key = t.tokenSymbol.toUpperCase();
    const asset = assetMap.get(key);
    if (!asset) {
      assetMap.set(key, {
        symbol: t.tokenSymbol,
        name: t.tokenName,
        transfersIn: t.direction === "in" ? 1 : 0,
        transfersOut: t.direction === "out" ? 1 : 0,
        usdIn: t.direction === "in" ? t.usdValue ?? 0 : 0,
        usdOut: t.direction === "out" ? t.usdValue ?? 0 : 0,
        chains: [t.chain],
      });
    } else {
      if (t.direction === "in") asset.transfersIn++;
      if (t.direction === "out") asset.transfersOut++;
      asset.usdIn += t.direction === "in" ? t.usdValue ?? 0 : 0;
      asset.usdOut += t.direction === "out" ? t.usdValue ?? 0 : 0;
      if (!asset.chains.includes(t.chain)) asset.chains.push(t.chain);
    }

    if (t.counterparty && t.direction !== "self") {
      bumpCp(t.counterparty, {
        label: null,
        isContract: false,
        interactions: 1,
        sent: t.direction === "out" ? 1 : 0,
        received: t.direction === "in" ? 1 : 0,
        nativeIn: 0,
        nativeOut: 0,
        usdIn: t.direction === "in" ? t.usdValue ?? 0 : 0,
        usdOut: t.direction === "out" ? t.usdValue ?? 0 : 0,
        chains: [t.chain],
      });
    }
  }

  // timing
  const times = sorted.map((a) => a.timestamp);
  const gapsMin: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const g = (times[i] - times[i - 1]) / 60_000;
    if (g > 0) gapsMin.push(g);
  }
  gapsMin.sort((x, y) => x - y);
  const medianGapMinutes = gapsMin.length ? gapsMin[Math.floor(gapsMin.length / 2)] : null;
  const meanGapMinutes = gapsMin.length ? gapsMin.reduce((s, g) => s + g, 0) / gapsMin.length : null;
  const variance = gapsMin.length > 1 && meanGapMinutes
    ? Math.sqrt(gapsMin.reduce((s, g) => s + (g - meanGapMinutes) ** 2, 0) / gapsMin.length) / (meanGapMinutes || 1)
    : 0;
  const regularity = gapsMin.length > 4 ? clamp(1 - variance / 2.6) : 0;
  const longestQuietDays = gapsMin.length ? gapsMin[gapsMin.length - 1] / (60 * 24) : 0;

  // burst: max txs inside any 10-minute window (two pointers)
  let burstMax10m = 0;
  let j = 0;
  for (let i = 0; i < times.length; i++) {
    while (times[i] - times[j] > 10 * 60_000) j++;
    burstMax10m = Math.max(burstMax10m, i - j + 1);
  }

  const firstAt = times.length ? times[0] : null;
  const lastAt = times.length ? times[times.length - 1] : null;
  const ageDays = firstAt ? Math.max(0, (now - firstAt) / 86_400_000) : 0;
  const spanDays = firstAt && lastAt ? Math.max(0, (lastAt - firstAt) / 86_400_000) : 0;
  const activeDays = daySet.size;
  const txsPerActiveDay = activeDays ? sorted.length / activeDays : 0;

  const monthHistogram = [...monthMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, count]) => ({ label, count }));

  const counterparties = [...cpMap.values()].sort((a, b) => b.interactions - a.interactions);
  const contracts = [...contractMap.values()].sort((a, b) => b.interactions - a.interactions);
  const methods = [...methodMap.entries()]
    .map(([method, count]) => ({ method, count }))
    .sort((a, b) => b.count - a.count);
  const assets = [...assetMap.values()].sort(
    (a, b) => b.transfersIn + b.transfersOut - (a.transfersIn + a.transfersOut),
  );

  // derived facts
  const totalInteractions = counterparties.reduce((s, c) => s + c.interactions, 0) || 1;
  const uniqueInboundSenders = counterparties.filter((c) => c.received > 0 && !c.isContract).length;
  const topCounterpartyShare = counterparties.length ? counterparties[0].interactions / totalInteractions : 0;
  const contractInteractions = contracts.reduce((s, c) => s + c.interactions, 0) || 1;
  const topContractShare = contracts.length ? contracts[0].interactions / contractInteractions : 0;
  const outboundTotal = counts.sends + counts.contractCalls + counts.approvals + counts.swaps + counts.bridges + counts.contractCreations;
  const inboundRatio = counts.receives / Math.max(1, counts.receives + counts.sends);
  const fromWalletCalls = outboundTotal || 1;
  const failRate = counts.failed / fromWalletCalls;
  const topMethodShare = methods.length ? methods[0].count / Math.max(1, outboundTotal) : 0;
  const hourConcentration = sorted.length ? Math.max(...hourHistogram) / sorted.length : 0;

  // value repetition among outbound values
  const valueBuckets = new Map<string, number>();
  for (const v of outboundValues) {
    const bucket = v >= 10 ? v.toFixed(0) : v >= 0.1 ? v.toFixed(2) : v.toFixed(5);
    valueBuckets.set(bucket, (valueBuckets.get(bucket) ?? 0) + 1);
  }
  const mostCommonSendShare = outboundValues.length
    ? Math.max(...valueBuckets.values()) / outboundValues.length
    : 0;
  const dustReceiveShare = pricedOrTinyReceives ? dustReceives / pricedOrTinyReceives : 0;

  const derived: DerivedFacts = {
    uniqueCounterparties: counterparties.length,
    uniqueInboundSenders,
    dustReceiveShare,
    topCounterpartyShare,
    topContractShare,
    inboundRatio,
    failRate,
    topMethodShare,
    hourConcentration,
    mostCommonSendShare,
  };

  // signals
  const automation = clamp(
    0.45 * regularity + 0.3 * norm(hourConcentration, 0.12, 0.55) + 0.25 * norm(burstMax10m, 4, 45),
  );
  const sybil = clamp(
    0.4 * norm(uniqueInboundSenders, 6, 60) +
      0.35 * norm(dustReceiveShare, 0.25, 0.85) +
      0.25 * norm(inboundRatio, 0.55, 0.92),
  );
  const concentration = clamp(0.5 * norm(topCounterpartyShare, 0.1, 0.65) + 0.5 * norm(topContractShare, 0.15, 0.8));
  const failure = clamp(0.7 * norm(failRate, 0.02, 0.3) + 0.3 * norm(counts.failed, 3, 40));
  const dormancy = clamp(norm(longestQuietDays / Math.max(ageDays, 1), 0.25, 0.85));
  const repetition = clamp(0.55 * norm(mostCommonSendShare, 0.15, 0.85) + 0.45 * norm(topMethodShare, 0.35, 0.95));

  const signals: BehaviorSignals = { automation, sybil, concentration, failure, dormancy, repetition };

  const signalDetails: WalletAnalytics["signalDetails"] = {
    automation: `${fmtPctSafe(regularity)} gap regularity · top hour holds ${fmtPctSafe(hourConcentration)} of activity · peak burst ${burstMax10m} tx / 10m`,
    sybil: `${uniqueInboundSenders} unique inbound EOAs · dust share ${fmtPctSafe(dustReceiveShare)} · inbound ratio ${fmtPctSafe(inboundRatio)}`,
    concentration: `top counterparty ${fmtPctSafe(topCounterpartyShare)} of interactions · top contract ${fmtPctSafe(topContractShare)}`,
    failure: `${counts.failed} failed of ${outboundTotal} outbound interactions (${fmtPctSafe(failRate, 1)})`,
    dormancy: `longest quiet stretch ${longestQuietDays.toFixed(0)}d across ${ageDays.toFixed(0)}d of inspected history`,
    repetition: `most common outbound value covers ${fmtPctSafe(mostCommonSendShare)} of sends · top method ${fmtPctSafe(topMethodShare)}`,
  };

  const pick = (arr: typeof sendValuesKey): ValueRef | null => {
    if (!arr.length) return null;
    const best = [...arr].sort((a, b) => (b.usd ?? b.native) - (a.usd ?? a.native))[0];
    return {
      native: best.native,
      usd: best.usd,
      nativeSymbol: symbolOf(best.chain),
      hash: best.hash,
      chain: best.chain,
      at: best.at,
      party: best.party,
    };
  };

  return {
    subject: { address: input.address, ensName: input.ensName },
    window: { firstAt, lastAt, ageDays, activeDays, spanDays },
    counts,
    volume: {
      nativeInBySymbol,
      nativeOutBySymbol,
      feesBySymbol,
      usdInKnown,
      usdOutKnown,
      feesUsd,
      largestSend: pick(sendValuesKey),
      largestReceive: pick(receiveValuesKey),
    },
    timing: {
      medianGapMinutes,
      meanGapMinutes,
      longestQuietDays,
      burstMax10m,
      regularity,
      hourHistogram,
      weekdayHistogram,
      monthHistogram,
      txsPerActiveDay,
    },
    counterparties: counterparties.slice(0, 12),
    contracts: contracts.slice(0, 10),
    methods: methods.slice(0, 10),
    assets: assets.slice(0, 10),
    signals,
    signalDetails,
    derived,
  };
}

function symbolOf(chain: ChainId): string {
  switch (chain) {
    case "polygon": return "POL";
    case "gnosis": return "xDAI";
    default: return "ETH";
  }
}

function fmtPctSafe(x: number, dp = 0): string {
  if (!Number.isFinite(x)) return "0%";
  return `${(x * 100).toFixed(dp)}%`;
}
