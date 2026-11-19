"use client";

// A Liquity V2 redeemer's page on the deposit page's shell
// (app/(app)/ethereum/liquity-v2/stability-pool/[collateralType]/[wallet]/deposit-view.tsx):
// the card (P1) with the wallet's sums, then the shared timeline (P3), one
// row per Trove a redemption hit, newest first, with its filters (the
// collateral narrows to a branch). Between them the Lifetime flows panel
// draws BOLD's market price over the redeeming span with the wallet's
// redemption days on its events row, tied to the timeline by the day as the
// deposit page's is (lib/liquity-v2/redeemer-flows.ts; a wallet holds no
// position, so no bars). Past REDEEMER_FIRST_READ rows the timeline closes on a
// boundary card, and the cut notice reads the rest on request; the card's
// sums cover every row. A row's event page and View in timeline are the
// Trove's.

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { DetailBodySkeleton } from "@/components/shared/detail-body-skeleton";
import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { CHAIN_TRUTH_DISPLAY_ITEMS, TimelineActivityHeader } from "@/components/shared/timeline-toolbar";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { LifetimeFlowsPanel, type FlowsRead } from "@/components/shared/lifetime-flows-panel";
import { LifetimeFlowsScrubber } from "@/components/shared/lifetime-flows-scrubber";
import { FlowFocusContext, useFlowFocusRoot, useFlowFocusValue } from "@/components/shared/flow-focus-context";
import { RedeemerFlowsNote } from "@/components/protocol/liquity/redeemer-flows-note";
import {
  redeemerFocus,
  redeemerTimeline,
  unfilledThrough,
  type BoldDailyResponse,
  type RedeemerDaysResponse,
} from "@/lib/liquity-v2/redeemer-flows";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import { LiquityV2RedeemerCard } from "@/components/protocol/liquity/redeemer-card";
import { LiquityV2RedemptionCard } from "@/components/protocol/liquity/redeemer-event-card";
import { LIQUITY_V2_BASE_PATH } from "@/lib/liquity-v2/sp-routes";
import {
  REDEEMER_FIRST_READ,
  redemptionEventHref,
  redemptionId,
  redemptionTimelineEvent,
} from "@/lib/liquity-v2/redeemer-timeline";
import { boundaryFromLimit } from "@/lib/shared/timeline-boundary";
import {
  readBoldDailyPrices,
  readLiquityV2Redeemer,
  readLiquityV2RedeemerDays,
  type LiquityV2RedeemerResponse,
  type LiquityV2RedemptionRow,
} from "@/lib/sources/api/liquity-v2-redeemer";

export default function RedeemerView({
  address,
  initial,
}: {
  address: string;
  initial: LiquityV2RedeemerResponse | null;
}) {
  const [data, setData] = useState(initial);
  const [failed, setFailed] = useState(false);

  // The index lane, where the server's read did not answer.
  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    readLiquityV2Redeemer(address, { order: "desc", limit: String(REDEEMER_FIRST_READ) })
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [initial, address]);

  // The rows past the first read, on the cut notice's "Load the older
  // events": pages of REDEEMER_FIRST_READ, newest first, read on while a page
  // comes back full. A row arriving meanwhile shifts the pages down, so a page
  // can repeat a row and the last page still reaches the oldest; the ids
  // settle repeats.
  const [older, setOlder] = useState<LiquityV2RedemptionRow[]>([]);
  const [olderRead, setOlderRead] = useState<"idle" | "loading" | "failed">("idle");
  // One read at a time: a second would land later and replace the rows,
  // resetting the timeline's window under a landing.
  const reading = useRef(false);
  const loadRest = async () => {
    if (!data || reading.current) return;
    reading.current = true;
    setOlderRead("loading");
    const got: LiquityV2RedemptionRow[] = [];
    try {
      for (let offset = data.rows.length; ; offset += REDEEMER_FIRST_READ) {
        const page = await readLiquityV2Redeemer(address, {
          order: "desc",
          limit: String(REDEEMER_FIRST_READ),
          offset: String(offset),
        });
        got.push(...page.rows);
        if (page.rows.length < REDEEMER_FIRST_READ) break;
      }
      setOlder(got);
      setOlderRead("idle");
    } catch {
      setOlderRead("failed");
    } finally {
      reading.current = false;
    }
  };

  const rows = data?.rows;
  const listed = useMemo(() => {
    const seen = new Set<string>();
    const all = [...(rows ?? []), ...older].filter((r) => {
      const id = redemptionId(r);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    return all.reverse();
  }, [rows, older]);
  const rowById = useMemo(() => new Map(listed.map((r) => [redemptionId(r), r])), [listed]);
  const events = useMemo(() => listed.map((r) => redemptionTimelineEvent(r, address)), [listed, address]);
  const total = data?.totals.operations ?? 0;
  const olderCount = Math.max(0, total - listed.length);

  // A `?at=` link to a row past the first read (a Trove's "redeemer" link):
  // the rest is read first, and the timeline mounts with the row in it, so
  // its landing finds the row.
  const at = useSearchParams()?.get("at") ?? null;
  const awaitAt = at != null && olderCount > 0 && !rowById.has(at) && olderRead !== "failed";
  useEffect(() => {
    if (awaitAt && olderRead === "idle") void loadRest();
    // `loadRest` is a fresh closure every render; the read keys on the wait.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitAt, olderRead]);

  // Where the rows stop short of the first redemption, its time is one more
  // read: the oldest row.
  const [firstRead, setFirstRead] = useState<number | null>(null);
  useEffect(() => {
    if (olderCount === 0) return;
    let cancelled = false;
    readLiquityV2Redeemer(address, { order: "asc", limit: "1" })
      .then((d) => !cancelled && d.rows[0] && setFirstRead(Number(d.rows[0].block_timestamp)))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [olderCount, address]);

  // The chart: every redemption day, then BOLD's price over them. Only a
  // failed days read fails the panel; a failed price read keeps the events
  // row and says the price was not read.
  const [days, setDays] = useState<RedeemerDaysResponse | null>(null);
  const [daysFailed, setDaysFailed] = useState(false);
  const [prices, setPrices] = useState<BoldDailyResponse | null>(null);
  const [priceRead, setPriceRead] = useState<"reading" | "done" | "failed">("reading");
  useEffect(() => {
    const ctl = new AbortController();
    readLiquityV2RedeemerDays(address, ctl.signal)
      .then((d) => {
        setDays(d);
        if (d.days.length === 0) {
          setPriceRead("done");
          return;
        }
        const from = d.days[0][0];
        const to = d.days[d.days.length - 1][0];
        readBoldDailyPrices(from, to, ctl.signal)
          .then((p) => {
            setPrices(p);
            setPriceRead("done");
          })
          .catch(() => !ctl.signal.aborted && setPriceRead("failed"));
      })
      .catch(() => !ctl.signal.aborted && setDaysFailed(true));
    return () => ctl.abort();
  }, [address]);
  // On the days and prices alone: reading more rows leaves the chart's cursor.
  const timeline = useMemo(
    () => (days && priceRead !== "reading" ? redeemerTimeline(days.days, prices) : null),
    [days, prices, priceRead],
  );
  const focusEvents = useMemo(() => redeemerFocus(listed, timeline), [listed, timeline]);
  const flowsRead: FlowsRead = daysFailed ? "failed" : days && priceRead !== "reading" ? "done" : "reading";
  const flowFocus = useFlowFocusValue(useFlowFocusRoot(timeline ? focusEvents : NO_FOCUS), timeline);

  const tl = useTimelineEvents(events, {
    storageKey: `liquity-v2-redeemer-${address}`,
    protocolKey: "liquity-v2-redeemer",
    olderCount,
    // Navigated by the Lifetime flows cursor through "Sync to chart": no Dates.
    dates: false,
  });
  const boundary = useMemo(() => {
    const oldest = tl.sortedEvents[0];
    if (olderCount === 0 || !oldest) return null;
    return boundaryFromLimit({
      total,
      listed: listed.length,
      cutBlock: oldest.blockNumber,
      cutAt: oldest.timestamp,
      state: null,
    });
  }, [olderCount, total, listed.length, tl.sortedEvents]);

  if (!data && !failed) return <DetailBodySkeleton />;
  if (!data)
    return (
      <div className="py-8 text-sm text-rb-500">
        The index did not answer for this redeemer just now. Reload the page to try again.
      </div>
    );
  if (total === 0)
    return (
      <div className="py-8 text-sm text-rb-500">The index holds no Liquity V2 redemption sent from this address.</div>
    );

  const newest = listed.length > 0 ? Number(listed[listed.length - 1].block_timestamp) : null;
  const firstAt = olderCount === 0 && listed.length > 0 ? Number(listed[0].block_timestamp) : firstRead;
  const served = data.served_thru_block;

  const firstDay = days?.days[0]?.[0] ?? null;
  const lastDay = days?.days[days.days.length - 1]?.[0] ?? null;

  return (
    <FlowFocusContext.Provider value={timeline ? flowFocus : null}>
      <div className="py-8 space-y-6" data-anatomy="Q1·liquity">
        <DetailTopRow session="liquity-v2" wallet={address} fallbackHref={LIQUITY_V2_BASE_PATH} tools={false} />
        <LiquityV2RedeemerCard
          data={data}
          lastAt={newest}
          explanation={
            <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-rb-500">
              <li>
                A redemption burns BOLD and takes collateral of the same value at the branch price, less a fee. It takes
                the debt from the Troves with the lowest interest rates, and the fee stays in those Troves.
              </li>
              <li>
                This address sent the transactions. The collateral went to the account that called the
                CollateralRegistry: this address when it called it directly.
              </li>
              <li>
                The sums cover every redemption the index holds from this address
                {served ? `, through block ${Number(served).toLocaleString("en-US")}` : ""}.
              </li>
            </ul>
          }
        />
        <div data-anatomy="Q3·liquity">
          <LifetimeFlowsPanel
            scrubber={timeline ? <LifetimeFlowsScrubber timeline={timeline} /> : null}
            read={flowsRead}
            explanation={
              days && firstDay != null && lastDay != null ? (
                <RedeemerFlowsNote
                  days={days.days.length}
                  firstDay={firstDay}
                  lastDay={lastDay}
                  unreadThrough={unfilledThrough(prices, firstDay, lastDay)}
                  priceFailed={priceRead === "failed"}
                  pool={prices?.pool ?? null}
                />
              ) : undefined
            }
          />
        </div>
        {awaitAt ? (
          <DetailBodySkeleton />
        ) : (
          <ChainTruthTimeline
            persistKeyPrefix="liquity-v2-redeemer"
            closed={false}
            tl={tl}
            boundary={boundary}
            eventHref={(id) => {
              const r = rowById.get(id);
              return r ? redemptionEventHref(r) : null;
            }}
            loadOlder={olderCount > 0 ? { state: olderRead, load: () => void loadRest() } : undefined}
            displayItems={CHAIN_TRUTH_DISPLAY_ITEMS}
            emptyLabel="No redemptions recorded for this address"
            toolbarLeading={
              <TimelineActivityHeader
                events={events}
                closed={false}
                firstAt={firstAt}
                tenurePending={firstAt == null}
              />
            }
            renderCard={(event, meta) => {
              const r = rowById.get(event.id);
              return r ? <LiquityV2RedemptionCard row={r} isLast={meta.isLast} eventNumber={meta.eventNumber} /> : null;
            }}
          />
        )}
        <ProvInspectorLayer />
      </div>
    </FlowFocusContext.Provider>
  );
}

const NO_FOCUS: never[] = [];
