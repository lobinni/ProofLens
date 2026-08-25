import { useEffect, type ReactNode } from "react";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import { PRIVY_APP_ID, privyConfigured } from "./privy";
import { setSession } from "@/lib/session";

/**
 * AuthProvider — identical architecture to the reference deployment:
 * Privy hosts the email OTP modal (email as the ONLY login method),
 * wallets never appear anywhere in the product.
 *
 * When VITE_PRIVY_APP_ID is absent, the provider renders nothing and the
 * app degrades gracefully to the self-hosted OTP fallback (or anonymous).
 */

/** Email joined to a Privy account — v1 exposes it as a string on user. */
function extractEmail(user: unknown): string | null {
  if (!user || typeof user !== "object") return null;
  const email = (user as { email?: unknown }).email;
  if (typeof email === "string") return email;
  if (email && typeof email === "object") {
    const address = (email as { address?: unknown }).address;
    if (typeof address === "string") return address;
  }
  return null;
}

/**
 * Bridges Privy auth state into the app's session store, so every existing
 * consumer (relayer Bearer headers, cloud history, header chip) works
 * unchanged regardless of which sign-in provider is active.
 */
function PrivyBridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, user, getAccessToken } = usePrivy();

  useEffect(() => {
    let alive = true;

    async function sync() {
      if (!ready) return;
      if (!authenticated) {
        setSession(null);
        return;
      }
      try {
        const token = await getAccessToken();
        if (!alive || !token) return;
        setSession({
          token,
          email: extractEmail(user) ?? "",
          expiresAt: Date.now() + 55 * 60 * 1000,
        });
      } catch {
        /* token refresh is retried on the interval below */
      }
    }

    void sync();
    const interval = setInterval(sync, 8 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [ready, authenticated, user, getAccessToken]);

  return <>{children}</>;
}

const PRIVY_CONFIG = {
  loginMethods: ["email"],
  appearance: {
    theme: "dark",
    accentColor: "#ffb224",
  },
  embeddedWallets: {
    createOnLogin: "off",
  },
} as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  if (!privyConfigured()) return <>{children}</>;
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={PRIVY_CONFIG as unknown as React.ComponentProps<typeof PrivyProvider>["config"]}
    >
      <PrivyBridge>{children}</PrivyBridge>
    </PrivyProvider>
  );
}
