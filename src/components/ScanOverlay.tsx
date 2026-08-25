import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { Check, Loader2, X, AlertTriangle, Minus } from "lucide-react";
import { CHAIN_MAP } from "@/lib/chains";
import type { ScanState } from "@/hooks/useScan";
import type { ScanStage } from "@/lib/types";
import { fmtInt } from "@/lib/format";

const STAGES: { id: ScanStage; label: string; hint: string }[] = [
  { id: "resolving", label: "Find", hint: "locate the wallet" },
  { id: "collecting", label: "Read", hint: "gather public activity" },
  { id: "analyzing", label: "Understand", hint: "find patterns and routes" },
  { id: "committing", label: "Prepare", hint: "finish the evidence report" },
  { id: "attesting", label: "Review", hint: "ask independent validators" },
  { id: "consensus", label: "Agree", hint: "finalize the verdict" },
];

const ORDER: ScanStage[] = ["resolving", "collecting", "analyzing", "committing", "attesting", "consensus"];

function stageIndex(stage: ScanStage): number {
  const i = ORDER.indexOf(stage);
  return i === -1 ? (stage === "done" ? ORDER.length : 0) : i;
}

const toneColor: Record<string, string> = {
  info: "text-mute",
  ok: "text-mint",
  warn: "text-amber",
  err: "text-risk",
};

export function ScanOverlay({ state, onCancel }: { state: ScanState; onCancel: () => void }) {
  const logRef = useRef<HTMLDivElement>(null);
  const active = stageIndex(state.stage);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.logs]);

  const chains = Object.values(state.chains);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.35 } }}
      className="fixed inset-0 z-[70] overflow-y-auto bg-ink/95 backdrop-blur-md"
    >
      <div className="scanline" />
      <div className="mx-auto flex min-h-full max-w-6xl flex-col px-5 py-24 md:px-8">
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mono-label text-center text-amber"
        >
          Interrogating the record
        </motion.p>

        {/* stage rail */}
        <div className="mx-auto mt-10 flex w-full max-w-3xl items-start">
          {STAGES.map((s, i) => {
            const done = i < active || state.stage === "done";
            const current = i === active && state.stage !== "done";
            return (
              <div key={s.id} className="flex flex-1 flex-col items-center">
                <div className="flex w-full items-center">
                  <span className={`h-px flex-1 ${i === 0 ? "opacity-0" : done || current ? "bg-amber/70" : "bg-line-2"}`} />
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors duration-500 ${
                      done
                        ? "border-amber bg-amber text-ink"
                        : current
                          ? "pulse-ring border-amber text-amber"
                          : "border-line-2 text-dim"
                    }`}
                  >
                    {done ? <Check className="h-4 w-4" strokeWidth={3} /> : current ? <Loader2 className="h-4 w-4 animate-spin" /> : <Minus className="h-4 w-4" />}
                  </span>
                  <span className={`h-px flex-1 ${i === STAGES.length - 1 ? "opacity-0" : done ? "bg-amber/70" : "bg-line-2"}`} />
                </div>
                <p className={`mono-label mt-3 ${current ? "text-amber" : done ? "text-bone" : "text-dim"}`}>{s.label}</p>
                <p className="mt-1 hidden font-mono text-[10px] text-dim sm:block">{s.hint}</p>
              </div>
            );
          })}
        </div>

        {/* chain cards */}
        <div className="mt-12 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {chains.map((info) => {
            const id = info.chain;
            const cfg = CHAIN_MAP[id];
            const status = info.status;
            return (
              <motion.div
                key={id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-lg border p-3.5 transition-colors duration-500 ${
                  status === "scanning"
                    ? "border-amber/50 bg-amber/[0.06]"
                    : status === "done"
                      ? "border-line-2 bg-ink-2"
                      : status === "error"
                        ? "border-risk/40 bg-risk/[0.05]"
                        : "border-line/70 bg-ink-2/40"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 font-mono text-[11px] font-medium tracking-wider">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: cfg.color }} />
                    {cfg.short}
                  </span>
                  {status === "scanning" && <Loader2 className="h-3.5 w-3.5 animate-spin text-amber" />}
                  {status === "done" && <Check className="h-3.5 w-3.5 text-mint" />}
                  {status === "empty" && <Minus className="h-3.5 w-3.5 text-dim" />}
                  {status === "error" && <AlertTriangle className="h-3.5 w-3.5 text-risk" />}
                </div>
                <p className="mt-2.5 font-mono text-xs text-mute">
                  {info ? (
                    status === "error" ? (
                      <span className="text-risk">failed</span>
                    ) : (
                      <>
                        {fmtInt(info.collectedTx)} tx
                        <span className="text-dim"> · </span>
                        {fmtInt(info.collectedTransfers)} tr
                      </>
                    )
                  ) : (
                    <span className="text-dim">waiting</span>
                  )}
                </p>
                {info?.counters ? (
                  <p className="mt-1 font-mono text-[10px] text-dim">counters {fmtInt(info.counters.transactions)}</p>
                ) : null}
              </motion.div>
            );
          })}
        </div>

        {chains.length > 0 && (
          <div
            ref={logRef}
            className="mt-8 h-40 overflow-y-auto rounded-lg border border-line bg-ink-2/70 p-4 font-mono text-[11px] leading-relaxed no-scrollbar"
          >
            {state.logs.map((l, i) => (
              <p key={i} className={toneColor[l.tone]}>
                <span className="mr-2 text-dim">{new Date(l.at).toLocaleTimeString("en-US", { hour12: false })}</span>
                {l.text}
              </p>
            ))}
            <p className="text-amber blink">▮</p>
          </div>
        )}

        {state.stage === "error" && (
          <p className="mt-6 text-center font-mono text-xs text-risk">{state.error}</p>
        )}

        <button
          onClick={onCancel}
          className="mx-auto mt-10 flex items-center gap-2 rounded-full border border-line px-5 py-2.5 font-mono text-xs tracking-widest text-mute uppercase transition-colors hover:border-line-2 hover:text-bone"
        >
          <X className="h-3.5 w-3.5" />
          Abort scan
        </button>
      </div>
    </motion.div>
  );
}
