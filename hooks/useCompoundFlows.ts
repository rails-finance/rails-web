"use client";

// The Lifetime flows timeline for a Compound V3 position page (Ethereum's
// (market, wallet) page and each market of the Base wallet page): the
// position's whole history replayed by lib/compound/flows.ts. A page that
// holds the whole history as events hands them over; a windowed or
// folder-served page reads the flat history once (the read its CSV export
// makes), and a read short of the whole history is a failed read, since a
// replay of part of a history would state the wrong lifetime. A page whose
// history is not whole makes no read, and the read is `withheld` (rails-ops
// TO-DO-ui-jobs.md item 415). Comet's oracle
// prices at each row's block, up to COMPOUND_PRICE_READS blocks, come from the
// prices the server stores for every event block (/api/compound/prices-at),
// and from the archive (/api/chain/compound/prices-at-block, six at a time)
// for the blocks not stored yet. Between events each asset is valued at the
// daily price store's price for the day (`cv3:<comet>:<asset>`), one read per
// page. It also gives the page the value that ties the panel to the timeline
// (components/shared/flow-focus-context.tsx).

import { useEffect, useMemo, useState } from "react";
import type { FlowsRead } from "@/components/shared/lifetime-flows-panel";
import { useFlowFocusRoot, useFlowFocusValue, type FlowFocusValue } from "@/components/shared/flow-focus-context";
import type { FlowTimeline } from "@/lib/shared/flows-timeline";
import { isCompoundEvent, type BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { CometMarket } from "@/lib/compound/asset-catalog";
import {
  collAsset,
  compoundAssets,
  compoundFlowEvents,
  compoundFlowFacts,
  compoundFlowReplay,
  compoundFlowTimeline,
  compoundFocusEvents,
  compoundPriceBlocks,
  type CompoundFlowFacts,
  type CompoundFlowReplay,
  type CompoundLive,
} from "@/lib/compound/flows";
import { storedCometPrices } from "@/lib/compound/at-block-prices";
import { fetchStoredCometPrices } from "@/lib/api/fetch-compound-stored-prices";
import { fetchDailyPrices } from "@/lib/api/fetch-daily-prices";
import type { CompoundDeploymentKey } from "@/lib/compound/deployments";
import type { CompoundMarketChainResponse } from "@/lib/api/fetch-compound-position";
import { cometCardLines, cometFactorRead, cometHealthSource, cometTodayRead } from "@/lib/compound/flows-health";
import { healthRead } from "@/lib/shared/health-reads";
import { cardLevels } from "@/lib/shared/flows-health";
import { useFlowsHealth, type HealthReader } from "@/hooks/useFlowsHealth";
import { useCometFactorChanges } from "@/hooks/useFactorChanges";
import { factorChangePicks } from "@/lib/shared/collateral-factor-changes";
import { withChanges } from "@/lib/shared/flows-changes";

const DAY_S = 86_400;
const CHAIN_ID = { ethereum: 1, base: 8453, arbitrum: 42161 } as const;

/** The deployments whose event-block prices and daily prices rails-server
 *  stores; elsewhere (Arbitrum) every price is an archive read and assets are
 *  carried between events at their latest priced row. */
const STORED: Record<CompoundDeploymentKey, boolean> = { ethereum: true, base: true, arbitrum: false };
/** Archive price reads in flight at once; the keyless Arbitrum gateway
 *  refuses a wide burst. */
const READS_AT_ONCE: Record<CompoundDeploymentKey, number> = { ethereum: 6, base: 6, arbitrum: 2 };
/** A failed archive read is asked once more where the gateway refuses
 *  bursts. */
const RETRY: Record<CompoundDeploymentKey, boolean> = { ethereum: false, base: false, arbitrum: true };
const RETRY_BACKOFF_MS = 800;

/** At most this many blocks' price reads per position; the rest take the
 *  nearest priced row's prices, and the Explanation counts them. */
export const COMPOUND_PRICE_READS = 250;

const cache = new Map<string, Promise<Record<string, number> | null>>();

/** Comet's oracle prices at one block, cached for the page's life (a past
 *  block's answer never changes); null where the read failed. */
function loadPricesAt(
  deployment: CompoundDeploymentKey,
  market: string,
  block: number,
  assets: string[],
): Promise<Record<string, number> | null> {
  const url = `/api/chain/compound/prices-at-block?deployment=${deployment}&market=${market}&block=${block}&assets=${assets.join(",")}`;
  let p = cache.get(url);
  if (!p) {
    const once = () =>
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => (d?.prices && typeof d.prices === "object" ? (d.prices as Record<string, number>) : null))
        .catch(() => null);
    // The keyless Arbitrum gateway refuses a burst now and then: one more
    // ask after a short back-off.
    p = once().then((v) =>
      v != null || !RETRY[deployment]
        ? v
        : new Promise<Record<string, number> | null>((r) => setTimeout(() => r(once()), RETRY_BACKOFF_MS)),
    );
    p.then((v) => {
      if (v == null) cache.delete(url);
    });
    cache.set(url, p);
  }
  return p;
}

export interface CompoundFlowsInput {
  /** The page's events in this market, when they are the whole history;
   *  null otherwise. */
  wholeEvents: BaseActivityEvent[] | null;
  /** Reads the whole flat history; null where the page withholds the read
   *  because its history is not whole (the panel then draws nothing: rails-ops
   *  TO-DO-ui-jobs.md item 415). */
  fetchAll: (() => Promise<{ events: BaseActivityEvent[]; missing: number }>) | null;
  deployment: CompoundDeploymentKey;
  market: CometMarket;
  open: boolean;
  /** The page's live read of the position, where it has one. */
  live: CompoundLive | null;
  /** The card's Comet read, for the health view's today. */
  chain?: CompoundMarketChainResponse | null;
}

export function useCompoundFlows(p: CompoundFlowsInput): {
  timeline: FlowTimeline | null;
  read: FlowsRead;
  focus: FlowFocusValue;
  facts: CompoundFlowFacts | null;
  replay: CompoundFlowReplay | null;
} {
  const [fetched, setFetched] = useState<{ events: BaseActivityEvent[] | null; read: FlowsRead }>({
    events: null,
    read: "reading",
  });
  const needRead = p.wholeEvents == null;
  const { fetchAll, market } = p;
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

  const source = useMemo(
    () =>
      (p.wholeEvents ?? fetched.events)?.filter((e) => !isCompoundEvent(e) || e.context.data.market === market.key) ??
      null,
    [p.wholeEvents, fetched.events, market.key],
  );
  const bare = useMemo(
    () => (source ? compoundFlowEvents(source, market.baseToken, market.baseDecimals) : []),
    [source, market.baseToken, market.baseDecimals],
  );
  const blocks = useMemo(() => compoundPriceBlocks(bare, COMPOUND_PRICE_READS), [bare]);
  const assets = useMemo(() => compoundAssets(bare, market.baseToken), [bare, market.baseToken]);
  const blocksKey = `${p.deployment}:${market.key}:${assets.join(",")}:${blocks.join(",")}`;
  const [prices, setPrices] = useState<{ key: string; map: Map<number, Record<string, number>> } | null>(null);
  useEffect(() => {
    if (source == null) return;
    let live = true;
    const map = new Map<number, Record<string, number>>();
    const run = async () => {
      // The stored prices first; the archive for the blocks the server has not
      // stored (or every block, where the stored read failed).
      const stored =
        blocks.length > 0 && STORED[p.deployment]
          ? await fetchStoredCometPrices(CHAIN_ID[p.deployment], market.comet, blocks).catch(() => null)
          : null;
      let list = blocks.slice();
      if (stored) {
        for (const b of blocks) {
          const s = stored.blocks[String(b)];
          const r = s ? storedCometPrices(s, assets) : null;
          if (r) map.set(b, r);
        }
        const missing = new Set(stored.missing);
        list = blocks.filter((b) => missing.has(b));
      }
      let next = 0;
      const worker = async () => {
        while (live && next < list.length) {
          const b = list[next++];
          const r = await loadPricesAt(p.deployment, market.key, b, assets);
          if (r) map.set(b, r);
        }
      };
      await Promise.all(Array.from({ length: Math.min(READS_AT_ONCE[p.deployment], list.length) }, worker));
    };
    run().then(() => {
      if (live) setPrices({ key: blocksKey, map });
    });
    return () => {
      live = false;
    };
    // `blocksKey` stands for the deployment, the market, the assets and the blocks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocksKey, source == null]);
  const priced = prices?.key === blocksKey ? prices.map : null;
  const rows = useMemo(
    () => (source && priced ? compoundFlowEvents(source, market.baseToken, market.baseDecimals, priced) : null),
    [source, priced, market.baseToken, market.baseDecimals],
  );

  // The daily store, one read per page: each asset's series (the base's
  // too) from the first row's day. A failed or empty read carries each
  // asset's latest priced event.
  const want = useMemo(() => {
    if (!rows || rows.length === 0) return null;
    return { from: Math.floor(rows[0].ts / DAY_S), key: `${p.deployment}:${market.comet}:${assets.join(",")}` };
  }, [rows, p.deployment, market.comet, assets]);
  const [daily, setDaily] = useState<{ key: string; prices: Record<string, [number, number][]> | null } | null>(null);
  useEffect(() => {
    if (!want) return;
    if (!STORED[p.deployment]) {
      setDaily({ key: want.key, prices: null });
      return;
    }
    const ac = new AbortController();
    const comet = market.comet.toLowerCase();
    fetchDailyPrices(
      CHAIN_ID[p.deployment],
      assets.map((t) => `cv3:${comet}:${t}`),
      { from: want.from, signal: ac.signal },
    )
      .then((byKey) => {
        const prices: Record<string, [number, number][]> = {};
        for (const t of assets) {
          const obs = byKey?.[`cv3:${comet}:${t}`];
          if (obs) prices[t] = obs;
        }
        setDaily({ key: want.key, prices: Object.keys(prices).length > 0 ? prices : null });
      })
      .catch((err) => {
        if ((err as { name?: string })?.name !== "AbortError") setDaily({ key: want.key, prices: null });
      });
    return () => ac.abort();
    // `want.key` stands for the deployment, the Comet and the assets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want?.key, want?.from]);
  const dailySettled = want != null && daily?.key === want.key;
  const dailyPrices = dailySettled ? (daily?.prices ?? undefined) : undefined;

  // Set on mount, so the server's render and the first client render agree.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now() / 1000), []);
  const opts = useMemo(
    () =>
      now != null
        ? {
            baseToken: market.baseToken,
            baseSymbol: market.baseSymbol,
            baseDecimals: market.baseDecimals,
            now,
            live: p.open ? p.live : null,
            ...(dailyPrices ? { dailyPrices } : {}),
          }
        : null,
    [now, market.baseToken, market.baseSymbol, market.baseDecimals, p.open, p.live, dailyPrices],
  );
  const replay = useMemo(() => (rows && opts && rows.length > 0 ? compoundFlowReplay(rows, opts) : null), [rows, opts]);
  const replayed = useMemo(
    () => (rows && opts && (dailySettled || rows.length === 0) ? compoundFlowTimeline(rows, opts) : null),
    [rows, opts, dailySettled],
  );
  // The health view (ui-jobs 328, ruling 15): each collateral's liquidate
  // factor at the day's last event, the card's read today.
  const healthEvents = useMemo(() => (rows ?? []).map((r) => ({ blockNumber: r.block, timestamp: r.ts })), [rows]);
  const collTokens = useMemo(
    () => assets.filter((t) => t !== market.baseToken.toLowerCase()),
    [assets, market.baseToken],
  );
  const reader = useMemo<HealthReader | null>(() => {
    if (collTokens.length === 0) return null;
    const qs = `deployment=${p.deployment}&market=${market.key}&assets=${collTokens.join(",")}`;
    return {
      key: `cv3:${qs}`,
      load: (e) =>
        healthRead(`/api/chain/compound/factors-at-block?${qs}&block=${e.blockNumber}`, (b) => {
          const a = b as { block?: number; factors?: Record<string, { liquidate: number }> } | null;
          return a && typeof a.block === "number" && a.factors ? { block: a.block, factors: a.factors } : null;
        }).then((a) => (a ? cometFactorRead(a, e.timestamp) : null)),
    };
  }, [collTokens, p.deployment, market.key]);
  // The liquidate factor changes the Comet's upgrades carried in the life, on
  // the collaterals the account used (ui-jobs 328 step 8): markers, and a
  // factor read at each upgrade's block so the line steps there.
  const collSymbols = useMemo(() => {
    const out = new Map<string, { asset: string; symbol: string }>();
    for (const e of bare)
      if (!e.isBase && !e.token.startsWith("symbol:") && !out.has(e.token))
        out.set(e.token, { asset: collAsset(e.token), symbol: e.symbol });
    return out;
  }, [bare]);
  const { changes, unavailable: changesUnavailable } = useCometFactorChanges(
    p.deployment,
    market.key,
    collSymbols,
    replayed,
  );
  const also = useMemo(() => factorChangePicks(changes, replayed), [changes, replayed]);
  const changed = changes.length > 0;
  const healthSource = useMemo(() => cometHealthSource(CHAIN_ID[p.deployment], changed), [p.deployment, changed]);
  const chainNow = p.open && p.chain && !p.chain.chainStale ? p.chain : null;
  const todayRead = useMemo(() => (chainNow && now != null ? cometTodayRead(chainNow, now) : null), [chainNow, now]);
  const liveLevels = useMemo(
    () => (chainNow ? cardLevels(cometCardLines(chainNow), replayed?.todayPrices) : null),
    [chainNow, replayed],
  );
  const healthTimeline = useFlowsHealth(replayed, {
    reader,
    source: healthSource,
    events: healthEvents,
    liveHf: chainNow?.healthFactor ?? null,
    liveLevels,
    todayRead,
    also,
  });
  const timeline = useMemo(
    () => withChanges(healthTimeline, changes, changesUnavailable),
    [healthTimeline, changes, changesUnavailable],
  );
  const focusEvents = useMemo(() => (replay ? compoundFocusEvents(replay) : []), [replay]);
  const focus = useFlowFocusValue(useFlowFocusRoot(focusEvents), timeline);
  const facts = useMemo(
    () => (replay ? compoundFlowFacts(replay, dailyPrices ? "store" : "carried") : null),
    [replay, dailyPrices],
  );
  const read: FlowsRead =
    p.wholeEvents == null && fetched.read !== "done"
      ? fetched.read
      : now == null || (source != null && priced == null) || (rows != null && rows.length > 0 && !dailySettled)
        ? "reading"
        : "done";
  return { timeline, read, focus, facts, replay };
}
