import { motion } from "motion/react";
import { Gauge, Loader2, ListChecks, FileText, ShieldQuestion, ExternalLink, Wallet } from "lucide-react";
import type { AttestationInfo, AttestedReport, VerdictClass } from "@/lib/types";
import { contractExplorerUrl, type ConsensusStatus } from "@/lib/genlayer";
import type { GenLayerWalletState } from "@/hooks/useGenLayerWallet";

const CLASS_STYLE: Record<VerdictClass, { label: string; color: string; bg: string; blurb: string }> = {
  low_risk: { label: "Low risk", color: "#7bd88f", bg: "rgba(123,216,143,0.08)", blurb: "nothing in view demands suspicion" },
  ordinary: { label: "Ordinary", color: "#b7f34d", bg: "rgba(183,243,77,0.07)", blurb: "human-paced, unremarkable" },
  bot_like: { label: "Bot like", color: "#59d6e6", bg: "rgba(89,214,230,0.08)", blurb: "scripted timing signature" },
  sybil_like: { label: "Sybil like", color: "#ffb224", bg: "rgba(255,178,36,0.08)", blurb: "farm-shaped activity graph" },
  high_risk: { label: "High risk", color: "#ff5c4d", bg: "rgba(255,92,77,0.08)", blurb: "strong abuse indicators" },
  inconclusive: { label: "Inconclusive", color: "#8b9097", bg: "rgba(139,144,151,0.08)", blurb: "evidence too thin to judge" },
};

const FACTOR_LABEL: Record<string, string> = {
  BURST_ACTIVITY: "burst activity",
  CONCENTRATED_COUNTERPARTIES: "concentrated counterparties",
  CONCENTRATED_CONTRACTS: "concentrated contracts",
  HIGH_FAILURE_RATE: "high failure rate",
  HIGH_AUTOMATION: "high automation",
  LOW_ACTIVITY: "low activity",
  MULTICHAIN_DEPTH: "multichain depth",
  PARTIAL_COVERAGE: "partial coverage",
  REPETITIVE_BEHAVIOR: "repetitive behavior",
  LONG_DORMANCY: "long dormancy",
};

function WalletSubmit({
  attestError,
  wallet,
  onSubmitWithWallet,
  submittingWithWallet,
}: {
  attestError: string | null;
  wallet: GenLayerWalletState;
  onSubmitWithWallet: () => Promise<void>;
  submittingWithWallet: boolean;
}) {
  const noMetaMask = !wallet.checking && !wallet.prereq.hasMetaMask;
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-ink-2/60 p-7 md:p-9">
      <div className="flex items-center gap-3">
        <Wallet className="h-4 w-4 text-amber" />
        <p className="mono-label text-amber">Submit for an on-chain verdict</p>
      </div>
      <h2 className="mt-5 max-w-2xl text-4xl font-semibold tracking-[-0.02em] text-bone md:text-5xl">
        Report ready.
        <span className="font-serif-i ml-3 font-normal text-mute">Sign to reach consensus.</span>
      </h2>
      <p className="mt-5 max-w-xl text-sm leading-relaxed text-mute">
        {noMetaMask
          ? "The wallet analysis is complete. To attest it on GenLayer, install MetaMask with the GenLayer Snap, then sign the transaction yourself — you pay only network gas."
          : "The wallet analysis is complete. Connect your GenLayer wallet and sign the transaction yourself. Your selected account needs StudioNet GEN for gas — ProofLens never holds or asks for a private key."}
      </p>

      <div className="mt-7 flex flex-wrap items-center gap-4">
        <button
          onClick={() => void onSubmitWithWallet()}
          disabled={submittingWithWallet || wallet.connecting || noMetaMask}
          className="group flex items-center gap-2.5 rounded-lg bg-amber px-6 py-3 text-sm font-semibold text-ink transition-all hover:bg-bone disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submittingWithWallet || wallet.connecting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Wallet className="h-4 w-4" />
          )}
          {noMetaMask
            ? "MetaMask required"
            : submittingWithWallet || wallet.connecting
              ? "Awaiting signature…"
              : wallet.address
                ? "Sign & submit on-chain"
                : "Connect wallet & sign"}
        </button>
        {wallet.address && (
          <span className="font-mono text-[11px] text-mint">
            {wallet.address.slice(0, 6)}…{wallet.address.slice(-4)}
          </span>
        )}
      </div>

      {attestError && (
        <div className="mt-5 rounded-lg border border-amber/35 bg-amber/[0.06] p-4">
          <p className="mono-label text-[9px] text-amber">Submission result</p>
          <p className="mt-1.5 break-words font-mono text-[11.5px] leading-relaxed text-amber/90">
            {attestError}
          </p>
        </div>
      )}
    </div>
  );
}

function statusLabel(networkStatus: string | undefined): { text: string; color: string } {
  switch ((networkStatus ?? "PENDING").toUpperCase()) {
    case "ACCEPTED":
      return { text: "ACCEPTED — validators agreed, awaiting finality", color: "#b7f34d" };
    case "FINALIZED":
      return { text: "FINALIZED", color: "#7bd88f" };
    case "PROPAGATING":
      return { text: "PROPAGATING — transaction is spreading", color: "#ffb224" };
    case "CANCELED":
    case "UNDETERMINED":
      return { text: networkStatus?.toUpperCase() ?? "ENDED", color: "#ff5c4d" };
    default:
      return { text: "PENDING — validators are collecting evidence", color: "#ffb224" };
  }
}

function PendingVerdict({
  attestation,
  txStatus,
}: {
  attestation: AttestationInfo | null;
  txStatus: ConsensusStatus | null;
}) {
  const status = statusLabel(txStatus?.networkStatus);
  return (
    <div className="grid gap-px overflow-hidden rounded-xl border border-line bg-line">
      <div className="bg-ink-2/60 p-7 md:p-9">
        <div className="flex items-center gap-3">
          <Loader2 className="h-4 w-4 animate-spin text-amber" />
          <p className="mono-label text-amber">Consensus in progress</p>
        </div>
        <h2 className="mt-5 text-5xl font-semibold tracking-[-0.03em] text-bone md:text-6xl">
          Validators are
          <span className="font-serif-i ml-3 font-normal text-mute">arguing.</span>
        </h2>
        <p className="mt-5 max-w-lg text-sm leading-relaxed text-mute">
          GenLayer validators are independently fetching the sealed evidence, replaying every
          committed proof against Blockscout, and disagreeing with each other until they converge.
          This usually takes a few minutes — this page reads the contract and updates itself.
        </p>
        <div
          className="mt-6 inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 font-mono text-[10px] tracking-wider uppercase"
          style={{ borderColor: `${status.color}55`, color: status.color, background: `${status.color}11` }}
        >
          <span className="blink h-1.5 w-1.5 rounded-full" style={{ background: status.color }} />
          {status.text}
        </div>
        {attestation && (
          <div className="mt-6 space-y-2 font-mono text-[11px] text-mute">
            <a
              href={`https://explorer-studio.genlayer.com/transactions/${attestation.transactionHash}`}
              target="_blank"
              rel="noreferrer"
              className="group flex items-center gap-1.5 break-all hover:text-amber"
            >
              tx · {attestation.transactionHash}
              <ExternalLink className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
            </a>
            <a
              href={contractExplorerUrl(attestation.contractAddress)}
              target="_blank"
              rel="noreferrer"
              className="group flex items-center gap-1.5 hover:text-bone"
            >
              contract · {attestation.contractAddress}
              <ExternalLink className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export function VerdictPanel({
  consensus,
  attestation,
  attestError,
  wallet,
  onSubmitWithWallet,
  submittingWithWallet,
  txStatus,
}: {
  consensus: AttestedReport | null;
  attestation: AttestationInfo | null;
  attestError: string | null;
  wallet: GenLayerWalletState;
  onSubmitWithWallet: () => Promise<void>;
  submittingWithWallet: boolean;
  txStatus: ConsensusStatus | null;
}) {
  if (!consensus && !attestation) {
    return (
      <WalletSubmit
        attestError={attestError}
        wallet={wallet}
        onSubmitWithWallet={onSubmitWithWallet}
        submittingWithWallet={submittingWithWallet}
      />
    );
  }
  if (!consensus) return <PendingVerdict attestation={attestation} txStatus={txStatus} />;

  const v = consensus.verdict;
  const style = CLASS_STYLE[v.classification] ?? CLASS_STYLE.inconclusive;
  const arc = Math.PI * 80;
  const filled = (v.risk_score / 100) * arc;

  return (
    <div className="grid gap-px overflow-hidden rounded-xl border border-line bg-line lg:grid-cols-[1.35fr_1fr]">
      {/* classification */}
      <div className="relative bg-ink-2/60 p-7 md:p-9">
        <div className="flex flex-wrap items-center gap-3">
          <p className="mono-label" style={{ color: style.color }}>
            GenLayer consensus verdict
          </p>
          <span className="rounded-full border border-mint/40 bg-mint/10 px-2.5 py-1 font-mono text-[9px] tracking-wider text-mint uppercase">
            validator-agreed
          </span>
        </div>

        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="mt-5 text-6xl font-semibold tracking-[-0.03em] md:text-7xl"
          style={{ color: style.color }}
        >
          {style.label}
          <span className="font-serif-i ml-3 align-middle text-2xl font-normal text-mute md:text-3xl">
            {style.blurb}
          </span>
        </motion.h2>

        {v.summary && <p className="mt-5 max-w-lg text-sm leading-relaxed text-mute">{v.summary}</p>}

        <div className="mt-6 inline-block">
          <span className="stamp text-[10px]" style={{ color: style.color }}>
            {v.policy_version} · studionet
          </span>
        </div>

        {v.factor_codes.length > 0 && (
          <div className="mt-8 border-t border-line/70 pt-6">
            <div className="flex items-center gap-2">
              <ListChecks className="h-3.5 w-3.5 text-dim" />
              <p className="mono-label text-dim">Factor codes</p>
            </div>
            <div className="mt-3.5 flex flex-wrap gap-2">
              {v.factor_codes.map((code) => (
                <span
                  key={code}
                  className="rounded-full border border-line-2 bg-ink-3 px-3 py-1.5 font-mono text-[10.5px] tracking-wide text-bone"
                >
                  {FACTOR_LABEL[code] ?? code.toLowerCase().replace(/_/g, " ")}
                </span>
              ))}
            </div>
          </div>
        )}

        {v.evidence_refs.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center gap-2">
              <FileText className="h-3.5 w-3.5 text-dim" />
              <p className="mono-label text-dim">Evidence references</p>
            </div>
            <ul className="mt-3 space-y-1.5">
              {v.evidence_refs.map((ref, i) => (
                <li key={i} className="font-mono text-[11px] leading-relaxed text-mute">
                  · {ref}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* risk dial + confidence */}
      <div className="flex flex-col bg-ink p-7 md:p-9">
        <div className="flex items-center gap-3">
          <Gauge className="h-4 w-4 text-dim" />
          <p className="mono-label text-dim">Composite risk</p>
        </div>

        <div className="relative mx-auto mt-6 w-full max-w-[240px]">
          <svg viewBox="0 0 200 118" className="w-full">
            <path d="M 20 105 A 80 80 0 0 1 180 105" fill="none" stroke="#1f242c" strokeWidth="10" strokeLinecap="round" />
            <motion.path
              d="M 20 105 A 80 80 0 0 1 180 105"
              fill="none"
              stroke={style.color}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${arc}`}
              initial={{ strokeDashoffset: arc }}
              animate={{ strokeDashoffset: arc - filled }}
              transition={{ duration: 1.3, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            />
            {Array.from({ length: 11 }).map((_, i) => {
              const angle = Math.PI + (i / 10) * Math.PI;
              const x1 = 100 + 66 * Math.cos(angle);
              const y1 = 105 + 66 * Math.sin(angle);
              const x2 = 100 + 60 * Math.cos(angle);
              const y2 = 105 + 60 * Math.sin(angle);
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#2b323c" strokeWidth="1.5" />;
            })}
            <text x="100" y="86" textAnchor="middle" fill={style.color} fontSize="44" fontWeight="700" fontFamily="Space Grotesk">
              {v.risk_score}
            </text>
            <text x="100" y="106" textAnchor="middle" fill="#565d66" fontSize="9" fontFamily="IBM Plex Mono" letterSpacing="2">
              / 100
            </text>
          </svg>
        </div>

        <div className="mt-auto pt-8">
          <div className="flex items-baseline justify-between">
            <p className="mono-label text-dim">Confidence</p>
            <p className="font-mono text-sm text-bone">{v.confidence}%</p>
          </div>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-line">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${v.confidence}%` }}
              transition={{ duration: 1, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="h-full rounded-full bg-bone/80"
            />
          </div>

          {v.limitations.length > 0 && (
            <div className="mt-5 rounded-lg border border-line bg-ink-2/50 p-4">
              <div className="flex items-center gap-2">
                <ShieldQuestion className="h-3.5 w-3.5 text-dim" />
                <p className="mono-label text-[9px] text-dim">Validator limitations</p>
              </div>
              <ul className="mt-2.5 space-y-1.5">
                {v.limitations.map((lim, i) => (
                  <li key={i} className="font-mono text-[10px] leading-relaxed text-mute">
                    · {lim}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4 rounded-lg border p-4" style={{ borderColor: `${style.color}55`, background: style.bg }}>
            <p className="font-mono text-[10px] leading-relaxed" style={{ color: style.color }}>
              Stored on-chain at{" "}
              <a
                href={contractExplorerUrl(attestation?.contractAddress ?? "")}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                the attestation contract
              </a>
              . Verdicts describe behavior, never identity — read the receipts before the label.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
