import { motion } from "motion/react";
import { Radar } from "lucide-react";
import type { BehaviorSignals } from "@/lib/types";

const ROWS: { key: keyof BehaviorSignals; label: string; desc: string }[] = [
  { key: "automation", label: "Automation", desc: "gap regularity · hour concentration · burst density" },
  { key: "sybil", label: "Sybil shape", desc: "inbound dust · unique senders · inbound dominance" },
  { key: "concentration", label: "Concentration", desc: "share of interactions held by top route" },
  { key: "failure", label: "Failure", desc: "reverted calls vs everything attempted" },
  { key: "dormancy", label: "Dormancy", desc: "longest silence vs total wallet age" },
  { key: "repetition", label: "Repetition", desc: "identical values · dominant method reuse" },
];

function barColor(v: number): string {
  if (v >= 0.66) return "#ff5c4d";
  if (v >= 0.4) return "#ffb224";
  if (v >= 0.2) return "#565d66";
  return "#2b323c";
}

export function SignalsPanel({
  signals,
  details,
}: {
  signals: BehaviorSignals;
  details: Record<keyof BehaviorSignals, string>;
}) {
  return (
    <div className="rounded-xl border border-line bg-ink-2/50 p-7">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Radar className="h-4 w-4 text-amber" strokeWidth={1.8} />
          <p className="mono-label text-mute">Behavioral signals</p>
        </div>
        <p className="font-mono text-[10px] text-dim">0 → 1 deterministic</p>
      </div>
      <div className="mt-7 grid gap-x-10 gap-y-6 md:grid-cols-2">
        {ROWS.map((row, i) => {
          const v = signals[row.key];
          return (
            <motion.div
              key={row.key}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.06, duration: 0.5 }}
            >
              <div className="flex items-baseline justify-between">
                <p className="text-[13px] font-medium text-bone">{row.label}</p>
                <p className="font-mono text-xs" style={{ color: barColor(v) }}>
                  {v.toFixed(2)}
                </p>
              </div>
              <div className="mt-2 h-[5px] overflow-hidden rounded-full bg-line">
                <motion.div
                  initial={{ width: 0 }}
                  whileInView={{ width: `${Math.max(v * 100, 1.5)}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 1, delay: 0.15 + i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                  className="h-full rounded-full"
                  style={{ background: barColor(v) }}
                />
              </div>
              <p className="mt-1.5 font-mono text-[10px] text-dim">{details[row.key]}</p>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
