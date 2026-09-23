"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

/** Namespaced per deployment so a future sibling mono-rail (e.g. aave-v4)
 *  doesn't inherit the Liquity wallet pill on first load. Mirrors the scope
 *  convention in `lib/shared/sessions.ts`. */
const SESSION_SCOPE = process.env.NEXT_PUBLIC_SESSION_SCOPE ?? "liquity-v2";
const SESSION_KEY = `${SESSION_SCOPE}-current-wallet`;

interface WalletContextValue {
  /** Currently viewed address (length 0 or 1 — single-protocol focused). */
  addresses: string[];
  ensNames: Record<string, string | null>;
  setWallets: (addrs: string[], ens: Record<string, string | null>) => void;
}

const WalletCtx = createContext<WalletContextValue>({
  addresses: [],
  ensNames: {},
  setWallets: () => {},
});

function loadSession(): {
  addresses: string[];
  ensNames: Record<string, string | null>;
} | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.addresses) && parsed.addresses.length > 0) {
      return {
        addresses: parsed.addresses.slice(0, 1),
        ensNames: parsed.ensNames ?? {},
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function saveSession(addresses: string[], ensNames: Record<string, string | null>) {
  if (typeof window === "undefined") return;
  if (addresses.length === 0) return;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ addresses, ensNames }));
  } catch {
    /* ignore */
  }
}

/** Parse `/address/<addr>` from the path so the header can show the wallet
 *  pill the moment context hydrates, ahead of any deeper page chunk. */
function addressFromPath(): string | null {
  if (typeof window === "undefined") return null;
  const m = window.location.pathname.match(/^\/address\/([^/]+)/);
  if (!m) return null;
  const decoded = decodeURIComponent(m[1]).split("+")[0]?.trim().toLowerCase();
  return decoded && /^0x[a-f0-9]{40}$/.test(decoded) ? decoded : null;
}

export function WalletContextProvider({ children }: { children: ReactNode }) {
  const [addresses, setAddresses] = useState<string[]>([]);
  const [ensNames, setEnsNames] = useState<Record<string, string | null>>({});

  useEffect(() => {
    const urlAddr = addressFromPath();
    if (urlAddr) {
      let alreadyHydrated = false;
      setAddresses((curr) => {
        if (curr.length > 0) {
          alreadyHydrated = true;
          return curr;
        }
        return [urlAddr];
      });
      if (alreadyHydrated) return;
      // No ENS endpoint in this app yet; the page itself can hydrate
      // ensNames via setWallets() once it has resolved them.
      return;
    }
    const session = loadSession();
    if (session) {
      setAddresses((curr) => (curr.length > 0 ? curr : session.addresses));
      setEnsNames((curr) => (Object.keys(curr).length > 0 ? curr : session.ensNames));
    }
  }, []);

  const setWallets = useCallback((addrs: string[], ens: Record<string, string | null>) => {
    const trimmed = addrs.slice(0, 1);
    setAddresses(trimmed);
    setEnsNames(ens);
    saveSession(trimmed, ens);
  }, []);

  return <WalletCtx.Provider value={{ addresses, ensNames, setWallets }}>{children}</WalletCtx.Provider>;
}

export function useWalletContext() {
  return useContext(WalletCtx);
}
