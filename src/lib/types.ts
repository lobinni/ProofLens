import type { ChainId } from "./chains";

export type ActivityCategory =
  | "send"
  | "receive"
  | "contract-call"
  | "contract-creation"
  | "approval"
  | "swap"
  | "bridge";

export interface NormalizedActivity {
  id: string;
  chain: ChainId;
  hash: string;
  timestamp: number;
  /** Exact timestamp string as returned by the explorer — proofs reuse it byte-for-byte. */
  timestampRaw: string;
  block: number;
  status: "ok" | "failed";
  /** Raw explorer status string ("ok" | "error" | result fallback) — committed in proofs. */
  statusRaw: string | null;
  category: ActivityCategory;
  method: string | null;
  from: string;
  to: string | null;
  fromIsContract: boolean;
  toIsContract: boolean;
  counterparty: string | null;
  counterpartyLabel: string | null;
  counterpartyIsContract: boolean;
  nativeValue: number;
  valueRaw: string;
  usdValue: number | null;
  feeNative: number;
  explorerUrl: string;
}

export interface NormalizedTokenTransfer {
  id: string;
  chain: ChainId;
  txHash: string;
  timestamp: number;
  tokenType: "ERC-20" | "ERC-721" | "ERC-1155" | "unknown";
  direction: "in" | "out" | "self";
  tokenAddress: string;
  tokenSymbol: string;
  tokenName: string;
  amount: number | null;
  usdValue: number | null;
  from: string;
  to: string;
  counterparty: string;
  explorerUrl: string;
}

export interface ChainCounters {
  chain: ChainId;
  transactions: number;
  tokenTransfers: number;
  gasUsed: number;
}

export type ChainStatus = "queued" | "scanning" | "done" | "error" | "empty";

export interface ChainScanInfo {
  chain: ChainId;
  status: ChainStatus;
  collectedTx: number;
  collectedTransfers: number;
  counters: ChainCounters | null;
  coinPrice: number | null;
  error?: string;
}

export interface CounterpartyStat {
  address: string;
  label: string | null;
  isContract: boolean;
  interactions: number;
  sent: number;
  received: number;
  nativeIn: number;
  nativeOut: number;
  usdIn: number;
  usdOut: number;
  chains: ChainId[];
}

export interface ContractStat {
  address: string;
  name: string | null;
  interactions: number;
  failed: number;
  methods: string[];
  chains: ChainId[];
}

export interface AssetStat {
  symbol: string;
  name: string;
  transfersIn: number;
  transfersOut: number;
  usdIn: number;
  usdOut: number;
  chains: ChainId[];
}

export interface ValueRef {
  native: number;
  usd: number | null;
  nativeSymbol: string;
  hash: string;
  chain: ChainId;
  at: number;
  party: string | null;
}

export interface MonthBucket {
  label: string;
  count: number;
}

export interface BehaviorSignals {
  automation: number;
  sybil: number;
  concentration: number;
  failure: number;
  dormancy: number;
  repetition: number;
}

export interface DerivedFacts {
  uniqueCounterparties: number;
  uniqueInboundSenders: number;
  dustReceiveShare: number;
  topCounterpartyShare: number;
  topContractShare: number;
  inboundRatio: number;
  failRate: number;
  topMethodShare: number;
  hourConcentration: number;
  mostCommonSendShare: number;
}

export interface WalletAnalytics {
  subject: { address: string; ensName: string | null };
  window: {
    firstAt: number | null;
    lastAt: number | null;
    ageDays: number;
    activeDays: number;
    spanDays: number;
  };
  counts: {
    observedTx: number;
    authoritativeTx: number;
    sends: number;
    receives: number;
    contractCalls: number;
    contractCreations: number;
    approvals: number;
    swaps: number;
    bridges: number;
    failed: number;
    tokenIn: number;
    tokenOut: number;
    nftTransfers: number;
  };
  volume: {
    nativeInBySymbol: Record<string, number>;
    nativeOutBySymbol: Record<string, number>;
    feesBySymbol: Record<string, number>;
    usdInKnown: number;
    usdOutKnown: number;
    feesUsd: number;
    largestSend: ValueRef | null;
    largestReceive: ValueRef | null;
  };
  timing: {
    medianGapMinutes: number | null;
    meanGapMinutes: number | null;
    longestQuietDays: number;
    burstMax10m: number;
    regularity: number;
    hourHistogram: number[];
    weekdayHistogram: number[];
    monthHistogram: MonthBucket[];
    txsPerActiveDay: number;
  };
  counterparties: CounterpartyStat[];
  contracts: ContractStat[];
  methods: { method: string; count: number }[];
  assets: AssetStat[];
  signals: BehaviorSignals;
  signalDetails: Record<keyof BehaviorSignals, string>;
  derived: DerivedFacts;
}

/* ------------------------------------------------------------------ */
/* Consensus verdict — the taxonomy stored by the deployed contract     */
/* ------------------------------------------------------------------ */

export type VerdictClass =
  | "low_risk"
  | "ordinary"
  | "bot_like"
  | "sybil_like"
  | "high_risk"
  | "inconclusive";

export interface ConsensusVerdict {
  classification: VerdictClass;
  risk_score: number;
  confidence: number;
  factor_codes: string[];
  summary: string;
  evidence_refs: string[];
  limitations: string[];
  policy_version: string;
}

/** The exact shape stored on-chain by ProofLensIntelligence.analyze_wallet(). */
export interface AttestedReport {
  scan_id: string;
  wallet: string;
  evidence_hash: string;
  evidence_schema: string;
  verification_schema: string;
  policy_version: string;
  verdict: ConsensusVerdict;
}

export interface AttestationInfo {
  evidenceHash: string;
  transactionHash: string;
  contractAddress: string;
}

/* ------------------------------------------------------------------ */
/* Verification shapes — byte-compatible with the deployed contract     */
/* ------------------------------------------------------------------ */

export interface VerificationProof {
  chainId: ChainId;
  hash: string;
  url: string;
  blockNumber: number | null;
  timestamp: string | null;
  from: string;
  to: string | null;
  value: string;
  status: string | null;
  method: string | null;
  targetIsContract: boolean;
  createdContract: boolean;
}

export interface VerificationSourceRef {
  chainId: ChainId;
  countersUrl: string;
}

export interface VerificationMetrics {
  sampledTransactions: number;
  sampledOutbound: number;
  sampledInbound: number;
  sampledSelf: number;
  sampledFailed: number;
  sampledContractCalls: number;
  sampledContractCreations: number;
  sampledChains: number;
  firstActivityAt: string | null;
  lastActivityAt: string | null;
}

export interface VerificationSection {
  schemaVersion: "blockscout.v1";
  sourceRefs: VerificationSourceRef[];
  transactionProofs: VerificationProof[];
  metrics: VerificationMetrics;
}

export interface EvidenceBundle {
  schemaVersion: "prooflens.v2";
  scanId: string;
  wallet: string;
  verification: VerificationSection;
}

export interface ScanResult {
  scanId: string;
  address: string;
  ensName: string | null;
  startedAt: number;
  finishedAt: number;
  chains: ChainScanInfo[];
  activity: NormalizedActivity[];
  tokenTransfers: NormalizedTokenTransfer[];
  analytics: WalletAnalytics;
  evidence: EvidenceBundle;
  evidenceHash: string;
  canonicalEvidence: string;
  attestation: AttestationInfo | null;
  /** Set when the relayer pipeline could not complete — the report still
   *  renders analytics + sealed evidence, the verdict shows the reason. */
  attestError: string | null;
  consensus: AttestedReport | null;
}

export type ScanStage =
  | "idle"
  | "resolving"
  | "collecting"
  | "analyzing"
  | "committing"
  | "attesting"
  | "consensus"
  | "done"
  | "error";

export interface ScanLogLine {
  at: number;
  text: string;
  tone: "info" | "ok" | "warn" | "err";
}
