"use client";

// One read of the Aave CoW routes' web proxies (app/api/cow/ethereum/aave/…),
// shared by the info pages' figures block and the swaps listing. The server
// reads a family once an hour, and a cold read takes seconds: a 503 (nothing
// held yet), a 504 (the proxy's 15 s budget) or a network error is read again
// after a wait, with the loading line standing meanwhile; any other failure
// ends the read at once.

import { useEffect, useState } from "react";

export type CowAaveRead<T> =
  | { status: "reading" }
  | { status: "ready"; value: T }
  /** Still not ready after every retry. */
  | { status: "not-yet" }
  /** A failure a retry would not mend. */
  | { status: "failed" };

/** Waits before each further read. */
const RETRY_MS = [3_000, 6_000, 12_000, 20_000];
const RETRYABLE = new Set([503, 504]);

export function useCowAaveRead<T>(url: string): CowAaveRead<T> {
  const [state, setState] = useState<{ url: string; read: CowAaveRead<T> }>({ url, read: { status: "reading" } });
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setState({ url, read: { status: "reading" } });
    const attempt = async (n: number) => {
      let retry = true;
      try {
        const res = await fetch(url);
        if (!live) return;
        if (res.ok) {
          const body = (await res.json()) as T & { success?: boolean };
          if (!live) return;
          if (body.success !== false) return setState({ url, read: { status: "ready", value: body } });
          retry = false;
        } else retry = RETRYABLE.has(res.status);
      } catch {
        if (!live) return;
      }
      if (!retry) setState({ url, read: { status: "failed" } });
      else if (n < RETRY_MS.length) timer = setTimeout(() => void attempt(n + 1), RETRY_MS[n]);
      else setState({ url, read: { status: "not-yet" } });
    };
    void attempt(0);
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [url]);
  // A read for an earlier URL is not this one's.
  return state.url === url ? state.read : { status: "reading" };
}
