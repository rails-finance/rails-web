"use client";

// The Lifetime flows timeline for a LlamaLend position page: the position's
// whole history replayed by lib/llamalend/flows.ts. A page that holds the
// whole history as events hands them over; a windowed page reads the flat
// history once (the read its CSV export makes), and a read short of the whole
// history is a failed read, since a replay of part of a history would state
// the wrong lifetime. Each row carries what the server stored at its block
// (rails-server mig 373: the AMM's oracle price and the position's state,
// once its filler has reached the block). For a row it has not stored, the
// price is read from the archive (/api/chain/llamalend/liq-price, six at a
// time, up to LLAMALEND_PRICE_READS blocks; the route caches each block's
// answer at the edge), and a row with no after-image (an underwater repay, a
// partial liquidation) has the position read at its block
// (/api/chain/llamalend/event-state, the read its card's detail makes).
// LlamaLend is not in the shared daily price store, so nothing is read
// between events: the collateral keeps its latest event's price. The same
// event-state read at the last event of each of the latest HEALTH_READS_MAX
// days with events gives the chart its Health view and the collateral's
// soft-liquidation band (lib/llamalend/flows-health.ts). It also gives the
// page the value that ties the panel to the timeline
// (components/shared/flow-focus-context.tsx).

import { useEffect, useMemo, useState } from "react";
import type { FlowsRead } from "@/components/shared/lifetime-flows-panel";
import { useFlowFocusRoot, useFlowFocusValue, type FlowFocusValue } from "@/components/shared/flow-focus-context";
import type { FlowTimeline } from "@/lib/shared/flows-timeline";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { HEALTH_READS_MAX, healthReadPicks } from "@/lib/shared/flows-health";
import {
  llamalendBandHelp,
  llamalendBandRead,
  llamalendPriceView,
  type LlamalendBandLive,
  type LlamalendBandRead,
} from "@/lib/llamalend/flows-health";
import {
  llamalendStateBlocks,
  llamalendFlowEvents,
  llamalendFlowFacts,
  llamalendFlowReplay,
  llamalendFlowTimeline,
  llamalendFocusEvents,
  llamalendPriceBlocks,
  LLAMALEND_COLL_KEY,
  type LlamalendFlowFacts,
  type LlamalendLive,
  type LlamalendStateRead,
} from "@/lib/llamalend/flows";
import {
  llamalendConfigChanges,
  llamalendLifeHasDiscountChange,
  type LlamalendConfigLog,
} from "@/lib/llamalend/config-log";
import { withChanges } from "@/lib/shared/flows-changes";

const DAY_S = 86_400;

const cache = new Map<string, Promise<number | null>>();

/** The AMM's oracle price at one block, cached for the page's life (a past
 *  block's answer never changes); null where the read failed. */
function loadPriceAt(controller: string, block: number): Promise<number | null> {
  const url = `/api/chain/llamalend/liq-price?controller=${controller}&block=${block}`;
  let p = cache.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (typeof d?.price === "number" && d.price > 0 ? (d.price as number) : null))
      .catch(() => null);
    p.then((v) => {
      if (v == null) cache.delete(url);
    });
    cache.set(url, p);
  }
  return p;
}

/** The position at the end of one block: its balances (base units) and
 *  its band and health; null where the read failed. */
interface StateAt {
  state: LlamalendStateRead | null;
  band: LlamalendBandRead | null;
}
const stateCache = new Map<string, Promise<StateAt | null>>();

/** The position at the end of one block, cached for the page's life. */
function loadStateAt(controller: string, user: string, block: number): Promise<StateAt | null> {
  const url = `/api/chain/llamalend/event-state?controller=${controller}&user=${user}&block=${block}`;
  let p = stateCache.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d): StateAt | null => {
        const a = d?.after;
        if (!a) return null;
        const state = !a.hasLoan
          ? { coll: BigInt(0), debt: BigInt(0) }
          : a.collateralRaw == null || a.debtRaw == null
            ? null
            : { coll: BigInt(a.collateralRaw), debt: BigInt(a.debtRaw) };
        return { state, band: llamalendBandRead(a) };
      })
      .catch(() => null);
    p.then((v) => {
      if (v == null) stateCache.delete(url);
    });
    stateCache.set(url, p);
  }
  return p;
}

/** Runs `load` over `items`, six at a time. */
async function sixAtATime<T, R>(items: T[], load: (t: T) => Promise<R | null>, live: () => boolean) {
  const out = new Map<T, R>();
  let next = 0;
  const worker = async () => {
    while (live() && next < items.length) {
      const t = items[next++];
      const v = await load(t);
      if (v != null) out.set(t, v);
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, items.length) }, worker));
  return out;
}

export interface LlamalendFlowsInput {
  controller: string;
  /** The position's owner, for the reads of its state at a block. */
  user: string;
  /** The page's events, when they are the whole history; null otherwise. */
  wholeEvents: BaseActivityEvent[] | null;
  /** Reads the whole flat history; null where the page has no such read. */
  fetchAll: (() => Promise<{ events: BaseActivityEvent[]; missing: number }>) | null;
  collSymbol: string | null;
  debtSymbol: string | null;
  open: boolean;
  /** The page's live read of the position, null until it lands or where it
   *  failed; `liveSettled` says whether it is still out. */
  live: LlamalendLive | null;
  liveSettled: boolean;
  /** The market's A and the live read's band and health, for the chart's
   *  Health view and band; null where the live read has none. */
  band: { A: number | null; live: LlamalendBandLive | null } | null;
}

export function useLlamalendFlows(p: LlamalendFlowsInput): {
  timeline: FlowTimeline | null;
  read: FlowsRead;
  focus: FlowFocusValue;
  facts: LlamalendFlowFacts | null;
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
      setFetched({ events: null, read: "failed" });
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
  const bare = useMemo(() => (source ? llamalendFlowEvents(source) : null), [source]);
  const blocks = useMemo(() => (bare ? llamalendPriceBlocks(bare) : null), [bare]);
  const stateBlocks = useMemo(() => (bare ? llamalendStateBlocks(bare) : null), [bare]);
  // The blocks whose band and health the chart reads: the last event of each
  // of the latest HEALTH_READS_MAX days with events, and before an event that
  // leaves no debt the one before it, whose band and health its day ends on.
  const bandBlocks = useMemo(() => {
    if (!bare) return null;
    const picks = healthReadPicks(
      bare.map((e) => ({ blockNumber: e.block, timestamp: e.ts })),
      HEALTH_READS_MAX,
    ).map((e) => e.blockNumber);
    const from = picks[0] ?? Infinity;
    const before = bare.flatMap((e, i) =>
      i > 0 && e.debtAfter === BigInt(0) && bare[i - 1].block >= from && bare[i - 1].block !== e.block
        ? [bare[i - 1].block]
        : [],
    );
    return [...new Set([...picks, ...before])].sort((a, b) => a - b);
  }, [bare]);
  const blocksKey =
    blocks && stateBlocks ? `${p.controller}:${p.user}:${blocks.join(",")}:${stateBlocks.join(",")}` : null;
  const [reads, setReads] = useState<{
    key: string;
    prices: Map<number, number>;
    states: Map<number, LlamalendStateRead>;
  } | null>(null);
  useEffect(() => {
    if (!blocks || !stateBlocks || !blocksKey) return;
    let live = true;
    const alive = () => live;
    Promise.all([
      sixAtATime(blocks, (b) => loadPriceAt(p.controller, b), alive),
      sixAtATime(stateBlocks, (b) => loadStateAt(p.controller, p.user, b), alive),
    ]).then(([prices, at]) => {
      if (!live) return;
      const states = new Map<number, LlamalendStateRead>();
      for (const [b, v] of at) if (v.state) states.set(b, v.state);
      setReads({ key: blocksKey, prices, states });
    });
    return () => {
      live = false;
    };
    // `blocksKey` stands for the controller, the owner and the blocks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocksKey]);
  const got = reads != null && reads.key === blocksKey ? reads : null;
  // The band and health reads, after the timeline's own: the panel draws
  // first and the view joins when every read has settled.
  const bandKey = got && bandBlocks ? `${p.controller}:${p.user}:${bandBlocks.join(",")}` : null;
  const [bandReads, setBandReads] = useState<{ key: string; bands: Map<number, LlamalendBandRead> } | null>(null);
  useEffect(() => {
    if (!bandKey || !bandBlocks) return;
    let live = true;
    sixAtATime(
      bandBlocks,
      (b) => loadStateAt(p.controller, p.user, b),
      () => live,
    ).then((at) => {
      if (!live) return;
      const bands = new Map<number, LlamalendBandRead>();
      for (const [b, v] of at) if (v.band) bands.set(b, v.band);
      setBandReads({ key: bandKey, bands });
    });
    return () => {
      live = false;
    };
    // `bandKey` stands for the controller, the owner and the blocks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bandKey]);
  const bands = bandReads != null && bandReads.key === bandKey ? bandReads.bands : null;
  const rows = useMemo(
    () => (source && got ? llamalendFlowEvents(source, got.prices, got.states) : null),
    [source, got],
  );

  // The market's discount and policy setter logs
  // (/api/chain/llamalend/config-log), one read per page. A failed read
  // leaves `configLog` null: no marker draws.
  const logController = source ? p.controller.toLowerCase() : null;
  const [configLogs, setConfigLogs] = useState<{ key: string; log: LlamalendConfigLog | null } | null>(null);
  useEffect(() => {
    if (!logController) return;
    const ac = new AbortController();
    fetch(`/api/chain/llamalend/config-log?controller=${logController}`, { signal: ac.signal })
      .then((r) => (r.ok ? (r.json() as Promise<LlamalendConfigLog>) : null))
      .then((log) => setConfigLogs({ key: logController, log }))
      .catch((err) => {
        if ((err as { name?: string })?.name !== "AbortError") setConfigLogs({ key: logController, log: null });
      });
    return () => ac.abort();
  }, [logController]);
  const configLogSettled = logController == null || configLogs?.key === logController;
  const configLog = logController != null && configLogs?.key === logController ? configLogs.log : null;

  // Set on mount, so the server's render and the first client render agree.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now() / 1000), []);
  const opts = useMemo(
    () =>
      now != null && p.collSymbol && p.debtSymbol && p.liveSettled
        ? { collSymbol: p.collSymbol, debtSymbol: p.debtSymbol, now, open: p.open, live: p.live }
        : null,
    [now, p.collSymbol, p.debtSymbol, p.open, p.live, p.liveSettled],
  );
  const replay = useMemo(
    () => (rows && opts && rows.length > 0 ? llamalendFlowReplay(rows, opts) : null),
    [rows, opts],
  );
  const plain = useMemo(() => (rows && opts ? llamalendFlowTimeline(rows, opts) : null), [rows, opts]);
  // Each change to the market's discounts or policy, marked on the events
  // row (lib/llamalend/config-log.ts).
  const changes = useMemo(
    () =>
      rows && p.collSymbol && p.debtSymbol
        ? llamalendConfigChanges(configLog, rows, `${p.collSymbol}/${p.debtSymbol}`)
        : [],
    [configLog, rows, p.collSymbol, p.debtSymbol],
  );
  const discountChanged = useMemo(() => {
    if (!rows?.length || !opts) return false;
    const first = Math.floor(rows[0].ts / DAY_S);
    const last = opts.open ? Math.floor(opts.now / DAY_S) : Math.floor(rows[rows.length - 1].ts / DAY_S);
    return llamalendLifeHasDiscountChange(changes, first, last);
  }, [rows, opts, changes]);
  // The Health view and the collateral's band (lib/llamalend/flows-health.ts).
  const band = p.band;
  const timeline = useMemo(() => {
    if (!plain || !rows || !opts || !bands || !band || !p.collSymbol || !p.debtSymbol) return plain;
    const v = llamalendPriceView(rows, bands, {
      now: opts.now,
      open: opts.open,
      A: band.A,
      live: band.live,
      collSymbol: p.collSymbol,
      debtSymbol: p.debtSymbol,
      cap: HEALTH_READS_MAX,
      discountChanged,
    });
    if (!v.health && !v.band) return plain;
    return {
      ...plain,
      ...(v.health ? { health: v.health } : {}),
      priceMarks: {
        ...plain.priceMarks,
        [LLAMALEND_COLL_KEY]: {
          ...plain.priceMarks?.[LLAMALEND_COLL_KEY],
          ...(v.band ? { band: v.band } : {}),
          help: llamalendBandHelp(p.collSymbol, p.debtSymbol, HEALTH_READS_MAX),
        },
      },
    };
  }, [plain, rows, opts, bands, band, p.collSymbol, p.debtSymbol, discountChanged]);
  const changed = useMemo(() => withChanges(timeline, changes), [timeline, changes]);
  const focusEvents = useMemo(
    () =>
      replay && changed && p.collSymbol && p.debtSymbol ? llamalendFocusEvents(replay, p.collSymbol, p.debtSymbol) : [],
    [replay, changed, p.collSymbol, p.debtSymbol],
  );
  const focus = useFlowFocusValue(useFlowFocusRoot(focusEvents), changed);
  const facts = useMemo(() => (replay ? llamalendFlowFacts(replay, changed) : null), [replay, changed]);
  const read: FlowsRead =
    p.wholeEvents == null && fetched.read !== "done"
      ? fetched.read
      : now == null || !p.liveSettled || !p.collSymbol || !p.debtSymbol || rows == null || !configLogSettled
        ? "reading"
        : // A position whose collateral has no price at all (no block read and
          // no live read) cannot be drawn in the borrowed token.
          rows.length > 0 && changed == null
          ? "failed"
          : "done";
  return { timeline: changed, read, focus, facts };
}
