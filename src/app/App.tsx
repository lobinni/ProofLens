import { useCallback, useEffect, useState } from "react";
import { AnimatePresence } from "motion/react";
import { Plus } from "lucide-react";
import { useScan } from "@/hooks/useScan";
import { addHistoryEntry } from "@/lib/persistence";
import { commitEvidence, requestAttestation } from "@/lib/relayer";
import { Footer, Header } from "@/components/Chrome";
import { Landing } from "@/components/Landing";
import { ScanOverlay } from "@/components/ScanOverlay";
import { Report } from "@/components/Report";

/** Guard against StrictMode double-effects when archiving scan history. */
const archivedScanIds = new Set<string>();

export default function App() {
  const { state, start, cancel, reset, setConsensus, setAttestation } = useScan();
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const busy = state.stage !== "idle" && state.stage !== "done";
  const showReport = state.stage === "done" && state.result !== null;

  /** Re-run the relayer pipeline for an already-sealed scan (after env fix). */
  const retryAttestation = useCallback(async () => {
    const r = state.result;
    if (!r || retrying) return;
    setRetrying(true);
    setRetryError(null);
    try {
      const commit = await commitEvidence({ scanId: r.scanId, canonical: r.canonicalEvidence });
      const attest = await requestAttestation(r.scanId);
      setAttestation({
        evidenceUrl: attest.evidenceUrl || commit.evidenceUrl,
        evidenceHash: commit.sha256,
        transactionHash: attest.transactionHash,
        contractAddress: attest.contractAddress,
      });
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : "attestation retry failed");
    } finally {
      setRetrying(false);
    }
  }, [state.result, retrying, setAttestation]);

  // Archive scans once the consensus verdict has actually landed.
  useEffect(() => {
    const r = state.result;
    if (!r?.consensus) return;
    if (archivedScanIds.has(r.scanId)) return;
    archivedScanIds.add(r.scanId);
    addHistoryEntry({
      scanId: r.scanId,
      wallet: r.address,
      ensName: r.ensName,
      chainsRequested: r.chains.map((c) => c.chain),
      verdictModel: "genlayer-consensus",
      classification: r.consensus.verdict.classification,
      riskScore: r.consensus.verdict.risk_score,
      confidence: r.consensus.verdict.confidence,
      evidenceHash: r.evidenceHash,
      observedTx: r.analytics.counts.observedTx,
      createdAt: r.finishedAt,
    });
  }, [state.result]);

  return (
    <div className="grain relative min-h-screen">
      <Header
        onHome={() => {
          reset();
          window.scrollTo({ top: 0 });
        }}
        right={
          showReport ? (
            <button
              onClick={() => {
                reset();
                window.scrollTo({ top: 0 });
              }}
              className="flex h-9 items-center gap-2 rounded-md border border-line px-3.5 font-mono text-[11px] tracking-wider text-mute uppercase transition-colors hover:border-amber/50 hover:text-amber"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">New scan</span>
            </button>
          ) : undefined
        }
      />

      <main className={busy ? "pointer-events-none select-none" : ""}>
        {showReport ? (
          <Report
            result={state.result!}
            onNewScan={reset}
            onConsensus={setConsensus}
            onRetryAttest={retryAttestation}
            retryingAttest={retrying}
            retryAttestError={retryError}
          />
        ) : (
          <Landing
            onScan={(input, chains) => {
              window.scrollTo({ top: 0 });
              start(input, chains);
            }}
          />
        )}
      </main>

      <Footer />

      <AnimatePresence>
        {busy && <ScanOverlay key="scan" state={state} onCancel={cancel} />}
      </AnimatePresence>
    </div>
  );
}
