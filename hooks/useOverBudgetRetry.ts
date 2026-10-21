"use client";

// The page's wait after a history read answered 429 (ChainTimelineOverBudget,
// lib/api/fetch-chain-timeline.ts): a countdown the notice draws, and a new
// ask when it ends. `asks` goes in the fetch effect's dependencies, so the
// read runs again once the wait is over; the timer is cleared on unmount.

import { useCallback, useEffect, useState } from "react";

interface Wait {
  seconds: number;
  at: number;
}

export function useOverBudgetRetry(): {
  /** Bumped when a wait ends: the fetch effect's cue to ask again. */
  asks: number;
  /** Seconds until the page asks again; null while it is not waiting. */
  retryIn: number | null;
  /** Start the wait the route's Retry-After named. */
  wait: (seconds: number) => void;
} {
  const [pending, setPending] = useState<Wait | null>(null);
  const [asks, setAsks] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!pending) return;
    const end = pending.at + pending.seconds * 1000;
    const timer = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= end) {
        clearInterval(timer);
        setPending(null);
        setAsks((n) => n + 1);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [pending]);

  const wait = useCallback((seconds: number) => {
    const at = Date.now();
    setNow(at);
    setPending({ seconds, at });
  }, []);

  const retryIn = pending
    ? Math.min(pending.seconds, Math.max(0, Math.ceil((pending.at + pending.seconds * 1000 - now) / 1000)))
    : null;
  return { asks, retryIn, wait };
}

/** "in 23 seconds", "in 1 second", or "shortly" once the count is out. */
export function retryWhen(retryIn: number | null): string {
  if (retryIn == null || retryIn <= 0) return "shortly";
  return retryIn === 1 ? "in 1 second" : `in ${retryIn} seconds`;
}
