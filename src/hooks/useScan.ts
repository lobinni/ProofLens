import { useCallback, useRef, useState } from "react";
import type { ChainId } from "@/lib/chains";
import { runScan } from "@/lib/scan";
import type {
  AttestationInfo,
  AttestedReport,
  ChainScanInfo,
  ScanLogLine,
  ScanResult,
  ScanStage,
} from "@/lib/types";

export interface ScanState {
  stage: ScanStage;
  chains: Partial<Record<ChainId, ChainScanInfo>>;
  logs: ScanLogLine[];
  result: ScanResult | null;
  error: string | null;
}

const initialState: ScanState = {
  stage: "idle",
  chains: {},
  logs: [],
  result: null,
  error: null,
};

export function useScan() {
  const [state, setState] = useState<ScanState>(initialState);
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback((input: string, chains: ChainId[]) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setState({ stage: "resolving", chains: {}, logs: [], result: null, error: null });

    runScan(
      input,
      chains,
      {
        onStage: (stage) => setState((s) => ({ ...s, stage })),
        onChain: (info) =>
          setState((s) => ({ ...s, chains: { ...s.chains, [info.chain]: info } })),
        onLog: (line) =>
          setState((s) => ({ ...s, logs: [...s.logs.slice(-48), line] })),
      },
      ctrl.signal,
    )
      .then((result) => {
        // Report appears immediately. On-chain submission is user-opt-in via
        // their own GenLayer wallet — no backend key required in the core flow.
        setState((s) => ({ ...s, stage: "done", result }));
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        const message = err instanceof Error ? err.message : "Scan failed.";
        setState((s) => ({
          ...s,
          stage: "error",
          error: message,
          logs: [...s.logs, { at: Date.now(), text: message, tone: "err" }],
        }));
      });
  }, []);

  const setConsensus = useCallback((report: AttestedReport) => {
    setState((s) =>
      s.result ? { ...s, result: { ...s.result, consensus: report, attestError: null } } : s,
    );
  }, []);

  const setAttestation = useCallback((info: AttestationInfo) => {
    setState((s) =>
      s.result ? { ...s, result: { ...s.result, attestation: info, attestError: null } } : s,
    );
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setState(initialState);
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(initialState);
  }, []);

  return { state, start, cancel, reset, setConsensus, setAttestation };
}
