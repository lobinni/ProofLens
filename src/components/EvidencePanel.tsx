import { useState } from "react";
import { motion } from "motion/react";
import { Check, Copy, Download, FileLock2, Link2, ListChecks, ExternalLink, ShieldCheck } from "lucide-react";
import { CHAIN_MAP } from "@/lib/chains";
import { GENLAYER } from "@/lib/config";
import { contractExplorerUrl, isAttestable } from "@/lib/genlayer";
import type { ScanResult } from "@/lib/types";
import { shortAddress } from "@/lib/format";

const VALIDATOR_STEPS = [
  "Fetch the evidence body and recompute its SHA-256 against the commitment",
  "Reject mismatched wallet, scan id, or evidence schema",
  "Re-fetch live chain counters from every committed Blockscout source",
  "Re-fetch every bounded transaction proof and canonicalize it identically",
  "Reject proofs whose parties, value, status, method or flags differ",
  "Recompute direction, failure, contract-call and time-range metrics",
  "Let the model judge only validator-verified inputs",
  "Agree on classification family, risk ±15, confidence ±25, factor overlap",
];

export function EvidencePanel({ result }: { result: ScanResult }) {
  const [copied, setCopied] = useState<string | null>(null);
  const e = result.evidence;
  const v = e.verification;
  const attestable = isAttestable(e, result.evidenceHash);
  const deployment = GENLAYER.deployment;

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  const download = () => {
    const blob = new Blob([result.canonicalEvidence], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `prooflens-evidence-${result.scanId}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-ink-2/50">
      <div className="flex items-center justify-between border-b border-line/70 px-6 py-4">
        <div className="flex items-center gap-2.5">
          <FileLock2 className="h-4 w-4 text-amber" strokeWidth={1.8} />
          <p className="mono-label text-mute">Evidence & proofs</p>
        </div>
        <p className="font-mono text-[10px] text-dim">
          {e.schemaVersion} · verification {v.schemaVersion} · {e.mode}
        </p>
      </div>

      <div className="grid gap-px bg-line lg:grid-cols-[1.2fr_1fr]">
        {/* commitment */}
        <div className="bg-ink p-6 md:p-7">
          <div className="flex items-center justify-between gap-3">
            <p className="mono-label text-dim">SHA-256 evidence commitment</p>
            <span
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[9px] tracking-wider uppercase ${
                result.consensus
                  ? "border-mint/40 bg-mint/10 text-mint"
                  : result.attestation
                    ? "border-amber/40 bg-amber/10 text-amber"
                    : attestable
                      ? "border-violet/40 bg-violet/10 text-violet"
                      : "border-line-2 bg-ink-3 text-dim"
              }`}
            >
              <ShieldCheck className="h-3 w-3" />
              {result.consensus
                ? "consensus stored on-chain"
                : result.attestation
                  ? "attested · finalizing"
                  : attestable
                    ? "sealed · awaiting attestation"
                    : "below attestation floor"}
            </span>
          </div>
          <div className="mt-3 rounded-lg border border-amber/30 bg-amber/[0.04] p-4">
            <p className="font-mono text-[11.5px] leading-relaxed break-all text-amber">
              {result.evidenceHash}
            </p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => copy("hash", result.evidenceHash)}
              className="flex items-center gap-2 rounded-md border border-line px-3.5 py-2 font-mono text-[11px] text-mute transition-colors hover:border-line-2 hover:text-bone"
            >
              {copied === "hash" ? <Check className="h-3.5 w-3.5 text-mint" /> : <Copy className="h-3.5 w-3.5" />}
              {copied === "hash" ? "copied" : "copy hash"}
            </button>
            <button
              onClick={download}
              className="flex items-center gap-2 rounded-md border border-line px-3.5 py-2 font-mono text-[11px] text-mute transition-colors hover:border-line-2 hover:text-bone"
            >
              <Download className="h-3.5 w-3.5" />
              download canonical bundle
            </button>
            <button
              onClick={() => copy("bundle", result.canonicalEvidence)}
              className="flex items-center gap-2 rounded-md border border-line px-3.5 py-2 font-mono text-[11px] text-mute transition-colors hover:border-line-2 hover:text-bone"
            >
              {copied === "bundle" ? <Check className="h-3.5 w-3.5 text-mint" /> : <Copy className="h-3.5 w-3.5" />}
              copy canonical json
            </button>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line/60 pt-5 sm:grid-cols-3">
            {[
              ["scan id", result.scanId],
              ["proofs", `${v.transactionProofs.length} / 16`],
              ["counter sources", `${v.sourceRefs.length} / 6`],
              ["sampled outbound", String(v.metrics.sampledOutbound)],
              ["sampled failed", String(v.metrics.sampledFailed)],
              ["chains in sample", String(v.metrics.sampledChains)],
            ].map(([k, val]) => (
              <div key={k}>
                <p className="mono-label text-[9px] text-dim">{k}</p>
                <p className="mt-1 font-mono text-xs text-bone">{val}</p>
              </div>
            ))}
          </div>

          {/* proofs */}
          <p className="mono-label mt-7 text-dim">Bounded transaction proofs</p>
          <ul className="mt-3 divide-y divide-line/50 rounded-lg border border-line/70">
            {v.transactionProofs.slice(0, 8).map((p) => (
              <li key={`${p.chainId}:${p.hash}`} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: CHAIN_MAP[p.chainId].color }}
                  />
                  <a
                    href={`${CHAIN_MAP[p.chainId].host}/tx/${p.hash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate font-mono text-[11px] text-bone hover:text-amber"
                  >
                    {shortAddress(p.hash, 8)}
                  </a>
                  {p.method && (
                    <span className="hidden font-mono text-[9.5px] text-dim sm:inline">{p.method}()</span>
                  )}
                </div>
                <p className="shrink-0 font-mono text-[10px] text-dim">
                  {p.status && /error|failure|reverted/i.test(p.status) ? (
                    <span className="text-risk">reverted</span>
                  ) : (
                    `block ${p.blockNumber !== null ? p.blockNumber.toLocaleString() : "—"}`
                  )}
                </p>
              </li>
            ))}
            {v.transactionProofs.length > 8 && (
              <li className="px-4 py-2.5 text-center font-mono text-[10px] text-dim">
                + {v.transactionProofs.length - 8} more inside the canonical bundle
              </li>
            )}
            {v.transactionProofs.length === 0 && (
              <li className="px-4 py-6 text-center font-mono text-[10px] text-dim">
                no proofs — no chain returned counters this scan
              </li>
            )}
          </ul>

          {/* verification metrics */}
          <p className="mono-label mt-6 text-dim">Validator-recomputed metrics (committed)</p>
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border border-line/70 p-4 font-mono text-[10.5px] sm:grid-cols-3">
            {(
              [
                ["transactions", v.metrics.sampledTransactions],
                ["inbound", v.metrics.sampledInbound],
                ["self", v.metrics.sampledSelf],
                ["contract calls", v.metrics.sampledContractCalls],
                ["creations", v.metrics.sampledContractCreations],
                ["chains", v.metrics.sampledChains],
              ] as [string, number][]
            ).map(([k, val]) => (
              <p key={k} className="flex items-baseline justify-between gap-2 text-mute">
                <span className="text-dim">{k}</span>
                <span className="text-bone">{val}</span>
              </p>
            ))}
          </div>
        </div>

        {/* verification recipe + sources */}
        <div className="bg-ink p-6 md:p-7">
          <div className="flex items-center gap-2.5">
            <ListChecks className="h-4 w-4 text-mint" strokeWidth={1.8} />
            <p className="mono-label text-dim">How StudioNet validators re-verify this</p>
          </div>
          <ol className="mt-4 space-y-2.5">
            {VALIDATOR_STEPS.map((step, i) => (
              <motion.li
                key={step}
                initial={{ opacity: 0, x: 8 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className="flex gap-3 text-[12px] leading-relaxed text-mute"
              >
                <span className="font-mono text-[10px] text-dim">{String(i + 1).padStart(2, "0")}</span>
                {step}
              </motion.li>
            ))}
          </ol>

          <div className="mt-7 border-t border-line/60 pt-5">
            <div className="flex items-center gap-2.5">
              <Link2 className="h-4 w-4 text-dim" strokeWidth={1.8} />
              <p className="mono-label text-dim">Committed Blockscout sources</p>
            </div>
            <ul className="mt-3 space-y-2">
              {v.sourceRefs.map((s) => (
                <li key={s.chainId} className="flex items-center gap-2.5 font-mono text-[10.5px]">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: CHAIN_MAP[s.chainId].color }}
                  />
                  <span className="w-14 shrink-0 text-dim">{CHAIN_MAP[s.chainId].short}</span>
                  <a href={s.countersUrl} target="_blank" rel="noreferrer" className="truncate text-mute hover:text-amber">
                    {s.countersUrl.replace("https://", "")}
                  </a>
                </li>
              ))}
              {v.sourceRefs.length === 0 && (
                <li className="font-mono text-[10.5px] text-dim">none committed</li>
              )}
            </ul>

            {deployment.state === "active" && deployment.address && (
              <div className="mt-5 rounded-lg border border-mint/25 bg-mint/[0.05] p-4">
                <p className="mono-label text-[9px] text-mint">Attestation contract · live</p>
                <a
                  href={contractExplorerUrl(deployment.address)}
                  target="_blank"
                  rel="noreferrer"
                  className="group mt-2 flex items-center gap-1.5 font-mono text-[11px] break-all text-bone hover:text-mint"
                >
                  {deployment.address}
                  <ExternalLink className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                </a>
                {result.attestation && (
                  <p className="mt-2 font-mono text-[10px] leading-relaxed text-amber">
                    this scan's tx · {result.attestation.transactionHash}
                  </p>
                )}
                <p className="mt-2 font-mono text-[9.5px] leading-relaxed text-dim">
                  genlayer studionet · attest_wallet() · owner-gated relayer · reports readable via
                  get_report / get_latest_report_id
                </p>
              </div>
            )}

            <p className="mt-5 font-mono text-[10px] leading-relaxed text-dim">
              Validators fetched this exact bundle from /api/evidence/{result.scanId}, hashed it
              against the commitment, replayed every proof against Blockscout, and recomputed the
              metrics before the model was allowed to speak.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
