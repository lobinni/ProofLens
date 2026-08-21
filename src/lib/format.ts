export function shortAddress(addr: string | null | undefined, chars = 6): string {
  if (!addr) return "—";
  if (addr.length <= chars * 2 + 2) return addr;
  return `${addr.slice(0, chars + 2)}…${addr.slice(-chars)}`;
}

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function fmtCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function fmtUsd(n: number | null | undefined, opts?: { compact?: boolean }): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (opts?.compact && abs >= 10_000) return `$${fmtCompact(n)}`;
  if (abs >= 1000)
    return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (abs >= 1) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (abs === 0) return "$0";
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
}

export function fmtNative(v: number | null | undefined, symbol: string, dp = 4): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const abs = Math.abs(v);
  let s: string;
  if (abs >= 1000) s = v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  else if (abs >= 1) s = v.toLocaleString("en-US", { maximumFractionDigits: dp });
  else if (abs === 0) s = "0";
  else s = v.toLocaleString("en-US", { maximumFractionDigits: 6 });
  return `${s} ${symbol}`;
}

export function fmtPct(x: number, dp = 0): string {
  return `${(x * 100).toFixed(dp)}%`;
}

export function fmtDate(ts: number | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function fmtDateTime(ts: number | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function relTime(ts: number | null): string {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 30 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  if (diff < 365 * 86_400_000) return `${Math.floor(diff / (30 * 86_400_000))}mo ago`;
  return `${(diff / (365 * 86_400_000)).toFixed(1)}y ago`;
}

export function fmtGapMinutes(mins: number | null): string {
  if (mins === null || Number.isNaN(mins)) return "—";
  if (mins < 1) return `${Math.round(mins * 60)}s`;
  if (mins < 60) return `${Math.round(mins)}m`;
  if (mins < 60 * 24) {
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(mins / (60 * 24));
  return `${d}d`;
}

export function fmtDurationDays(days: number): string {
  if (days < 1) return `${Math.round(days * 24)}h`;
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${(days / 30).toFixed(1)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

export function clamp(x: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, x));
}
