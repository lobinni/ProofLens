import { useEffect, useState } from "react";
import { ExternalLink, Landmark } from "lucide-react";
import {
  contractExplorerUrl,
  deployedContractAddress,
  inspectBrowserContract,
  readOnChainReportCount,
} from "@/lib/genlayer";

/**
 * Live on-chain state, read DIRECTLY from the ProofLensIntelligence
 * Intelligent Contract by this page — the browser queries StudioNet itself
 * (get_report_count / get_latest_report_id), no server in the middle.
 */
export function OnChainStats() {
  const [count, setCount] = useState<number | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const address = deployedContractAddress();

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [inspection, n] = await Promise.all([
        inspectBrowserContract(),
        readOnChainReportCount(),
      ]);
      if (alive) {
        setConnected(inspection.reachable && inspection.compatible);
        setCount(n);
      }
    };
    void load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <a
      href={contractExplorerUrl(address)}
      target="_blank"
      rel="noreferrer"
      className="group inline-flex items-center gap-3 rounded-lg border border-line/70 bg-ink-2/60 px-4 py-2.5 transition-colors hover:border-mint/40"
    >
      <Landmark className="h-4 w-4 text-mint" strokeWidth={1.8} />
      <span className="text-xs text-mute">
        {connected === false ? (
          <span className="text-amber">GenLayer verifier is not responding</span>
        ) : count === null ? (
          <span className="text-dim">Checking live GenLayer records…</span>
        ) : (
          <>
            <span className="font-semibold text-bone">{count.toLocaleString()}</span> verified{" "}
            {count === 1 ? "report" : "reports"} recorded on GenLayer
          </>
        )}
      </span>
      <ExternalLink className="h-3 w-3 text-dim transition-colors group-hover:text-mint" />
    </a>
  );
}
