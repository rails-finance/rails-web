"use client";

// PWN loan detail — a Tier 1 (chain-state) explorer: one view, the chain's own
// values. PWN's fixed interest (repay − principal) is a one-step
// chain-derived value over two on-chain loan terms.
// Per-value provenance lives with the page-level inspector (the per-card
// receipts pane retired in its favour). A PWN "position" is one
// discrete loan, so this page shows exactly ONE loan — the ?loan= id if present,
// else the wallet's most recent — with its principal/interest economics and the
// timeline sliced to that loan's own events. A wallet can be a party (lender OR
// borrower) to several loans; those are separate positions, each its own card on
// the /pwn listing. Everything replayed from the PWN events.

import { useCallback, useEffect, useMemo, useState } from "react";
import { INDEX_ROW_CEILING } from "@/lib/shared/timeline-row-ceiling";
import { DetailBodySkeleton } from "@/components/shared/detail-body-skeleton";
import dynamic from "next/dynamic";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import type { LatestPriceAsset } from "@/components/shared/latest-prices";
import { ORACLE_USD_REASON } from "@/lib/shared/oracle-usd-reasons";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isPwnEvent } from "@/lib/shared/types/event-shape";
import { fetchPwnPositions } from "@/lib/api/fetch-pwn-positions";
import { fetchPwnTimeline } from "@/lib/api/fetch-pwn-timeline";
import { fetchTimelineOpeningBalance } from "@/lib/api/fetch-timeline-opening-balance";
import {
  TIMELINE_WINDOW_EVENTS,
  WHOLE_HISTORY,
  lifetimeFiguresKnown,
  type TimelineOpeningBalance,
  type TimelineWindow,
} from "@/lib/shared/timeline-opening-balance";
import { fetchPwnBundleContents, type PwnBundleAsset } from "@/lib/api/fetch-pwn-bundle";
import { isPwnBundler } from "@/lib/pwn/asset-catalog";
import type { PwnPositionSummary } from "@/lib/sources/api/pwn-positions";
import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { groupEventsByTx } from "@/lib/shared/explainer-prose";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import { TimelineActivityHeader } from "@/components/shared/timeline-toolbar";
import { PwnEventCard } from "@/components/protocol/pwn/pwn-event-card";
import { PwnPositionCard, viewFromSummary } from "@/components/protocol/pwn/pwn-position-card";
import { PwnPositionExplanation } from "@/components/protocol/pwn/pwn-position-explanation";
import { ChainTruthTower } from "@/components/shared/chain-truth-tower";
import {
  accrueTo,
  computePwnEconomics,
  isAccruing,
  loanCost,
  loanDeadlineAt,
  loanDueAt,
  pwnLoanState,
} from "@/lib/pwn/economics";
import { PwnDeadlinePassedRow, PwnLoanTenure } from "@/components/protocol/pwn/pwn-loan-clock";
import { shortTokenId } from "@/lib/pwn/asset-catalog";
import { formatNumber } from "@/lib/utils/format";
import { fetchPwnCollateralTransfers } from "@/lib/api/fetch-pwn-collateral-transfer";
import type { PwnCollateralReturn, PwnContext } from "@/lib/shared/types/event-shape";
import { pwnEconomicsExplanation, pwnEconomicsContent } from "@/lib/pwn/economics-explanation";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { exportScopeNote, markdownHistoryScope } from "@/lib/shared/markdown-history";

// Lazy: the export path (dropdown UX + Markdown serializer + CSV builder) is
// one chunk off the initial bundle.
const PwnExportMenu = dynamic(() => import("@/components/protocol/pwn/pwn-export-menu").then((m) => m.PwnExportMenu), {
  ssr: false,
});

interface PwnLoanViewProps {
  /** Already lower-cased and address-shaped — the server route rejected
   *  anything else with a 404 before this component existed. */
  wallet: string;
  /** `?loan=`, decoded on the server so the document renders the loan the URL
   *  names rather than the latest one and then swapping after hydration. */
  loanParam: string | null;
  /** Every loan this wallet is a party to. `null` means the server could not
   *  seed the tail — see lib/pwn/position-page-data.ts for the one case where
   *  it deliberately does not. */
  initialSummaries: PwnPositionSummary[] | null;
  initialEvents: BaseActivityEvent[] | null;
  initialCutoffBlock: number | null;
  initialOpening: TimelineOpeningBalance | null;
}

export default function PwnLoanView({
  wallet,
  loanParam,
  initialSummaries,
  initialEvents,
  initialCutoffBlock,
  initialOpening,
}: PwnLoanViewProps) {
  // Keyed on the timeline, not the roster: a wallet party to no PWN loan is a
  // real answer the server can seed, and its `initialSummaries` is empty.
  const seeded = initialEvents != null;
  const [summaries, setSummaries] = useState<PwnPositionSummary[]>(initialSummaries ?? []);
  const [events, setEvents] = useState<BaseActivityEvent[]>(initialEvents ?? []);
  // The checkpoint model. The timeline fetch asks for a WINDOW of the wallet's
  // most recent events; the response names the block the window opened at, and
  // everything below it arrives as a declared opening balance from the
  // /summary twin. PWN's deepest wallet today holds a few dozen events — far
  // under TIMELINE_WINDOW_EVENTS — so `cutoffBlock` comes back null and this
  // page reads exactly as it did before for every real position.
  const [cutoffBlock, setCutoffBlock] = useState<number | null>(initialCutoffBlock);
  const [opening, setOpening] = useState<TimelineOpeningBalance | null>(initialOpening);
  const [openingFailed, setOpeningFailed] = useState(false);
  const [loading, setLoading] = useState(!seeded);

  // Mount. A seeded view already holds the tail and leaves this alone; an
  // unseeded one reads it exactly as this page always did.
  useEffect(() => {
    if (seeded || !wallet) return;
    (async () => {
      setLoading(true);
      try {
        // Fetch every loan this wallet is a party to (not limit:1) so ?loan= can
        // resolve to any of them; the timeline carries all the loans' events.
        const [pData, tData] = await Promise.all([
          fetchPwnPositions({ wallet, limit: 100 }),
          fetchPwnTimeline(wallet, { recent: TIMELINE_WINDOW_EVENTS }),
        ]);
        setSummaries(pData.data);

        // ⚠️ THE WINDOW IS CUT AT THE WALLET; THIS PAGE RENDERS ONE LOAN.
        // rails-server keys `?recent=N` and its /summary twin on the wallet
        // (lender OR borrower OR tx_from), and the summary's `totalEvents`,
        // `byAction`, `byDay` and `firstTimestamp` describe every loan the
        // wallet is a party to. This page's position is one LOAN, and the list
        // below is sliced to it — so on a wallet with more than one loan those
        // figures are about a different position than the rows they sit above:
        // the numbering would offset this loan's cards by another loan's event
        // count, the filter menu would count another loan's rows, and the
        // tenure would name the wallet's first loan rather than this one.
        //
        // Where the wallet is party to exactly one loan the two grains coincide
        // and every seeded surface is exact, so the window stands. Otherwise the
        // whole history is fetched, as it was before — one extra request, and
        // only on a wallet deep enough to have been windowed at all. The deepest
        // PWN owner in the index holds 77 events against a 1,000-event window,
        // so this costs nothing today and exists to keep the arithmetic right
        // if PWN ever grows. Windowing a multi-loan wallet needs a per-loan
        // cutoff on both backend routes; until then the page refuses.
        const loanScoped = (tData.cutoffBlock ?? null) != null && pData.data.length !== 1;
        const rows = loanScoped ? await fetchPwnTimeline(wallet) : tData;
        setEvents(rows.events ?? []);
        setCutoffBlock(rows.cutoffBlock ?? null);
      } finally {
        setLoading(false);
      }
    })();
  }, [wallet, seeded]);

  // The opening balance — the second of the windowed page's two requests, and
  // deliberately not merged into the first: the rows land and the list is
  // readable while this is in flight, and every whole-history figure declares
  // itself unknown until it arrives rather than stating the window's
  // arithmetic as a lifetime. A failure is a stated failure for the same
  // reason. PWN has no lifetime Σ and no actor split — both arrive omitted in
  // the response — so there is no merge to seed downstream of this; the tenure,
  // the numbering offset and both filter menus' counts are all this unlocks.
  useEffect(() => {
    // A seeded opening balance is already the answer — re-requesting it would
    // blank the whole-history figures for a round trip and put them back
    // unchanged. Only a server-side failure leaves it null with a cutoff block
    // set, which is exactly the case this still covers.
    if (opening != null) return;
    setOpeningFailed(false);
    if (cutoffBlock == null) return;
    const ac = new AbortController();
    fetchTimelineOpeningBalance({
      path: "/api/pwn/timeline/summary",
      params: { wallet },
      cutoffBlock,
      signal: ac.signal,
    })
      .then((data) => setOpening(data))
      .catch((err) => {
        if ((err as { name?: string })?.name !== "AbortError") setOpeningFailed(true);
      });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, cutoffBlock]);

  const historyWindow = useMemo<TimelineWindow>(() => {
    if (cutoffBlock == null) return WHOLE_HISTORY;
    if (opening) return { state: "ready", cutoffBlock, opening };
    return { state: openingFailed ? "failed" : "pending", cutoffBlock, opening: null };
  }, [cutoffBlock, opening, openingFailed]);

  // Which loan this page shows: the ?loan= id if it resolves, else the wallet's
  // most recently created loan. Old links without ?loan land on the latest.
  const selected =
    (loanParam ? summaries.find((s) => s.loanId === loanParam) : undefined) ??
    [...summaries].sort((a, b) => (b.createdBlock ?? 0) - (a.createdBlock ?? 0))[0];
  const selectedLoanId = selected?.loanId ?? null;

  // Bundle collateral overlay: when the collateral is the PWN Token Bundler's
  // ERC-1155, resolve what the bundle wrapped — the bundler's own
  // tokensInBundle(id) read at the loan's creation block (the bundle empties
  // when unwrapped after close). Additive: while in flight / on failure the
  // card simply shows "PWN Bundle #id". Detail page only — no listing reads.
  const bundleKey =
    selected?.collateral &&
    isPwnBundler(selected.collateral.address) &&
    selected.collateral.tokenId != null &&
    selected.createdBlock != null
      ? `${selected.collateral.tokenId}@${selected.createdBlock}`
      : null;
  const [bundle, setBundle] = useState<{ key: string; assets: PwnBundleAsset[] } | null>(null);
  useEffect(() => {
    if (!bundleKey) return;
    const [bundleId, block] = bundleKey.split("@");
    let cancelled = false;
    fetchPwnBundleContents({ bundleId, block: Number(block) })
      .then((r) => {
        if (!cancelled) setBundle({ key: bundleKey, assets: r.assets });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [bundleKey]);

  // Collateral reused from an earlier loan's default: the same NFT (or bundle)
  // the lender claimed on a previous loan among this wallet's, posted again by
  // the borrower. How it came back is read from the token's transfers
  // between that claim and this loan's creation.
  const prior =
    selected?.collateral &&
    selected.collateral.tokenId != null &&
    (selected.collateral.category === "ERC721" || selected.collateral.category === "ERC1155") &&
    selected.createdBlock != null
      ? summaries
          .filter(
            (s) =>
              s.loanId !== selected.loanId &&
              s.status === "defaulted" &&
              s.lender != null &&
              s.collateral?.address === selected.collateral!.address &&
              s.collateral?.tokenId === selected.collateral!.tokenId &&
              s.closedBlock != null &&
              s.closedBlock <= selected.createdBlock!,
          )
          .sort((a, b) => (b.closedBlock ?? 0) - (a.closedBlock ?? 0))[0]
      : undefined;
  const returnKey =
    prior && selected?.borrower && selected.collateral
      ? [
          selected.collateral.address,
          selected.collateral.category,
          selected.collateral.tokenId,
          prior.lender,
          selected.borrower,
          prior.closedBlock,
          selected.createdBlock,
          prior.loanId,
        ].join("|")
      : null;
  const [collateralReturn, setCollateralReturn] = useState<{
    key: string;
    value: PwnCollateralReturn | "unknown";
  } | null>(null);
  useEffect(() => {
    if (!returnKey) return;
    const [asset, category, id, lender, borrower, fromBlock, toBlock, priorLoanId] = returnKey.split("|");
    let cancelled = false;
    fetchPwnCollateralTransfers({
      asset,
      category: category as "ERC721" | "ERC1155",
      id,
      lender,
      borrower,
      fromBlock: Number(fromBlock),
      toBlock: Number(toBlock),
    })
      .then((rows) => {
        // The last transfer that landed with the borrower before this loan.
        const back = [...rows].reverse().find((r) => r.to === borrower);
        if (!cancelled) setCollateralReturn({ key: returnKey, value: back ? { ...back, priorLoanId } : "unknown" });
      })
      .catch(() => {
        if (!cancelled) setCollateralReturn({ key: returnKey, value: "unknown" });
      });
    return () => {
      cancelled = true;
    };
  }, [returnKey]);

  // Slice the timeline to the selected loan so each loan shows only its own
  // events; the export serializer wants them oldest-first.
  const loanEvents = events
    .filter(isPwnEvent)
    .filter((e) => selectedLoanId == null || e.context.data.loanId === selectedLoanId)
    .sort((a, b) => a.blockNumber - b.blockNumber);

  // What the loan's rows say that its listing row may not yet: the
  // deadline the latest extension set (the timeline carries v1.1 extensions
  // read from the chain until the index does), and how many transactions
  // stand behind its events.
  const extensionRows = loanEvents.filter((e) => e.context.data.eventType === "extended");
  const lastExtension = extensionRows[extensionRows.length - 1]?.context.data.extendedDefaultTimestamp;
  const summaryView = selected ? viewFromSummary(selected) : null;
  const view = summaryView
    ? {
        ...summaryView,
        bundleContents: bundle && bundle.key === bundleKey ? bundle.assets : undefined,
        ...(loanEvents.length > 0
          ? {
              eventCount: loanEvents.length,
              txCount: new Set(loanEvents.map((e) => e.txHash)).size,
              txParts: txPartsOf(loanEvents),
              extensionCount: extensionRows.length,
              extensionsBy: extensionRows.map((e) => e.context.data.extendedBy ?? ""),
              repaidAt: loanEvents.find((e) => e.context.data.eventType === "paid_back")?.timestamp ?? null,
              extendedDueAt: lastExtension != null ? Number(lastExtension) : (summaryView.extendedDueAt ?? null),
            }
          : {}),
      }
    : null;

  // What the loan's rows state that the index's event rows do not carry: the
  // v1.2/v1.3 rate and the sums it gives (what a repayment paid, what a default
  // owed at the deadline), where the deadline ended up, and how reused
  // collateral came back. Each row still reads only its event.
  const cost = view ? loanCost(view) : null;
  const deadline = view ? loanDeadlineAt(view) : null;
  const owedAtDeadline =
    view && isAccruing(view) && view.credit?.decimals != null && view.createdAt != null && deadline != null
      ? accrueTo(
          view.credit.amountRaw,
          view.credit.decimals,
          view.accruingInterestApr!,
          view.fixedInterestRaw,
          view.createdAt,
          deadline,
        )
      : null;
  const returned = collateralReturn && collateralReturn.key === returnKey ? collateralReturn.value : undefined;
  // Where the loan stands by the clock: past its deadline with no repayment or
  // claim it has defaulted, though the index still calls it open.
  const loanState = view ? pwnLoanState(view) : null;
  const unclaimed = loanState === "unclaimed";
  // The loan's rows run from its creation to its close (or to now); the
  // header states that span against the term the loan was struck for.
  // A repaid loan ran to its repayment (the note holder may claim much later);
  // a defaulted one to the lender's claim.
  const closedAt =
    view?.status === "repaid"
      ? (view.repaidAt ?? null)
      : view?.status === "defaulted" && loanEvents.length > 0
        ? loanEvents[loanEvents.length - 1].timestamp
        : null;
  const pwnEvents = loanEvents.map((e) => {
    const d = e.context.data;
    if (!view) return e;
    const add: Partial<PwnContext> = {};
    if (isAccruing(view)) add.accruingInterestApr = view.accruingInterestApr!;
    if (cost?.shape === "accruing" && cost.accrual && cost.basis === "paid") {
      if (d.eventType === "paid_back" || (d.eventType === "claimed" && !d.defaulted))
        add.accrued = { ...cost.accrual, basis: "paid" };
    }
    if (owedAtDeadline && d.eventType === "claimed" && d.defaulted)
      add.accrued = { ...owedAtDeadline, basis: "at-deadline" };
    if (d.eventType === "created") {
      add.finalDeadline = deadline ?? undefined;
      add.extensionCount = view.extensionCount ?? 0;
      add.extensionsByLender =
        (view.extensionsBy?.length ?? 0) > 0 && view.extensionsBy!.every((a) => a === view.lender);
      if (returnKey) add.collateralReturn = returned;
    }
    return Object.keys(add).length > 0 ? { ...e, context: { protocol: "pwn" as const, data: { ...d, ...add } } } : e;
  });
  // The CSV is the export whose purpose IS the rows, so on a windowed page it
  // fetches the whole history at click time rather than handing over the window
  // under a whole-history filename. It is narrowed to the SAME life/loan the
  // page is showing, so the spreadsheet covers the position on screen.
  const fetchAllHistory = useCallback(
    async () =>
      await (async () => {
        const res = await fetchPwnTimeline(wallet);
        const served = res.events ?? [];
        return {
          events: served
            .filter(isPwnEvent)
            .filter((e) => selectedLoanId == null || e.context.data.loanId === selectedLoanId)
            .sort((a, b) => a.blockNumber - b.blockNumber),
          missing: Math.max((res.rowCeiling?.total ?? served.length) - served.length, 0),
        };
      })(),
    [wallet, selectedLoanId],
  );
  // The tx-sibling seam: each card reaches its same-tx peers so a minted / burned
  // custody card can cross-reference the economic event it accompanies.
  const siblingsByTx = groupEventsByTx(pwnEvents);
  const tl = useTimelineEvents(pwnEvents, {
    storageKey: `pwn-${wallet}-${selectedLoanId ?? "all"}`,
    protocolKey: "pwn",
    window: historyWindow,
  });

  // The top row's price dropdown: the selected loan's two sides, named, with
  // no figure beside either. PWN has no oracle at all — the borrower and the
  // lender agree the terms between themselves, and nothing on chain says what
  // the collateral is worth — so the dropdown lists what the loan stands on
  // and says why there is no price. A bundled collateral is one ERC-1155
  // wrapping several tokens; its contents are listed under it once the bundle
  // read lands, since what is held is what is inside the wrapper.
  const stripAssets = useMemo<LatestPriceAsset[]>(() => {
    if (!view) return [];
    const out: LatestPriceAsset[] = [];
    if (view.collateral) {
      out.push({
        symbol: view.collateral.symbol,
        address: view.collateral.address,
        label: `${view.collateral.symbol}, the loan's collateral`,
      });
      for (const b of view.bundleContents ?? []) {
        out.push({ symbol: b.symbol, address: b.address, label: `${b.symbol}, inside the bundled collateral` });
      }
    }
    if (view.credit) {
      out.push({
        symbol: view.credit.symbol,
        address: view.credit.address,
        label: `${view.credit.symbol}, the loan's credit asset`,
      });
    }
    return out;
  }, [view]);

  return (
    <div className="py-8 space-y-6">
      {/* showStamp={false}: PWN has no chain overlay — a recency stamp would
          assert a freshness the page doesn't have. */}
      <DetailTopRow
        session="pwn"
        wallet={wallet}
        showStamp={false}
        assets={stripAssets}
        priceReason={ORACLE_USD_REASON.pwn}
        closed={view != null && view.status !== "open"}
      >
        {/* A window survives here only on a single-loan wallet: with more loans
            the page refetches the whole history, because PWN's timeline route
            takes no per-loan cutoff and a wallet-grained opening balance cannot
            be split across loans. So where the scope note below appears, the
            wallet's history IS this loan's. */}
        {view && (
          <PwnExportMenu
            view={view}
            events={pwnEvents}
            wallet={wallet}
            csvFilename={`pwn-loan-${view.loanId}-activity.csv`}
            fetchAllEvents={historyWindow.state === "whole" ? undefined : fetchAllHistory}
            history={markdownHistoryScope(historyWindow, pwnEvents)}
            scopeNote={exportScopeNote(historyWindow, pwnEvents, "this loan's whole history")}
          />
        )}
      </DetailTopRow>

      {loading ? (
        <DetailBodySkeleton />
      ) : !view ? (
        <div className="text-sm text-rb-500">No loan captured for this wallet.</div>
      ) : (
        <>
          <PwnPositionCard
            v={view}
            viewer={wallet}
            receipts
            viewHref={tl.viewHref}
            explanation={<PwnPositionExplanation v={view} wallet={wallet} />}
          />
          {/* The tower stacks the collateral and the credit on one scale, so it
              mounts only where both are fungible amounts and the loan is
              running: an NFT or a bundle has no unit in common with the
              credit, and a loan past its deadline has no debt to draw. */}
          {loanState === "running" &&
            view.collateral?.category === "ERC20" &&
            (() => {
              const towerData = computePwnEconomics(view);
              return (
                <ChainTruthTower
                  data={towerData}
                  title={`Loan #${view.loanId} · Lifetime flows`}
                  explanation={pwnEconomicsExplanation(towerData)}
                  learnMore={pwnEconomicsContent(isAccruing(view))}
                />
              );
            })()}
          <ChainTruthTimeline
            csvExportCeiling={INDEX_ROW_CEILING}
            // Matches `PwnEventCard`'s own `persistKey={`pwn:${event.id}`}` —
            // lets pinned mode (the per-event share route) force a landed
            // card's detail panel open on its first mount.
            persistKeyPrefix="pwn"
            // A loan past its deadline is not live: no pulsing tip.
            closed={view.status !== "open" || unclaimed}
            tl={tl}
            liveWindow={
              unclaimed && deadline != null
                ? ({ isFirst }) => (
                    <PwnDeadlinePassedRow
                      isFirst={isFirst}
                      deadline={deadline}
                      extended={view.extendedDueAt != null && view.extendedDueAt !== loanDueAt(view)}
                      dueKind={view.dueKind}
                      loanId={view.loanId}
                      version={view.version}
                      owed={cost && view.credit ? `${formatNumber(cost.total)} ${view.credit.symbol}` : null}
                      collateral={
                        view.collateral
                          ? view.collateral.tokenId != null && view.collateral.category !== "ERC20"
                            ? `${view.collateral.symbol} #${shortTokenId(view.collateral.tokenId)}`
                            : `${formatNumber(view.collateral.amount)} ${view.collateral.symbol}`
                          : "The collateral"
                      }
                    />
                  )
                : undefined
            }
            // Tenure-first header (the V4 spoke treatment): when this LOAN
            // actually opened, not when the wallet's window does — `firstAt`
            // only overrides the tenure toward an EARLIER timestamp, so on the
            // no-op path (every real PWN wallet today) this is inert.
            toolbarLeading={
              loanState !== "running" &&
              lifetimeFiguresKnown(historyWindow) &&
              view.createdAt != null &&
              loanEvents.length > 0 ? (
                <PwnLoanTenure
                  state={loanState!}
                  createdAt={view.createdAt}
                  deadline={deadline}
                  closedAt={closedAt}
                  lastAt={loanEvents[loanEvents.length - 1].timestamp}
                  fallback={
                    <TimelineActivityHeader
                      events={pwnEvents}
                      closed={view.status !== "open"}
                      firstAt={opening?.firstTimestamp}
                    />
                  }
                />
              ) : (
                <TimelineActivityHeader
                  events={pwnEvents}
                  closed={view.status !== "open"}
                  firstAt={opening?.firstTimestamp}
                  tenurePending={!lifetimeFiguresKnown(historyWindow)}
                />
              )
            }
            renderCard={(event, meta) =>
              isPwnEvent(event) ? (
                <PwnEventCard
                  event={event}
                  eventNumber={meta.eventNumber}
                  isFirst={meta.isFirst}
                  isLast={meta.isLast}
                  siblings={siblingsByTx.get(event.txHash) ?? [event]}
                />
              ) : null
            }
          />
          <ProvInspectorLayer />
        </>
      )}
    </div>
  );
}

/** What each of the loan's transactions did, oldest first: "the creation,
 *  which also minted the note", "4 extensions", "the repayment", "the note
 *  holder's claim, which also burned the note". Consecutive extensions read as
 *  one count. */
function txPartsOf(events: { txHash: string; context: { data: PwnContext } }[]): string[] {
  const byTx = new Map<string, PwnContext["eventType"][]>();
  for (const e of events) byTx.set(e.txHash, [...(byTx.get(e.txHash) ?? []), e.context.data.eventType]);
  const parts: string[] = [];
  let ext = 0;
  const flush = () => {
    const words = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
    if (ext > 0) parts.push(`${words[ext] ?? ext} extension${ext === 1 ? "" : "s"}`);
    ext = 0;
  };
  for (const [, kinds] of byTx) {
    const has = (k: PwnContext["eventType"]) => kinds.includes(k);
    if (has("extended") && kinds.length === 1) {
      ext += 1;
      continue;
    }
    flush();
    const also: string[] = [];
    let head: string;
    if (has("created")) {
      head = "the creation";
      if (has("minted")) also.push("minted the note");
    } else if (has("paid_back")) {
      head = "the repayment";
      if (has("claimed")) also.push("paid the note holder");
      if (has("burned")) also.push("burned the note");
    } else if (has("claimed")) {
      head = events.some((e) => e.context.data.eventType === "claimed" && e.context.data.defaulted)
        ? "the lender's claim on the collateral"
        : "the note holder's claim";
      if (has("burned")) also.push("burned the note");
    } else {
      head = kinds.join(" and ");
    }
    parts.push(also.length > 0 ? `${head}, which also ${also.join(" and ")}` : head);
  }
  flush();
  return parts;
}
