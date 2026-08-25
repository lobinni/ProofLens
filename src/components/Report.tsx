import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { AlertTriangle, ArrowUpRight, Check, Copy } from "lucide-react";
import { CHAIN_MAP } from "@/lib/chains";
import { readTransactionStatus, type ConsensusStatus } from "@/lib/genlayer";
import { fetchConsensusReport } from "@/lib/consensus";
import type { AttestedReport, ScanResult } from "@/lib/types";
import type { GenLayerWalletState } from "@/hooks/useGenLayerWallet";
import {
  fmtCompact,
  fmtDate,
  fmtDurationDays,
  fmtGapMinutes,
  fmtInt,
  fmtPct,
  fmtUsd,
} from "@/lib/format";
import { VerdictPanel } from "./VerdictPanel";
import { SignalsPanel } from "./SignalsPanel";
import { Ledger } from "./Ledger";
import { EvidencePanel } from "./EvidencePanel";

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="border-l border-line/80 pl-4">
      <p className="mono-label text-[9px] text-dim">{label}</p>
      <p className="mt-2 text-xl font-semibold tracking-tight text-bone md:text-2xl">{value}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-dim">{note}</p>
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-4">
      <h2 className="text-xl font-semibold tracking-tight md:text-2xl">{children}</h2>
      <span className="rule-dash flex-1" />
    </div>
  );
}

export function Report({
  result,
  onNewScan,
  onConsensus,
  wallet,
  onSubmitWithWallet,
  submittingWithWallet,
  submitError,
}: {
  result: ScanResult;
  onNewScan: () => void;
  onConsensus: (report: AttestedReport) => void;
  wallet: GenLayerWalletState;
  onSubmitWithWallet: () => Promise<void>;
  submittingWithWallet: boolean;
  submitError: string | null;
}) {
  const a = result.analytics;
  const c = a.counts;
  const [copied, setCopied] = useState(false);
  const [txStatus, setTxStatus] = useState<ConsensusStatus | null>(null);
  const errChains = result.chains.filter((chain) => chain.status === "error");
  const readyChains = result.chains.filter(
    (chain) => chain.status === "done" || chain.status === "empty",
  );
  const scanSeconds = Math.max(1, Math.round((result.finishedAt - result.startedAt) / 1000));

  useEffect(() => {
    if (result.consensus || !result.attestation) return;
    let stopped = false;
    let attempts = 0;

    const tick = () => {
      attempts++;
      readTransactionStatus(result.attestation!.transactionHash)
        .then((status) => {
          if (!stopped) setTxStatus(status);
        })
        .catch(() => undefined);

      fetchConsensusReport(result.scanId)
        .then((report) => {
          if (report && !stopped) {
            stopped = true;
            window.clearInterval(timer);
            onConsensus(report);
          }
        })
        .catch(() => undefined);

      if (attempts >= 30) window.clearInterval(timer);
    };

    const timer = window.setInterval(tick, 10_000);
    tick();
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [result.attestation, result.consensus, result.scanId, onConsensus]);

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(result.address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable */
    }
  };

  const outbound = c.sends + c.contractCalls + c.approvals + c.swaps + c.bridges;
  const knownVolume = a.volume.usdInKnown + a.volume.usdOutKnown;
  const topCounterparty = a.counterparties[0];
  const topContract = a.contracts[0];
  const topMethod = a.methods[0];

  return (
    <div className="mx-auto max-w-6xl px-5 pt-28 pb-24 md:px-8">
      <motion.header
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <p className="mono-label text-amber">Wallet report</p>
          <span className="text-xs text-dim">
            {readyChains.length} networks read in {scanSeconds}s
          </span>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <h1 className="min-w-0 truncate font-mono text-lg font-medium text-bone sm:text-2xl">
            {result.ensName ?? result.address}
          </h1>
          <button
            onClick={copyAddress}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line text-mute transition-colors hover:text-bone"
            aria-label="Copy wallet address"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-mint" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
        {result.ensName && <p className="mt-2 font-mono text-xs text-dim">{result.address}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          {result.chains.map((chain) => (
            <span
              key={chain.chain}
              className="flex items-center gap-1.5 rounded-full border border-line/70 px-2.5 py-1 text-[10px] text-mute"
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background: CHAIN_MAP[chain.chain].color,
                  opacity: chain.status === "error" ? 0.25 : 1,
                }}
              />
              {CHAIN_MAP[chain.chain].name}
            </span>
          ))}
        </div>

        {errChains.length > 0 && (
          <div className="mt-5 flex items-start gap-3 rounded-lg border border-amber/30 bg-amber/[0.05] p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
            <p className="text-xs leading-relaxed text-amber">
              {errChains.map((chain) => CHAIN_MAP[chain.chain].name).join(", ")} did not return a
              complete response. The report keeps those gaps visible.
            </p>
          </div>
        )}
      </motion.header>

      <div className="mt-10">
        <VerdictPanel
          consensus={result.consensus}
          attestation={result.attestation}
          attestError={result.attestError ?? submitError ?? wallet.error}
          wallet={wallet}
          onSubmitWithWallet={onSubmitWithWallet}
          submittingWithWallet={submittingWithWallet}
          txStatus={txStatus}
        />
      </div>

      <section className="mt-14">
        <SectionTitle>At a glance</SectionTitle>
        <div className="mt-7 grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-3">
          <Metric
            label="Visible activity span"
            value={a.window.ageDays > 0 ? fmtDurationDays(a.window.ageDays) : "—"}
            note={a.window.firstAt ? `Oldest inspected record ${fmtDate(a.window.firstAt)}` : "No activity found"}
          />
          <Metric
            label="Transactions"
            value={fmtCompact(c.authoritativeTx)}
            note={`${fmtInt(c.observedTx)} recent records inspected`}
          />
          <Metric
            label="Active days"
            value={fmtInt(a.window.activeDays)}
            note={`In the sample · typical gap ${fmtGapMinutes(a.timing.medianGapMinutes)}`}
          />
          <Metric
            label="Direction"
            value={`${fmtInt(c.receives)} in · ${fmtInt(outbound)} out`}
            note={`${c.contractCalls} app calls, ${c.swaps} swaps`}
          />
          <Metric
            label="Known value"
            value={knownVolume > 0 ? fmtUsd(knownVolume, { compact: true }) : "Unpriced"}
            note="Only transfers with available prices"
          />
          <Metric
            label="Failed actions"
            value={fmtInt(c.failed)}
            note={`${fmtPct(a.derived.failRate, 1)} of outbound attempts`}
          />
        </div>

        <div className="mt-9 border-y border-line/70 py-6 text-sm leading-relaxed text-mute">
          <p>
            This wallet interacted with <span className="text-bone">{fmtInt(a.derived.uniqueCounterparties)} counterparties</span>
            {a.contracts.length > 0 && (
              <> and <span className="text-bone">{fmtInt(a.contracts.length)} frequently used apps</span></>
            )}. Its busiest ten-minute window contained <span className="text-bone">{a.timing.burstMax10m} actions</span>,
            while its longest quiet stretch was <span className="text-bone">{fmtDurationDays(a.timing.longestQuietDays)}</span>.
          </p>
          {(topCounterparty || topContract || topMethod) && (
            <p className="mt-3">
              {topCounterparty && <>Most repeated route: <span className="text-bone">{topCounterparty.label ?? `${topCounterparty.address.slice(0, 8)}…`}</span>. </>}
              {topContract && <>Most-used app: <span className="text-bone">{topContract.name ?? `${topContract.address.slice(0, 8)}…`}</span>. </>}
              {topMethod && <>Most common action: <span className="text-bone">{topMethod.method}</span>.</>}
            </p>
          )}
        </div>
      </section>

      <section className="mt-14">
        <SectionTitle>Behavior signals</SectionTitle>
        <div className="mt-7">
          <SignalsPanel signals={a.signals} details={a.signalDetails} />
        </div>
      </section>

      <section className="mt-14">
        <SectionTitle>Recent activity</SectionTitle>
        <div className="mt-7">
          <Ledger activity={result.activity} />
        </div>
      </section>

      <section className="mt-14">
        <SectionTitle>Evidence</SectionTitle>
        <div className="mt-7">
          <EvidencePanel result={result} />
        </div>
      </section>

      <div className="mt-14 flex flex-col items-center gap-5 border-t border-line/70 pt-10 text-center">
        <p className="font-serif-i max-w-lg text-lg leading-relaxed text-mute">
          A verdict describes visible behavior. It is not a promise of safety or a claim about the
          person behind the wallet.
        </p>
        <button
          onClick={() => {
            onNewScan();
            window.scrollTo({ top: 0 });
          }}
          className="group flex items-center gap-2.5 rounded-full border border-amber/50 bg-amber/10 px-6 py-3 text-xs font-medium tracking-[0.14em] text-amber uppercase transition-colors hover:bg-amber hover:text-ink"
        >
          Scan another wallet
          <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </button>
      </div>
    </div>
  );
}