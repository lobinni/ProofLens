import { useCallback, useEffect, useState } from "react";
import {
  getSession,
  onSessionChange,
  refreshSessionIfNeeded,
  setSession,
  type EmailSession,
} from "@/lib/session";

export interface AuthUser {
  email: string;
  token: string;
}

export function useAuth(): {
  user: AuthUser | null;
  signOut: () => void;
} {
  const [session, setLocal] = useState<EmailSession | null>(() => getSession());

  useEffect(() => {
    void refreshSessionIfNeeded();
    return onSessionChange(() => setLocal(getSession()));
  }, []);

  const signOut = useCallback(() => setSession(null), []);

  if (!session || session.expiresAt <= Date.now()) {
    return { user: null, signOut };
  }
  return { user: { email: session.email, token: session.token }, signOut };
}
