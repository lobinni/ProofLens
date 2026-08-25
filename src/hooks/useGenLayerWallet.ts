import { useCallback, useEffect, useState } from "react";
import {
  connectGenLayerWallet,
  onAccountsChanged,
  type WalletConnection,
} from "@/lib/genlayer-wallet";

export interface GenLayerPrereq {
  hasMetaMask: boolean;
}

export interface GenLayerWalletState {
  prereq: GenLayerPrereq;
  checking: boolean;
  address: string | null;
  client: WalletConnection | null;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<WalletConnection | null>;
  disconnect: () => void;
}

export function useGenLayerWallet(): GenLayerWalletState {
  const [prereq, setPrereq] = useState<GenLayerPrereq>({ hasMetaMask: false });
  const [checking, setChecking] = useState(true);
  const [address, setAddress] = useState<string | null>(null);
  const [client, setClient] = useState<WalletConnection | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const present =
      typeof window !== "undefined" &&
      Boolean((window as unknown as { ethereum?: { isMetaMask?: boolean } }).ethereum?.isMetaMask);
    setPrereq({ hasMetaMask: present });
    setChecking(false);
  }, []);

  useEffect(() => {
    const off = onAccountsChanged((next) => {
      setAddress(next);
      setClient(null); // force a reconnect-bound client whenever account changes
    });
    return off;
  }, []);

  const connect = useCallback(async (): Promise<WalletConnection | null> => {
    setError(null);
    setConnecting(true);
    try {
      const conn = await connectGenLayerWallet();
      setClient(conn);
      setAddress(conn.address);
      return conn;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setClient(null);
      return null;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setClient(null);
    setAddress(null);
    setError(null);
  }, []);

  return { prereq, checking, address, client, connecting, error, connect, disconnect };
}
