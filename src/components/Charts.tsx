import { useMemo } from "react";
import { motion } from "motion/react";
import { BarChart3, Clock3, CalendarRange } from "lucide-react";
import type { MonthBucket } from "@/lib/types";

function ChartCard({
  icon: Icon,
  title,
  note,
  children,
}: {
  icon: typeof Clock3;
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-ink-2/50 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Icon className="h-4 w-4 text-amber" strokeWidth={1.8} />
          <p className="mono-label text-mute">{title}</p>
        </div>
        <p className="font-mono text-[10px] text-dim">{note}</p>
      </div>
      <div className="mt-6">{children}</div>
    </div>
  );
}

export function HourDial({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  return (
    <ChartCard icon={Clock3} title="Hour of day" note="utc">
      <div className="relative mx-auto aspect-square w-full max-w-[220px]">
        <svg viewBox="0 0 200 200" className="h-full w-full">
          {Array.from({ length: 60 }).map((_, i) => {
            const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
            return (
              <line
                key={i}
                x1={100 + 87 * Math.cos(a)}
                y1={100 + 87 * Math.sin(a)}
                x2={100 + (i % 5 === 0 ? 92 : 90) * Math.cos(a)}
                y2={100 + (i % 5 === 0 ? 92 : 90) * Math.sin(a)}
                stroke="#2b323c"
                strokeWidth="1"
              />
            );
          })}
          {data.map((v, i) => {
            const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
            const len = 12 + (v / max) * 52;
            return (
              <motion.line
                key={i}
                x1={100 + 14 * Math.cos(a)}
                y1={100 + 14 * Math.sin(a)}
                x2={100 + (14 + len) * Math.cos(a)}
                y2={100 + (14 + len) * Math.sin(a)}
                stroke={v / max > 0.66 ? "#ffb224" : "#8b9097"}
                strokeWidth={v / max > 0.66 ? 5 : 4}
                strokeLinecap="round"
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.02 }}
              >
                <title>{`${String(i).padStart(2, "0")}:00 — ${v} tx`}</title>
              </motion.line>
            );
          })}
          {[0, 6, 12, 18].map((h) => {
            const a = (h / 24) * Math.PI * 2 - Math.PI / 2;
            return (
              <text
                key={h}
                x={100 + 74 * Math.cos(a)}
                y={100 + 74 * Math.sin(a) + 3}
                textAnchor="middle"
                fill="#565d66"
                fontSize="8"
                fontFamily="IBM Plex Mono"
              >
                {String(h).padStart(2, "0")}
              </text>
            );
          })}
        </svg>
      </div>
    </ChartCard>
  );
}

export function WeekdayBars({ data }: { data: number[] }) {
  // data indexed 0=Sun (UTC day) — display Mon-first
  const labels = ["M", "T", "W", "T", "F", "S", "S"];
  const ordered = [1, 2, 3, 4, 5, 6, 0].map((d, i) => ({ v: data[d] ?? 0, label: labels[i] }));
  const max = Math.max(...ordered.map((o) => o.v), 1);
  const total = ordered.reduce((s, o) => s + o.v, 0) || 1;
  return (
    <ChartCard icon={BarChart3} title="Day of week" note="utc">
      <div className="flex h-[190px] items-end gap-2.5">
        {ordered.map((d, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-2">
            <span className="font-mono text-[9px] text-dim">{(d.v / total * 100).toFixed(0)}%</span>
            <motion.div
              initial={{ height: 0 }}
              whileInView={{ height: `${Math.max((d.v / max) * 120, 3)}px` }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
              className={`w-full rounded-t-sm ${d.v / max > 0.8 ? "bg-amber" : "bg-line-2"}`}
            >
              <title>{`${d.v} tx`}</title>
            </motion.div>
            <span className="font-mono text-[10px] text-mute">{d.label}</span>
          </div>
        ))}
      </div>
    </ChartCard>
  );
}

export function MonthArea({ data }: { data: MonthBucket[] }) {
  const { path, area, labels } = useMemo(() => {
    if (!data.length) return { path: "", area: "", labels: [] as { x: number; label: string }[] };
    const W = 400;
    const H = 150;
    const pad = 8;
    const max = Math.max(...data.map((d) => d.count), 1);
    const pts = data.map((d, i) => {
      const x = data.length === 1 ? W / 2 : pad + (i / (data.length - 1)) * (W - pad * 2);
      const y = H - pad - (d.count / max) * (H - pad * 2 - 20);
      return { x, y, ...d };
    });
    const line = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const fill = `${line} L ${pts[pts.length - 1].x.toFixed(1)} ${H - pad} L ${pts[0].x.toFixed(1)} ${H - pad} Z`;
    const lbls = pts.filter((_, i) => i % Math.max(1, Math.floor(pts.length / 5)) === 0 || i === pts.length - 1);
    return { path: line, area: fill, labels: lbls };
  }, [data]);

  if (data.length < 2) {
    return (
      <ChartCard icon={CalendarRange} title="Monthly cadence" note="utc">
        <div className="flex h-[190px] items-center justify-center font-mono text-xs text-dim">
          not enough months to draw a trend
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard icon={CalendarRange} title="Monthly cadence" note="utc">
      <svg viewBox="0 0 400 170" className="w-full">
        <defs>
          <linearGradient id="month-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffb224" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#ffb224" stopOpacity="0" />
          </linearGradient>
        </defs>
        <motion.path
          d={area}
          fill="url(#month-fill)"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1, delay: 0.4 }}
        />
        <motion.path
          d={path}
          fill="none"
          stroke="#ffb224"
          strokeWidth="1.8"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
        />
        {labels.map((l, i) => (
          <text key={i} x={l.x} y={166} textAnchor="middle" fill="#565d66" fontSize="8.5" fontFamily="IBM Plex Mono">
            {l.label}
          </text>
        ))}
      </svg>
    </ChartCard>
  );
}
