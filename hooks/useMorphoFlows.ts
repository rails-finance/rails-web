"use client";

// The Lifetime flows timeline for a Morpho Blue position page (Ethereum and
// Base): the position's whole history replayed by lib/morpho/flows.ts. A page
// that holds the whole history as events hands them over; a windowed or
// folder-served page reads the flat history once (the read its CSV export
// makes), and a read short of the whole history is a failed read, since a
// replay of part of a history would state the wrong lifetime. The market
// oracle at each row's block comes from the row (liquidations) or from
// /api/chain/morpho/at-block, the read the opened card makes, six at a time
// (two on Arbitrum).
// It also gives the page the value that ties the panel to the timeline
// (components/shared/flow-focus-context.tsx).

import { useEffect, useMemo, useState } from "react";
import type { FlowsRead } from "@/components/shared/lifetime-flows-panel";
import { useFlowFocusRoot, useFlowFocusValue, type FlowFocusValue } from "@/components/shared/flow-focus-context";
import type { FlowTimeline } from "@/lib/shared/flows-timeline";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { loadMorphoAtBlock } from "@/lib/morpho/use-market-at-block";
import { ARBITRUM_CHAIN_ID } from "@/lib/shared/chains";
import { useFlowsHealth } from "@/hooks/useFlowsHealth";
import { MORPHO_COLL_KEY, morphoHealthSource, morphoLiqPrice, morphoLltvReads } from "@/lib/morpho/flows-health";
import {
  MO,
  morphoFlowEvents,
  morphoFlowReplay,
  morphoFlowTimeline,
  morphoFocusEvents,
  morphoPriceBlocks,
  morphoUnpriced,
  type MorphoLive,
  type MorphoRoles,
} from "@/lib/morpho/flows";

/** At most this many blocks' oracle reads per page; the rest take the
 *  nearest priced row's price, and the Explanation counts them. */
export const MORPHO_PRICE_READS = 250;
const NO_EVENTS: never[] = [];

export interface MorphoFlowsInput {
  /** The page's events, when they are the whole history; null otherwise. */
  wholeEvents: BaseActivityEvent[] | null;
  /** Reads the whole flat history; null where the page withholds the read
   *  because its history is not whole (the panel then draws nothing: rails-ops
   *  TO-DO-ui-jobs.md item 415). */
  fetchAll: (() => Promise<{ events: BaseActivityEvent[]; missing: number }>) | null;
  marketId: string;
  chainId: number;
  loanSymbol: string | null;
  collSymbol: string | null;
  /** The tokens' addresses, for the ledgers' icons (a Pendle PT's mark). */
  loanAddress?: string | null;
  collAddress?: string | null;
  lltv: number | null;
  open: boolean;
  /** The page's live read of the position, where it has one. */
  live: MorphoLive | null;
  /** The card's risk figures from the live read, for the health view; null
   *  where the card states no LTV. */
  risk?: MorphoRisk | null;
}

/** The card's risk figures now (lib/sources/chain/morpho-position.ts). */
export interface MorphoRisk {
  /** The card's LTV: the debt over the collateral's value at the oracle. */
  ltv: number;
  lltv: number;
  collateral: number;
  currentDebt: number;
}

/** The card's figures, where it prints its LTV (the card's test). */
export function morphoRisk(
  chain: { currentDebt: number; maxBorrow: number; ltv: number | null; lltv: number; collateral: number } | null,
): MorphoRisk | null {
  return chain && chain.currentDebt > 0 && chain.maxBorrow > 0 && chain.ltv != null && chain.ltv > 0
    ? { ltv: chain.ltv, lltv: chain.lltv, collateral: chain.collateral, currentDebt: chain.currentDebt }
    : null;
}

export interface MorphoFlowsNoteFacts {
  roles: MorphoRoles;
  /** Collateral flows valued at their own block's oracle price, and at the
   *  nearest priced row's. */
  priced: number;
  nearest: number;
  /** Rows whose debt the answer states as principal (no market totals). */
  principalRows: number;
  /** Liquidations, and those that wrote debt off. */
  liquidations: number;
  badDebt: number;
}

export function useMorphoFlows(p: MorphoFlowsInput): {
  timeline: FlowTimeline | null;
  read: FlowsRead;
  focus: FlowFocusValue;
  facts: MorphoFlowsNoteFacts | null;
} {
  const [fetched, setFetched] = useState<{ events: BaseActivityEvent[] | null; read: FlowsRead }>({
    events: null,
    read: "reading",
  });
  const needRead = p.wholeEvents == null;
  const { fetchAll } = p;
  useEffect(() => {
    if (!needRead) return;
    if (!fetchAll) {
      setFetched({ events: null, read: "withheld" });
      return;
    }
    let cancelled = false;
    setFetched({ events: null, read: "reading" });
    fetchAll()
      .then(({ events, missing }) => {
        if (!cancelled) setFetched(missing > 0 ? { events: null, read: "failed" } : { events, read: "done" });
      })
      .catch((err) => {
        console.warn("Lifetime flows history not read:", err);
        if (!cancelled) setFetched({ events: null, read: "failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [needRead, fetchAll]);

  const source = p.wholeEvents ?? fetched.events;
  const bare = useMemo(() => (source ? morphoFlowEvents(source) : []), [source]);
  // The oracle at each block a row needs it, where any row holds collateral.
  const blocks = useMemo(() => {
    const borrower = bare.some((e) => Math.abs(e.collDelta) > 0 || (e.collAfter ?? 0) > 0);
    return borrower ? morphoPriceBlocks(bare, MORPHO_PRICE_READS) : [];
  }, [bare]);
  const blocksKey = `${p.marketId}:${p.chainId}:${blocks.join(",")}`;
  const [prices, setPrices] = useState<{ key: string; map: Map<number, number> } | null>(null);
  useEffect(() => {
    if (source == null) return;
    let live = true;
    const list = blocks.slice();
    const map = new Map<number, number>();
    let next = 0;
    const worker = async () => {
      while (live && next < list.length) {
        const b = list[next++];
        const r = await loadMorphoAtBlock(p.marketId, b, p.chainId);
        if (r && r.at.price > 0) map.set(b, r.at.price);
      }
    };
    // Two at a time on Arbitrum: the keyless gateway refuses a wide burst.
    const atOnce = p.chainId === ARBITRUM_CHAIN_ID ? 2 : 6;
    Promise.all(Array.from({ length: Math.min(atOnce, list.length) }, worker)).then(() => {
      if (live) setPrices({ key: blocksKey, map });
    });
    return () => {
      live = false;
    };
    // `blocksKey` stands for the market, the chain and the blocks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocksKey, source == null]);
  const priced = prices?.key === blocksKey ? prices.map : null;
  const rows = useMemo(() => (source && priced ? morphoFlowEvents(source, priced) : null), [source, priced]);

  // Set on mount, so the server's render and the first client render agree.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now() / 1000), []);
  const opts = useMemo(
    () =>
      now != null && p.loanSymbol && p.lltv != null
        ? {
            loanSymbol: p.loanSymbol,
            collSymbol: p.collSymbol ?? "collateral",
            loanAddress: p.loanAddress ?? null,
            collAddress: p.collSymbol ? (p.collAddress ?? null) : null,
            lltv: p.lltv,
            now,
            live: p.open ? p.live : null,
          }
        : null,
    [now, p.loanSymbol, p.collSymbol, p.loanAddress, p.collAddress, p.lltv, p.open, p.live],
  );
  const replay = useMemo(() => (rows && opts && rows.length > 0 ? morphoFlowReplay(rows, opts) : null), [rows, opts]);
  const replayedTimeline = useMemo(() => (rows && opts ? morphoFlowTimeline(rows, opts) : null), [rows, opts]);
  // The health view in the card's terms (ui-jobs 328 step 6;
  // lib/morpho/flows-health.ts): the LTV against the market's LLTV.
  const given = useMemo(
    () =>
      replay?.roles.borrower && p.lltv != null
        ? morphoLltvReads(
            replay.replayed.map((r) => r.ev),
            p.lltv,
          )
        : null,
    [replay, p.lltv],
  );
  const healthSource = useMemo(() => morphoHealthSource(p.chainId, p.loanSymbol ?? ""), [p.chainId, p.loanSymbol]);
  const risk = p.open ? (p.risk ?? null) : null;
  const grain = 10 ** (replayedTimeline?.unit?.scale ?? 0);
  // Keyed by its figures: the page hands a new object on each render.
  const [rColl, rDebt, rLltv] = [risk?.collateral ?? 0, risk?.currentDebt ?? 0, risk?.lltv ?? 0];
  const liveLevels = useMemo(
    () => (rColl > 0 && rLltv > 0 ? { [MORPHO_COLL_KEY]: morphoLiqPrice(rColl, rDebt, rLltv) * grain } : null),
    [rColl, rDebt, rLltv, grain],
  );
  const timeline = useFlowsHealth(replayedTimeline, {
    reader: null,
    given,
    source: healthSource,
    events: NO_EVENTS,
    liveHf: risk ? risk.lltv / risk.ltv : null,
    liveLevels,
    liveLine: risk?.lltv ?? null,
  });
  const focusEvents = useMemo(
    () => (replay && p.loanSymbol ? morphoFocusEvents(replay, p.loanSymbol, p.collSymbol ?? "collateral") : []),
    [replay, p.loanSymbol, p.collSymbol],
  );
  const focus = useFlowFocusValue(useFlowFocusRoot(focusEvents), timeline);
  const facts = useMemo<MorphoFlowsNoteFacts | null>(() => {
    if (!replay) return null;
    const collFlows = replay.replayed.filter((r) =>
      r.legs.some((l) => l.bucket === MO.collIn || l.bucket === MO.collOut || l.bucket === MO.collSeized),
    );
    const nearest = morphoUnpriced(replay);
    const liq = replay.replayed.filter((r) => r.ev.kind === "liquidation");
    return {
      roles: replay.roles,
      priced: collFlows.length - nearest,
      nearest,
      principalRows: replay.replayed.filter(
        (r) => r.ev.debtBefore == null && (r.ev.kind === "borrow" || r.ev.kind === "repay"),
      ).length,
      liquidations: liq.length,
      badDebt: liq.filter((r) => r.legs.some((l) => l.bucket === MO.badDebt)).length,
    };
  }, [replay]);
  const read: FlowsRead =
    p.wholeEvents == null && fetched.read !== "done"
      ? fetched.read
      : now == null || (source != null && priced == null)
        ? "reading"
        : "done";
  return { timeline, read, focus, facts };
}
