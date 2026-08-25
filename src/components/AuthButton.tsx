import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, Loader2, LogOut, Mail, X } from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { privyConfigured } from "@/auth/privy";
import { useAuth } from "@/hooks/useAuth";
import { requestEmailCode, verifyEmailCode } from "@/lib/session";

type Step = "email" | "code";

/* ------------------------------------------------------------------ */
/* Shared account chip                                                 */
/* ------------------------------------------------------------------ */

function AccountChip({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setMenuOpen((v) => !v)}
        className="flex h-9 items-center gap-2.5 rounded-full border border-mint/40 bg-mint/10 pr-3 pl-1.5 transition-colors hover:border-mint/70"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-mint font-mono text-[11px] font-semibold text-ink uppercase">
          {email.charAt(0) || "?"}
        </span>
        <span className="hidden max-w-[140px] truncate font-mono text-[11px] text-mint sm:inline">
          {email || "account"}
        </span>
        <ChevronDown className={`h-3 w-3 text-mint transition-transform ${menuOpen ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-line-2 bg-ink-2 p-2 shadow-2xl"
          >
            <div className="border-b border-line/60 px-3 py-2.5">
              <p className="mono-label text-[9px] text-dim">signed in</p>
              <p className="mt-1 truncate font-mono text-xs text-bone">{email || "—"}</p>
              <p className="mt-1 font-mono text-[9.5px] text-mint">scan history saves to this account</p>
            </div>
            <button
              onClick={() => {
                onSignOut();
                setMenuOpen(false);
              }}
              className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 font-mono text-[11px] text-mute transition-colors hover:bg-ink-3 hover:text-risk"
            >
              <LogOut className="h-3.5 w-3.5" />
              sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Privy controls — hosted email modal, same architecture as upstream  */
/* ------------------------------------------------------------------ */

function PrivyAuthControls() {
  const { ready, authenticated, login, logout, user } = usePrivy();

  if (authenticated && user) {
    const email =
      typeof user.email === "string"
        ? user.email
        : (user.email as { address?: string } | null | undefined)?.address ?? "";
    return <AccountChip email={email} onSignOut={() => void logout()} />;
  }

  return (
    <button
      onClick={() => void login()}
      disabled={!ready}
      className="flex h-9 items-center gap-2 rounded-md border border-line px-3.5 font-mono text-[11px] tracking-wider text-mute uppercase transition-colors hover:border-amber/50 hover:text-amber disabled:opacity-50"
    >
      {ready ? <Mail className="h-3.5 w-3.5" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      <span className="hidden sm:inline">Sign in</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Self-hosted OTP fallback                                            */
/* ------------------------------------------------------------------ */

function SelfHostedAuthControls() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "code") setTimeout(() => codeRef.current?.focus(), 80);
  }, [step]);

  const reset = () => {
    setStep("email");
    setCode("");
    setError(null);
    setDevCode(null);
  };

  const closeModal = () => {
    if (busy) return;
    setOpen(false);
    reset();
  };

  // Always allow dismissing the modal (Escape) — even mid-flight.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, busy]);

  const submitEmail = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await requestEmailCode(email.trim());
      setDevCode(res.devCode ?? null);
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not send code");
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (value?: string) => {
    const finalCode = (value ?? code).replace(/\D/g, "");
    if (finalCode.length !== 6) return;
    setError(null);
    setBusy(true);
    try {
      await verifyEmailCode(email.trim(), finalCode);
      setOpen(false);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "verification failed");
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  if (user) return <AccountChip email={user.email} onSignOut={signOut} />;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-9 items-center gap-2 rounded-md border border-line px-3.5 font-mono text-[11px] tracking-wider text-mute uppercase transition-colors hover:border-amber/50 hover:text-amber"
      >
        <Mail className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Sign in</span>
      </button>

      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-ink/85 p-5 backdrop-blur-sm"
              onClick={closeModal}
              role="dialog"
              aria-modal="true"
              aria-label="Email sign in"
            >
              <motion.div
                initial={{ opacity: 0, y: 24, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 24, scale: 0.97 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                onClick={(e) => e.stopPropagation()}
                className="my-auto w-full max-w-md rounded-2xl border border-line-2 bg-ink-2 p-7 shadow-2xl"
              >
              <div className="flex items-start justify-between">
                <div>
                  <p className="mono-label text-amber">Email sign in</p>
                  <h3 className="mt-2.5 text-2xl font-semibold tracking-tight">
                    {step === "email" ? (
                      <>One email. <span className="font-serif-i font-normal text-mute">No password.</span></>
                    ) : (
                      <>Check <span className="font-serif-i font-normal text-mute">your inbox.</span></>
                    )}
                  </h3>
                </div>
                <button
                  onClick={closeModal}
                  className="text-dim transition-colors hover:text-bone"
                  aria-label="Close"
                >
                  <X className="h-4.5 w-4.5" />
                </button>
              </div>

              <p className="mt-3 text-[13px] leading-relaxed text-mute">
                {step === "email"
                  ? "Sign-in only saves your scan history across devices. No wallets, no signatures — scanning stays anonymous by default."
                  : devCode
                    ? "Your one-time code is shown below. It expires in 10 minutes."
                    : `A 6-digit code is on its way to ${email}. It expires in 10 minutes.`}
              </p>

              {step === "email" ? (
                <div className="mt-6">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void submitEmail()}
                    placeholder="you@domain.xyz"
                    autoComplete="email"
                    className="addr-input h-12 w-full rounded-lg border border-line-2 bg-ink px-4 font-mono text-sm text-bone placeholder:text-dim focus:border-amber/60"
                  />
                  <button
                    onClick={() => void submitEmail()}
                    disabled={busy || !email.includes("@")}
                    className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-amber text-sm font-semibold text-ink transition-all hover:bg-bone disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                    {busy ? "Sending…" : "Send sign-in code"}
                  </button>
                  <p className="mt-3 text-center font-mono text-[9.5px] leading-relaxed text-dim">
                    Optional and private — codes expire in 10 minutes, nothing else is collected.
                  </p>
                </div>
              ) : (
                <div className="mt-6">
                  {devCode && (
                    <div className="mb-4 flex items-center justify-between rounded-lg border border-amber/35 bg-amber/[0.07] px-4 py-3">
                      <p className="font-mono text-[10px] text-amber">your one-time code</p>
                      <p className="font-mono text-lg font-semibold tracking-[0.3em] text-amber">{devCode}</p>
                    </div>
                  )}
                  <input
                    ref={codeRef}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                      setCode(v);
                      if (v.length === 6) void submitCode(v);
                    }}
                    placeholder="• • • • • •"
                    className="addr-input h-14 w-full rounded-lg border border-line-2 bg-ink text-center font-mono text-2xl font-semibold tracking-[0.5em] text-bone placeholder:text-dim focus:border-amber/60"
                  />
                  <button
                    onClick={() => void submitCode()}
                    disabled={busy || code.length !== 6}
                    className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-amber text-sm font-semibold text-ink transition-all hover:bg-bone disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {busy ? "Verifying…" : "Verify & sign in"}
                  </button>
                  <button
                    onClick={() => {
                      setStep("email");
                      setCode("");
                      setError(null);
                    }}
                    className="mx-auto mt-3 block font-mono text-[11px] text-dim transition-colors hover:text-mute"
                  >
                    ← use a different email
                  </button>
                </div>
              )}

                {error && (
                  <p className="mt-4 rounded-lg border border-risk/30 bg-risk/[0.07] px-3.5 py-2.5 font-mono text-[11px] leading-relaxed text-risk">
                    {error}
                  </p>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */

export function AuthButton() {
  if (privyConfigured()) return <PrivyAuthControls />;
  return <SelfHostedAuthControls />;
}
