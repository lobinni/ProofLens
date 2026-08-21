import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowRight,
  Activity,
  Banknote,
  Boxes,
  Network,
  Radar,
  FileSearch,
  ScanSearch,
  Fingerprint,
  Layers,
  Landmark,
  Crosshair,
  AlertTriangle,
  History,
  X,
} from "lucide-react";
import { CHAINS, type ChainId } from "@/lib/chains";
import { listHistory, removeHistoryEntry, type ScanHistoryEntry } from "@/lib/persistence";
import { fetchCloudHistory } from "@/lib/cloud-history";
import { useAuth } from "@/hooks/useAuth";
import { relTime, shortAddress } from "@/lib/format";
import { Reveal } from "./Chrome";

const VERDICT_DOT: Record<string, string> = {
  low_risk: "#7bd88f",
  ordinary: "#b7f34d",
  bot_like: "#59d6e6",
  sybil_like: "#ffb224",
  high_risk: "#ff5c4d",
  inconclusive: "#8b9097",
};

const SAMPLES = [
  { label: "vitalik.eth", value: "vitalik.eth" },
  { label: "binance hot wallet", value: "0x28C6c06298d514Db089934071355E5743bf21d60" },
  { label: "bitfinex", value: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e" },
];

const CAPABILITIES = [
  {
    icon: Activity,
    title: "Activity fingerprint",
    body: "First-seen date, wallet age, sends, receives, approvals, swaps, bridges, failures — and the rhythm between them.",
  },
  {
    icon: Banknote,
    title: "Value movement",
    body: "Native, token, NFT and fee volume. Priced where explorers expose prices; honestly unpriced where they don't.",
  },
  {
    icon: Boxes,
    title: "Contract & protocol use",
    body: "Most-used contracts, method names, protocol labels, and how concentrated the wallet's contract diet really is.",
  },
  {
    icon: Network,
    title: "Counterparty graph",
    body: "The most active counterparties and repeated routes, drawn as an interactive force graph you can pull apart.",
  },
  {
    icon: Radar,
    title: "Behavioral signals",
    body: "Automation, dust-farm shape, concentration, failure, dormancy and repetition — each one shown with its numbers.",
  },
  {
    icon: FileSearch,
    title: "Honest coverage notes",
    body: "When an explorer has incomplete history or a request fails, the gap stays visible in the report. No silent certainty.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Collect",
    body: "Each chain is scanned independently through its public Blockscout explorer, so one grumpy API never erases the others.",
  },
  {
    n: "02",
    title: "Analyze",
    body: "Activity is normalized and deterministic analytics are computed: timing, volumes, counterparties, signals.",
  },
  {
    n: "03",
    title: "Commit",
    body: "A canonical prooflens.v2 evidence bundle with bounded raw proofs is built and sealed with a SHA-256 commitment.",
  },
  {
    n: "04",
    title: "Verdict",
    body: "The relayer submits the commitment to StudioNet. Validators replay every proof, recompute the metrics, agree — and the verdict is stored on-chain.",
  },
];

export function Landing({ onScan }: { onScan: (input: string, chains: ChainId[]) => void }) {
  const [input, setInput] = useState("");
  const [selected, setSelected] = useState<ChainId[]>(CHAINS.map((c) => c.id));
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ScanHistoryEntry[]>([]);
  const { user } = useAuth();

  useEffect(() => {
    // Signed-in users get server-mirrored history; anonymous users get the
    // local adapter. Cloud list falls back to local when unreachable.
    if (user) {
      fetchCloudHistory(user.token).then((cloud) => {
        setHistory(cloud && cloud.length > 0 ? cloud : listHistory());
      });
    } else {
      setHistory(listHistory());
    }
  }, [user]);

  const toggle = (id: ChainId) =>
    setSelected((s) => (s.includes(id) ? s.filter((c) => c !== id) : [...s, id]));

  const submit = (value?: string) => {
    const v = (value ?? input).trim();
    if (!v) {
      setError("Paste a 0x address or an ENS name first.");
      return;
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(v) && !/^[a-z0-9-]+(\.[a-z0-9-]+)*\.eth$/i.test(v) && !value) {
      setError("That does not look like an EVM address or ENS name.");
      return;
    }
    if (!selected.length) {
      setError("Pick at least one chain to scan.");
      return;
    }
    setError(null);
    onScan(v, selected);
  };

  return (
    <div className="relative">
      {/* ------------------------------ HERO ------------------------------ */}
      <section className="relative overflow-hidden">
        <div className="grid-bg pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[820px] -translate-x-1/2 rounded-full bg-amber/[0.05] blur-3xl" />
        <div className="relative z-10 mx-auto max-w-7xl px-5 pt-36 pb-20 md:px-8 md:pt-44 md:pb-28">
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="mono-label flex items-center gap-3 text-amber"
          >
            <span className="inline-block h-px w-10 bg-amber/60" />
            Public wallet intelligence · six chains · zero wallet connections
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.85, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="mt-6 max-w-4xl text-[13.5vw] leading-[0.95] font-semibold tracking-[-0.03em] sm:text-7xl md:text-[86px]"
          >
            Paste an address.
            <br />
            <span className="font-serif-i font-normal text-amber">Read the receipts.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="mt-6 max-w-xl text-[15px] leading-relaxed text-mute md:text-base"
          >
            ProofLens follows a public EVM wallet across Ethereum, Base, Optimism, Arbitrum,
            Polygon and Gnosis, then computes a deterministic verdict from committed evidence.
            No signatures. No connection. The activity speaks for itself.
          </motion.p>

          {/* ------------------------------ SCAN FORM ------------------------------ */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.85, delay: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="mt-10 max-w-3xl"
          >
            <div className="group relative rounded-xl border border-line-2 bg-ink-2/90 p-1.5 shadow-[0_0_60px_-20px_rgba(255,178,36,0.25)] focus-within:border-amber/60">
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <ScanSearch className="absolute top-1/2 left-4 h-4.5 w-4.5 -translate-y-1/2 text-dim" />
                  <input
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      setError(null);
                    }}
                    onKeyDown={(e) => e.key === "Enter" && submit()}
                    placeholder="0x… or ensname.eth"
                    spellCheck={false}
                    autoComplete="off"
                    className="addr-input h-13 w-full rounded-lg bg-transparent pl-11 pr-4 font-mono text-[15px] text-bone placeholder:text-dim"
                  />
                </div>
                <button
                  onClick={() => submit()}
                  className="group/btn flex h-13 items-center justify-center gap-2.5 rounded-lg bg-amber px-7 text-[15px] font-semibold text-ink transition-all hover:bg-bone"
                >
                  Scan wallet
                  <ArrowRight className="h-4.5 w-4.5 transition-transform group-hover/btn:translate-x-1" />
                </button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="mono-label mr-1 text-dim">chains</span>
              {CHAINS.map((c) => {
                const on = selected.includes(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => toggle(c.id)}
                    className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 font-mono text-[11px] tracking-wide transition-all ${
                      on
                        ? "border-line-2 bg-ink-3 text-bone"
                        : "border-line/70 bg-transparent text-dim hover:text-mute"
                    }`}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full transition-opacity"
                      style={{ background: c.color, opacity: on ? 1 : 0.3 }}
                    />
                    {c.name}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-2 text-xs text-dim">
              <span className="mono-label mr-1">try</span>
              {SAMPLES.map((s) => (
                <button
                  key={s.label}
                  onClick={() => {
                    setInput(s.value);
                    submit(s.value);
                  }}
                  className="rounded border border-line/70 px-2.5 py-1 font-mono text-[11px] text-mute transition-colors hover:border-amber/50 hover:text-amber"
                >
                  {s.label}
                </button>
              ))}
              {error && (
                <span className="flex items-center gap-1.5 font-mono text-[11px] text-risk">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {error}
                </span>
              )}
            </div>

            {history.length > 0 && (
              <div className="mt-8 max-w-xl">
                <div className="flex items-center gap-2">
                  <History className="h-3.5 w-3.5 text-dim" />
                  <p className="mono-label text-dim">
                    {user ? `Recent scans · ${user.email}` : "Recent scans · this browser only"}
                  </p>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {history.slice(0, 4).map((h) => (
                    <li
                      key={h.scanId}
                      className="group flex items-center gap-3 rounded-lg border border-line/70 bg-ink-2/60 px-3.5 py-2.5 transition-colors hover:border-line-2"
                    >
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: VERDICT_DOT[h.classification] ?? "#8b9097" }}
                      />
                      <button
                        onClick={() => {
                          setInput(h.wallet);
                          submit(h.wallet);
                        }}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="block truncate font-mono text-[11px] text-mute transition-colors group-hover:text-bone">
                          {h.ensName ?? shortAddress(h.wallet, 10)}
                        </span>
                        <span className="mt-0.5 block font-mono text-[9.5px] text-dim">
                          {h.classification.replace(/_/g, " ")} · risk {h.riskScore} · {h.observedTx} tx · {relTime(h.createdAt)}
                        </span>
                      </button>
                      <button
                        onClick={() => {
                          removeHistoryEntry(h.scanId);
                          setHistory(listHistory());
                        }}
                        className="shrink-0 text-dim opacity-0 transition-opacity group-hover:opacity-100 hover:text-risk"
                        aria-label="Remove from history"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </motion.div>
        </div>

        {/* marquee */}
        <div className="relative z-10 border-y border-line/70 bg-ink-2/50 py-3.5">
          <div className="flex overflow-hidden">
            <div className="marquee-track flex shrink-0 items-center gap-10 pr-10">
              {[0, 1].map((dup) => (
                <div key={dup} className="flex items-center gap-10">
                  {CHAINS.concat(CHAINS).map((c, i) => (
                    <span key={`${c.id}-${i}`} className="flex items-center gap-3 whitespace-nowrap">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.color }} />
                      <span className="font-mono text-xs tracking-[0.22em] text-mute uppercase">
                        {c.name}
                      </span>
                      <span className="font-serif-i text-sm text-dim">live chain data</span>
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------ CAPABILITIES ------------------------------ */}
      <section className="mx-auto max-w-7xl px-5 py-24 md:px-8 md:py-32">
        <Reveal>
          <p className="mono-label text-amber">01 — What ProofLens reads</p>
          <h2 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight md:text-5xl">
            Everything the explorers
            <span className="font-serif-i font-normal text-mute"> already know, </span>
            cross-examined.
          </h2>
        </Reveal>
        <div className="mt-14 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((cap, i) => (
            <Reveal key={cap.title} delay={i * 0.06} className="bg-ink">
              <div className="group h-full p-7 transition-colors hover:bg-ink-2">
                <cap.icon className="h-5 w-5 text-amber transition-transform duration-500 group-hover:-rotate-12" strokeWidth={1.8} />
                <h3 className="mt-5 text-lg font-semibold tracking-tight">{cap.title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-mute">{cap.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ------------------------------ HOW A SCAN MOVES ------------------------------ */}
      <section className="border-y border-line/70 bg-ink-2/40">
        <div className="mx-auto max-w-7xl px-5 py-24 md:px-8 md:py-32">
          <Reveal>
            <p className="mono-label text-amber">02 — How a scan moves</p>
            <h2 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight md:text-5xl">
              From address to
              <span className="font-serif-i font-normal text-mute"> committed verdict.</span>
            </h2>
          </Reveal>
          <div className="mt-14 grid gap-10 md:grid-cols-4 md:gap-6">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 0.1}>
                <div className="relative">
                  <div className="flex items-center gap-4">
                    <span className="font-serif-i text-5xl text-dim">{s.n}</span>
                    <span className="rule-dash hidden flex-1 md:block" />
                  </div>
                  <h3 className="mt-5 text-xl font-semibold tracking-tight">{s.title}</h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-mute">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={0.2}>
            <div className="mt-16 flex flex-col items-start gap-5 rounded-xl border border-amber/25 bg-amber/[0.05] p-7 md:flex-row md:items-center">
              <Crosshair className="h-6 w-6 shrink-0 text-amber" strokeWidth={1.6} />
              <p className="text-sm leading-relaxed text-mute">
                <span className="font-semibold text-bone">Every scan</span> seals its evidence with
                a SHA-256 commitment, which the relayer submits to the ProofLensAttestation
                Intelligent Contract on GenLayer StudioNet. Validators independently re-fetch the
                evidence and every proof from Blockscout, recompute the metrics themselves, and
                only then let the model speak.{" "}
                <span className="text-bone">No consensus, no verdict.</span>
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------ CLOSING STRIP ------------------------------ */}
      <section className="mx-auto max-w-7xl px-5 py-24 md:px-8 md:py-32">
        <div className="grid items-end gap-10 md:grid-cols-[1.4fr_1fr]">
          <Reveal>
            <Fingerprint className="h-8 w-8 text-amber" strokeWidth={1.5} />
            <h2 className="mt-6 text-4xl font-semibold tracking-tight md:text-[56px] md:leading-[1.05]">
              Wallets are weird.
              <br />
              <span className="font-serif-i font-normal text-mute">Bring receipts.</span>
            </h2>
          </Reveal>
          <Reveal delay={0.12}>
            <div className="space-y-4">
              {[
                { icon: Layers, text: "Live data from six Blockscout explorers" },
                { icon: Landmark, text: "Deterministic, evidence-committed verdicts" },
                { icon: ScanSearch, text: "No wallet connection — paste and read" },
              ].map((row) => (
                <div key={row.text} className="flex items-center gap-4 border-b border-line/70 pb-4">
                  <row.icon className="h-4.5 w-4.5 shrink-0 text-dim" strokeWidth={1.8} />
                  <p className="text-sm text-mute">{row.text}</p>
                </div>
              ))}
              <button
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                className="group mt-2 flex items-center gap-2 font-mono text-xs tracking-[0.18em] text-amber uppercase"
              >
                Scan an address
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
