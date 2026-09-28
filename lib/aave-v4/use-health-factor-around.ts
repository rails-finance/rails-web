"use client";

import { useEffect, useState } from "react";

/** One end of an event's health-factor read: the spoke's figure at the end of a
 *  block, as a WAD string, or null when the position held no debt there. */
export interface HealthFactorRead {
  block: number;
  wad: string | null;
}

export type HealthFactorAround =
  | { status: "loading" }
  | { status: "miss" }
  | {
      status: "ok";
      before: HealthFactorRead;
      after: HealthFactorRead;
      /** Whether the event's reserve counted as collateral either side of the
       *  block, when the read was asked for it and found it. */
      collateral?: { before: boolean; after: boolean };
    };

type Loaded = { before: HealthFactorRead; after: HealthFactorRead; collateral?: { before: boolean; after: boolean } };

// One request per (spoke, wallet, block): the opened card's grid and its
// explanation both read the figure, and a past block's answer never changes.
const cache = new Map<string, Promise<Loaded | null>>();

function load(spoke: string, wallet: string, block: number, asset?: string) {
  const url = `/api/chain/aave-v4/health-factor?spoke=${spoke}&wallet=${wallet}&block=${block}${asset ? `&asset=${encodeURIComponent(asset)}` : ""}`;
  let p = cache.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) =>
        d?.before && d?.after ? ({ before: d.before, after: d.after, collateral: d.collateral } as Loaded) : null,
      )
      .catch(() => null);
    p.then((v) => {
      // A miss is not remembered, so a later open can try again.
      if (v == null) cache.delete(url);
    });
    cache.set(url, p);
  }
  return p;
}

/** The health factor at the end of the block before an event and of its own
 *  block, read from the spoke. Fetched when the opened card mounts. `asset`
 *  (the event's reserve symbol) also reads its collateral flag; the grid and
 *  the explanation pass the same one so they share the request. */
export function useHealthFactorAround(
  enabled: boolean,
  spoke: string | undefined,
  wallet: string | undefined,
  blockNumber?: number,
  asset?: string,
): HealthFactorAround {
  const [state, setState] = useState<HealthFactorAround>({ status: "loading" });
  useEffect(() => {
    if (!enabled || !spoke || !wallet || blockNumber == null) {
      setState({ status: "miss" });
      return;
    }
    let live = true;
    setState({ status: "loading" });
    load(spoke, wallet, blockNumber, asset).then((v) => {
      if (live) setState(v ? { status: "ok", ...v } : { status: "miss" });
    });
    return () => {
      live = false;
    };
  }, [enabled, spoke, wallet, blockNumber, asset]);
  return state;
}

export const hfOf = (wad: string | null): number | null => (wad == null ? null : Number(wad) / 1e18);
