import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { ArrowDownLeft, ArrowUpRight, Boxes, ExternalLink, ListFilter, XCircle } from "lucide-react";
import { CHAIN_MAP } from "@/lib/chains";
import type { ActivityCategory, NormalizedActivity } from "@/lib/types";
import { fmtNative, fmtUsd, relTime, shortAddress } from "@/lib/format";

type Filter = "all" | "out" | "in" | "contracts" | "failed";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "out", label: "Outbound" },
  { id: "in", label: "Inbound" },
  { id: "contracts", label: "Contract calls" },
  { id: "failed", label: "Failed" },
];

const CATEGORY_LABEL: Record<ActivityCategory, string> = {
  send: "send",
  receive: "receive",
  "contract-call": "call",
  "contract-creation": "deploy",
  approval: "approve",
  swap: "swap",
  bridge: "bridge",
};

function matches(a: NormalizedActivity, f: Filter): boolean {
  switch (f) {
    case "all": return true;
    case "out": return a.category === "send";
    case "in": return a.category === "receive";
    case "contracts":
      return a.category === "contract-call" || a.category === "approval" || a.category === "swap" || a.category === "bridge" || a.category === "contract-creation";
    case "failed": return a.status === "failed";
  }
}

export function Ledger({ activity }: { activity: NormalizedActivity[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [limit, setLimit] = useState(8);

  const rows = useMemo(() => {
    const sorted = [...activity].sort((a, b) => b.timestamp - a.timestamp);
    return sorted.filter((a) => matches(a, filter));
  }, [activity, filter]);

  const visible = rows.slice(0, limit);

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-ink-2/50">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line/70 px-6 py-4">
        <div className="flex items-center gap-2.5">
          <ListFilter className="h-4 w-4 text-amber" strokeWidth={1.8} />
          <p className="mono-label text-mute">Activity ledger</p>
          <span className="font-mono text-[10px] text-dim">sampled · newest first</span>
        </div>
        <div className="flex gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => {
                setFilter(f.id);
                setLimit(8);
              }}
              className={`rounded-full border px-3 py-1.5 font-mono text-[10px] tracking-wide transition-colors ${
                filter === f.id
                  ? "border-amber/60 bg-amber/10 text-amber"
                  : "border-line text-dim hover:text-mute"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="px-6 py-12 text-center font-mono text-[11px] text-dim">nothing in this bucket</p>
      ) : (
        <ul>
          {visible.map((a, i) => {
            const inbound = a.category === "receive";
            const contractish = a.category !== "send" && a.category !== "receive";
            return (
              <motion.li
                key={a.id + i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: Math.min(i * 0.03, 0.4) }}
                className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-line/40 px-5 py-3 last:border-0 hover:bg-ink-3/40 sm:grid-cols-[auto_auto_minmax(0,1fr)_auto_auto_auto] sm:gap-4"
              >
                <span className={`flex h-7 w-7 items-center justify-center rounded-md border ${
                  a.status === "failed"
                    ? "border-risk/40 bg-risk/10 text-risk"
                    : inbound
                      ? "border-mint/30 bg-mint/10 text-mint"
                      : contractish
                        ? "border-violet/30 bg-violet/10 text-violet"
                        : "border-amber/30 bg-amber/10 text-amber"
                }`}>
                  {a.status === "failed" ? (
                    <XCircle className="h-3.5 w-3.5" />
                  ) : inbound ? (
                    <ArrowDownLeft className="h-3.5 w-3.5" />
                  ) : contractish ? (
                    <Boxes className="h-3.5 w-3.5" />
                  ) : (
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  )}
                </span>

                <span className="hidden rounded bg-ink-3 px-2 py-0.5 font-mono text-[9.5px] tracking-wide text-mute uppercase sm:inline">
                  {CATEGORY_LABEL[a.category]}{a.method ? ` · ${a.method}` : ""}
                </span>

                <span className="min-w-0">
                  <a
                    href={a.explorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex items-center gap-1.5 font-mono text-xs text-bone hover:text-amber"
                  >
                    {shortAddress(a.hash, 6)}
                    <ExternalLink className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                  </a>
                  <p className="mt-0.5 truncate font-mono text-[9.5px] text-dim">
                    {inbound ? "from " : "to "}
                    {a.counterpartyLabel ? `${a.counterpartyLabel} ` : ""}
                    {shortAddress(a.counterparty, 6)}
                  </p>
                </span>

                <span className="text-right">
                  <p className="font-mono text-xs text-bone">
                    {a.usdValue !== null
                      ? fmtUsd(a.usdValue)
                      : a.nativeValue > 0
                        ? fmtNative(a.nativeValue, CHAIN_MAP[a.chain].nativeSymbol, 3)
                        : "—"}
                  </p>
                </span>

                <span className="hidden font-mono text-[10px] text-dim sm:block">{relTime(a.timestamp)}</span>

                <span
                  className="hidden h-1.5 w-1.5 rounded-full sm:block"
                  style={{ background: CHAIN_MAP[a.chain].color }}
                  title={CHAIN_MAP[a.chain].name}
                />
              </motion.li>
            );
          })}
        </ul>
      )}

      {rows.length > limit && (
        <button
          onClick={() => setLimit((l) => l + 8)}
          className="w-full border-t border-line/70 py-3.5 font-mono text-[11px] tracking-widest text-mute uppercase transition-colors hover:bg-ink-3/60 hover:text-bone"
        >
          show more · {rows.length - limit} remaining in sample
        </button>
      )}
    </div>
  );
}
