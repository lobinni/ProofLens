import { motion } from "motion/react";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  Copy,
  Check,
  Timer,
  Waves,
} from "lucide-react";
import { useState } from "react";
import { useEffect } from "react";
import { CHAIN_MAP } from "@/lib/chains";
import { fetchConsensusReport } from "@/lib/relayer";
import type { AttestedReport, ScanResult } from "@/lib/types";
import {
  fmtCompact,
  fmtDate,
  fmtDurationDays,
  fmtGapMinutes,
  fmtInt,
  fmtPct,
  fmtUsd,
} from "@/lib/format";
import { Reveal } from "./Chrome";
import { VerdictPanel } from "./VerdictPanel";
import { HourDial, MonthArea, WeekdayBars } from "./Charts";
import { SignalsPanel } from "./SignalsPanel";
import { TxMap } from "./TxMap";
import { Contracts, Counterparties, Holdings, MethodsAndAssets } from "./Groups";
import { Ledger } from "./Ledger";
import { EvidencePanel } from "./EvidencePanel";

function Kpi({ label, value, sub, i }: { label: string; value: string; sub: string; i: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ delay: i * 0.04, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      className="border-l border-line/80 pl-4"
    >
      <p className="mono-label text-[9px] text-dim">{label}</p>
      <p className="mt-2 truncate text-xl font-semibold tracking-tight text-bone md:text-[22px]">{value}</p>
      <p className="mt-1 truncate font-mono text-[10px] text-dim">{sub}</p>
    </motion.div>
  );
}

function SectionLabel({ index, title }: { index: string; title: string }) {
  return (
    <div className="flex items-baseline gap-4">
      <span className="font-serif-i text-2xl text-dim">{index}</span>
      <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h2>
      <span className="rule-dash flex-1" />
    </div>
  );
}

export function Report({
  result,
  onNewScan,
  onConsensus,
  onRetryAttest,
  retryingAttest,
  retryAttestError,
}: {
  result: ScanResult;
  onNewScan: () => void;
  onConsensus: (report: AttestedReport) => void;
  onRetryAttest: () => Promise<void>;
  retryingAttest: boolean;
  retryAttestError: string | null;
}) {
  const a = result.analytics;
  const c = a.counts;
  const errChains = result.chains.filter((ch) => ch.status === "error");
  const scanSeconds = Math.max(1, Math.round((result.finishedAt - result.startedAt) / 1000));
  const [copied, setCopied] = useState(false);

  // Keep polling while StudioNet consensus finalizes — the verdict panel
  // swaps from "validators are arguing" to the stored report on its own.
  useEffect(() => {
    if (result.consensus || !result.attestation) return;
    let stopped = false;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;
      fetchConsensusReport(result.scanId)
        .then((report) => {
          if (report && !stopped) {
            stopped = true;
            clearInterval(timer);
            onConsensus(report);
          }
        })
        .catch(() => undefined);
      if (attempts >= 18) clearInterval(timer);
    }, 15_000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [result, onConsensus]);

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(result.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* noop */
    }
  };

  const kpis: { label: string; value: string; sub: string }[] = [
    {
      label: "Wallet age",
      value: a.window.ageDays > 0 ? fmtDurationDays(a.window.ageDays) : "—",
      sub: a.window.firstAt ? `first seen ${fmtDate(a.window.firstAt)}` : "no activity",
    },
    {
      label: "Total transactions",
      value: fmtCompact(c.authoritativeTx),
      sub: `${fmtInt(c.observedTx)} sampled directly`,
    },
    {
      label: "Active days",
      value: fmtInt(a.window.activeDays),
      sub: `${a.timing.txsPerActiveDay.toFixed(1)} tx per active day`,
    },
    {
      label: "Median gap",
      value: fmtGapMinutes(a.timing.medianGapMinutes),
      sub: `mean ${fmtGapMinutes(a.timing.meanGapMinutes)} between txs`,
    },
    {
      label: "Outbound",
      value: fmtInt(c.sends + c.contractCalls + c.approvals + c.swaps + c.bridges),
      sub: `${c.sends} sends · ${c.contractCalls} calls`,
    },
    {
      label: "Inbound",
      value: fmtInt(c.receives),
      sub: `${c.tokenIn} token · ${c.nftTransfers} nft moves`,
    },
    {
      label: "Swaps / approvals",
      value: `${fmtInt(c.swaps)} / ${fmtInt(c.approvals)}`,
      sub: `${c.bridges} bridge actions · ${c.contractCreations} deploys`,
    },
    {
      label: "Failed",
      value: fmtInt(c.failed),
      sub: `${fmtPct(a.derived.failRate, 1)} of outbound attempts`,
    },
    {
      label: "Largest send",
      value: a.volume.largestSend
        ? a.volume.largestSend.usd !== null
          ? fmtUsd(a.volume.largestSend.usd, { compact: true })
          : `${a.volume.largestSend.native.toFixed(4)} ${a.volume.largestSend.nativeSymbol}`
        : "—",
      sub: a.volume.largestSend ? fmtDate(a.volume.largestSend.at) : "no outbound value",
    },
    {
      label: "Largest receive",
      value: a.volume.largestReceive
        ? a.volume.largestReceive.usd !== null
          ? fmtUsd(a.volume.largestReceive.usd, { compact: true })
          : `${a.volume.largestReceive.native.toFixed(4)} ${a.volume.largestReceive.nativeSymbol}`
        : "—",
      sub: a.volume.largestReceive ? fmtDate(a.volume.largestReceive.at) : "no inbound value",
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-5 pt-28 pb-24 md:px-8">
      {/* ------------------------------ header ------------------------------ */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}>
        <div className="flex flex-wrap items-center gap-3">
          <p className="mono-label text-amber">Evidence report</p>
          <span className="font-mono text-[10px] text-dim">
            {result.scanId} · {scanSeconds}s scan · {result.chains.filter((x) => x.status === "done" || x.status === "empty").length}/{result.chains.length} chains
          </span>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
          <h1 className="font-mono text-xl font-medium tracking-tight text-bone break-all sm:text-2xl md:text-[32px]">
            {result.address}
          </h1>
          <button
            onClick={copyAddress}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line text-mute transition-colors hover:text-bone"
            aria-label="Copy address"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-mint" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11px] text-mute">
          {result.ensName && <span className="text-amber">{result.ensName}</span>}
          <span className="flex items-center gap-1.5">
            <Timer className="h-3.5 w-3.5 text-dim" />
            {result.chains.map((ch) => (
              <span
                key={ch.chain}
                className="mx-0.5 inline-block h-2 w-2 rounded-full"
                style={{ background: CHAIN_MAP[ch.chain].color, opacity: ch.status === "error" ? 0.25 : 1 }}
                title={`${CHAIN_MAP[ch.chain].name}: ${ch.status}`}
              />
            ))}
          </span>
          {(a.volume.usdInKnown + a.volume.usdOutKnown) > 0 && (
            <span className="flex items-center gap-1.5">
              <Waves className="h-3.5 w-3.5 text-dim" />
              priced volume {fmtUsd(a.volume.usdOutKnown, { compact: true })} out · {fmtUsd(a.volume.usdInKnown, { compact: true })} in
            </span>
          )}
          {a.volume.feesUsd > 0 && (
            <span className="flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5 text-dim" />
              gas burned ≈ {fmtUsd(a.volume.feesUsd)}
            </span>
          )}
        </div>

        {errChains.length > 0 && (
          <div className="mt-5 flex items-start gap-3 rounded-lg border border-amber/30 bg-amber/[0.05] p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
            <p className="font-mono text-[11px] leading-relaxed text-amber">
              Coverage note — failed to collect: {errChains.map((x) => CHAIN_MAP[x.chain].name).join(", ")}.
              Those chains stay visible here instead of being silently dropped; the verdict treats them as unknown.
            </p>
          </div>
        )}
      </motion.div>

      {/* ------------------------------ verdict ------------------------------ */}
      <div className="mt-12">
        <VerdictPanel
          consensus={result.consensus}
          attestation={result.attestation}
          attestError={retryAttestError ?? result.attestError}
          onRetryAttest={onRetryAttest}
          retryingAttest={retryingAttest}
        />
      </div>

      {/* ------------------------------ kpis ------------------------------ */}
      <div className="mt-14">
        <SectionLabel index="i." title="The ledger, at a glance" />
        <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
          {kpis.map((k, i) => (
            <Kpi key={k.label} {...k} i={i} />
          ))}
        </div>
      </div>

      {/* ------------------------------ cadence ------------------------------ */}
      <div className="mt-16">
        <SectionLabel index="ii." title="Cadence" />
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Reveal><HourDial data={a.timing.hourHistogram} /></Reveal>
          <Reveal delay={0.08}><WeekdayBars data={a.timing.weekdayHistogram} /></Reveal>
          <Reveal delay={0.16} className="md:col-span-2 lg:col-span-1"><MonthArea data={a.timing.monthHistogram} /></Reveal>
        </div>
      </div>

      {/* ------------------------------ signals ------------------------------ */}
      <div className="mt-16">
        <SectionLabel index="iii." title="Signals" />
        <div className="mt-8">
          <Reveal><SignalsPanel signals={a.signals} details={a.signalDetails} /></Reveal>
        </div>
      </div>

      {/* ------------------------------ graph & routes ------------------------------ */}
      <div className="mt-16">
        <SectionLabel index="iv." title="Graph & routes" />
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <Reveal><TxMap analytics={a} wallet={result.address} /></Reveal>
          <Reveal delay={0.08}><Counterparties analytics={a} /></Reveal>
          <Reveal><Contracts analytics={a} /></Reveal>
          <Reveal delay={0.08}><MethodsAndAssets analytics={a} /></Reveal>
        </div>
      </div>

      {/* ------------------------------ holdings ------------------------------ */}
      <div className="mt-16">
        <SectionLabel index="v." title="Holdings & ledger" />
        <div className="mt-8 space-y-4">
          <Reveal><Holdings analytics={a} /></Reveal>
          <Reveal delay={0.06}><Ledger activity={result.activity} /></Reveal>
        </div>
      </div>

      {/* ------------------------------ evidence ------------------------------ */}
      <div className="mt-16">
        <SectionLabel index="vi." title="Evidence" />
        <div className="mt-8">
          <Reveal><EvidencePanel result={result} /></Reveal>
        </div>
      </div>

      {/* ------------------------------ footer note ------------------------------ */}
      <div className="mt-16 flex flex-col items-center gap-6 border-t border-line/70 pt-12 text-center">
        <p className="font-serif-i max-w-xl text-xl leading-relaxed text-mute">
          "Ordinary and low risk are not safety guarantees. When history is thin, the right verdict
          is inconclusive."
        </p>
        <button
          onClick={() => {
            onNewScan();
            window.scrollTo({ top: 0 });
          }}
          className="group flex items-center gap-2.5 rounded-full border border-amber/50 bg-amber/10 px-6 py-3 font-mono text-xs tracking-[0.18em] text-amber uppercase transition-colors hover:bg-amber hover:text-ink"
        >
          Interrogate another wallet
          <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </button>
      </div>
    </div>
  );
}
