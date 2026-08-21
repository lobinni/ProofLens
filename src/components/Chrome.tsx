import type { ReactNode } from "react";
import { motion } from "motion/react";
import { ScanEye, ShieldAlert, ArrowUpRight } from "lucide-react";
import { AuthButton } from "./AuthButton";

export function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55 0-.27-.01-1.17-.02-2.12-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.72-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 5.74 0c2.19-1.49 3.15-1.18 3.15-1.18.62 1.59.23 2.76.11 3.05.73.81 1.18 1.83 1.18 3.09 0 4.41-2.69 5.38-5.25 5.67.41.35.77 1.05.77 2.12 0 1.53-.01 2.76-.01 3.14 0 .3.2.66.8.55A11.52 11.52 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}

export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function Header({ onHome, right }: { onHome: () => void; right?: ReactNode }) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line/70 bg-ink/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 md:px-8">
        <button onClick={onHome} className="group flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-md border border-line-2 bg-ink-2 text-amber transition-colors group-hover:border-amber/60">
            <ScanEye className="h-4 w-4" strokeWidth={2.2} />
          </span>
          <span className="text-[17px] font-semibold tracking-tight">
            ProofLens
            <span className="font-serif-i ml-2 hidden text-[15px] text-mute sm:inline">
              receipts, not vibes
            </span>
          </span>
        </button>
        <div className="flex items-center gap-3">
          <span className="mono-label hidden items-center gap-2 rounded-full border border-mint/35 bg-mint/10 px-3 py-1.5 text-mint lg:flex">
            <span className="blink h-1.5 w-1.5 rounded-full bg-mint" />
            genlayer studionet · live
          </span>
          <AuthButton />
          {right}
          <a
            href="https://github.com/lobinni/ProofLens"
            target="_blank"
            rel="noreferrer"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-line text-mute transition-colors hover:border-line-2 hover:text-bone"
            aria-label="GitHub repository"
          >
            <GithubMark className="h-4 w-4" />
          </a>
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line/70">
      <div className="mx-auto max-w-7xl px-5 py-14 md:px-8">
        <div className="grid gap-10 md:grid-cols-[1.3fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-3">
              <ShieldAlert className="h-4 w-4 text-amber" />
              <p className="mono-label text-amber">A necessary note about verdicts</p>
            </div>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-mute">
              ProofLens classifies public wallet behavior. It does not identify the person behind
              an address, declare guilt, promise safety, or replace investigation.{" "}
              <span className="text-bone">Sybil like</span> means the visible activity resembles
              coordinated account farming. <span className="text-bone">Bot like</span> means the
              timing resembles automation. <span className="text-bone">High risk</span> means
              stronger abuse indicators are present.{" "}
              <span className="text-bone">Ordinary</span> and{" "}
              <span className="text-bone">low risk</span> are not safety guarantees.
            </p>
          </div>
          <div>
            <p className="mono-label text-dim">Every scan exposes</p>
            <ul className="mt-4 space-y-2.5 text-sm text-mute">
              {[
                "Canonical prooflens.v2 evidence bundle",
                "SHA-256 evidence commitment",
                "Official Blockscout source references",
                "Bounded raw transaction proof set",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-dim" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mono-label text-dim">Colophon</p>
            <p className="mt-4 text-sm leading-relaxed text-mute">
              Six EVM chains read live from public Blockscout v2 APIs. Evidence sealed in your
              browser; verdicts argued by GenLayer validators on StudioNet. No wallet connection,
              ever.
            </p>
            <p className="mt-6 font-mono text-xs text-dim">© MMXXVI ProofLens — healthy skepticism is part of the product.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
