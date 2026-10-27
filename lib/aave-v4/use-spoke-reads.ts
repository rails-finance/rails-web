"use client";

// The Aave V4 health view's reads (ui-jobs 328 step 5): the spoke's state at
// the end of each picked block, through /api/chain/aave-v4/spoke-position
// ?block=, kept per (wallet, spoke, block) for the life of the tab. At most
// MAX_IN_FLIGHT run at once; a read that fails or takes longer than
// READ_TIMEOUT_MS is asked once more, then counts as missing.

import { useEffect, useState } from "react";
import type { AaveV4SpokePositionChainResponse } from "@/lib/api/fetch-aave-v4-spoke-position";

const READ_TIMEOUT_MS = 25_000;
const RETRY_AFTER_MS = 2_000;
const MAX_IN_FLIGHT = 3;

const settled = new Map<string, AaveV4SpokePositionChainResponse>();
const inFlight = new Map<string, Promise<AaveV4SpokePositionChainResponse | null>>();
let running = 0;
const waiting: (() => void)[] = [];

async function limited<T>(job: () => Promise<T>): Promise<T> {
  if (running >= MAX_IN_FLIGHT) await new Promise<void>((go) => waiting.push(go));
  running++;
  try {
    return await job();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

async function attempt(url: string): Promise<AaveV4SpokePositionChainResponse | null> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), READ_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ac.signal });
    const body = res.ok ? ((await res.json()) as AaveV4SpokePositionChainResponse) : null;
    return body && Array.isArray(body.reserves) && !body.chainStale ? body : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function read(key: string, url: string): Promise<AaveV4SpokePositionChainResponse | null> {
  const kept = settled.get(key);
  if (kept) return Promise.resolve(kept);
  let p = inFlight.get(key);
  if (!p) {
    p = (async () => {
      let r = await limited(() => attempt(url));
      if (!r) {
        await new Promise((go) => setTimeout(go, RETRY_AFTER_MS));
        r = await limited(() => attempt(url));
      }
      if (r) settled.set(key, r);
      inFlight.delete(key);
      return r;
    })();
    inFlight.set(key, p);
  }
  return p;
}

/** The spoke's state at each block, in the order asked (null where the read
 *  missed), once every read has settled; null until then and with no reads. */
export function useAaveV4SpokeReads(args: {
  wallet?: string;
  spoke?: string;
  blocks: readonly number[];
}): (AaveV4SpokePositionChainResponse | null)[] | null {
  const { wallet, spoke, blocks } = args;
  const joined = wallet && spoke ? `${wallet.toLowerCase()}:${spoke}:${blocks.join(",")}` : "";
  const [result, setResult] = useState<{ joined: string; reads: (AaveV4SpokePositionChainResponse | null)[] } | null>(
    null,
  );
  useEffect(() => {
    if (!wallet || !spoke || blocks.length === 0) return;
    let live = true;
    Promise.all(
      blocks.map((b) =>
        read(
          `${wallet.toLowerCase()}:${spoke}:${b}`,
          `/api/chain/aave-v4/spoke-position?wallet=${wallet}&spoke=${spoke}&block=${b}`,
        ),
      ),
    ).then((reads) => {
      if (live) setResult({ joined, reads });
    });
    return () => {
      live = false;
    };
    // `joined` names every read; `blocks` follows it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined]);
  return result && result.joined === joined && blocks.length > 0 ? result.reads : null;
}
