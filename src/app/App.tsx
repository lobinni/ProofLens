import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { Plus } from "lucide-react";
import { useScan } from "@/hooks/useScan";
import { useGenLayerWallet } from "@/hooks/useGenLayerWallet";
import { submitAnalysisFromWallet } from "@/lib/genlayer-wallet";
import { addHistoryEntry } from "@/lib/persistence";
import { deployedContractAddress } from "@/lib/genlayer";
import { Footer, Header } from "@/components/Chrome";
import { Landing } from "@/components/Landing";
import { ScanOverlay } from "@/components/ScanOverlay";
import { Report } from "@/components/Report";

/** Guard against StrictMode double-effects when archiving scan history. */
const archivedScanIds = new Set<string>();

export default function App() {
  const { state, start, cancel, reset, setConsensus, setAttestation } = useScan();
  const wallet = useGenLayerWallet();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submitLock = useRef(false);

  const busy = state.stage !== "idle" && state.stage !== "done";
  const showReport = state.stage === "done" && state.result !== null;

  /**
   * USER-signed on-chain submission via the GenLayer Snap. The user connects
   * their own wallet once, then signs analyze_wallet() themselves — the user
   * pays their own gas, so no server signing secret exists anywhere.
   *
   * This is the PRIMARY, GenLayer-native path: fully client-side.
   */
  const submitWithWallet = useCallback(async () => {
    const r = state.result;
    if (!r || submitting || submitLock.current) return;
    submitLock.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      // connect() returns the connection immediately. Do NOT read wallet.client
      // after await: that value belongs to the previous React render and is
      // still null until the hook state update commits.
      const conn = wallet.client ?? (await wallet.connect());
      if (!conn) {
        throw new Error(wallet.error ?? "Connect a GenLayer wallet to sign the verdict.");
      }
      const transactionHash = await submitAnalysisFromWallet(conn, {
        scanId: r.scanId,
        wallet: r.address,
        evidenceJson: r.canonicalEvidence,
        evidenceHash: r.evidenceHash,
      });
      setAttestation({
        evidenceHash: r.evidenceHash,
        transactionHash,
        contractAddress: deployedContractAddress(),
      });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }, [state.result, submitting, wallet, setAttestation]);

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
        wallet={wallet}
      />

      <main className={busy ? "pointer-events-none select-none" : ""}>
        {showReport ? (
          <Report
            result={state.result!}
            onNewScan={reset}
            onConsensus={setConsensus}
            wallet={wallet}
            onSubmitWithWallet={submitWithWallet}
            submittingWithWallet={submitting}
            submitError={submitError ?? wallet.error}
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
