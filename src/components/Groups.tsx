import { motion } from "motion/react";
import { Boxes, Coins, User, Workflow, Wallet2 } from "lucide-react";
import { CHAIN_MAP } from "@/lib/chains";
import type { WalletAnalytics } from "@/lib/types";
import { fmtCompact, fmtInt, shortAddress, fmtUsd, fmtPct } from "@/lib/format";

export function Counterparties({ analytics }: { analytics: WalletAnalytics }) {
  const list = analytics.counterparties;
  const max = Math.max(...list.map((c) => c.interactions), 1);
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-ink-2/50">
      <div className="flex items-center justify-between border-b border-line/70 px-6 py-4">
        <div className="flex items-center gap-2.5">
          <User className="h-4 w-4 text-amber" strokeWidth={1.8} />
          <p className="mono-label text-mute">Top counterparties</p>
        </div>
        <p className="font-mono text-[10px] text-dim">{fmtInt(analytics.derived.uniqueCounterparties)} observed</p>
      </div>
      {list.length === 0 ? (
        <Empty text="no counterparties in the sampled window" />
      ) : (
        <ul>
          {list.slice(0, 8).map((c, i) => (
            <motion.li
              key={c.address}
              initial={{ opacity: 0, x: -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.04 }}
              className="relative border-b border-line/50 px-6 py-3.5 last:border-0"
            >
              <div
                className="absolute inset-y-0 left-0 bg-amber/[0.05]"
                style={{ width: `${(c.interactions / max) * 100}%` }}
              />
              <div className="relative flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-mono text-xs text-bone">
                    <span className="text-dim">{String(i + 1).padStart(2, "0")}</span>
                    {shortAddress(c.address, 8)}
                    {c.label && (
                      <span className="max-w-[130px] truncate rounded border border-amber/30 bg-amber/10 px-1.5 py-px text-[9px] text-amber">
                        {c.label}
                      </span>
                    )}
                    {c.isContract && <Boxes className="h-3 w-3 text-violet" />}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-dim">
                    ↑ {c.sent} out · ↓ {c.received} in · {c.chains.map((ch) => CHAIN_MAP[ch].short).join("/")}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono text-xs text-bone">{fmtInt(c.interactions)}×</p>
                  {(c.usdIn + c.usdOut) > 0 && (
                    <p className="mt-0.5 font-mono text-[10px] text-mute">
                      {fmtUsd(c.usdIn + c.usdOut, { compact: true })}
                    </p>
                  )}
                </div>
              </div>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Contracts({ analytics }: { analytics: WalletAnalytics }) {
  const list = analytics.contracts;
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-ink-2/50">
      <div className="flex items-center justify-between border-b border-line/70 px-6 py-4">
        <div className="flex items-center gap-2.5">
          <Boxes className="h-4 w-4 text-violet" strokeWidth={1.8} />
          <p className="mono-label text-mute">Most used contracts</p>
        </div>
        <p className="font-mono text-[10px] text-dim">{fmtPct(analytics.derived.topContractShare)} on top contract</p>
      </div>
      {list.length === 0 ? (
        <Empty text="no contract calls in the sampled window" />
      ) : (
        <ul>
          {list.slice(0, 7).map((c, i) => (
            <motion.li
              key={c.address}
              initial={{ opacity: 0, x: -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.04 }}
              className="border-b border-line/50 px-6 py-3.5 last:border-0"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-bone">
                    {c.name ?? shortAddress(c.address, 8)}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {c.methods.slice(0, 3).map((m) => (
                      <span key={m} className="rounded bg-ink-3 px-1.5 py-px font-mono text-[9.5px] text-mute">
                        {m}()
                      </span>
                    ))}
                    {c.methods.length > 3 && (
                      <span className="font-mono text-[9.5px] text-dim">+{c.methods.length - 3}</span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono text-xs text-bone">{fmtInt(c.interactions)}×</p>
                  {c.failed > 0 && (
                    <p className="mt-0.5 font-mono text-[10px] text-risk">{c.failed} failed</p>
                  )}
                </div>
              </div>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MethodsAndAssets({ analytics }: { analytics: WalletAnalytics }) {
  const methodTotal = analytics.methods.reduce((s, m) => s + m.count, 0) || 1;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-line bg-ink-2/50 p-6">
        <div className="flex items-center gap-2.5">
          <Workflow className="h-4 w-4 text-cyan" strokeWidth={1.8} />
          <p className="mono-label text-mute">Method calls</p>
        </div>
        {analytics.methods.length === 0 ? (
          <Empty text="no decoded methods sampled" compact />
        ) : (
          <div className="mt-5 flex flex-wrap gap-2">
            {analytics.methods.slice(0, 10).map((m) => (
              <span
                key={m.method}
                className="flex items-center gap-2 rounded-full border border-line bg-ink px-3 py-1.5 font-mono text-[11px] text-mute"
              >
                {m.method}()
                <span className="text-bone">{fmtPct(m.count / methodTotal)}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="rounded-xl border border-line bg-ink-2/50 p-6">
        <div className="flex items-center gap-2.5">
          <Coins className="h-4 w-4 text-lime" strokeWidth={1.8} />
          <p className="mono-label text-mute">Assets moved</p>
        </div>
        {analytics.assets.length === 0 ? (
          <Empty text="no token transfers sampled" compact />
        ) : (
          <ul className="mt-4 space-y-2.5">
            {analytics.assets.slice(0, 6).map((a) => (
              <li key={a.symbol + a.name} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs text-bone">{a.symbol}</p>
                  <p className="truncate font-mono text-[9.5px] text-dim">{a.name}</p>
                </div>
                <p className="shrink-0 font-mono text-[10.5px] text-mute">
                  <span className="text-mint">↓{a.transfersIn}</span>
                  <span className="mx-1.5 text-dim">/</span>
                  <span className="text-risk">↑{a.transfersOut}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function Holdings({ analytics }: { analytics: WalletAnalytics }) {
  const list = [...analytics.holdings].sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0)).slice(0, 10);
  const totalUsd = analytics.holdings.reduce((s, h) => s + (h.usdValue ?? 0), 0);
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-ink-2/50">
      <div className="flex items-center justify-between border-b border-line/70 px-6 py-4">
        <div className="flex items-center gap-2.5">
          <Wallet2 className="h-4 w-4 text-amber" strokeWidth={1.8} />
          <p className="mono-label text-mute">Current holdings</p>
        </div>
        <p className="font-mono text-[10px] text-dim">
          {totalUsd > 0 ? `≈ ${fmtUsd(totalUsd, { compact: true })} priced` : "as exposed by explorers"}
        </p>
      </div>
      {list.length === 0 ? (
        <Empty text="no token balances exposed by the source explorers" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left">
            <thead>
              <tr className="border-b border-line/70 font-mono text-[9.5px] tracking-[0.15em] text-dim uppercase">
                <th className="px-6 py-3 font-medium">Asset</th>
                <th className="px-4 py-3 font-medium">Chain</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
                <th className="py-3 pr-6 pl-4 text-right font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {list.map((h, i) => (
                <tr key={`${h.chain}-${h.tokenAddress}-${i}`} className="border-b border-line/40 last:border-0">
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2.5">
                      {h.iconUrl ? (
                        <img src={h.iconUrl} alt="" className="h-5 w-5 rounded-full bg-ink-3" loading="lazy" />
                      ) : (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink-3 font-mono text-[8px] text-mute">
                          {h.symbol.slice(0, 3)}
                        </span>
                      )}
                      <div>
                        <p className="font-mono text-xs text-bone">{h.symbol}</p>
                        <p className="max-w-[160px] truncate font-mono text-[9.5px] text-dim">{h.name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5 font-mono text-[10.5px] text-mute">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: CHAIN_MAP[h.chain].color }} />
                      {CHAIN_MAP[h.chain].short}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-[10.5px] text-dim">{h.type}</td>
                  <td className="px-4 py-3 text-right font-mono text-[11px] text-mute">
                    {h.amount !== null ? fmtCompact(h.amount) : h.type !== "ERC-20" ? "held" : "—"}
                  </td>
                  <td className="py-3 pr-6 pl-4 text-right font-mono text-[11px] text-bone">
                    {h.usdValue !== null ? fmtUsd(h.usdValue) : <span className="text-dim">unpriced</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Empty({ text, compact }: { text: string; compact?: boolean }) {
  return (
    <p className={`px-6 text-center font-mono text-[11px] text-dim ${compact ? "py-8" : "py-12"}`}>{text}</p>
  );
}
