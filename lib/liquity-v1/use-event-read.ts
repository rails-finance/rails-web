"use client";

// Client reads for one Liquity V1 event: its receipt figures
// (/api/chain/liquity-v1/event — fee, reserve, where a liquidation's debt and
// ETH went, the PriceFeed price at the block) and, on a full redemption or a
// liquidation, the ETH it left in the CollSurplusPool with its claim status
// (/api/chain/liquity-family/coll-surplus). A mined transaction never changes,
// so each answer is kept per page load and shared by the card's grid, its
// explanation and its header.

import { useEffect, useState } from "react";
import type { LiquityV1EventRead } from "@/lib/sources/chain/liquity-v1-event";
import type { CollSurplusRead, CollSurplusClaim } from "@/lib/sources/chain/liquity-coll-surplus";

export type { LiquityV1EventRead };

const cache = new Map<string, Promise<unknown>>();

function load<T>(url: string, ok: (d: unknown) => d is T): Promise<T | null> {
  let p = cache.get(url) as Promise<T | null> | undefined;
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (ok(d) ? d : null))
      .catch(() => null);
    p.then((v) => {
      if (v == null) cache.delete(url);
    });
    cache.set(url, p);
  }
  return p;
}

/** The answer for `url` and whether it is still on its way; a failed read
 *  settles as null. */
function useLoadState<T>(url: string | null, ok: (d: unknown) => d is T): { value: T | null; pending: boolean } {
  const [state, setState] = useState<{ url: string | null; value: T | null }>({ url: null, value: null });
  useEffect(() => {
    if (!url) return;
    let live = true;
    load(url, ok).then((d) => {
      if (live) setState({ url, value: d });
    });
    return () => {
      live = false;
    };
    // `ok` is a module-level guard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  const settled = url != null && state.url === url;
  return { value: settled ? state.value : null, pending: url != null && !settled };
}

function useLoad<T>(url: string | null, ok: (d: unknown) => d is T): T | null {
  return useLoadState(url, ok).value;
}

const isEventRead = (d: unknown): d is LiquityV1EventRead =>
  d != null && typeof d === "object" && "blockNumber" in d && "lusdMintedToOwner" in d;

const eventReadUrl = (txHash?: string | null, wallet?: string | null): string | null =>
  txHash && wallet ? `/api/chain/liquity-v1/event?tx=${txHash}&wallet=${wallet.toLowerCase()}` : null;

/** The receipt read for one event with its loading state: null while loading
 *  or when it failed, and `pending` tells the two apart. */
export function useLiquityV1EventReadState(
  txHash?: string,
  wallet?: string,
): { read: LiquityV1EventRead | null; pending: boolean } {
  const { value, pending } = useLoadState(eventReadUrl(txHash, wallet), isEventRead);
  return { read: value, pending };
}

/** The receipt reads for several events of one Trove, keyed by transaction;
 *  null until every one has settled. A failed read is absent from the map. */
export function useLiquityV1EventReads(
  txHashes: readonly string[],
  wallet?: string | null,
): Map<string, LiquityV1EventRead> | null {
  const key = wallet ? txHashes.join(",") : "";
  const [state, setState] = useState<{ key: string; reads: Map<string, LiquityV1EventRead> } | null>(null);
  useEffect(() => {
    if (!key || !wallet) return;
    let live = true;
    const txs = key.split(",");
    Promise.all(txs.map((tx) => load(eventReadUrl(tx, wallet) as string, isEventRead))).then((reads) => {
      if (!live) return;
      const m = new Map<string, LiquityV1EventRead>();
      reads.forEach((r, i) => {
        if (r) m.set(txs[i], r);
      });
      setState({ key, reads: m });
    });
    return () => {
      live = false;
    };
  }, [key, wallet]);
  if (!key) return null;
  return state?.key === key ? state.reads : null;
}

export interface LiquityV1Surplus {
  /** ETH this transaction credited to the owner in the CollSurplusPool. */
  surplus: number;
  surplusRaw: string;
  /** What the owner can still claim of it. */
  claimable: number;
  claimableRaw: string;
  pool: string;
  blockNumber: number;
  claimed: CollSurplusClaim | null;
}

const isSurplusRead = (d: unknown): d is CollSurplusRead =>
  d != null && typeof d === "object" && "surplusRaw" in d && "claimableRaw" in d;

const shift = (raw: string) => Number(raw) / 1e18;

/** The surplus a full redemption or a liquidation left the owner; null while
 *  loading, on a failure, or when the transaction credited none. */
export function useLiquityV1Surplus(txHash?: string | null, owner?: string | null): LiquityV1Surplus | null {
  const url =
    txHash && owner
      ? `/api/chain/liquity-family/coll-surplus?protocol=liquity-v1&branch=ETH&owner=${owner.toLowerCase()}&tx=${txHash}`
      : null;
  const d = useLoad(url, isSurplusRead);
  if (!d || !d.pool || d.surplusRaw === "0") return null;
  return {
    surplus: shift(d.surplusRaw),
    surplusRaw: d.surplusRaw,
    claimable: shift(d.claimableRaw),
    claimableRaw: d.claimableRaw,
    pool: d.pool,
    blockNumber: d.blockNumber,
    claimed: d.claimed,
  };
}
