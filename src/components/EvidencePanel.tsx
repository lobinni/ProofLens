import { useState } from "react";
import { Check, Copy, Download, ExternalLink, FileLock2, ShieldCheck } from "lucide-react";
import { CHAIN_MAP } from "@/lib/chains";
import { GENLAYER } from "@/lib/config";
import { contractExplorerUrl, isAttestable, studionetTxUrl } from "@/lib/genlayer";
import type { ScanResult } from "@/lib/types";
import { shortAddress } from "@/lib/format";

export function EvidencePanel({ result }: { result: ScanResult }) {
  const [copied, setCopied] = useState(false);
  const verification = result.evidence.verification;
  const attestable = isAttestable(result.evidence, result.evidenceHash);
  const contract = GENLAYER.deployment.address;

  const copyHash = async () => {
    try {
      await navigator.clipboard.writeText(result.evidenceHash);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
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

  const state = result.consensus
    ? { label: "Verified and recorded", tone: "text-mint border-mint/40 bg-mint/10" }
    : result.attestation
      ? { label: "Under independent review", tone: "text-amber border-amber/40 bg-amber/10" }
      : attestable
        ? { label: "Ready for review", tone: "text-violet border-violet/40 bg-violet/10" }
        : { label: "Limited evidence", tone: "text-dim border-line-2 bg-ink-3" };

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-ink-2/50">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 px-6 py-4">
        <div className="flex items-center gap-2.5">
          <FileLock2 className="h-4 w-4 text-amber" strokeWidth={1.8} />
          <p className="mono-label text-mute">Evidence record</p>
        </div>
        <span
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium ${state.tone}`}
        >
          <ShieldCheck className="h-3 w-3" />
          {state.label}
        </span>
      </div>

      <div className="p-6 md:p-7">
        <p className="text-sm leading-relaxed text-mute">
          This seal identifies the exact report reviewed for this wallet. The source transactions
          below open in their original network explorers.
        </p>

        <div className="mt-5 flex items-center gap-3 rounded-lg border border-line bg-ink px-4 py-3">
          <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-amber">
            {result.evidenceHash}
          </p>
          <button
            onClick={copyHash}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line text-mute transition-colors hover:text-bone"
            aria-label="Copy evidence seal"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-mint" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-4 border-y border-line/60 py-5 text-center">
          <div>
            <p className="text-xl font-semibold text-bone">{verification.sourceRefs.length}</p>
            <p className="mt-1 text-[10px] text-dim">networks checked</p>
          </div>
          <div>
            <p className="text-xl font-semibold text-bone">{verification.transactionProofs.length}</p>
            <p className="mt-1 text-[10px] text-dim">source transactions</p>
          </div>
          <div>
            <p className="text-xl font-semibold text-bone">{verification.metrics.sampledFailed}</p>
            <p className="mt-1 text-[10px] text-dim">failed in sample</p>
          </div>
        </div>

        {verification.transactionProofs.length > 0 && (
          <div className="mt-6">
            <p className="mono-label text-dim">Receipts</p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {verification.transactionProofs.slice(0, 6).map((proof) => (
                <li key={`${proof.chainId}:${proof.hash}`}>
                  <a
                    href={`${CHAIN_MAP[proof.chainId].host}/tx/${proof.hash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex items-center justify-between gap-3 rounded-lg border border-line/70 px-3.5 py-2.5 transition-colors hover:border-amber/40"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: CHAIN_MAP[proof.chainId].color }}
                      />
                      <span className="truncate font-mono text-[11px] text-mute group-hover:text-bone">
                        {shortAddress(proof.hash, 7)}
                      </span>
                    </span>
                    <ExternalLink className="h-3 w-3 shrink-0 text-dim group-hover:text-amber" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            onClick={download}
            className="flex items-center gap-2 rounded-md border border-line px-3.5 py-2 text-xs text-mute transition-colors hover:border-line-2 hover:text-bone"
          >
            <Download className="h-3.5 w-3.5" />
            Download full evidence
          </button>
          {result.attestation && (
            <a
              href={studionetTxUrl(result.attestation.transactionHash)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-md border border-line px-3.5 py-2 text-xs text-mute transition-colors hover:border-amber/40 hover:text-amber"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View review record
            </a>
          )}
          {contract && (
            <a
              href={contractExplorerUrl(contract)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-md border border-line px-3.5 py-2 text-xs text-mute transition-colors hover:border-mint/40 hover:text-mint"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View verifier
            </a>
          )}
        </div>
      </div>
    </div>
  );
}